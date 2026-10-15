import { thoughtDispositionVersions } from './prediction-lineage.js';
import type { z } from 'zod';
import {
  id, now, DispositionSchema, MemorySchema, PredictionDraftSchema, PredictionSchema, PredictionUpdateSchema,
  type Memory, type Prediction, type PredictionUpdate, type WorldState,
} from './domain.js';
import { InfrastructureError, type Store } from './contracts.js';
import type { Inspection } from './inspection.js';
import type { PartMutations } from './mutations.js';

type PredictionDraft = z.infer<typeof PredictionDraftSchema>;

export class Predictions {
  constructor(private readonly store: Store, private readonly inspection: Inspection, private readonly mutations: PartMutations) {}
  form(partId: string, world: WorldState, draft: PredictionDraft, thoughtEventId?: string): Prediction {
    const owner = this.store.get('part', partId);
    if (owner.agentId !== world.agentId) throw new Error('Prediction owner mismatch');
    if (this.store.list('prediction', world.agentId).some(p => p.partId === partId && p.status === 'open')) {
      throw new InfrastructureError('prediction', 'An open prediction must be continued or revised before forming another');
    }
    const availableMemories = new Set(owner.instance?.evidenceMemoryIds ?? []);
    for (const scaffold of draft.scaffolds ?? []) {
      if (new Set(scaffold.relevantMemoryIds).size !== scaffold.relevantMemoryIds.length
        || scaffold.relevantMemoryIds.some(memoryId => !availableMemories.has(memoryId)))
        throw new InfrastructureError('prediction', 'Scaffold memory hints must cite the owning perspective’s recalled evidence');
    }
    const thought = thoughtEventId ? this.store.eventsByType(world.agentId, ['part.thought'], [world.cycleId])
      .find(event => event.id === thoughtEventId && event.type === 'part.thought' && event.payload.partId === partId) : null;
    if (thoughtEventId && (!thought || thought.type !== 'part.thought'
      || JSON.stringify(thought.payload.output.prediction) !== JSON.stringify(draft)))
      throw new Error('Prediction origin requires its exact recorded cognition');
    const cognitionOrigin = thought?.type === 'part.thought' ? { thoughtEventId: thought.id,
      partVersion: thought.payload.partSnapshot.version,
      dispositions: thoughtDispositionVersions(this.store, world.agentId, world.cycleId,
        (thought.payload.partSnapshot.instance?.dispositionBindings ?? []).map(binding => binding.dispositionId)) } : undefined;
    const prediction = PredictionSchema.parse({ ...PredictionDraftSchema.parse(draft), cognitionOrigin, confidence: owner.instance ? draft.confidence : owner.beliefConfidence ?? 1, id: id('prediction'),
      agentId: world.agentId, partId, version: 1, schemaVersion: 1, createdCycle: world.cycleId,
      status: 'open', evaluation: null, memoryId: null });
    return this.commitFormation(prediction, world);
  }
  formGap(world: WorldState, draft: PredictionDraft, gapOrigin: NonNullable<Prediction['gapOrigin']>): Prediction {
    if ((draft.scaffolds ?? []).some(scaffold => scaffold.relevantMemoryIds.length))
      throw new InfrastructureError('cognition_coverage', 'Gap formation cannot invent recalled memory references');
    const prediction = PredictionSchema.parse({ ...PredictionDraftSchema.parse(draft), id: id('hypothesis'),
      agentId: world.agentId, partId: null, gapOrigin, version: 1, schemaVersion: 1,
      createdCycle: world.cycleId, status: 'open', evaluation: null, memoryId: null });
    return this.commitFormation(prediction, world);
  }
  private commitFormation(prediction: Prediction, world: WorldState): Prediction {
    const threadId = this.store.cycle(world.cycleId).threadId;
    const frontier = Math.max(world.sequence, ...this.store.cycles(world.agentId)
      .filter(cycle => cycle.threadId === threadId && cycle.status !== 'failed').map(cycle => cycle.sequence));
    if (frontier > world.sequence) prediction = { ...prediction, committedAfterSequence: frontier };
    this.inspection.atomic(() => {
      this.store.save('prediction', prediction, 0, { origin: 'organic_cognition', reason: prediction.gapOrigin ? 'Coverage formed unresolved-state hypothesis' : 'Part formed prediction', sourceIds: [world.id] });
      this.inspection.emit(world.agentId, world.cycleId, 'part.prediction_created', prediction);
      this.createScaffolds(prediction, world);
    });
    return prediction;
  }
  private createScaffolds(prediction: Prediction, world: WorldState): void {
      for (const relevance of prediction.scaffolds ?? []) {
        const disposition = DispositionSchema.parse({ id: id('scaffold'), agentId: world.agentId,
          version: 1, schemaVersion: 1, name: relevance.name, concern: prediction.expectation,
          cues: relevance.cues, scope: relevance.target, prerequisites: [], threshold: 2,
          memoryIds: relevance.relevantMemoryIds, sourcePredictionId: prediction.id, temporary: true, active: true,
          scaffold: { createdCycle: world.cycleId, threadId: this.store.cycle(world.cycleId).threadId ?? null,
            hypothesisVersion: prediction.version, relevance, endedCycle: null, endReason: null },
          development: { retrievalIntent: relevance.retrievalIntent, contextCues: [], internalStateCues: [],
            status: 'provisional', confidence: 'Untested temporary relevance hypothesis', lineage: [],
            previousVersion: null, evidence: [], createdAt: now() } });
        this.store.save('disposition', disposition, 0, { origin: 'organic_cognition',
          reason: 'Prediction proposed temporary relevance for ordinary later-cycle investigation', sourceIds: [prediction.id, world.id] });
        this.inspection.emit(world.agentId, world.cycleId, 'disposition.learned', disposition);
      }
  }
  encode(partId: string, world: WorldState, draft: NonNullable<PredictionUpdate['memory']>, predictionId: string | null = null, ancestorIds = [world.id]): Memory {
    const memory = MemorySchema.parse({ ...draft, id: id('memory'), agentId: world.agentId, partId,
      version: 1, schemaVersion: 1, ancestorIds, predictionId, createdCycle: world.cycleId,
      ...(world.experienced ? { selfAffectAtFormation: world.experienced.posture.map(({ partId, affect }) => ({ partId, affect })) } : {}),
      ...(this.store.get('part', partId).instance ? { encoding: {
        interpretation: this.store.get('part', partId).instance!.interpretation,
        affect: this.store.get('part', partId).emotionalCharge ?? '', perceivedDetails: draft.context,
        prediction: predictionId ? this.store.get('prediction', predictionId).expectation : null,
        outcome: draft.content,
      } } : {}) });
    this.inspection.atomic(() => {
      this.store.save('memory', memory, 0, { origin: predictionId ? 'prediction_evaluation' : 'organic_cognition',
        reason: 'Part encoded subjective episode', sourceIds: ancestorIds });
      this.inspection.emit(world.agentId, world.cycleId, 'memory.episodic_created', memory);
    });
    return memory;
  }
  private encodeGap(prediction: Prediction, world: WorldState, draft: NonNullable<PredictionUpdate['memory']>): Memory {
    const memory = MemorySchema.parse({ ...draft, id: id('memory'), agentId: world.agentId, partId: null,
      referencingPartIds: [], version: 1, schemaVersion: 1, ancestorIds: this.outcomeAncestors(prediction, world),
      predictionId: prediction.id, createdCycle: world.cycleId,
      ...(world.experienced ? { selfAffectAtFormation: world.experienced.posture.map(({ partId, affect }) => ({ partId, affect })) } : {}),
      encoding: { interpretation: prediction.capsule.interpretation, affect: '', perceivedDetails: draft.context,
        prediction: prediction.expectation, outcome: draft.content } });
    this.store.save('memory', memory, 0, { origin: 'prediction_evaluation', reason: 'Subjective gap hypothesis outcome episode', sourceIds: memory.ancestorIds });
    this.inspection.emit(world.agentId, world.cycleId, 'memory.episodic_created', memory);
    return memory;
  }
  private outcomeAncestors(prediction: Prediction, world: WorldState): string[] {
    // Capsule references are opaque provenance, not necessarily WorldState IDs.
    // Include recorded formation/revision snapshots without replaying their contents.
    const snapshots = new Set(this.store.worlds(world.agentId).map(snapshot => snapshot.id));
    const recordedSources = this.store.versions('prediction', prediction.id).flatMap(version => version.change.sourceIds);
    return [...new Set([...recordedSources, ...prediction.capsule.sourceIds, world.id])]
      .filter(sourceId => snapshots.has(sourceId));
  }
  /** Async inference applies only to the exact version it was given. Never rebase meaning. */
  applyCurrent(prediction: Prediction, world: WorldState, update: PredictionUpdate, outcome?: 'correct' | 'incorrect'): Prediction | null {
    return this.inspection.atomic(() => {
      const current = this.store.get('prediction', prediction.id);
      if (current.version !== prediction.version || current.status !== 'open') {
        this.inspection.emit(world.agentId, world.cycleId, 'prediction.update_discarded', {
          predictionId: prediction.id, expectedVersion: prediction.version, currentVersion: current.version,
          worldId: world.id, operation: update.operation, reason: 'Prediction changed while inference was running; stale output discarded without rebasing',
        });
        return null;
      }
      return this.apply(prediction, world, update, outcome);
    });
  }
  apply(prediction: Prediction, world: WorldState, update: PredictionUpdate, outcome?: 'correct' | 'incorrect'): Prediction {
    const validated = PredictionUpdateSchema.parse(update);
    if (prediction.agentId !== world.agentId || prediction.status !== 'open') throw new Error('Prediction is not open for this Agent');
    if (validated.operation === 'revise' && !validated.revision) throw new InfrastructureError('prediction', 'Revision requires preserved new expectation/context');
    if (validated.operation !== 'revise' && validated.revision) throw new InfrastructureError('prediction', 'Only revision may replace expectation/context');
    if (validated.operation === 'resolve' && !validated.evaluation) throw new InfrastructureError('prediction', 'Resolution requires a nonbinary evaluation');
    if (validated.evaluation && validated.evaluation.evidenceWorldId !== world.id) throw new InfrastructureError('prediction', 'Evaluation must identify current evidence');
    const statuses = { continue: 'open', revise: 'open', resolve: 'resolved', abandon: 'abandoned', expire: 'expired', invalidate: 'invalidated' } as const;
    return this.inspection.atomic(() => {
      if (!prediction.partId && validated.mutation) throw new InfrastructureError('hypothesis_reflection', 'Gap reflection cannot mutate a Part');
      const memory = validated.memory ? prediction.partId
        ? this.encode(prediction.partId, world, validated.memory, prediction.id, this.outcomeAncestors(prediction, world))
        : this.encodeGap(prediction, world, validated.memory) : null;
      const next = PredictionSchema.parse({ ...prediction, ...(validated.revision ?? {}), version: prediction.version + 1,
        status: statuses[validated.operation], evaluation: validated.evaluation ?? prediction.evaluation, memoryId: memory?.id ?? prediction.memoryId });
      this.store.save('prediction', next, prediction.version, { origin: 'prediction_evaluation', reason: validated.reason, sourceIds: [world.id] });
      if (next.status !== 'open' || validated.operation === 'revise') {
        for (const current of this.store.list('disposition', world.agentId).filter(disposition => disposition.temporary
          && disposition.scaffold && disposition.sourcePredictionId === prediction.id && disposition.active)) {
          const ended = DispositionSchema.parse({ ...current, version: current.version + 1, active: false,
            scaffold: { ...current.scaffold!, endedCycle: world.cycleId, endReason: validated.reason },
            development: current.development ? { ...current.development, previousVersion: current.version } : undefined });
          this.store.save('disposition', ended, current.version, { origin: 'prediction_evaluation',
            reason: 'End prediction-bound disposition eligibility while preserving its hypothesis and use history', sourceIds: [prediction.id, world.id] });
          this.inspection.emit(world.agentId, world.cycleId, 'disposition.learned', ended);
        }
      }
      if (validated.operation === 'revise') this.createScaffolds(next, world);
      if (memory && validated.operation === 'resolve') {
        const owner = prediction.partId ? this.store.get('part', prediction.partId) : null;
        for (const binding of owner?.instance?.dispositionBindings ?? []) {
          const current = this.store.list('disposition', world.agentId).find(disposition => disposition.id === binding.dispositionId);
          if (!current || current.temporary) continue;
          // Preserve the actual version supplied when the prediction was formed, not today's wording.
          const judgments = this.store.eventsByType(world.agentId, ['construction.judgment'], [prediction.createdCycle]);
          const source = judgments.flatMap(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation'
            ? event.payload.input.candidates.filter(candidate => candidate.id === current.id) : []).at(0);
          const sourceVersion = source ? (source.context as { disposition: { version: number } }).disposition.version : null;
          const development = current.development ?? { retrievalIntent: current.concern, contextCues: [], internalStateCues: [],
            status: 'provisional' as const, confidence: 'Developmental status not previously recorded', lineage: [],
            previousVersion: null, evidence: [], createdAt: now() };
          const disposition = DispositionSchema.parse({ ...current, version: current.version + 1,
            memoryIds: [...new Set([...current.memoryIds, memory.id])],
            development: { ...development, previousVersion: current.version, evidence: [...development.evidence, {
              memoryId: memory.id, predictionId: prediction.id, cycleId: world.cycleId,
              threadId: this.store.cycle(world.cycleId).threadId ?? null, dispositionVersion: sourceVersion,
              relationship: 'unclassified', retrievalUsefulness: 'unknown', reconciliation: 'pending',
              reason: 'Resolved expectation requires interpretation of relevance; outcome classification is not a retrieval judgment',
            }] } });
          this.store.save('disposition', disposition, current.version, { origin: 'prediction_evaluation',
            reason: 'Attach resolved lived evidence for later reconciliation', sourceIds: [memory.id, prediction.id] });
          this.inspection.emit(world.agentId, world.cycleId, 'disposition.learned', disposition);
        }
      }
      if (prediction.partId && validated.mutation && !this.store.get('part', prediction.partId).instance) {
        const part = this.store.get('part', prediction.partId);
        this.mutations.propose(part.id, part.version, validated.mutation,
          { origin: 'prediction_evaluation', reason: validated.reason, sourceIds: [prediction.id, world.id] }, world.cycleId);
      }
      if (prediction.partId && outcome && validated.operation === 'resolve' && !this.store.get('part', prediction.partId).instance) {
        this.mutations.recordPredictionConfidence(prediction.partId, outcome, prediction.id, world.id, world.cycleId);
      }
      this.inspection.emit(world.agentId, world.cycleId,
        validated.operation === 'revise' ? 'part.prediction_revised' : 'prediction.evaluation',
        validated.operation === 'revise' ? next : { partId: prediction.partId, prediction: next, update: validated });
      return next;
    });
  }
}
