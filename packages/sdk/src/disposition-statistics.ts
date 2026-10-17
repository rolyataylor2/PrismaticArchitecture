import type { Store } from '../../core/src/contracts.js';

/** Researcher audit projection only. Counts never become activation weights or psychological meaning. */
export function dispositionStatistics(store: Store, dispositionId: string) {
  const disposition = store.get('disposition', dispositionId);
  const activations = new Set<string>();
  for (const event of store.eventsByType(disposition.agentId, ['construction.judgment'])) {
    if (event.type !== 'construction.judgment' || event.payload.input.task !== 'disposition_activation') continue;
    const candidate = event.payload.input.candidates.find(candidate => candidate.id === dispositionId);
    const score = event.payload.scores.find(score => score.partId === dispositionId);
    if ((candidate?.context as { activationPhase?: string })?.activationPhase === 'baseline') continue;
    if (candidate && score && score.score >= (event.payload.thresholds?.[dispositionId] ?? (candidate.context as { disposition: { threshold: number } }).disposition.threshold))
      activations.add(event.payload.input.world.cycleId);
  }
  const predictionIds = new Set(disposition.development?.evidence.flatMap(evidence => evidence.predictionId ? [evidence.predictionId] : []) ?? []);
  if (disposition.sourcePredictionId) predictionIds.add(disposition.sourcePredictionId);
  for (const prediction of store.list('prediction', disposition.agentId)) {
    const owner = prediction.partId ? store.versions('part', prediction.partId).at(0)?.state : undefined;
    if (owner?.instance?.dispositionBindings?.some(binding => binding.dispositionId === dispositionId)) predictionIds.add(prediction.id);
  }
  const outcomes = new Map<string, string>();
  for (const event of store.eventsByType(disposition.agentId, ['prediction.outcome_checked']))
    if (event.type === 'prediction.outcome_checked' && predictionIds.has(event.payload.predictionId)) outcomes.set(event.payload.predictionId, event.payload.outcome);
  return { activatedCycles: activations.size, associatedPredictions: predictionIds.size,
    correct: [...outcomes.values()].filter(outcome => outcome === 'correct').length,
    incorrect: [...outcomes.values()].filter(outcome => outcome === 'incorrect').length,
    incomplete: [...outcomes.values()].filter(outcome => outcome === 'incomplete').length,
    irrelevant: [...outcomes.values()].filter(outcome => outcome === 'irrelevant').length };
}
