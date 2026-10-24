import { activationDisposition, interestDisposition, DispositionInterestSettingsSchema } from './disposition-interest.js';
import { validateActionSpace } from './embodied-action.js';
import { ThoughtJobs, type ThoughtScope, type ThoughtJob } from './thought-jobs.js';
import { z } from 'zod';
import { SynthesisPolicySchema } from './sleep-policy.js';
import { predictionTrajectories, PredictionTrajectorySchema } from './prediction-lineage.js';
import { CoverageProductSchema } from './cognition-coverage.js';
import { commitReconciliation } from './reconciliation-commit.js';
import { ActivationScoreSchema, DispositionSchema, MemorySchema, freeze, id, now, ordinaryMemory, memoryWithoutFormationAffect,
  activationAssociations, ordinaryDisposition, type WorldState, type Part, type Memory, type Disposition, type Prediction, type Cognition } from './domain.js';
import { constructedOutputs, LearningSchema, EffortfulRecallSchema, DispositionLearningTraceSchema, type ConstructedInput, type ConstructedTask,
  type JudgmentInput, type PartGenerationSchema } from './constructed-domain.js';
import { InfrastructureError, ContextLimitError, MutationValidationError, type Store, type DecisionProvider, type ReasoningProvider } from './contracts.js';
import type { Inspection } from './inspection.js';
import type { PartMutations } from './mutations.js';
import { validateExperientialFormation } from './experiential-formation.js';

export type DispositionAssessment = {
  world: WorldState; threadId: string | null; dispositions: Disposition[];
  bindings: { disposition: Disposition; entityId: string }[];
  scores: z.infer<typeof ActivationScoreSchema>[];
};

export type ConstructedCycle = { world: WorldState; threadId?: string; memories: Memory[]; parts: Part[];
  generatedCognition: Record<string, { worldId: string; output: Cognition; durationMs: number; inferenceSource?: import('./contracts.js').InferenceSource }>;
  recalledMemoryIds: Record<string, string[]>; dispositions: Disposition[];
  dispositionBindings: { entityId: string; dispositionId: string }[] };

/** Code owns assembly and continuity; models supply ordered psychological products. */
export class ConstructedCognition {
  private closed = false;
  async close(): Promise<void> { this.closed = true; await Promise.all([...this.jobQueues.values()].map(queue => queue.close())); }
  private readonly pendingBidOwners = new Set<string>();
  holdBidOwner(partId: string, retained: boolean): void {
    if (retained) this.pendingBidOwners.add(partId); else this.pendingBidOwners.delete(partId);
  }
  private readonly jobQueues = new Map<string, ThoughtJobs>();
  private jobs(agentId: string): ThoughtJobs {
    const settings = this.store.agentActivationSettings(agentId);
    let jobs = this.jobQueues.get(agentId);
    if (!jobs || (!jobs.activeCount && !jobs.queuedCount
      && (jobs.concurrency !== (settings.maxConcurrentThoughts ?? 4) || jobs.queueLimit !== (settings.maxQueuedThoughts ?? 100)))) {
      jobs = new ThoughtJobs(settings.maxConcurrentThoughts ?? 4, settings.maxQueuedThoughts ?? 100);
      this.jobQueues.set(agentId, jobs);
    }
    return jobs;
  }
  isProcessing(scope: ThoughtScope): boolean { return this.jobQueues.get(scope.agentId)?.isProcessing(scope) ?? false; }
  async scheduleJob<T>(job: ThoughtJob<T>) {
    const jobId = id('thought_job');
    const world = this.store.world(job.worldId);
    const emit = (status: import('./contracts.js').EventPayloads['cognition.job']['status']) =>
      this.inspection.emit(job.agentId, world.cycleId, 'cognition.job', {
        jobId, worldId: job.worldId, threadId: job.threadId, dispositionId: job.dispositionId, status });
    emit('queued');
    if (this.closed) { emit('closed'); return { status: 'closed' as const }; }
    try {
      const result = await this.jobs(job.agentId).submit({ ...job, run: async () => { emit('started'); return job.run(); } });
      emit(result.status);
      return result;
    } catch (error) { emit('failed'); throw error; }
  }
  isThinking(agentId: string): boolean { const jobs = this.jobQueues.get(agentId); return Boolean(jobs && (jobs.activeCount || jobs.queuedCount)); }
  async idle(agentId: string): Promise<void> { await this.jobQueues.get(agentId)?.idle(); }
  async checkBidConditions(world: WorldState, bids: import('./domain.js').ActionBid[]) {
    const candidates = bids.flatMap(bid => (bid.validWhile ?? []).map((condition, index) => ({ id: `${bid.id}:condition:${index}`,
      question: 'Is this declared external condition supported by the currently available factual observations? Unknown is at most 2; do not treat a subjective interpretation as confirmation.',
      context: { bidId: bid.id, condition, action: { kind: bid.action.kind, text: bid.action.text } } })));
    const scores = await this.judge({ task: 'bid_applicability', agentId: world.agentId, world, candidates });
    return bids.map(bid => ({ bidId: bid.id, conditions: candidates.filter(candidate => candidate.context.bidId === bid.id).map(candidate => ({
      condition: candidate.context.condition, score: scores.find(score => score.partId === candidate.id)?.score ?? null,
    })) }));
  }
  private readonly assessments = new WeakMap<DispositionAssessment, { world: WorldState; threadId: string | null; inquiry: string | null }>();
  constructor(private readonly store: Store, private readonly decisions: DecisionProvider,
    private readonly reasoning: ReasoningProvider, private readonly mutations: PartMutations, private readonly inspection: Inspection, private readonly maxTemporaryParts = 12) {}
  private readonly inferenceSources = new WeakMap<object, import('./contracts.js').InferenceSource>();
  async infer<T extends ConstructedTask>(task: T, input: Omit<ConstructedInput, 'task'>): Promise<z.infer<typeof constructedOutputs[T]>> {
    if (!this.reasoning.constructed) throw new InfrastructureError(task, 'Reasoning provider does not support assembled Part cognition');
    if ((input.hypothesisHistory ?? []).some(prediction => prediction.agentId !== input.agentId)) throw new InfrastructureError(task, 'Hypothesis history ownership mismatch');
    if ((input.predictions ?? []).some(prediction => prediction.agentId !== input.agentId) || (input.hypothesis && input.hypothesis.agentId !== input.agentId))
      throw new InfrastructureError(task, 'Inference prediction ownership mismatch');
    if (input.world && input.world.agentId !== input.agentId) throw new InfrastructureError(task, 'Inference WorldState ownership mismatch');
    if (!['thought_resources', 'part_cognition', 'cognition_coverage', 'hypothesis_reflection'].includes(task) && input.world) throw new InfrastructureError(task, 'Offline learning and subjective detail recall cannot receive WorldState');
    if (task === 'cognition_coverage' && (input.workingParts || input.identity || input.memories || input.memory || input.dispositionBindings || input.question))
      throw new InfrastructureError(task, 'Coverage receives expressed products and relevant definitions, never private Part state or raw memories');
    if ((input.coverageProducts || input.hypothesisLimit !== undefined) && task !== 'cognition_coverage') throw new InfrastructureError(task, 'Coverage products are reserved for coverage inference');
    if (task === 'hypothesis_reflection' && (!input.hypothesis?.gapOrigin || input.hypothesis.partId !== null
      || input.world?.thoughtHistory?.length || input.world?.experienced || input.workingParts || input.identity || input.memories || input.dispositions))
      throw new InfrastructureError(task, 'Gap reflection requires factual-only evidence and its own capsule; no private state or imagination');
    if ((input.hypothesis || input.laterEvidence || input.outcome) && task !== 'hypothesis_reflection')
      throw new InfrastructureError(task, 'Hypothesis outcome evidence is reflection-only');
    if ((input.dispositionHistory || input.hypothesisHistory || input.observations || input.predictionTrajectories) && task !== 'disposition_learning') throw new InfrastructureError(task, 'Structural evidence is offline only');
    if (input.learningTraces && task !== 'disposition_learning') throw new InfrastructureError(task, 'Learning traces are offline-only evidence');
    if (task === 'experiential_formation' && (input.workingParts || input.identity || input.dispositionBindings || input.memory || input.question))
      throw new InfrastructureError(task, 'Experiential formation receives committed subjective memories and relevance structures only');
    if (input.synthesisPolicy && task !== 'memory_synthesis') throw new InfrastructureError(task, 'Synthesis detail policy is reserved for offline memory synthesis');
    if (task === 'memory_synthesis' && (input.workingParts || input.identity || input.dispositionBindings || input.memory || input.question || input.dispositions?.length !== 1))
      throw new InfrastructureError(task, 'Memory synthesis receives one disposition and selected subjective evidence only');
    if (task === 'memory_reinterpretation' && (input.workingParts || input.identity || input.dispositions || input.dispositionBindings || input.memory || input.question))
      throw new InfrastructureError(task, 'Memory reinterpretation receives selected subjective evidence only');
    if ((input.memories ?? []).some(memory => memory.agentId !== input.agentId) || (input.memory && input.memory.agentId !== input.agentId)) throw new InfrastructureError(task, 'Inference memory ownership mismatch');
    if ((input.workingParts ?? []).some(part => part.agentId !== input.agentId)
      || (input.dispositions ?? []).some(disposition => disposition.agentId !== input.agentId)
      || (['thought_resources', 'part_cognition'].includes(task) && (input.workingParts?.length ?? 0) > 1)
      || (input.identity && (input.identity.agentId !== input.agentId || !['thought_resources', 'part_cognition'].includes(task) || input.dispositions?.length
        || input.dispositionBindings?.length || input.workingParts?.some(part => part.name !== 'self'))))
      throw new InfrastructureError(task, 'Identity is permitted only for the same-Agent fallback Part');
    const request: ConstructedInput = freeze({ task, agentId: input.agentId,
      ...(input.world ? { world: input.world } : {}), ...(input.dispositions ? { dispositions: task === 'disposition_learning' ? input.dispositions : input.dispositions.map(ordinaryDisposition) } : {}),
      ...(input.dispositionBindings ? { dispositionBindings: input.dispositionBindings } : {}),
      ...(input.memories ? { memories: input.memories.map(memoryWithoutFormationAffect) } : {}), ...(input.memory ? { memory: memoryWithoutFormationAffect(input.memory) } : {}),
      ...(input.workingParts ? { workingParts: input.workingParts } : {}),
      ...(input.hypothesis ? { hypothesis: input.hypothesis } : {}),
      ...(input.laterEvidence ? { laterEvidence: input.laterEvidence } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.hypothesisLimit !== undefined ? { hypothesisLimit: z.number().int().min(0).max(3).parse(input.hypothesisLimit) } : {}),
      ...(input.coverageProducts ? { coverageProducts: CoverageProductSchema.array().parse(input.coverageProducts) } : {}),
      ...(task === 'memory_synthesis' ? { synthesisPolicy: SynthesisPolicySchema.parse(input.synthesisPolicy ?? {}) } : {}),
      ...(input.predictions ? { predictions: input.predictions } : {}),
      ...(input.hypothesisHistory ? { hypothesisHistory: input.hypothesisHistory } : {}),
      ...(input.dispositionHistory ? { dispositionHistory: input.dispositionHistory } : {}),
      ...(input.observations ? { observations: input.observations } : {}),
      ...(input.predictionTrajectories ? { predictionTrajectories: PredictionTrajectorySchema.array().parse(input.predictionTrajectories) } : {}),
      ...(input.learningTraces ? { learningTraces: DispositionLearningTraceSchema.array().parse(input.learningTraces) } : {}),
      ...(input.identity ? { identity: input.identity } : {}), ...(input.question !== undefined ? { question: input.question } : {}),
    });
    const started = this.inspection.emit(input.agentId, input.world?.cycleId ?? null, 'construction.inference_started', request);
    const raw = await this.reasoning.constructed(request);
    const result = constructedOutputs[task].safeParse(raw);
    this.inspection.emit(input.agentId, input.world?.cycleId ?? null, 'runtime.validation', { inputEventId: started.id,
      task, contract: `constructedOutputs.${task}`, status: result.success ? 'accepted' : 'rejected',
      issues: result.success ? [] : result.error.issues.slice(0, 40).map(issue => ({ path: issue.path.join('.'), code: issue.code })),
      result: result.success ? result.data : null });
    if (!result.success) throw result.error;
    if (task === 'part_cognition' && input.world) validateActionSpace(input.world, (result.data as z.infer<typeof PartGenerationSchema>).cognition.proposal);
    const inferenceSource = this.reasoning.sourceFor?.(raw);
    if (inferenceSource) this.inferenceSources.set(result.data, inferenceSource);
    return result.data as z.infer<typeof constructedOutputs[T]>;
  }
  private async judge(input: JudgmentInput) {
    if (!input.candidates.length) return [];
    const thresholds = input.task === 'disposition_activation' ? Object.fromEntries(input.candidates.map(candidate => [candidate.id, (candidate.context as { disposition: Disposition }).disposition.threshold])) : undefined;
    input = { ...input, candidates: input.candidates.map(candidate => {
      const context = candidate.context as { disposition?: Disposition };
      return context.disposition ? { ...candidate, context: { ...context, disposition: input.task === 'disposition_activation' ? activationDisposition(context.disposition) : ordinaryDisposition(context.disposition) } } : candidate;
    }) };
    if (!this.decisions.judge) throw new InfrastructureError(input.task, 'Decision provider does not support constructed judgments');
    const judgeBatch = async (candidates: JudgmentInput['candidates']): Promise<z.infer<typeof ActivationScoreSchema>[]> => {
      const batch = freeze({ ...input, candidates });
      const started = this.inspection.emit(input.agentId, input.world.cycleId, 'construction.judgment_started', batch);
      let result: z.infer<typeof ActivationScoreSchema>[];
      try {
        const raw = await this.decisions.judge!(batch);
        const parsed = ActivationScoreSchema.array().safeParse(raw);
        if (!parsed.success) {
          this.inspection.emit(input.agentId, input.world.cycleId, 'runtime.validation', { inputEventId: started.id, task: input.task,
            contract: 'ActivationScoreSchema[]', status: 'rejected', result: null,
            issues: parsed.error.issues.slice(0, 40).map(issue => ({ path: issue.path.join('.'), code: issue.code })) });
          throw parsed.error;
        }
        result = parsed.data;
      }
      catch (error) {
        if (!(error instanceof ContextLimitError) || candidates.length <= 1) throw error;
        const midpoint = Math.ceil(candidates.length / 2);
        return [...await judgeBatch(candidates.slice(0, midpoint)), ...await judgeBatch(candidates.slice(midpoint))];
      }
      const expected = new Set(batch.candidates.map(candidate => candidate.id));
      if (result.length !== expected.size || new Set(result.map(score => score.partId)).size !== expected.size
        || result.some(score => !expected.has(score.partId))) {
        this.inspection.emit(input.agentId, input.world.cycleId, 'runtime.validation', { inputEventId: started.id, task: input.task,
          contract: 'independent candidate coverage', status: 'rejected', result: null, issues: [{ path: 'candidates', code: 'each_supplied_id_exactly_once' }] });
        throw new InfrastructureError(input.task, 'Every supplied candidate must be scored exactly once');
      }
      this.inspection.emit(input.agentId, input.world.cycleId, 'runtime.validation', { inputEventId: started.id, task: input.task,
        contract: 'ActivationScoreSchema[] + independent candidate coverage', status: 'accepted', result, issues: [] });
      this.inspection.emit(input.agentId, input.world.cycleId, 'construction.judgment', { input: batch, scores: result, ...(thresholds ? { thresholds } : {}) });
      return result;
    };
    const scores: z.infer<typeof ActivationScoreSchema>[] = [];
    for (let offset = 0; offset < input.candidates.length; offset += 100) {
      scores.push(...await judgeBatch(input.candidates.slice(offset, offset + 100)));
    }
    return scores;
  }
  private retire(part: Part, world: WorldState, reason: string) {
    const current = this.store.get('part', part.id);
    this.mutations.patch(current.id, current.version, { lifecycle: 'archived',
      ...(current.instance ? { instance: { ...current.instance, retirement: { cycleId: world.cycleId, reason } } } : {}) },
      { origin: 'organic_cognition', reason, sourceIds: [world.id] }, world.cycleId);
    this.inspection.emit(world.agentId, world.cycleId, 'part.instance_retired', { partId: part.id, reason });
  }
  /** Ordinary relevance scoring without recall, generations or psychological writes. */
  async assess(world: WorldState, threadId?: string, inquiry?: string): Promise<DispositionAssessment> {
    freeze(world);
    const agentId = world.agentId;
    const openPredictions = this.store.list('prediction', agentId).filter(prediction => prediction.status === 'open');
    const interestSettings = DispositionInterestSettingsSchema.parse(this.store.agentActivationSettings(agentId).dispositionInterests ?? {});
    const definitions = this.store.list('disposition', agentId).map(disposition => interestDisposition(disposition, world.capturedAt, interestSettings));
    const durable = definitions.filter(disposition => disposition.active && !disposition.temporary);
    const temporary = definitions.filter(disposition => disposition.temporary && disposition.active
      && disposition.scaffold && disposition.scaffold.createdCycle !== world.cycleId
      && disposition.scaffold.threadId === (threadId ?? null)
      && openPredictions.some(prediction => prediction.id === disposition.sourcePredictionId));
    const includeProcessing = this.store.agentActivationSettings(agentId).includeProcessingDispositions ?? false;
    const busy = (dispositionId: string) => this.isProcessing({ agentId, threadId: threadId ?? null, dispositionId });
    const eligible = [...durable, ...temporary].filter(disposition => includeProcessing || !busy(disposition.id));
    const eligibleIds = new Set(eligible.map(disposition => disposition.id));
    const persisted = definitions;
    const eligibility = persisted.map(disposition => {
      const available = eligibleIds.has(disposition.id);
      const reasons = available ? [disposition.temporary ? 'open prior-cycle investigation in this thread' : 'live durable scope'] : [
        ...(!disposition.active ? ['inactive scope'] : []),
        ...(!includeProcessing && busy(disposition.id) ? ['currently processing; excluded by activation policy'] : []),
        ...(disposition.temporary && !disposition.scaffold ? ['no current persisted scaffold'] : []),
        ...(disposition.scaffold?.createdCycle === world.cycleId ? ['created in this cycle; later-cycle eligibility required'] : []),
        ...(disposition.scaffold && disposition.scaffold.threadId !== (threadId ?? null) ? ['different thread'] : []),
        ...(disposition.temporary && !openPredictions.some(prediction => prediction.id === disposition.sourcePredictionId) ? ['owning investigation is not open'] : []),
      ];
      return { dispositionId: disposition.id, name: disposition.name, version: disposition.version, temporary: disposition.temporary,
        threshold: disposition.threshold, eligible: available, reasons: reasons.length ? reasons : ['not admitted by the current eligibility policy'] };
    });
    this.inspection.emit(agentId, world.cycleId, 'construction.eligibility', { worldId: world.id, threadId: threadId ?? null, inquiry: inquiry ?? null, scopes: eligibility });
    // Participating scopes may supply independent signals during recruitment, without regenerating their Parts.
    const candidates = eligible.map(disposition => ({ disposition, entityId: `scope_${encodeURIComponent(disposition.scope ?? 'world')}` }));
    const directScores = await this.judge({ task: 'disposition_activation', agentId, world,
      candidates: candidates.map(binding => ({ id: binding.disposition.id,
        question: `How strongly does ${binding.disposition.name} register directly within its own scope? Score independently 0–4.`,
        context: { disposition: { ...binding.disposition, prerequisites: [], activationAssociations: [] }, scope: binding.disposition.scope,
          activationPhase: activationAssociations(binding.disposition).length ? 'baseline' : 'final',
          ...(inquiry ? { inquiry } : {}) } })) });
    const baseline = new Map(directScores.map(score => [score.partId, score.score]));
    const associated = candidates.filter(binding => activationAssociations(binding.disposition).length);
    const associatedScores = await this.judge({ task: 'disposition_activation', agentId, world,
      candidates: associated.map(binding => ({ id: binding.disposition.id,
        question: `How strongly does ${binding.disposition.name} register after its contributing and inhibiting associations? Score independently 0–4 using only frozen direct signals.`,
        context: { disposition: binding.disposition, scope: binding.disposition.scope, activationPhase: 'associated',
          baselineActivation: baseline.get(binding.disposition.id),
          associationSignals: activationAssociations(binding.disposition).map(association => ({ ...association,
            ...(association.kind === 'disposition' ? {
              name: eligible.find(source => source.id === association.dispositionId)?.name ?? null,
              baselineActivation: baseline.get(association.dispositionId) ?? 0,
              available: baseline.has(association.dispositionId),
            } : {}) })),
          ...(inquiry ? { inquiry } : {}) } })) });
    const final = new Map([...directScores, ...associatedScores].map(score => [score.partId, score]));
    const scores = [...final.values()];
    const assessment = freeze({ world, threadId: threadId ?? null, dispositions: eligible, scores,
      bindings: candidates });
    this.assessments.set(assessment, { world, threadId: threadId ?? null, inquiry: inquiry ?? null });
    return assessment;
  }
  async prepare(world: WorldState, threadId?: string, recruitment?: { question: string; participatingDispositionIds: string[]; temporaryBudget?: number }, assessment?: DispositionAssessment, onCompleted?: (state: ConstructedCycle) => void): Promise<ConstructedCycle> {
    const agentId = world.agentId;
    const workingParts = this.store.list('part', agentId).filter(part => part.instance
      && !part.instance.retirement && part.lifecycle === 'active' && part.instance.threadId === (threadId ?? null));
    const assessed = assessment ?? await this.assess(world, threadId, recruitment?.question);
    const issued = this.assessments.get(assessed);
    if (!issued || issued.world !== world || issued.threadId !== (threadId ?? null) || issued.inquiry !== (recruitment?.question ?? null))
      throw new InfrastructureError('disposition_activation', 'Assessment must belong to this runtime and identical snapshot, thread and inquiry');
    const { scores } = assessed;
    const openPredictions = this.store.list('prediction', agentId).filter(prediction => prediction.status === 'open');
    const bindings = assessed.bindings.filter(binding => !recruitment?.participatingDispositionIds.includes(binding.disposition.id));
    const qualifiedBindings = bindings.filter(binding => scores.some(score => score.partId === binding.disposition.id && score.score >= binding.disposition.threshold));
    const temporaryBudget = recruitment?.temporaryBudget ?? this.maxTemporaryParts;
    const qualifiedTemporary = qualifiedBindings.filter(binding => binding.disposition.temporary)
      .sort((a, b) => scores.find(score => score.partId === b.disposition.id)!.score - scores.find(score => score.partId === a.disposition.id)!.score);
    const admittedTemporary = new Set(qualifiedTemporary.slice(0, temporaryBudget).map(binding => binding.disposition.id));
    const activeBindings = qualifiedBindings.filter(binding => (!binding.disposition.temporary || admittedTemporary.has(binding.disposition.id))
      && !this.isProcessing({ agentId, threadId: threadId ?? null, dispositionId: binding.disposition.id }));
    this.inspection.emit(agentId, world.cycleId, 'construction.admission', { worldId: world.id, inquiry: recruitment?.question ?? null,
      scopes: assessed.bindings.map(binding => ({ dispositionId: binding.disposition.id, score: scores.find(score => score.partId === binding.disposition.id)?.score ?? null,
        threshold: binding.disposition.threshold, status: recruitment?.participatingDispositionIds.includes(binding.disposition.id) ? 'already_participating' as const
          : !qualifiedBindings.some(candidate => candidate.disposition.id === binding.disposition.id) ? 'below_threshold' as const
          : binding.disposition.temporary && !admittedTemporary.has(binding.disposition.id) ? 'budget_deferred' as const
          : this.isProcessing({ agentId, threadId: threadId ?? null, dispositionId: binding.disposition.id }) ? 'busy' as const : 'admitted' as const })) });
    if (qualifiedTemporary.length) this.inspection.emit(agentId, world.cycleId, 'construction.temporary_scope_budget', {
      limit: temporaryBudget, activeScopeIds: qualifiedTemporary.map(binding => binding.disposition.id),
      admittedScopeIds: [...admittedTemporary], deferredScopeIds: qualifiedTemporary.filter(binding => !admittedTemporary.has(binding.disposition.id)).map(binding => binding.disposition.id) });
    const autobiography = this.store.list('memory', agentId).map(ordinaryMemory);
    const settings = this.store.agentActivationSettings(agentId);
    const groups = activeBindings.length ? activeBindings : recruitment || this.jobs(agentId).activeCount ? [] : [{ disposition: null, entityId: 'fallback_self' }];
    // Freeze every assembly before inference. Model output cannot select continuity or expose another scope's private state.
    const assemblies = groups.map(group => {
      const matches = workingParts.filter(part => group.disposition
        ? part.instance?.dispositionBindings?.some(binding => binding.dispositionId === group.disposition!.id && binding.entityId === group.entityId)
        : !part.instance?.dispositionBindings?.length && part.name === 'self');
      if (matches.length > 1) throw new InfrastructureError('part_cognition', 'A scope must have one current working instance');
      return { ...group, current: matches[0] ?? null };
    });
    const identity = this.store.get('identity', agentId);
    const generatedCognition: ConstructedCycle['generatedCognition'] = {};
    const recalledMemoryIds: Record<string, string[]> = {};
    const parts: Part[] = [];
    const commitProduct = ({ assembly, selected, product, durationMs }: {
      assembly: typeof assemblies[number]; selected: Memory[]; product: z.infer<typeof PartGenerationSchema>; durationMs: number;
    }) => {
      const part = this.inspection.atomic(() => {
        const formation = product.formation;
        const dispositionBindings = assembly.disposition ? [{ entityId: assembly.entityId, dispositionId: assembly.disposition.id }] : [];
        const fields = { name: assembly.disposition ? formation.name : 'self', mission: formation.mission,
          beliefs: formation.beliefs, strategies: formation.strategies, triggers: formation.triggers,
          emotionalCharge: formation.affect || null,
          stickiness: { retained: true, unresolved: true, concern: formation.concern },
          instance: { createdCycle: assembly.current?.instance?.createdCycle ?? world.cycleId, threadId: threadId ?? null,
            interpretation: formation.interpretation, evidenceMemoryIds: formation.evidenceMemoryIds,
            counterevidenceMemoryIds: formation.counterevidenceMemoryIds, dispositionBindings, retirement: null },
        };
        const change = { origin: 'organic_cognition' as const, reason: 'Assembled scope perspective from disposition and chronological memories', sourceIds: [world.id, ...selected.map(memory => memory.id)] };
        const part = assembly.current
          ? this.mutations.patch(assembly.current.id, assembly.current.version, fields, change, world.cycleId)
          : this.mutations.create(agentId, { ...fields, temporary: true, lifecycle: 'active', mode: 'perspective',
            cognitiveCharacteristics: [], associations: [], lineage: [], provenance: change.sourceIds.slice(0, 200) }, change);
        parts.push(part);
        const inferenceSource = this.inferenceSources.get(product);
        generatedCognition[part.id] = { worldId: world.id, output: product.cognition, durationMs, ...(inferenceSource ? { inferenceSource } : {}) };
        recalledMemoryIds[part.id] = selected.map(memory => memory.id);
        this.inspection.emit(agentId, world.cycleId, 'construction.generated', { partId: part.id, result: product });
        for (const selectedMemory of selected) {
          const memory = this.store.get('memory', selectedMemory.id);
          if ((memory.referencingPartIds ?? (memory.partId ? [memory.partId] : [])).includes(part.id)) continue;
          this.store.save('memory', { ...memory, referencingPartIds: [...new Set([...(memory.referencingPartIds ?? (memory.partId ? [memory.partId] : [])), part.id])], version: memory.version + 1 }, memory.version,
            { origin: 'organic_cognition', reason: 'Assembled Part references its selected subjective evidence', sourceIds: [part.id, world.id] });
        }
        this.commitReflection(part, world, product);
        return part;
      });
      onCompleted?.({ world, ...(threadId ? { threadId } : {}), memories: freeze([...selected]),
        parts: [part], generatedCognition: { [part.id]: generatedCognition[part.id]! },
        recalledMemoryIds: { [part.id]: recalledMemoryIds[part.id]! },
        dispositions: assembly.disposition ? [assembly.disposition] : [],
        dispositionBindings: assembly.disposition ? [{ entityId: assembly.entityId, dispositionId: assembly.disposition.id }] : [] });
    };
    // Each validated job commits independently; no cohort completion barrier.
    const settled = await Promise.allSettled(assemblies.map(assembly => this.scheduleJob({
      agentId, threadId: threadId ?? null, dispositionId: assembly.disposition?.id ?? '__identity_fallback__', worldId: world.id,
      run: async () => {
      const recallScores = await this.judge({ task: 'memory_accessibility', agentId, world,
        candidates: autobiography.filter(memory => !assembly.disposition?.suppressedMemoryIds?.includes(memory.id)).map(memory => ({ id: memory.id,
          question: 'Could this lived episode materially inform this disposition perspective, including contrary evidence? Score independently 0–4.',
          context: { memory, disposition: assembly.disposition, scope: assembly.entityId,
            ...(recruitment ? { inquiry: recruitment.question } : {}),
            formedAt: this.store.versions('memory', memory.id)[0]?.at ?? null } })) });
      const ranked = recallScores.filter(score => score.score / 4 >= (settings.memoryRelevanceThreshold ?? 0.5)).sort((a, b) => b.score - a.score);
      const selected = (settings.memoryRecallLimit == null ? ranked : ranked.slice(0, settings.memoryRecallLimit))
        .map(score => autobiography.find(memory => memory.id === score.partId)!)
        .sort((a, b) => (this.store.versions('memory', a.id)[0]?.at ?? '').localeCompare(this.store.versions('memory', b.id)[0]?.at ?? ''));
      const started = performance.now();
      const product = await this.infer('part_cognition', { agentId, world, memories: selected,
        ...(recruitment ? { question: recruitment.question } : {}),
        dispositions: assembly.disposition ? [assembly.disposition] : [],
        dispositionBindings: assembly.disposition ? [{ entityId: assembly.entityId, dispositionId: assembly.disposition.id }] : [],
        // Beliefs are inferred afresh from recalled memory, not inherited as generation evidence.
        workingParts: assembly.current ? [{ ...assembly.current, beliefs: [] }] : [],
        predictions: openPredictions.filter(prediction => prediction.partId === assembly.current?.id),
        ...(!assembly.disposition ? { identity: { ...identity, traits: identity.traits.filter(trait => trait.role === 'self_definition') } } : {}),
      });
      const available = new Set(selected.map(memory => memory.id));
      if (!selected.length && (product.formation.beliefs.length || product.cognition.beliefs?.length))
        throw new InfrastructureError('part_cognition', 'Belief inference requires a currently recalled past memory; direct observations belong in interpretation');
      if ([...product.formation.evidenceMemoryIds, ...product.formation.counterevidenceMemoryIds].some(memoryId => !available.has(memoryId)))
        throw new InfrastructureError('part_cognition', 'Formation cited an unavailable memory');
      if (product.cognition.prediction && openPredictions.some(prediction => prediction.partId === assembly.current?.id))
        throw new InfrastructureError('part_cognition', 'Cannot stack another unresolved prediction');
      const availablePredictions = new Set(openPredictions.filter(prediction => prediction.partId === assembly.current?.id).map(prediction => prediction.id));
      if (product.cognition.affectProposals?.some(proposal => proposal.supportingPredictionIds.some(predictionId => !availablePredictions.has(predictionId))))
        throw new InfrastructureError('part_cognition', 'Affect proposal cited an unavailable owning-Part prediction');
      const proposal = product.cognition.proposal;
      if (proposal?.type === 'navigate' && !world.experienced?.stanceHistory?.some(record => record.id === proposal.stateId))
        throw new InfrastructureError('part_cognition', 'Navigation requires an available mediated stance');
      if ((product.memoryReflection === null) !== (product.memoryGist === null))
        throw new InfrastructureError('part_cognition', 'Memory reflection and gist must be supplied together');
      const result = { assembly, selected, product, durationMs: performance.now() - started };
      commitProduct(result);
      return result;
    } })));
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const products = settled.flatMap(result => result.status === 'fulfilled' && result.value.status === 'completed' ? [result.value.value] : []);
    this.inspection.atomic(() => {
      const retained = new Set(parts.map(part => part.id));
      const unfinishedCycles = this.store.cycles(agentId).filter(cycle => cycle.status === 'running').map(cycle => cycle.id);
      const pendingContributors = new Set(this.store.eventsByType(agentId, ['construction.generated'], unfinishedCycles)
        .flatMap(event => event.type === 'construction.generated' ? [event.payload.partId] : []));
      if (!recruitment) for (const part of workingParts.filter(part => !retained.has(part.id) && !this.pendingBidOwners.has(part.id) && !pendingContributors.has(part.id) && !(part.instance?.dispositionBindings?.length ? part.instance.dispositionBindings.map(binding => binding.dispositionId) : ['__identity_fallback__']).some(dispositionId => this.isProcessing({ agentId, threadId: threadId ?? null, dispositionId })))) this.retire(part, world, 'Disposition scope no longer participates in the current cycle');
      for (const part of this.store.list('part', agentId).filter(part => !part.instance && part.lifecycle === 'active'))
        this.retire(part, world, 'Historical persistent Part does not participate in assembled cognition');
    });
    return { world, ...(threadId ? { threadId } : {}), memories: freeze([...new Map(products.flatMap(product => product.selected).map(memory => [memory.id, memory])).values()]),
      parts, generatedCognition, recalledMemoryIds, dispositions: activeBindings.map(binding => binding.disposition),
      dispositionBindings: activeBindings.map(binding => ({ entityId: binding.entityId, dispositionId: binding.disposition.id })) };
  }
  private commitReflection(part: Part, world: WorldState, product: z.infer<typeof PartGenerationSchema>) {
    const reflection = product.memoryReflection;
    if (!reflection) return;
    const memory = MemorySchema.parse({ id: id('memory'), agentId: world.agentId, version: 1, schemaVersion: 1,
      partId: part.id, content: reflection.content, gist: product.memoryGist, context: reflection.context,
      ancestorIds: [world.id], predictionId: null, createdCycle: world.cycleId, referencingPartIds: [part.id],
      ...(world.experienced ? { selfAffectAtFormation: world.experienced.posture.map(({ partId, affect }) => ({ partId, affect })) } : {}),
      encoding: { interpretation: reflection.interpretation, affect: reflection.affect, perceivedDetails: reflection.perceivedDetails,
        prediction: null, outcome: null } });
    this.store.save('memory', memory, 0, { origin: 'organic_cognition', reason: 'Subjective reflection in ordered Part cognition', sourceIds: [world.id, part.id] });
    this.inspection.emit(world.agentId, world.cycleId, 'memory.episodic_created', memory);
  }
  async formFromExperience(agentId: string, cycleId: string) {
    const cycle = this.store.cycle(cycleId);
    if (cycle.agentId !== agentId) throw new MutationValidationError('Experience cycle ownership mismatch');
    const memories = this.store.list('memory', agentId).filter(memory => memory.createdCycle === cycleId && !memory.deleted);
    // Each episode is a committed psychological product; no inference for empty experience.
    for (const memory of memories) {
      const definitions = this.store.list('disposition', agentId).filter(disposition => (!disposition.temporary && disposition.active) || (disposition.temporary
        && disposition.scaffold?.threadId === (cycle.threadId ?? null)
        && (disposition.active || disposition.sourcePredictionId === memory.predictionId)));
      const predictions = this.store.list('prediction', agentId).filter(prediction => prediction.status === 'resolved'
        && prediction.id === memory.predictionId && prediction.memoryId === memory.id);
      const result = await this.infer('experiential_formation', { agentId, memories: [memory], predictions, dispositions: definitions });
      validateExperientialFormation(result, [memory.id], definitions.map(disposition => disposition.id));
      if (result.operation === 'NO_CHANGE') continue;
      this.inspection.atomic(() => {
        const evidence = { memoryId: memory.id, predictionId: predictions[0]?.id ?? null, cycleId,
          threadId: cycle.threadId ?? null, dispositionVersion: null as number | null,
          relationship: 'unclassified' as const, retrievalUsefulness: 'unknown' as const,
          reconciliation: 'pending' as const, reason: result.reason };
        if (result.operation === 'ATTACH_TO_EXISTING') {
          const current = this.store.get('disposition', result.dispositionId);
          if (current.memoryIds.includes(memory.id)) return;
          const development = current.development ?? { retrievalIntent: current.concern, contextCues: [], internalStateCues: [],
            status: 'provisional' as const, confidence: 'Developmental status not previously recorded', lineage: [],
            previousVersion: null, evidence: [], createdAt: now() };
          const next = DispositionSchema.parse({ ...current, version: current.version + 1,
            memoryIds: [...current.memoryIds, memory.id], development: { ...development, previousVersion: current.version,
              evidence: [...development.evidence, { ...evidence, dispositionVersion: current.version }] } });
          this.store.save('disposition', next, current.version, { origin: 'organic_cognition', reason: result.reason, sourceIds: [memory.id] });
          this.inspection.emit(agentId, cycleId, 'disposition.learned', next);
        }
      });
    }
  }
  async learn(agentId: string, memories: Memory[], predictions: Prediction[], selectedCycleIds = memories.map(memory => memory.createdCycle)) {
    const resolved = predictions.filter(prediction => prediction.status === 'resolved' && prediction.memoryId && memories.some(memory => memory.id === prediction.memoryId));
    const definitions = this.store.list('disposition', agentId);
    const selected = new Set(selectedCycleIds);
    const cycles = this.store.cycles(agentId).filter(cycle => cycle.kind !== 'attention_monitor' && cycle.status === 'completed' && selected.has(cycle.id));
    const events = this.store.eventsByType(agentId, ['construction.judgment', 'part.thought'], cycles.map(cycle => cycle.id));
    const learningTraces = cycles.map(cycle => DispositionLearningTraceSchema.parse({
      cycleId: cycle.id, sequence: cycle.sequence, threadId: cycle.threadId ?? null,
      activations: events.flatMap(event => {
        if (event.cycleId !== cycle.id || event.type !== 'construction.judgment' || event.payload.input.task !== 'disposition_activation') return [];
        return event.payload.scores.filter(score => (event.payload.input.candidates.find(candidate => candidate.id === score.partId)?.context as { activationPhase?: string })?.activationPhase !== 'baseline').map(score => {
          const candidate = event.payload.input.candidates.find(candidate => candidate.id === score.partId)!;
          const disposition = (candidate.context as { disposition: Disposition }).disposition;
          return { dispositionId: score.partId, dispositionVersion: disposition.version, scope: disposition.scope,
            baselineScore: events.flatMap(direct => direct.cycleId === cycle.id && direct.type === 'construction.judgment'
              && direct.payload.input.task === 'disposition_activation'
              && direct.payload.input.candidates.some(candidate => candidate.id === score.partId && (candidate.context as { activationPhase?: string }).activationPhase === 'baseline')
              ? direct.payload.scores.filter(baseline => baseline.partId === score.partId).map(baseline => baseline.score) : []).at(0) ?? score.score,
            score: score.score, active: score.score >= (event.payload.thresholds?.[score.partId] ?? disposition.threshold) };
        });
      }),
      thoughts: events.flatMap(event => event.cycleId === cycle.id && event.type === 'part.thought'
        ? [{ partId: event.payload.partId, dispositionIds: event.payload.partSnapshot.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [],
          interpretation: event.payload.output.interpretation, thought: event.payload.output.thought, proposal: event.payload.output.proposal }] : []),
    }));
    const observations = { episodes: memories.map(memory => ({ memoryId: memory.id, cycleId: memory.createdCycle, context: memory.context })),
      coactivations: cycles.map(cycle => ({ cycleId: cycle.id,
        dispositionIds: learningTraces.find(trace => trace.cycleId === cycle.id)!.activations.filter(activation => activation.active).map(activation => activation.dispositionId),
        experiencedMemoryIds: Object.fromEntries(learningTraces.find(trace => trace.cycleId === cycle.id)!.activations.filter(activation => activation.active).map(activation => [activation.dispositionId,
          memories.filter(memory => memory.createdCycle === cycle.id && (memory.partId && learningTraces.find(trace => trace.cycleId === cycle.id)!.thoughts.some(thought =>
            thought.partId === memory.partId && thought.dispositionIds.includes(activation.dispositionId))
            || (memory.predictionId !== null && definitions.find(disposition => disposition.id === activation.dispositionId)?.sourcePredictionId === memory.predictionId))).map(memory => memory.id)])),
        recalledMemoryIds: Object.fromEntries(events.flatMap(event => event.cycleId === cycle.id && event.type === 'part.thought'
          ? (event.payload.partSnapshot.instance?.dispositionBindings ?? []).map(binding => [binding.dispositionId, event.payload.recalledMemoryIds ?? []]) : [])),
      })) };
    const dispositionHistory = definitions.flatMap(disposition => this.store.versions('disposition', disposition.id).map(record => record.state));
    const usedScaffoldIds = new Set(learningTraces.flatMap(trace => trace.activations.filter(activation => activation.active).map(activation => activation.dispositionId)));
    const endedHypotheses = this.store.list('prediction', agentId).filter(prediction => prediction.status !== 'open'
      && definitions.some(disposition => disposition.scaffold && disposition.sourcePredictionId === prediction.id && usedScaffoldIds.has(disposition.id)));
    const learningPredictions = [...new Map([...resolved, ...endedHypotheses].map(prediction => [prediction.id, prediction])).values()];
    const trajectories = predictionTrajectories(this.store, agentId, learningPredictions, definitions);
    const proposal = LearningSchema.parse(await this.infer('disposition_learning', { agentId, memories, predictions: learningPredictions,
      dispositions: definitions, learningTraces, dispositionHistory, predictionTrajectories: trajectories,
      hypothesisHistory: learningPredictions.flatMap(prediction => this.store.versions('prediction', prediction.id).map(record => record.state)), observations }));
    const committed = commitReconciliation(this.store, this.inspection, agentId, proposal.operations, memories, observations,
      Object.fromEntries(definitions.map(disposition => [disposition.id, disposition.version])), trajectories);
    const interpretation = await this.infer('memory_reinterpretation', { agentId, memories, predictions: resolved });
    const selectedMemoryIds = new Set(memories.map(memory => memory.id));
    if (new Set(interpretation.revisions.map(revision => revision.memoryId)).size !== interpretation.revisions.length
      || interpretation.revisions.some(revision => !selectedMemoryIds.has(revision.memoryId) || revision.supportingMemoryIds.some(memoryId => !selectedMemoryIds.has(memoryId))))
      throw new MutationValidationError('Memory reinterpretation requires unique selected episodes and supporting evidence');
    this.inspection.atomic(() => {
      for (const revision of interpretation.revisions) {
        const current = this.store.get('memory', revision.memoryId);
        const original = memories.find(memory => memory.id === revision.memoryId)!;
        if (current.version !== original.version) throw new MutationValidationError('Memory reinterpretation evidence changed during inference');
        if (current.content === revision.content && current.gist === revision.gist) continue;
        const next = MemorySchema.parse({ ...current, version: current.version + 1, content: revision.content, gist: revision.gist });
        this.store.save('memory', next, current.version, { origin: 'consolidation', reason: `${revision.reason} Continuity: ${revision.continuity}`, sourceIds: revision.supportingMemoryIds });
        this.inspection.emit(agentId, null, 'memory.reconsolidated', next);
      }
    });
    const result = { ...proposal, revisions: interpretation.revisions, dispositions: committed.filter(disposition => disposition.version === 1) };
    return result;
  }
  async recall(agentId: string, memoryId: string, question: string) {
    const memory = this.store.get('memory', memoryId);
    if (memory.agentId !== agentId || memory.deleted) throw new Error('Memory is unavailable for this Agent');
    return EffortfulRecallSchema.parse(await this.infer('effortful_recall', { agentId, memory, question }));
  }
}
