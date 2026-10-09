// Historical regression fixture only. Never imported by production.
import { ConstructedCognition } from '../../../packages/core/src/constructed.js';
import { z } from 'zod';
import { CognitionSchema, PredictionDraftSchema, PredictionOutcomeSchema, ExecutionSchema, FactSchema, WorldStateSchema, freeze, id, type Cognition, type Contribution, type Cycle, type Execution, type Fact } from '../../../packages/core/src/domain.js';
import { InfrastructureError, type DecisionProvider, type EmbeddingProvider, type Executor, type PartContext, type ReasoningProvider, type Store } from '../../../packages/core/src/contracts.js';
import { Activator, defaultActivationPolicy, type ActivationPolicy } from './activation.js';
import { PrimitiveOutputSchema, type PrimitiveContext } from '../../../packages/core/src/primitives.js';
import { memoryEntries, relevantMemories } from '../../../packages/core/src/memory-recall.js';
import { partContext, thoughtHistory } from '../../../packages/core/src/context.js';
import { Inspection } from '../../../packages/core/src/inspection.js';
import { PartMutations } from '../../../packages/core/src/mutations.js';
import { Predictions } from '../../../packages/core/src/predictions.js';
import { select } from '../../../packages/core/src/self.js';

export type RuntimeOptions = { activation: ActivationPolicy; recentFactLimit: number | null; thoughtDecay?: { ordinary: number; selected: number }; maxDeliberationRounds: number };
export const defaultRuntimeOptions: RuntimeOptions = { activation: defaultActivationPolicy, recentFactLimit: null, thoughtDecay: { ordinary: 0.2, selected: 0.1 }, maxDeliberationRounds: 2 };
export class CognitiveRuntime {
  readonly constructed: ConstructedCognition;
  readonly mutations: PartMutations;
  readonly predictions: Predictions;
  readonly #activator: Activator;
  constructor(private readonly store: Store, private readonly decisions: DecisionProvider,
    private readonly reasoning: ReasoningProvider, embeddings: EmbeddingProvider, private readonly executor: Executor,
    readonly inspection: Inspection, private readonly options = defaultRuntimeOptions) {
    z.number().int().min(0).max(50).nullable().parse(options.recentFactLimit);
    if (options.thoughtDecay) {
      z.number().positive().max(1).parse(options.thoughtDecay.ordinary);
      z.number().positive().max(options.thoughtDecay.ordinary).parse(options.thoughtDecay.selected);
    }
    z.number().int().min(0).max(8).parse(options.maxDeliberationRounds);
    this.mutations = new PartMutations(store, inspection);
    this.constructed = new ConstructedCognition(store, decisions, reasoning, this.mutations, inspection);
    this.predictions = new Predictions(store, inspection, this.mutations);
    this.#activator = new Activator(store, decisions, embeddings, inspection, options.activation);
  }
  async run(agentId: string, facts: Fact[], threadId?: string): Promise<{ cycle: Cycle; execution: Execution | null; executions: Execution[] }> {
    const incoming = z.array(FactSchema).min(1).max(50).parse(facts);
    let cycle = this.store.startCycle(agentId, threadId);
    let stage = 'worldstate';
    try {
      this.inspection.emit(agentId, cycle.id, 'cycle.started', cycle);
      let world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId, cycleId: cycle.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt, facts: [...this.store.recentFacts(agentId, this.options.recentFactLimit, threadId), ...incoming.map(fact => ({ ...fact, timestamp: fact.timestamp ?? cycle.startedAt, originCycleId: cycle.id }))],
        thoughtHistory: thoughtHistory(this.store, cycle, this.options.thoughtDecay) }));
      this.store.saveWorld(world);
      this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
      const memorySettings = this.store.agentActivationSettings(agentId);
      const { vectorSearchEnabled, reevaluateAfterDeliberation, primitivesFirst } = memorySettings;
      const recalledContext = async (snapshot: typeof world, part: import('../../../packages/core/src/domain.js').Part, activation: import('../../../packages/core/src/domain.js').Activation): Promise<PartContext> => {
        const context = partContext(this.store, snapshot, part, activation);
        const memories = await relevantMemories(this.decisions, this.inspection, { world: snapshot, purpose: 'recall', entries: memoryEntries(this.store, snapshot, [part]) }, memorySettings);
        return freeze({ ...context, memories });
      };
      const primitiveDefinitions = this.store.primitiveSettings(agentId).items;
      const parts = this.store.list('part', agentId).map(part => this.store.partForThread(part.id, threadId));
      const identity = structuredClone(this.store.get('identity', agentId));
      if (identity.mask && cycle.sequence > identity.mask.expiresAfterCycle) identity.mask = null;
      const { parts: results, primitives: primitiveActivations } = await this.#activator.run(world, parts, vectorSearchEnabled, primitiveDefinitions, identity, memorySettings);
      stage = 'prediction_evaluation';
      const cycleSequences = new Map(this.store.cycles(agentId).map(record => [record.id, record.sequence]));
      for (const prediction of this.store.list('prediction', agentId).filter(p => p.status === 'open' && p.createdCycle !== cycle.id)) {
        const part = parts.find(p => p.id === prediction.partId);
        if (!part) continue;
        const sourceCycle = this.store.cycles(agentId).find(cycle => cycle.id === prediction.createdCycle);
        if ((sourceCycle?.threadId ?? part.instance?.threadId ?? undefined) !== threadId) continue;
        // Evidence can resolve early; the owning Part decides whether the horizon/evidence permits evaluation.
        const activation = results.find(r => r.partId === part.id) ?? { partId: part.id, similarity: 0, reasons: ['prediction_evidence'], score: 0, previous: 0, delta: 0, active: false };
        const createdSequence = cycleSequences.get(prediction.createdCycle) ?? world.sequence;
        const laterEvidence = world.facts.filter(fact => fact.originCycleId && (cycleSequences.get(fact.originCycleId) ?? 0) > createdSequence);
        const context = freeze({ ...await recalledContext(world, part, activation), prediction, laterEvidence });
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
      const generatedContributions = new Map<string, Contribution>();
      const contexts = new Map<string, PartContext>();
      const primitiveContexts = new Map<string, PrimitiveContext>();
      const cognize = async (phaseResults: typeof results, phasePrimitives: typeof primitiveActivations, existing: Set<string>) => {
        stage = 'part_cognition';

        // Assemble every independent first-pass context before any first-pass outputs are applied.
        for (const activation of phaseResults.filter(a => a.active && !existing.has(a.partId))) {
          const part = this.store.get('part', activation.partId);
          contexts.set(part.id, await recalledContext(world, part, activation));
        }
        const availableContributors = [
          ...phaseResults.filter(result => result.active).map(result => { const part = this.store.get('part', result.partId); return { partId: part.id, name: part.name }; }),
          ...primitiveDefinitions.filter(primitive => phasePrimitives.some(result => result.active && result.primitiveId === primitive.id)).map(primitive => ({ partId: primitive.id, name: primitive.name })),
        ];
        for (const [partId, context] of contexts) contexts.set(partId, freeze({ ...context, availableContributors }));
        const contributions: Contribution[] = phaseResults.filter(result => result.active && !existing.has(result.partId) && generatedContributions.has(result.partId))
          .map(result => generatedContributions.get(result.partId)!);
        stage = 'part_cognition';
        const cognizePrimitives = async () => {
          const batch = await Promise.all(primitiveDefinitions.filter(primitive => !existing.has(primitive.id) && phasePrimitives.some(result => result.active && result.primitiveId === primitive.id)).map(async primitive => {
            const context = freeze({ world, primitive }); primitiveContexts.set(primitive.id, context);
            const started = performance.now();
            const output = PrimitiveOutputSchema.parse(await this.reasoning.primitive!(context));
            if (primitive.bidsEnabled === false) output.proposal = null;
            return { primitive, output, durationMs: performance.now() - started };
          }));
          for (const { primitive, output, durationMs } of batch) {
            const bid = output.proposal ? { ...output.proposal, id: id('bid'), partId: primitive.id, sourceKind: 'primitive' as const } : null;
            this.inspection.emit(agentId, cycle.id, 'primitive.thought', { primitive, output, durationMs });
            if (bid) this.inspection.emit(agentId, cycle.id, 'primitive.bid_created', bid);
            contributions.push({ sourceKind: 'primitive', partId: primitive.id, name: primitive.name, interpretation: output.interpretation, thought: output.thought, evidenceSummary: output.evidenceSummary, prediction: null, bid });
          }
        };
        if (primitivesFirst) await cognizePrimitives();
        const outputs: { context: PartContext; output: Cognition; durationMs: number }[] = [];
        // Each phase shares one frozen snapshot; first-pass outputs cannot alter it.
        for (const mode of ['recognition', 'perspective'] as const) {
          const batch = await Promise.all([...contexts.values()].filter(context => !existing.has(context.part.id) && !generatedContributions.has(context.part.id) && context.part.mode === mode).map(async context => {
            const started = performance.now();
            this.inspection.emit(agentId, cycle.id, 'part.reasoning_started', { partId: context.part.id, provider: this.reasoning.label });
            const output = CognitionSchema.parse(await this.reasoning.cognize(context));
            return { context, output, durationMs: performance.now() - started };
          }));
          outputs.push(...batch);
        }
        for (const { context, output, durationMs } of outputs) {
          this.inspection.emit(agentId, cycle.id, 'part.thought', { partId: context.part.id, partSnapshot: context.part, predictionSnapshot: context.prediction, output, durationMs });
          let formedPrediction = null;
          if (!context.prediction) {
            const shouldPredict = await this.decisions.shouldPredict(freeze({ ...context, cognition: output }));
            this.inspection.emit(agentId, cycle.id, 'prediction.formation_checked', { partId: context.part.id, shouldPredict, provider: this.decisions.label });
            if (shouldPredict) formedPrediction = this.predictions.form(context.part.id, world, PredictionDraftSchema.parse(await this.reasoning.predict(freeze({ ...context, cognition: output }))));
          }
          const bid = output.proposal ? { ...output.proposal, id: id('bid'), partId: context.part.id } : null;
          if (bid) this.inspection.emit(agentId, cycle.id, 'part.bid_created', bid);
          contributions.push({ partId: context.part.id, name: context.part.name, thought: output.thought,
            interpretation: output.interpretation, evidenceSummary: output.evidenceSummary,
            prediction: formedPrediction?.expectation ?? context.prediction?.expectation ?? null, bid });
          generatedContributions.set(context.part.id, contributions.at(-1)!);
        }

        if (!primitivesFirst) await cognizePrimitives();
        return contributions;
      };
      const contributions = await cognize(results, primitiveActivations, new Set());
      stage = 'self';
      const selected = await select({ world, identity, contributions, contexts, primitiveContexts, decisions: this.decisions,
        reasoning: this.reasoning, inspection: this.inspection,
        answerContext: async (context: PartContext, _question: string): Promise<PartContext> => {
          if (!context.memories.length) return context;
          return context;
        },
        maxDeliberationRounds: this.options.maxDeliberationRounds,
        ...(reevaluateAfterDeliberation ? { afterDeliberation: async (current, deliberation) => {
          const previousWorldId = world.id;
          world = freeze(WorldStateSchema.parse({ ...world, id: id('world'), thoughtHistory: [
            ...(world.thoughtHistory ?? []), ...deliberation.map((message, index) => ({ id: `inquiry_${cycle.id}_${index}`, cycleId: cycle.id, partId: message.partId, partName: current.find(contribution => contribution.partId === message.partId)?.name ?? message.partId, thought: `Inquiry: ${message.question}\nResponse: ${message.answer}`, selectedBySelf: false, age: 0, retention: 1 })),
          ] }));
          this.store.saveWorld(world, previousWorldId); this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
          const refreshed = await this.#activator.run(world, parts, vectorSearchEnabled, primitiveDefinitions, identity, memorySettings);
          const active = new Set([...refreshed.parts.filter(result => result.active).map(result => result.partId), ...refreshed.primitives.filter(result => result.active).map(result => result.primitiveId)]);
          for (let index = current.length - 1; index >= 0; index--) if (!active.has(current[index]!.partId)) current.splice(index, 1);
          for (const partId of contexts.keys()) if (!active.has(partId)) contexts.delete(partId);
          current.push(...await cognize(refreshed.parts, refreshed.primitives, new Set(current.map(contribution => contribution.partId))));
        } } : {}),
      });
      let execution: Execution | null = null;
      const executions: Execution[] = [];
      if (selected) {
        stage = 'execution';
        cycle = { ...cycle, selectedBidId: selected[0]!.id, selectedBidIds: selected.map(bid => bid.id) };
        this.store.saveCycle(cycle);
        for (let index = 0; index < selected.length; index++) {
          const selectedBid = selected[index]!;
          const group = [selectedBid];
          if (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')) {
            while (selected[index + 1]?.action.kind === 'say' || selected[index + 1]?.action.kind === 'ask') group.push(selected[++index]!);
          }
          for (const bid of group) this.inspection.emit(agentId, cycle.id, 'execution.handoff', { bid });
          execution = ExecutionSchema.parse(await (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')
            ? this.executor.executeSay({ agentId, cycleId: cycle.id, bids: group })
            : this.executor.execute({ agentId, cycleId: cycle.id, bid: selectedBid })));
          if (execution.agentId !== agentId || execution.cycleId !== cycle.id || execution.action.kind !== selectedBid.action.kind
            || execution.action.text !== selectedBid.action.text) throw new InfrastructureError('execution', 'External handoff changed the selected action or owner');
          if ((group.length > 1 && !execution.speech) || (execution.speech && ((selectedBid.action.kind !== 'say' && selectedBid.action.kind !== 'ask')
            || JSON.stringify(execution.speech.bidIds) !== JSON.stringify(group.map(bid => bid.id))))) {
            throw new InfrastructureError('execution', 'Speech execution changed the selected command references');
          }
          this.store.saveExecution(execution);
          executions.push(execution);
          this.inspection.emit(agentId, cycle.id, 'execution.status', execution);
        }
      }
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
}
