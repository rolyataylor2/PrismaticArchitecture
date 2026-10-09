import { z } from 'zod';
import { Id, PredictionThoughtSchema, type Prediction, type Disposition } from './domain.js';
import type { Store } from './contracts.js';

export const PredictionTrajectorySchema = z.strictObject({ predictionId: Id,
  originEventId: Id.nullable(), thoughts: z.array(PredictionThoughtSchema).max(40),
  omittedThoughtCount: z.number().int().nonnegative() });
export type PredictionTrajectory = z.infer<typeof PredictionTrajectorySchema>;

/** Activation records preserve the exact definition supplied in the immutable assembly. */
export function thoughtDispositionVersions(store: Store, agentId: string, cycleId: string, dispositionIds: string[]) {
  const judgments = store.eventsByType(agentId, ['construction.judgment'], [cycleId]);
  return dispositionIds.flatMap(dispositionId => {
    const candidate = judgments.flatMap(event => event.type === 'construction.judgment'
      && event.payload.input.task === 'disposition_activation' ? event.payload.input.candidates.filter(candidate => candidate.id === dispositionId) : []).at(0);
    const disposition = (candidate?.context as { disposition?: Disposition } | undefined)?.disposition;
    return disposition ? [{ dispositionId, version: disposition.version }] : [];
  });
}

/** Expressed products only. No raw world, recalled contents, or private Part state. */
export function predictionTrajectories(store: Store, agentId: string, predictions: Prediction[], definitions: Disposition[]): PredictionTrajectory[] {
  const thoughts = store.eventsByType(agentId, ['part.thought']).filter(event => event.type === 'part.thought');
  const eventOrder = new Map(thoughts.map(event => [event.id, event.sequence]));
  const evaluations = store.eventsByType(agentId, ['prediction.evaluation']);
  const cycles = new Map(store.cycles(agentId).map(cycle => [cycle.id, cycle]));
  return predictions.map(prediction => {
    if (prediction.agentId !== agentId) throw new Error('Prediction trajectory ownership mismatch');
    const created = cycles.get(prediction.createdCycle)!;
    const versions = store.versions('prediction', prediction.id);
    const ended = versions.find(record => record.state.status !== 'open');
    const closedSequence = ended ? evaluations.find(event => event.type === 'prediction.evaluation' && event.payload.prediction.id === prediction.id && event.payload.prediction.status !== 'open')?.cycleId : null;
    // Missing terminal provenance cannot extend a closed investigation indefinitely.
    const endSequence = closedSequence ? cycles.get(closedSequence)!.sequence : ended ? created.sequence : Infinity;
    const creation = thoughts.filter(event => event.cycleId === prediction.createdCycle && event.payload.partId === prediction.partId
      && event.payload.output.prediction);
    // Legacy reconstruction requires unique creation evidence; never invent a motive.
    const origin = prediction.cognitionOrigin
      ? creation.find(event => event.id === prediction.cognitionOrigin!.thoughtEventId)
      : prediction.partId && creation.length === 1 && store.eventsByType(agentId, ['part.prediction_created'], [prediction.createdCycle])
        .some(event => event.type === 'part.prediction_created' && event.payload.id === prediction.id) ? creation[0] : undefined;
    const originatingDispositionIds = new Set(prediction.cognitionOrigin?.dispositions.map(reference => reference.dispositionId)
      ?? origin?.payload.partSnapshot.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? []);
    const scaffoldIds = new Set(definitions.filter(disposition => disposition.scaffold && disposition.sourcePredictionId === prediction.id).map(disposition => disposition.id));
    const associated = thoughts.flatMap(event => {
      const cycle = event.cycleId ? cycles.get(event.cycleId) : undefined;
      if (!cycle || cycle.kind === 'attention_monitor' || cycle.sequence < created.sequence || cycle.sequence > endSequence
        || cycle.threadId !== created.threadId) return [];
      const association = event.id === origin?.id ? 'origin' as const
        : event.payload.predictionSnapshot?.id === prediction.id ? 'holding_prediction' as const
          : event.payload.partSnapshot.instance?.dispositionBindings?.some(binding => scaffoldIds.has(binding.dispositionId)) ? 'scaffold' as const
            : event.payload.partSnapshot.instance?.dispositionBindings?.some(binding => originatingDispositionIds.has(binding.dispositionId)) ? 'originating_disposition' as const : null;
      if (!association) return [];
      const dispositions = association === 'origin' && prediction.cognitionOrigin ? prediction.cognitionOrigin.dispositions
        : thoughtDispositionVersions(store, agentId, cycle.id,
          (event.payload.partSnapshot.instance?.dispositionBindings ?? []).map(binding => binding.dispositionId));
      return [PredictionThoughtSchema.parse({ eventId: event.id, cycleId: cycle.id, sequence: cycle.sequence,
        threadId: cycle.threadId ?? null, partId: event.payload.partId, partVersion: event.payload.partSnapshot.version,
        dispositions, association, predictionVersion: event.payload.predictionSnapshot?.id === prediction.id
          ? event.payload.predictionSnapshot.version : association === 'origin' ? 1 : null,
        interpretation: event.payload.output.interpretation, thought: event.payload.output.thought,
        localGoal: event.payload.output.localGoal ?? null, proposal: event.payload.output.proposal })];
    }).sort((a, b) => a.sequence - b.sequence || eventOrder.get(a.eventId)! - eventOrder.get(b.eventId)!);
    const selected = associated.length <= 40 ? associated : [...associated.filter(thought => thought.association === 'origin'), ...associated.filter(thought => thought.association !== 'origin').slice(origin ? -39 : -40)];
    return PredictionTrajectorySchema.parse({ predictionId: prediction.id, originEventId: origin?.id ?? null,
      thoughts: selected, omittedThoughtCount: associated.length - selected.length });
  });
}
