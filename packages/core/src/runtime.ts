import { ordinaryDisposition } from './domain.js';
import { ConstructedCognition, type DispositionAssessment } from './constructed.js';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { ExecutiveSkill } from './executive-skill.js';
import { CognitionSchema, PredictionDraftSchema, PredictionOutcomeSchema, ExecutionSchema, FactSchema, WorldStateSchema, freeze, id, type Contribution, type Cycle, type Execution, type Fact, type ActionBid, type WorldState } from './domain.js';
import { InfrastructureError, type DecisionProvider, type EmbeddingProvider, type Executor, type PartContext, type ReasoningProvider, type Store } from './contracts.js';
import { defaultActivationPolicy, type ActivationPolicy } from './activation.js';
import { partContext, thoughtHistory } from './context.js';
import { Inspection } from './inspection.js';
import { PartMutations } from './mutations.js';
import { Predictions } from './predictions.js';
import { select } from './self.js';
import { experiencedState, factualWorld } from './experienced.js';
import { compileExecutionContract } from './execution-contract.js';
import { prepareGuidanceContinuation, acceptGuidanceContinuation, currentExecutionRequests, GuidanceResponseError } from './guidance-continuation.js';
import type { ExternalCapabilities } from './mcp-configuration.js';
import { publicSkills, selectSkillMethod, SkillInvocationError } from './skill-invocation.js';
import type { RemainderAuthority } from './remainder-authority.js';
import { createHash } from 'node:crypto';
import { selectedActivity, type SelectedActivity } from './execution-review.js';
import { ExecutiveCheckpointKindSchema, ExecutiveCompetenceSchema, evaluateExecutiveAttention, type ExecutiveCompetence } from './executive-attention.js';

export type RuntimeOptions = { activation: ActivationPolicy; recentFactLimit: number | null; thoughtDecay?: { ordinary: number; selected: number }; maxDeliberationRounds: number; maxTemporaryParts?: number; maxGuidanceContexts?: number; maxSkillContexts?: number; coverage?: { maxHypothesesPerCycle: number; maxOpenHypotheses: number } };
export const defaultRuntimeOptions: RuntimeOptions = { activation: defaultActivationPolicy, recentFactLimit: null, thoughtDecay: { ordinary: 0.2, selected: 0.1 }, maxDeliberationRounds: 2 };
export class CognitiveRuntime {
  readonly constructed: ConstructedCognition;
  readonly mutations: PartMutations;
  readonly predictions: Predictions;
  constructor(private readonly store: Store, private readonly decisions: DecisionProvider,
    private readonly reasoning: ReasoningProvider, _embeddings: EmbeddingProvider, private readonly executor: Executor,
    readonly inspection: Inspection, private readonly options = defaultRuntimeOptions,
    private readonly loadSkillPackage?: (agentId: string, skillId: string, version: number) => Promise<{ skill: ExecutiveSkill; digest: string }>,
    private readonly checkRemainder?: (input: { agentId: string; threadId: string | null; cycleId: string; bid: ActionBid }) => RemainderAuthority | undefined) {
    z.number().int().min(0).max(50).nullable().parse(options.recentFactLimit);
    if (options.thoughtDecay) {
      z.number().positive().max(1).parse(options.thoughtDecay.ordinary);
      z.number().positive().max(options.thoughtDecay.ordinary).parse(options.thoughtDecay.selected);
    }
    z.number().int().min(0).max(8).parse(options.maxDeliberationRounds);
    z.number().int().min(0).max(100).parse(options.maxTemporaryParts ?? 12);
    z.number().int().min(0).max(100).parse(options.maxGuidanceContexts ?? 20);
    z.number().int().min(0).max(100).parse(options.maxSkillContexts ?? 20);
    if (options.coverage) {
      z.number().int().min(0).max(3).parse(options.coverage.maxHypothesesPerCycle);
      z.number().int().min(0).max(30).parse(options.coverage.maxOpenHypotheses);
    }
    this.mutations = new PartMutations(store, inspection);
    this.constructed = new ConstructedCognition(store, decisions, reasoning, this.mutations, inspection, options.maxTemporaryParts ?? 12);
    this.predictions = new Predictions(store, inspection, this.mutations);
  }
  async run(agentId: string, facts: Fact[], threadId?: string, externalCapabilities?: ExternalCapabilities,
    externalSkillDocuments?: WorldState['externalSkillDocuments']): Promise<{ cycle: Cycle; execution: Execution | null; executions: Execution[] }> {
    const incoming = z.array(FactSchema).min(1).max(50).parse(facts);
    let cycle = this.store.startCycle(agentId, threadId);
    let stage = 'worldstate';
    try {
      this.inspection.emit(agentId, cycle.id, 'cycle.started', cycle);
      const executiveEnabled = this.store.executiveProfile(agentId).enabled;
      const externalExecutionRequests = executiveEnabled ? currentExecutionRequests(this.store, agentId, threadId ?? null, this.options.maxGuidanceContexts ?? 20) : [];
      const externalSkills = executiveEnabled ? publicSkills(this.store, agentId, threadId ?? null, this.options.maxSkillContexts ?? 20) : [];
      const world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId, cycleId: cycle.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt, facts: [...this.store.recentFacts(agentId, this.options.recentFactLimit, threadId), ...incoming.map(fact => ({ ...fact, timestamp: fact.timestamp ?? cycle.startedAt, originCycleId: cycle.id }))],
        ...(executiveEnabled && externalCapabilities ? { externalCapabilities } : {}),
        ...(externalExecutionRequests.length ? { externalExecutionRequests } : {}),
        ...(externalSkills.length ? { externalSkills } : {}),
        ...(executiveEnabled && externalSkillDocuments?.length ? { externalSkillDocuments } : {}),
        thoughtHistory: thoughtHistory(this.store, cycle, this.options.thoughtDecay),
        experienced: experiencedState(this.store, cycle) }));
      this.store.saveWorld(world);
      this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
      return await this.cognize(cycle, world, threadId);
    } catch (error) {
      const current = this.store.cycle(cycle.id);
      if (current.status === 'failed') throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.store.saveCycle({ ...current, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage, message });
      throw new InfrastructureError(stage, message, { cause: error });
    }
  }

  private async cognize(cycle: Cycle, world: WorldState, threadId?: string, assessment?: DispositionAssessment, activity?: SelectedActivity) {
    const agentId = world.agentId; let stage = 'part_cognition';
    try {
      stage = 'part_cognition';
      const constructedState = await this.constructed.prepare(world, threadId, undefined, assessment);
      const recalledContext = async (snapshot: typeof world, part: import('./domain.js').Part, activation: import('./domain.js').Activation): Promise<PartContext> => {
        const context = partContext(this.store, snapshot, part, activation);
        return freeze({ ...context,
          dispositions: constructedState.dispositions.filter(disposition => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === disposition.id)).map(ordinaryDisposition),
          memories: context.memories.filter(memory => constructedState.recalledMemoryIds[part.id]?.includes(memory.id) ?? true) });
      };
      stage = 'activation';
      const parts = this.store.list('part', agentId).map(part => this.store.partForThread(part.id, threadId));
      const identity = structuredClone(this.store.get('identity', agentId));
      if (identity.mask && cycle.sequence > identity.mask.expiresAfterCycle) identity.mask = null;
      const results = constructedState.parts.map(part => ({ partId: part.id, score: 2, previous: 2, delta: 0,
        similarity: 0, reasons: [part.instance?.dispositionBindings?.length ? 'disposition_participation' : 'identity_fallback_participation'], active: true }));
      this.inspection.emit(agentId, cycle.id, 'activation.scored', { results, primitives: [], provider: 'code/assembly participation' });
      stage = 'prediction_evaluation';
      const cycleSequences = new Map(this.store.cycles(agentId).map(record => [record.id, record.sequence]));
      for (const prediction of this.store.list('prediction', agentId).filter(p => p.status === 'open' && p.createdCycle !== cycle.id)) {
        if (prediction.gapOrigin) {
          if (prediction.gapOrigin.threadId !== (threadId ?? null)) continue;
          if (!this.decisions.checkHypothesis) throw new InfrastructureError('hypothesis_outcome', 'Decision provider lacks gap hypothesis checks');
          const createdSequence = cycleSequences.get(prediction.createdCycle) ?? world.sequence;
          const laterEvidence = world.facts.filter(fact => fact.originCycleId && (cycleSequences.get(fact.originCycleId) ?? 0) > createdSequence);
          const factual = factualWorld(world);
          const outcome = PredictionOutcomeSchema.parse(await this.decisions.checkHypothesis(freeze({ world: factual, prediction, laterEvidence })));
          this.inspection.emit(agentId, cycle.id, 'prediction.outcome_checked', { partId: null, predictionId: prediction.id, outcome, provider: this.decisions.label });
          if (outcome === 'incomplete') continue;
          const update = outcome === 'irrelevant' ? { operation: 'invalidate' as const, revision: null, evaluation: null,
            memory: null, mutation: null, reason: 'Gap hypothesis no longer relevant to its original context' }
            : { ...await this.constructed.infer('hypothesis_reflection', { agentId, world: factual,
                hypothesis: prediction, laterEvidence, outcome }), revision: null, mutation: null };
          this.predictions.apply(prediction, world, update, outcome === 'correct' || outcome === 'incorrect' ? outcome : undefined);
          continue;
        }
        const part = parts.find(p => p.id === prediction.partId);
        if (!part?.instance) continue; // Legacy forecasts remain offline history, not online Part learning.
        const sourceCycle = this.store.cycles(agentId).find(cycle => cycle.id === prediction.createdCycle);
        if ((sourceCycle?.threadId ?? part.instance?.threadId ?? undefined) !== threadId) continue;
        // Evidence can resolve early; the owning Part decides whether the horizon/evidence permits evaluation.
        const activation = results.find(r => r.partId === part.id) ?? { partId: part.id, similarity: 0, reasons: ['prediction_evidence'], score: 0, previous: 0, delta: 0, active: false };
        const createdSequence = cycleSequences.get(prediction.createdCycle) ?? world.sequence;
        const laterEvidence = world.facts.filter(fact => fact.originCycleId && (cycleSequences.get(fact.originCycleId) ?? 0) > createdSequence);
        const context = freeze({ ...await recalledContext(factualWorld(world), part, activation), prediction, laterEvidence,
          recentThoughts: [] });
        let update;
        let resolvedOutcome: 'correct' | 'incorrect' | undefined;
        try {
          const outcome = PredictionOutcomeSchema.parse(await this.decisions.checkPrediction(context));
          this.inspection.emit(agentId, cycle.id, 'prediction.outcome_checked', { partId: part.id, predictionId: prediction.id, outcome, provider: this.decisions.label });
          if (outcome === 'incomplete') continue;
          if (outcome === 'irrelevant') {
            update = { operation: 'invalidate' as const, revision: null, evaluation: null, memory: null, mutation: null,
              reason: 'Bounded outcome check found the prediction irrelevant to its original context.' };
          } else {
            resolvedOutcome = outcome;
            update = await this.reasoning.evaluate(freeze({ ...context, outcome }));
            if (update.operation !== 'resolve') throw new InfrastructureError('prediction_evaluation', 'Correct/incorrect outcome reflection must resolve the prediction');
          }
        } catch (error) {
          if (!(error instanceof InfrastructureError)) throw error;
          const message = error.message;
          this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage: 'prediction_evaluation',
            message: `Prediction evaluation failed; the cycle will continue without updating this prediction. ${message}` });
          continue;
        }
        this.predictions.apply(prediction, world, update, resolvedOutcome);
      }
      stage = 'part_cognition';
      const contexts = new Map<string, PartContext>();
      const availableContributors = constructedState.parts.map(part => ({ partId: part.id, name: part.name }));
      for (const activation of results) {
        const part = this.store.get('part', activation.partId);
        contexts.set(part.id, freeze({ ...await recalledContext(world, part, activation), availableContributors }));
      }
      const contributions: Contribution[] = [];
      // Generations already completed in parallel; publication and persistence remain deterministic.
      const publish = (context: PartContext, generated: typeof constructedState.generatedCognition[string]): Contribution => {
        if (!generated || generated.worldId !== world.id) throw new InfrastructureError('part_cognition', 'Missing assembled Part generation');
        const output = CognitionSchema.parse(generated.output);
        const thoughtEvent = this.inspection.emit(agentId, cycle.id, 'part.thought', { partId: context.part.id, partSnapshot: context.part, recalledMemoryIds: context.memories.map(memory => memory.id),
          predictionSnapshot: context.prediction, output, durationMs: generated.durationMs });
        let formedPrediction = null;
        if (output.prediction) {
          if (context.prediction) throw new InfrastructureError('part_cognition', 'Cannot stack another unresolved prediction');
          formedPrediction = this.predictions.form(context.part.id, world, PredictionDraftSchema.parse(output.prediction), thoughtEvent.id);
        }
        const current = this.store.get('part', context.part.id);
        this.mutations.patch(current.id, current.version, {
          instance: { ...current.instance!, interpretation: output.interpretation },
          ...(output.beliefs ? { beliefs: output.beliefs } : {}),
          ...(output.affect !== undefined ? { emotionalCharge: output.affect || null } : {}),
          ...(output.localGoal !== undefined ? { stickiness: { retained: output.localGoal !== null, unresolved: output.localGoal !== null, concern: output.localGoal ?? '' } } : {}),
        }, { origin: 'organic_cognition', reason: 'Updated scoped perspective from independent cognition', sourceIds: [world.id] }, cycle.id);
        const bid = output.proposal ? { ...output.proposal, id: id('bid'), partId: context.part.id } : null;
        if (bid) this.inspection.emit(agentId, cycle.id, 'part.bid_created', bid);
        return { partId: context.part.id, name: context.part.name, thought: output.thought,
          interpretation: output.interpretation, evidenceSummary: output.evidenceSummary,
          affect: output.affect ?? '',
          prediction: formedPrediction?.expectation ?? context.prediction?.expectation ?? null, bid };
      };
      for (const context of contexts.values()) contributions.push(publish(context, constructedState.generatedCognition[context.part.id]!));
      stage = 'self';
      let navigation: import('./domain.js').NavigationBid | undefined;
      let finalContributions = contributions;
      let continued = false;
      const thoughtsOnly = Boolean(activity) && !contributions.some(contribution => contribution.bid);
      const selected = thoughtsOnly ? null : await select({ world, identity, contributions, contexts, decisions: this.decisions,
        reasoning: this.reasoning, inspection: this.inspection,
        onSelection: items => { finalContributions = items; },
        ...(activity ? { ongoingActivity: activity, onContinue: () => { continued = true; } } : {}),
        onNavigation: bid => { navigation = bid; },
        answerContext: async (context: PartContext, question: string): Promise<PartContext> => {
          if (!context.memories.length) return context;
          const recollection = await this.constructed.infer('effortful_recall', { agentId, question,
            memories: context.memories.map(memory => this.store.get('memory', memory.id)) });
          return freeze({ ...context, effortfulRecollections: [recollection] });
        },
        afterDeliberation: async (current, messages) => {
          const question = messages.at(-1)?.question;
          if (!question) return;
          const participatingDispositionIds = [...contexts.values()].flatMap(context => context.part.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? []);
          const recruited = await this.constructed.prepare(world, threadId, { question, participatingDispositionIds, temporaryBudget: Math.max(0, (this.options.maxTemporaryParts ?? 12)
            - [...contexts.values()].filter(context => context.dispositions?.some(disposition => disposition.temporary)).length) });
          for (const part of recruited.parts) {
            if (contexts.has(part.id)) throw new InfrastructureError('self', 'Recruitment duplicated a participating Part');
            const activation = { partId: part.id, score: 2, previous: 0, delta: 2, similarity: 0,
              reasons: ['deliberation_recruitment'], active: true };
            const context = freeze({ ...partContext(this.store, world, part, activation),
              dispositions: recruited.dispositions.filter(disposition => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === disposition.id)).map(ordinaryDisposition),
              memories: partContext(this.store, world, part, activation).memories.filter(memory => recruited.recalledMemoryIds[part.id]?.includes(memory.id)),
              availableContributors: [...current.map(contribution => ({ partId: contribution.partId, name: contribution.name })),
                ...recruited.parts.map(item => ({ partId: item.id, name: item.name }))] });
            contexts.set(part.id, context);
            current.push(publish(context, recruited.generatedCognition[part.id]!));
          }
        },
        maxDeliberationRounds: this.options.maxDeliberationRounds,
      });
      const chosenStances = (navigation ? [navigation] : selected ?? []).flatMap(bid => {
        const contribution = finalContributions.find(item => item.partId === bid.partId);
        return contribution ? [{ partId: contribution.partId, name: contribution.name,
          interpretation: contribution.interpretation, affect: contribution.affect ?? '', thought: contribution.thought }] : [];
      });
      const resultingStances = navigation
        ? world.experienced!.stanceHistory!.find(record => record.id === navigation!.stateId)!.posture
        : (selected ?? []).flatMap(bid => {
          const stance = chosenStances.find(item => item.partId === bid.partId);
          return stance ? [{ ...stance, ...(bid.resultingPosture ?? {}) }] : [];
        });
      if (navigation) {
        cycle = { ...cycle, selectedBidId: navigation.id, selectedBidIds: [navigation.id] };
        this.store.saveCycle(cycle);
      }
      this.inspection.emit(agentId, cycle.id, 'self.experienced_transition', { id: id('stance'), cycleId: cycle.id,
        threadId: threadId ?? null, before: world.experienced?.posture ?? [], chosen: chosenStances,
        resulting: navigation || resultingStances.length ? resultingStances : world.experienced?.posture ?? [],
        selectedBidIds: navigation ? [navigation.id] : selected?.map(bid => bid.id) ?? [], revisitedStateId: navigation?.stateId ?? null });
      let execution: Execution | null = null;
      const executions: Execution[] = [];
      if (selected) {
        stage = 'execution';
        cycle = { ...cycle, selectedBidId: selected[0]!.id, selectedBidIds: selected.map(bid => bid.id) };
        this.store.saveCycle(cycle);
        for (let index = 0; this.store.executiveProfile(agentId).enabled && index < selected.length; index++) {
          const selectedBid = selected[index]!;
          const group = [selectedBid];
          if (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')) {
            while (selected[index + 1]?.action.kind === 'say' || selected[index + 1]?.action.kind === 'ask') group.push(selected[++index]!);
          }
          for (const bid of group) this.inspection.emit(agentId, cycle.id, 'execution.handoff', { bid });
          let packagedSelection: ReturnType<typeof selectSkillMethod>; let packageRejection: string | undefined;
          if (this.loadSkillPackage) {
            try {
              const reference = selectSkillMethod(this.store, agentId, threadId ?? null, selectedBid);
              if (reference) {
                const parent = await this.loadSkillPackage(agentId, reference.skillId, reference.version);
                const member = reference.memberSkillId
                  ? await this.loadSkillPackage(agentId, reference.memberSkillId, reference.memberVersion!) : parent;
                const current = this.store.executiveSkills(agentId);
                if (!isDeepStrictEqual(current.find(skill => skill.id === parent.skill.id), parent.skill)
                  || !isDeepStrictEqual(current.find(skill => skill.id === member.skill.id), member.skill))
                  throw new Error('Stored package does not match the current approved skill version');
                packagedSelection = { ...reference, procedure: member.skill.procedure, packageDigest: parent.digest,
                  ...(reference.memberSkillId ? { memberPackageDigest: member.digest } : {}) };
              }
            } catch (error) {
              packageRejection = `Skill package selection rejected: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
          if (!this.store.executiveProfile(agentId).enabled) break;
          const contract = this.inspection.atomic(() => {
            let continuation; let guidanceRejection; let selectedSkill; let skillRejection; let remainderRejection; let remainder;
            if (selectedBid.action.kind === 'operate' && selectedBid.action.operation.remainderCorrection) {
              try { remainder = this.checkRemainder?.({ agentId, threadId: threadId ?? null, cycleId: cycle.id, bid: selectedBid }); }
              catch (error) { remainderRejection = error instanceof Error ? error.message : String(error); }
            }
            try { selectedSkill = selectSkillMethod(this.store, agentId, threadId ?? null, selectedBid); }
            catch (error) { if (!(error instanceof SkillInvocationError)) throw error; skillRejection = error.message; }
            if (this.loadSkillPackage && selectedSkill) {
              const { packageDigest: _packageDigest, memberPackageDigest: _memberPackageDigest, ...reference } = packagedSelection ?? {};
              if (packageRejection || !packagedSelection || !isDeepStrictEqual(selectedSkill, reference)) {
                skillRejection = packageRejection ?? 'Skill selection changed during package loading'; selectedSkill = undefined;
              } else selectedSkill = packagedSelection;
            }
            try { if (!skillRejection) continuation = prepareGuidanceContinuation(this.store, agentId, cycle.id, threadId ?? null, selectedBid); }
            catch (error) { if (!(error instanceof GuidanceResponseError)) throw error; guidanceRejection = error.message; }
            const compiled = compileExecutionContract({ agentId, cycleId: cycle.id,
              ...(threadId ? { threadId } : {}), bids: group, predictions: this.store.list('prediction', agentId),
              profile: this.store.executiveProfile(agentId), ...(continuation ? { continuation } : {}),
              ...(guidanceRejection ? { guidanceRejection } : {}), ...(remainderRejection ? { remainderRejection } : {}), ...(remainder ? { remainder } : {}), ...(selectedSkill && !guidanceRejection ? { selectedSkill } : {}),
              ...(skillRejection ? { skillRejection } : {}) });
            this.inspection.emit(agentId, cycle.id, 'execution.contract', compiled);
            acceptGuidanceContinuation(this.store, this.inspection, compiled);
            return compiled;
          });
          if (!this.store.executiveProfile(agentId).enabled) break;
          execution = ExecutionSchema.parse(await (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')
            ? this.executor.executeSay({ agentId, cycleId: cycle.id, bids: group, contract })
            : contract.continuation && this.executor.resume
              ? this.executor.resume({ agentId, cycleId: cycle.id, bid: selectedBid, contract })
              : this.executor.execute({ agentId, cycleId: cycle.id, bid: selectedBid, contract })));
          if (execution.contractId && execution.contractId !== contract.id)
            throw new InfrastructureError('execution', 'External handoff changed the execution contract reference');
          execution = { ...execution, contractId: contract.id };
          if (execution.agentId !== agentId || execution.cycleId !== cycle.id
            || JSON.stringify(execution.action) !== JSON.stringify(selectedBid.action)) throw new InfrastructureError('execution', 'External handoff changed the selected action or owner');
          if ((group.length > 1 && !execution.speech) || (execution.speech && ((selectedBid.action.kind !== 'say' && selectedBid.action.kind !== 'ask')
            || JSON.stringify(execution.speech.bidIds) !== JSON.stringify(group.map(bid => bid.id))))) {
            throw new InfrastructureError('execution', 'Speech execution changed the selected command references');
          }
          this.store.saveExecution(execution);
          executions.push(execution);
          this.inspection.emit(agentId, cycle.id, 'execution.status', execution);
          if (execution.guidance) this.inspection.emit(agentId, cycle.id, 'execution.guidance', execution.guidance);
          this.executor.recorded?.(execution);
        }
      }
      stage = 'cognition_coverage';
      const coverageBudget = this.options.coverage ?? { maxHypothesesPerCycle: 3, maxOpenHypotheses: 6 };
      const predictions = this.store.list('prediction', agentId).filter(prediction =>
        prediction.gapOrigin ? prediction.gapOrigin.threadId === (threadId ?? null)
          : prediction.partId && this.store.get('part', prediction.partId).instance?.threadId === (threadId ?? null));
      const capacity = Math.max(0, coverageBudget.maxOpenHypotheses - predictions.filter(prediction => prediction.gapOrigin && prediction.status === 'open').length);
      if (coverageBudget.maxHypothesesPerCycle) {
        const coverage = await this.constructed.infer('cognition_coverage', { agentId, world, hypothesisLimit: Math.min(capacity, coverageBudget.maxHypothesesPerCycle),
          dispositions: constructedState.dispositions,
          coverageProducts: finalContributions.map(contribution => ({ partId: contribution.partId,
            dispositionIds: contexts.get(contribution.partId)?.part.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [],
            interpretation: contribution.interpretation, thought: contribution.thought,
            evidenceSummary: contribution.evidenceSummary, prediction: contribution.prediction, proposal: contribution.bid ?
              (({ id: _id, partId: _partId, sourceKind: _sourceKind, replacesBidId: _replaces, ...proposal }) => proposal)(contribution.bid) : null })),
          predictions: predictions.filter(prediction => prediction.status === 'open' || prediction.evaluation?.evidenceWorldId === world.id) });
        this.inspection.emit(agentId, cycle.id, 'cognition.coverage', coverage);
        const adjustments = coverage.adjustments ?? [];
        if (new Set(adjustments.map(adjustment => adjustment.predictionId)).size !== adjustments.length)
          throw new InfrastructureError('cognition_coverage', 'A hypothesis can be adjusted at most once per coverage pass');
        for (const adjustment of adjustments) {
          const source = predictions.find(prediction => prediction.id === adjustment.predictionId);
          if (!source?.gapOrigin || source.status !== 'open') throw new InfrastructureError('cognition_coverage', 'Coverage can adjust only supplied open original-thread gap hypotheses');
          if ((adjustment.revision?.scaffolds ?? []).some(scaffold => scaffold.relevantMemoryIds.length))
            throw new InfrastructureError('cognition_coverage', 'Gap revision cannot fabricate recalled memory');
        }
        if (coverage.operation === 'INVESTIGATE') {
          if (coverage.hypotheses.length > Math.min(capacity, coverageBudget.maxHypothesesPerCycle))
            throw new InfrastructureError('cognition_coverage', 'Hypothesis proposal exceeds the remaining investigation budget');
          this.inspection.atomic(() => {
            for (const adjustment of adjustments) this.predictions.apply(predictions.find(prediction => prediction.id === adjustment.predictionId)!, world,
              { operation: adjustment.operation, revision: adjustment.revision, reason: adjustment.reason, evaluation: null, memory: null, mutation: null });
            for (const hypothesis of coverage.hypotheses) this.predictions.formGap(world, hypothesis.prediction, {
              threadId: threadId ?? null, gap: coverage.gap, consequentialValue: coverage.consequentialValue,
              futureInference: hypothesis.futureInference, existingStructureInsufficient: hypothesis.existingStructureInsufficient });
          });
        } else this.inspection.atomic(() => {
          for (const adjustment of adjustments) this.predictions.apply(predictions.find(prediction => prediction.id === adjustment.predictionId)!, world,
            { operation: adjustment.operation, revision: adjustment.revision, reason: adjustment.reason, evaluation: null, memory: null, mutation: null });
        });
      }
      if (activity) this.inspection.emit(agentId, cycle.id, 'execution.review_completed', {
        executionId: activity.executionId, outcome: thoughtsOnly ? 'thoughts_only' : continued ? 'continued' : selected ? 'selected' : 'no_external_selection',
        selectedBidIds: selected?.map(bid => bid.id) ?? [],
      });
      stage = 'experiential_formation';
      await this.constructed.formFromExperience(agentId, cycle.id);
      cycle = { ...cycle, status: 'completed' };
      this.store.saveCycle(cycle);
      this.inspection.emit(agentId, cycle.id, 'cycle.completed', cycle);
      return { cycle, execution, executions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.saveCycle({ ...cycle, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage, message });
      throw new InfrastructureError(stage, message, { cause: error });
    }
  }

  /** Persist an advisory checkpoint, with ordinary activation but no recall, Parts or selection. */
  async monitorExecution(agentId: string, executionId: string, facts: Fact[], checkpoint: 'tool_result' | 'environment',
    competence: ExecutiveCompetence, externalCapabilities?: ExternalCapabilities, consultationReason?: string) {
    if (!this.store.executiveProfile(agentId).enabled) {
      if (consultationReason !== undefined) throw new Error('Executive is disabled');
      return null;
    }
    const incoming = z.array(FactSchema).min(1).max(50).parse(facts);
    ExecutiveCheckpointKindSchema.parse(checkpoint); ExecutiveCompetenceSchema.parse(competence);
    const execution = this.store.executions(agentId).find(item => item.id === executionId);
    if (!execution?.contractId || execution.action.kind !== 'operate') throw new Error('Monitoring requires an attributed operational execution');
    const origin = this.store.cycle(execution.cycleId);
    if (origin.agentId !== agentId) throw new Error('Monitoring execution ownership mismatch');
    const contract = this.store.eventsByType(agentId, ['execution.contract'], [origin.id]).find(event =>
      event.type === 'execution.contract' && event.payload.id === execution.contractId);
    if (!contract || contract.type !== 'execution.contract' || origin.status === 'failed'
      || contract.payload.commands.some(command => !origin.selectedBidIds?.includes(command.bidId)))
      throw new Error('Monitoring requires a nonfailed Self-selected source contract');
    const profile = this.store.executiveProfile(agentId);
    const requestedReason = consultationReason === undefined ? undefined : z.string().trim().min(1).max(4000).parse(consultationReason);
    if (requestedReason && !selectedActivity(this.store, agentId, executionId, origin.threadId ?? null))
      throw new Error('Explicit consultation requires a currently running Self-selected activity');
    if (!requestedReason && (!profile.attention.enabled || !profile.attention.checkpoints.includes(checkpoint))) return null;
    let cycle: Cycle = { ...this.store.startCycle(agentId, origin.threadId), kind: 'attention_monitor' };
    this.store.saveCycle(cycle);
    try {
      this.inspection.emit(agentId, cycle.id, 'cycle.started', cycle);
      if (requestedReason) this.inspection.emit(agentId, cycle.id, 'execution.consultation_requested', {
        executionId, contractId: execution.contractId, reason: requestedReason,
      });
      const activity = selectedActivity(this.store, agentId, executionId, origin.threadId ?? null);
      const world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId, cycleId: cycle.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt,
        ...(activity ? { selectedActivity: activity } : {}),
        facts: [...this.store.recentFacts(agentId, this.options.recentFactLimit, origin.threadId),
          ...incoming.map(fact => ({ ...fact, timestamp: fact.timestamp ?? cycle.startedAt, originCycleId: cycle.id })),
          ...(requestedReason ? [{ source: 'External execution consultation', kind: 'observes' as const,
            text: requestedReason, referenceId: null, timestamp: cycle.startedAt, originCycleId: cycle.id }] : [])],
        ...(externalCapabilities ? { externalCapabilities } : {}),
        externalExecutionRequests: currentExecutionRequests(this.store, agentId, origin.threadId ?? null, this.options.maxGuidanceContexts ?? 20),
        externalSkills: publicSkills(this.store, agentId, origin.threadId ?? null, this.options.maxSkillContexts ?? 20),
        thoughtHistory: thoughtHistory(this.store, cycle, this.options.thoughtDecay), experienced: experiencedState(this.store, cycle) }));
      this.store.saveWorld(world); this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
      const assessment = await this.constructed.assess(world, origin.threadId);
      const relevance = Math.max(0, ...assessment.scores.map(score => score.score));
      const evidenceKey = createHash('sha256').update(JSON.stringify({
        observations: [...new Set(world.facts.map(fact => JSON.stringify([fact.source, fact.kind, fact.text, fact.referenceId])))].sort(),
        competence, dispositions: assessment.dispositions.map(disposition => [disposition.id, disposition.version]),
        experienced: world.experienced, tools: externalCapabilities, settings: profile.attention,
      })).digest('hex');
      // Suppressed records must not extend the review cooldown or erase its hysteresis state.
      const previous = this.store.eventsByType(agentId, ['execution.attention']).filter(event =>
        event.type === 'execution.attention' && event.payload.executionId === executionId && !event.payload.suppressed).at(-1);
      const attention = { executionId, contractId: execution.contractId, checkpoint, relevance, competence, evidenceKey,
        at: cycle.startedAt, profileRevision: profile.revision,
        ...evaluateExecutiveAttention({ settings: profile.attention, relevance, competence, evidenceKey, at: cycle.startedAt,
          ...(previous?.type === 'execution.attention' ? { previous: previous.payload } : {}) }) };
      this.inspection.emit(agentId, cycle.id, 'execution.attention', attention);
      if (this.store.executiveProfile(agentId).enabled && (requestedReason || (profile.attention.reviewInterested && attention.state === 'interested')) && activity
        && selectedActivity(this.store, agentId, executionId, origin.threadId ?? null)) {
        cycle = { ...cycle, kind: 'attention_review' };
        this.store.saveCycle(cycle);
        this.inspection.emit(agentId, cycle.id, 'execution.review_started', { executionId, activity });
        const reviewed = await this.cognize(cycle, world, origin.threadId, assessment, activity);
        return { cycle: reviewed.cycle, attention, ...(requestedReason ? { consultation: 'reviewed' as const } : {}) };
      }
      cycle = { ...cycle, status: 'completed' };
      this.store.saveCycle(cycle); this.inspection.emit(agentId, cycle.id, 'cycle.completed', cycle);
      return { cycle, attention, ...(requestedReason ? { consultation: 'activity_ended' as const } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.store.cycle(cycle.id).status === 'failed') throw error;
      this.store.saveCycle({ ...cycle, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage: 'executive_attention', message });
      throw new InfrastructureError('executive_attention', message, { cause: error });
    }
  }
}
