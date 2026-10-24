import { captureSynthesisScopes, synthesizeScope } from './sleep-synthesis.js';
import { selectSleepPredictionReviews, reviewSleepPrediction } from './sleep-prediction-review.js';
import { SleepOptionsSchema, type SleepOptions } from './consolidation-domain.js';
import { ConstructedCognition } from './constructed.js';
import { freeze, id, now, type Memory } from './domain.js';
import { DevelopmentResultSchema, ReplayResultSchema, type ConsolidationContext, type ConsolidationRun, type DevelopmentProposal } from './consolidation-domain.js';
import { ConflictError, InfrastructureError, MutationValidationError, type ReasoningProvider, type Store } from './contracts.js';
import type { Inspection } from './inspection.js';
import type { PartMutations } from './mutations.js';

export class Consolidation {
  constructor(private readonly store: Store, private readonly reasoning: ReasoningProvider,
    private readonly mutations: PartMutations, private readonly inspection: Inspection, private readonly constructed?: ConstructedCognition) {}
  async run(agentId: string, fromCycle = 1, toCycle = Number.MAX_SAFE_INTEGER, options: Partial<SleepOptions> = {}): Promise<ConsolidationRun> {
    if (!Number.isInteger(fromCycle) || fromCycle < 1 || !Number.isInteger(toCycle) || toCycle < fromCycle) throw new Error('Invalid consolidation cycle range');
    const settings = SleepOptionsSchema.parse(options);
    if (settings.synthesizeMemories && this.store.get('agent', agentId).architecture === 'persistent') throw new Error('Memory synthesis requires the current consolidation profile');
    if (this.store.cycles(agentId).some(cycle => cycle.status === 'running') || this.store.consolidations(agentId).some(run => run.status === 'running')) throw new Error('Wait for current cognition or consolidation to finish');
    const cycles = this.store.cycles(agentId).filter(c => c.status === 'completed' && c.sequence >= fromCycle && c.sequence <= toCycle);
    const selectedIds = new Set(cycles.map(c => c.id));
    const selectedWorldIds = new Set(cycles.map(c => c.worldId));
    let run: ConsolidationRun = { id: id('sleep'), agentId, startedAt: now(), status: 'running', fromCycle,
      toCycle: cycles.at(-1)?.sequence ?? fromCycle,
      provider: (this.reasoning as ReasoningProvider & { labelForAgent?: (id: string) => string }).labelForAgent?.(agentId) ?? this.reasoning.label,
      selections: [], changes: [], options: settings, synthesisReviews: [], error: null };
    this.store.saveConsolidation(run);
    this.inspection.emit(agentId, null, 'consolidation.started', run);
    try {
      if (this.store.get('agent', agentId).architecture !== 'persistent') {
        if (!this.constructed) throw new InfrastructureError('consolidation', 'Constructed consolidation is unavailable');
        const memories = this.store.list('memory', agentId).filter(memory => !memory.deleted && selectedIds.has(memory.createdCycle));
        const predictions = this.store.list('prediction', agentId).filter(prediction => selectedIds.has(prediction.createdCycle)
          || (prediction.memoryId && memories.some(memory => memory.id === prediction.memoryId)));
        run.selections = [...new Set(memories.flatMap(memory => memory.partId ? [memory.partId] : []))].map(partId => ({ partId,
          memoryIds: memories.filter(memory => memory.partId === partId).map(memory => memory.id),
          predictionIds: predictions.filter(prediction => prediction.partId === partId).map(prediction => prediction.id),
          thoughtCycles: [], repeatedReferents: [], coactivated: [] }));
        for (const selection of run.selections) this.inspection.emit(agentId, null, 'consolidation.replay_selected', selection);
        const scopes = settings.synthesizeMemories ? captureSynthesisScopes(this.store, agentId, cycles.map(cycle => cycle.id)) : [];
        run.predictionReviews = selectSleepPredictionReviews(this.store, agentId, cycles.map(cycle => cycle.id), settings);
        this.store.saveConsolidation(run);
        run.synthesisReviews = scopes.map(scope => ({ dispositionId: scope.disposition.id, dispositionName: scope.disposition.name,
          dispositionVersion: scope.disposition.version, sourceMemoryIds: scope.memories.map(memory => memory.id), predictionIds: scope.predictions.map(prediction => prediction.id),
          cycleIds: scope.cycleIds, status: 'pending', memoryId: null, replacedMemoryIds: [], reason: 'Awaiting review' }));
        this.store.saveConsolidation(run);
        for (const [index, scope] of scopes.entries()) {
          try {
            run.synthesisReviews[index] = await synthesizeScope(this.store, this.inspection, this.constructed, agentId, run.id, scope, settings.replaceSourceMemories, { detailPolicy: settings.detailPolicy, synthesisInstructions: settings.synthesisInstructions });
          } catch (error) {
            run.synthesisReviews[index] = { ...run.synthesisReviews[index]!, status: 'failed', reason: error instanceof Error ? error.message : String(error) };
            throw error;
          }
          this.store.saveConsolidation(run);
        }
        for (const [index, review] of run.predictionReviews.entries()) {
          if (review.status !== 'pending') continue;
          try {
            run.predictionReviews[index] = await reviewSleepPrediction(this.store, this.constructed, agentId, review, completed => {
              run.predictionReviews![index] = completed;
              this.store.saveConsolidation(run);
            });
          } catch (error) {
            run.predictionReviews[index] = { ...review, status: 'failed', reason: error instanceof Error ? error.message : String(error) };
            this.store.saveConsolidation(run);
            throw error;
          }
          this.store.saveConsolidation(run);
        }
        const before = new Set(this.store.list('disposition', agentId).map(disposition => disposition.id));
        const reviewMemoryIds = new Set(run.predictionReviews.flatMap(review => review.result?.evidence.map(reference => reference.memoryId) ?? []));
        const learningMemories = [...new Map([...memories, ...this.store.list('memory', agentId).filter(memory => !memory.deleted && reviewMemoryIds.has(memory.id))].map(memory => [memory.id, memory])).values()];
        const reviewPredictionIds = new Set(run.predictionReviews.filter(review => review.result).map(review => review.predictionId));
        const learningPredictions = [...new Map([...predictions.map(prediction => this.store.get('prediction', prediction.id)),
          ...this.store.list('prediction', agentId).filter(prediction => reviewPredictionIds.has(prediction.id))].map(prediction => [prediction.id, prediction])).values()];
        const result = await this.constructed.learn(agentId, learningMemories, learningPredictions, cycles.map(cycle => cycle.id), run.predictionReviews);
        run = { ...run, status: 'completed', constructedLearning: {
          dispositionIds: this.store.list('disposition', agentId).filter(disposition => !before.has(disposition.id)).map(disposition => disposition.id),
          revisedMemoryIds: result.revisions.map(revision => revision.memoryId), reason: result.reason,
        } };
        this.store.saveConsolidation(run);
        this.inspection.emit(agentId, null, 'consolidation.completed', run);
        return run;
      }
      const events = this.store.eventsByType(agentId, ['activation.scored', 'part.thought', 'primitive.thought'], [...selectedIds]);
      const population = this.store.list('part', agentId);
      // Build every owner context before applying changes. No raw worlds are loaded here.
      const contexts: ConsolidationContext[] = population.filter(p => p.lifecycle !== 'archived').map(part => {
        const memories = this.store.list('memory', agentId).filter(m => m.partId === part.id && selectedIds.has(m.createdCycle));
        const predictions = this.store.list('prediction', agentId).filter(p => p.partId === part.id &&
          (selectedIds.has(p.createdCycle) || (p.evaluation && selectedWorldIds.has(p.evaluation.evidenceWorldId))));
        const activations = events.flatMap(e => e.type === 'activation.scored' ? e.payload.results.filter(a => a.partId === part.id)
          .map(activation => ({ cycleId: e.cycleId!, activation })) : []);
        const thoughts = events.flatMap(e => e.type === 'part.thought' && e.payload.partId === part.id
          ? [{ cycleId: e.cycleId!, interpretation: e.payload.output.interpretation, thought: e.payload.output.thought }] : []);
        const activeCycles = new Set(activations.filter(trace => trace.activation.active).map(trace => trace.cycleId));
        const primitiveAppraisals = events.flatMap(event => {
          if (event.type !== 'activation.scored' || !event.cycleId || !activeCycles.has(event.cycleId)) return [];
          return (event.payload.primitives ?? []).map(appraisal => {
            const thought = events.find(candidate => candidate.type === 'primitive.thought' && candidate.cycleId === event.cycleId && candidate.payload.primitive.id === appraisal.primitiveId);
            return { cycleId: event.cycleId!, primitiveId: appraisal.primitiveId, name: appraisal.name, score: appraisal.score, active: appraisal.active,
              thought: thought?.type === 'primitive.thought' ? thought.payload.output.thought : null,
              interpretation: thought?.type === 'primitive.thought' ? thought.payload.output.interpretation : null };
          });
        });
        const coactivation = new Map<string, number>();
        for (const event of events) if (event.type === 'activation.scored' && event.payload.results.some(a => a.partId === part.id && a.active)) {
          for (const active of event.payload.results.filter(a => a.active && a.partId !== part.id)) coactivation.set(active.partId, (coactivation.get(active.partId) ?? 0) + 1);
        }
        const referents = new Map<string, number>();
        for (const prediction of predictions) for (const name of new Set(prediction.capsule.entities)) referents.set(name, (referents.get(name) ?? 0) + 1);
        return freeze({ part, memories, predictions, activations, thoughts, primitiveAppraisals,
          coactivated: [...coactivation].map(([partId, count]) => ({ partId, count })),
          repeatedReferents: [...referents].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count })),
          population: population.map(p => ({ id: p.id, name: p.name, mode: p.mode, triggers: [...p.triggers] })) });
      });
      for (const context of contexts) {
        const selection = { partId: context.part.id, memoryIds: context.memories.map(m => m.id), predictionIds: context.predictions.map(p => p.id),
          thoughtCycles: context.thoughts.map(t => t.cycleId), repeatedReferents: context.repeatedReferents, coactivated: context.coactivated };
        run.selections.push(selection);
        this.inspection.emit(agentId, null, 'consolidation.replay_selected', selection);
        const result = DevelopmentResultSchema.parse(await this.reasoning.consolidate(context));
        for (const proposal of result.proposals) {
          const before = this.store.get('part', context.part.id);
          const record: ConsolidationRun['changes'][number] = { partId: before.id, proposal, accepted: false,
            explanation: proposal.reason, beforeVersion: before.version, afterVersion: before.version, createdPartId: null };
          this.inspection.emit(agentId, null, 'consolidation.mutation_proposed', record);
          try { this.inspection.atomic(() => {
            if (proposal.kind === 'no_change') record.explanation = `Preserved: ${proposal.reason}`;
            else if (['split', 'merge', 'specialize'].includes(proposal.kind)) record.explanation = 'Represented for inspection; structural application is deferred in this demo.';
            else {
              record.createdPartId = this.apply(context, proposal, run.id);
              record.accepted = true;
              record.afterVersion = this.store.get('part', before.id).version;
            }
            this.store.saveConsolidation({ ...run, changes: [...run.changes, record] });
            this.inspection.emit(agentId, null, 'consolidation.mutation_decided', record);
          }); } catch (error) {
            if (!(error instanceof MutationValidationError) && !(error instanceof ConflictError)) throw error;
            record.accepted = false;
            record.createdPartId = null;
            record.afterVersion = before.version;
            record.explanation = `Rejected by mutation validation: ${error instanceof Error ? error.message : String(error)}`;
            this.store.saveConsolidation({ ...run, changes: [...run.changes, record] });
            this.inspection.emit(agentId, null, 'consolidation.mutation_decided', record);
          }
          run.changes.push(record);
        }
      }
      run = { ...run, status: 'completed' };
      this.store.saveConsolidation(run);
      this.inspection.emit(agentId, null, 'consolidation.completed', run);
      return run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.saveConsolidation({ ...run, status: 'failed', error: message });
      this.inspection.emit(agentId, null, 'infrastructure.error', { stage: 'consolidation', message });
      throw new InfrastructureError('consolidation', message, { cause: error });
    }
  }
  private apply(context: ConsolidationContext, proposal: DevelopmentProposal, runId: string): string | null {
    const owner = this.store.get('part', context.part.id);
    const change = { origin: 'consolidation' as const, reason: proposal.reason, sourceIds: [runId, ...context.memories.map(m => m.id)] };
    if (proposal.kind === 'update') this.mutations.patch(owner.id, owner.version, proposal.patch, change);
    if (proposal.kind === 'memory_revision') {
      if (!context.memories.some(m => m.id === proposal.memoryId)) throw new MutationValidationError('Cannot reconsolidate another Part or unselected memory');
      const memory = this.store.get('memory', proposal.memoryId);
      if (memory.partId !== owner.id) throw new MutationValidationError('Cannot reconsolidate another Part memory');
      this.reviseMemory(memory, proposal.content, proposal.gist, change);
    }
    if (proposal.kind === 'formation') {
      const formed = this.mutations.create(owner.agentId, { ...proposal.draft,
        provenance: [...new Set([...proposal.draft.provenance, ...change.sourceIds])],
        lineage: [...new Set([...proposal.draft.lineage, owner.id])] }, change);
      this.mutations.patch(owner.id, owner.version, { associations: [...owner.associations, { targetPartId: formed.id, meaning: proposal.associationMeaning }] }, change);
      return formed.id;
    }
    return null;
  }
  private reviseMemory(memory: Memory, content: string, gist: string, change: { origin: 'consolidation'; reason: string; sourceIds: string[] }): void {
    const next = { ...memory, content, gist, version: memory.version + 1 };
    this.store.save('memory', next, memory.version, change);
    this.inspection.emit(memory.agentId, null, 'memory.reconsolidated', next);
  }
  /** Explicit exceptional research-triggered development; never called by normal recall or sleep. */
  async replay(memoryId: string, ancestorId: string, reason: string): Promise<Memory> {
    if (reason.trim().length < 10) throw new Error('Ancestor replay requires an explicit developmental reason');
    const memory = this.store.get('memory', memoryId);
    if (!memory.ancestorIds.includes(ancestorId)) throw new Error('Experience is not an ancestor of this memory');
    const ancestor = this.store.world(ancestorId);
    if (ancestor.agentId !== memory.agentId) throw new Error('Ancestor Agent mismatch');
    if (!memory.partId) throw new Error('Gap episodes require explicit subjective reinterpretation, not fabricated owning-Part replay');
    const part = this.store.get('part', memory.partId);
    const result = ReplayResultSchema.parse(await this.reasoning.reinterpret(freeze({ part, memory, ancestor, reason })));
    this.inspection.atomic(() => {
      if (result.revision) this.reviseMemory(memory, result.revision.content, result.revision.gist,
        { origin: 'consolidation', reason: result.reason, sourceIds: [ancestorId] });
      this.inspection.emit(memory.agentId, null, 'memory.ancestor_replayed', { partId: part.id, memoryId, ancestorId, reason,
        before: memory.content, after: result.revision?.content ?? memory.content, changed: result.revision !== null });
    });
    return this.store.get('memory', memoryId);
  }
}
