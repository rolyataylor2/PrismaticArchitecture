import { id, now } from '../../core/src/domain.js';
import type { ReasoningProvider, Store } from '../../core/src/contracts.js';
import { ProcedureConsolidationSchema, ProcedureConsolidationInputSchema, type ProcedureConsolidationInput, type ProcedureConsolidation } from '../../core/src/procedure-consolidation.js';
import { evaluateSkillEvidence } from '../../core/src/executive-skill-evidence.js';
import { executionProcedure } from '../../core/src/skill-invocation.js';
import { correctedProcedure } from '../../core/src/corrected-procedure.js';
import { isDeepStrictEqual } from 'node:util';
import { ExecutiveSkills } from './executive-skills.js';

export type ProcedureConsolidationRun = { id: string; kind: 'executive_consolidation'; agentId: string; createdAt: string; finishedAt: string | null;
  status: 'running' | 'completed' | 'failed' | 'skipped' | 'abandoned'; provider: string; input: ProcedureConsolidationInput;
  output: ProcedureConsolidation | null; skillIds: string[]; error: string | null; limitation: string;
  trigger?: { executionId: string; mode: 'after_verified_execution' | 'after_repeated_success'; requiredSuccesses: number };
  triggerFailure?: { executionId: string } };
/** External offline procedural inference; never owns intentions or mutates psychology. */
export class ProcedureConsolidator {
  constructor(private readonly store: Store, private readonly reasoning: ReasoningProvider, private readonly skills: ExecutiveSkills) {}
  records(agentId: string): ProcedureConsolidationRun[] {
    this.store.get('agent', agentId);
    return this.store.experiments().filter(record => record.kind === 'executive_consolidation' && record.agentId === agentId) as ProcedureConsolidationRun[];
  }
  recordTriggerFailure(agentId: string, executionId: string, error: unknown): void {
    if (this.records(agentId).some(record => record.trigger?.executionId === executionId || record.triggerFailure?.executionId === executionId)) return;
    const execution = this.store.executions(agentId).find(item => item.id === executionId);
    if (!execution) throw new Error('Automatic trigger failure requires a recorded same-Agent execution');
    const at = now();
    this.store.saveExperiment({ id: id('procedure-consolidation'), kind: 'executive_consolidation', agentId, createdAt: at, finishedAt: at,
      status: 'failed', provider: this.reasoning.label, input: { agentId, episodes: [] }, output: null, skillIds: [],
      error: error instanceof Error ? error.message : String(error), triggerFailure: { executionId },
      limitation: 'Automatic trigger assessment or scheduling failed before an inference report was created. Empty episodes do not establish absence of source evidence. Execution outcomes remain unchanged.' } satisfies ProcedureConsolidationRun);
  }
  abandon(agentId: string, runId: string, reason: string): ProcedureConsolidationRun {
    const record = this.records(agentId).find(record => record.id === runId);
    if (!record || record.status !== 'running') throw new Error('Only a recorded same-Agent incomplete inference may be closed');
    if (!reason.trim() || reason.length > 16000) throw new Error('Closing inference requires a bounded reason');
    const closed: ProcedureConsolidationRun = { ...record, status: 'abandoned', finishedAt: now(), error: `Researcher closed incomplete inference: ${reason}` };
    this.store.saveExperiment(closed); return structuredClone(closed);
  }
  async automatically(agentId: string, executionId: string): Promise<ProcedureConsolidationRun | null> {
    const profile = this.store.executiveProfile(agentId);
    if (profile.learningMode === 'disabled' || profile.consolidation.mode === 'manual'
      || this.records(agentId).some(record => record.status === 'running' || record.trigger?.executionId === executionId || record.triggerFailure?.executionId === executionId)) return null;
    const execution = this.store.executions(agentId).find(item => item.id === executionId);
    if (!execution || execution.status !== 'completed') return null;
    const source = this.store.eventsByType(agentId, ['execution.contract']).find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
    if (!source || source.type !== 'execution.contract' || source.payload.learningMode === 'disabled') return null;
    const episodes = this.episodes(agentId); const episode = episodes.find(item => item.contractId === execution.contractId);
    if (!episode || episode.evidence !== 'passed') return null;
    if (profile.consolidation.mode === 'after_repeated_success'
      && episodes.filter(item => item.evidence === 'passed' && isDeepStrictEqual(item.method, episode.method)).length < profile.consolidation.requiredSuccesses) return null;
    return this.run(agentId, { executionId, mode: profile.consolidation.mode, requiredSuccesses: profile.consolidation.requiredSuccesses });
  }
  async run(agentId: string, trigger?: ProcedureConsolidationRun['trigger']): Promise<ProcedureConsolidationRun> {
    this.store.get('agent', agentId);
    if (this.records(agentId).some(record => record.status === 'running')) throw new Error('Procedural consolidation is already running for this Agent');
    const profile = this.store.executiveProfile(agentId);
    const input = ProcedureConsolidationInputSchema.parse({ agentId, episodes: this.episodes(agentId) });
    const label = this.reasoning.label;
    const run: ProcedureConsolidationRun = { id: id('procedure-consolidation'), kind: 'executive_consolidation', agentId, createdAt: now(), finishedAt: null,
      status: 'running', provider: label, input, output: null, skillIds: [], error: null,
      ...(trigger ? { trigger } : {}),
      limitation: 'Recorded success is temporal evidence, not causal attribution, condition applicability, transfer or established maturity. Mock/mixed inference proves plumbing only.' };
    this.store.saveExperiment(run);
    try {
      if (profile.learningMode === 'disabled' || !input.episodes.some(episode => episode.evidence === 'passed')) run.status = 'skipped';
      else {
        run.provider = (this.reasoning as ReasoningProvider & { labelForAgent?: (id: string) => string }).labelForAgent?.(agentId) ?? this.reasoning.label;
        this.store.saveExperiment(run);
        if (!this.reasoning.consolidateProcedures) throw new Error('Configured provider lacks procedural consolidation');
        run.output = ProcedureConsolidationSchema.parse(await this.reasoning.consolidateProcedures(structuredClone(input)));
        this.store.transaction(() => {
          if (this.records(agentId).find(record => record.id === run.id)?.status !== 'running') throw new Error('The inference report was closed; late output cannot create candidates');
          if (this.store.executiveProfile(agentId).learningMode === 'disabled') throw new Error('Procedural learning was disabled during inference');
          if (run.trigger && !isDeepStrictEqual(this.store.executiveProfile(agentId).consolidation,
            { mode: run.trigger.mode, requiredSuccesses: run.trigger.requiredSuccesses }))
            throw new Error('Automatic consolidation policy changed during inference; candidates were not retained');
          // Validate the whole proposed set before any candidate is persisted.
          for (const candidate of run.output!.candidates) for (const branch of candidate.branches) {
            const source = input.episodes.find(episode => episode.contractId === branch.sourceContractId);
            if (!source || source.evidence !== 'passed') throw new Error('An executable branch requires a supplied independently passed episode');
          }
          for (const candidate of run.output!.candidates) {
            const members = candidate.branches.map((branch, index) => {
              const episode = input.episodes.find(episode => episode.contractId === branch.sourceContractId)!;
              const existing = this.store.executiveSkills(agentId).find(skill => skill.source.contractId === episode.contractId && !skill.conditional && skill.scope === 'agent');
              let member = existing;
              if (!member) {
                member = this.skills.proposeSkill(agentId, { name: `${candidate.name}: ${index + 1}`, conditions: branch.when, scope: 'agent', sourceContractId: episode.contractId });
                const execution = this.store.executions(agentId).find(execution => execution.contractId === episode.contractId)!;
                member = this.skills.validate(agentId, member.id, member.version, execution.id, false);
              }
              return { id: id('branch'), when: branch.when, reason: branch.reason, skillId: member.id, version: member.version };
            });
            const first = input.episodes.find(episode => episode.contractId === candidate.branches[0]!.sourceContractId)!;
            const family = this.skills.proposeConditional(agentId, { name: candidate.name, conditions: candidate.conditions, scope: 'agent', sourceContractId: first.contractId },
              { runId: run.id, reason: candidate.reason, escalate: candidate.escalate, branches: members });
            const execution = this.store.executions(agentId).find(execution => execution.contractId === first.contractId)!;
            const validated = this.skills.validate(agentId, family.id, family.version, execution.id, false);
            run.skillIds.push(validated.id);
          }
        });
        run.status = 'completed';
      }
    } catch (error) { run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); run.skillIds = []; }
    const current = this.records(agentId).find(record => record.id === run.id);
    if (current?.status === 'abandoned') return structuredClone(current);
    run.finishedAt = now(); this.store.saveExperiment(run); return structuredClone(run);
  }
  private episodes(agentId: string): ProcedureConsolidationInput['episodes'] {
    const executions = this.store.executions(agentId);
    return this.store.eventsByType(agentId, ['execution.contract']).slice(-50).flatMap(event => {
      if (event.type !== 'execution.contract' || event.payload.commands.length !== 1 || event.payload.guidanceRejection || event.payload.skillRejection) return [];
      const cycle = this.store.cycle(event.payload.cycleId); const command = event.payload.commands[0]!;
      let method = executionProcedure(event.payload);
      const execution = executions.find(execution => execution.contractId === event.payload.id);
      if (cycle.status !== 'completed' || !cycle.selectedBidIds?.includes(command.bidId) || command.action.kind !== 'operate'
        || !method || !execution || ['running', 'pending', 'continued', 'needs_guidance'].includes(execution.status)) return [];
      let chain: ReturnType<typeof correctedProcedure> | undefined;
      if (event.payload.remainder) {
        try { chain = correctedProcedure(this.store, agentId, execution.id); method = chain.method; }
        catch { return []; }
      }
      if (!method.steps.length) return [];
      const evidence = chain ? { result: chain.evidence } : evaluateSkillEvidence(method, execution, this.store.eventsByType(agentId, ['execution.contract', 'execution.tool_trace'], [cycle.id]));
      const contributingExecutions = new Set(chain?.executionIds ?? [execution.id]);
      const reviews = this.store.eventsByType(agentId, ['execution.review_started']).filter(review => review.type === 'execution.review_started' && contributingExecutions.has(review.payload.executionId));
      const cycleIds = [...new Set([cycle.id, ...(chain?.executionIds ?? []).map(id => executions.find(item => item.id === id)!.cycleId), ...reviews.flatMap(review => review.cycleId ? [review.cycleId] : [])])];
      const products = this.store.eventsByType(agentId, ['part.thought', 'part.bid_created', 'self.choice', 'construction.judgment'], cycleIds);
      const observations = cycleIds.flatMap(cycleId => this.store.world(this.store.cycle(cycleId).worldId).facts.filter(fact => fact.originCycleId === cycleId));
      const activations = products.flatMap(product => product.type === 'construction.judgment' && product.payload.input.task === 'disposition_activation'
        ? product.payload.scores.flatMap(score => {
          const context = product.payload.input.candidates.find(candidate => candidate.id === score.partId)?.context as { disposition?: import('../../core/src/domain.js').Disposition; activationPhase?: string } | undefined;
          const definition = context?.disposition;
          return definition && product.cycleId ? [{ cycleId: product.cycleId, phase: context?.activationPhase ?? 'final', dispositionId: definition.id, version: definition.version, concern: definition.concern, cues: definition.cues, score: score.score }] : [];
        }) : []);
      const expressedProducts = products.flatMap<ProcedureConsolidationInput['episodes'][number]['expressedProducts'][number]>(product => {
        if (!product.cycleId) return [];
        const selected = this.store.cycle(product.cycleId).selectedBidIds ?? [];
        const common = { eventId: product.id, cycleId: product.cycleId, kind: product.type };
        if (product.type === 'part.thought') return [{ ...common, partId: product.payload.partId, bidId: null, selected: false,
          text: `${product.payload.partSnapshot.name}: ${product.payload.output.thought}\nInterpretation: ${product.payload.output.interpretation}` }];
        if (product.type === 'part.bid_created') return [{ ...common, partId: product.payload.partId, bidId: product.payload.id,
          selected: selected.includes(product.payload.id), text: product.payload.argument }];
        if (product.type === 'self.choice') return [{ ...common, partId: null, bidId: null, selected: true,
          text: `${product.payload.choice}: ${product.payload.explanation}` }];
        return [];
      });
      // Preserve selection lineage before filling the bounded input with recent context.
      const selectedProducts = expressedProducts.filter(product => product.selected);
      const remainingContext = Math.max(0, 100 - selectedProducts.length);
      const retainedIds = new Set([...selectedProducts.slice(0, 100),
        ...(remainingContext ? expressedProducts.filter(product => !product.selected).slice(-remainingContext) : [])]
        .map(product => product.eventId));
      const retainedProducts = expressedProducts.filter(product => retainedIds.has(product.eventId));
      return [{ contractId: event.payload.id, cycleId: cycle.id, threadId: cycle.threadId ?? null, goal: command.action.text, argument: command.argument,
        bidId: command.bidId, method, outcome: execution.status, evidence: evidence.result,
        ...(chain ? { correctionChain: { rootContractId: chain.rootContractId, contractIds: chain.contractIds, executionIds: chain.executionIds } } : {}),
        limitations: ['Independent ledger evidence checks this exact method and criterion only. Applicability, causal benefit and transfer are unproven.',
          'Inference context is bounded: selected products precede recent unselected context. Coverage counts include omitted records, which remain in source audit history.'],
        contextCoverage: { observations: observations.length, activations: activations.length, expressedProducts: expressedProducts.length,
          omittedSelectedProducts: Math.max(0, selectedProducts.length - 100) },
        observations: observations.slice(-20), activations: activations.slice(-100),
        expressedProducts: retainedProducts }];
    });
  }
}
