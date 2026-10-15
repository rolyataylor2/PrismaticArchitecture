import type { Store } from '../../core/src/contracts.js';

export type DispositionActivationSample = {
  eventId: string; cycleId: string; worldId: string; sequence: number; capturedAt: string;
  recordedAt: string; threadId: string | null; dispositionVersion: number; threshold: number;
  score: number | null; phase: 'direct' | 'baseline' | 'associated' | 'excluded'; reasons: string[];
};

export function currentDispositionActivation(samples: DispositionActivationSample[]) {
  const finals = samples.filter(sample => sample.phase !== 'baseline');
  return { latestAssessment: finals.at(-1) ?? null, latestMeasurement: finals.findLast(sample => sample.score !== null) ?? null };
}

/** Exact recorded judgments; baseline and associated results remain separate evidence. */
export function dispositionActivationHistory(store: Store, dispositionId: string): DispositionActivationSample[] {
  const disposition = store.get('disposition', dispositionId);
  const cycles = new Map(store.cycles(disposition.agentId).map(cycle => [cycle.id, cycle]));
  const samples: DispositionActivationSample[] = [];
  for (const event of store.eventsByType(disposition.agentId, ['construction.judgment', 'construction.eligibility'])) {
    if (event.type === 'construction.eligibility') {
      const scope = event.payload.scopes.find(scope => scope.dispositionId === dispositionId);
      if (!scope || scope.eligible || !event.cycleId) continue;
      const cycle = cycles.get(event.cycleId);
      if (!cycle) continue;
      samples.push({ eventId: event.id, cycleId: cycle.id, worldId: event.payload.worldId,
        sequence: cycle.sequence, capturedAt: cycle.startedAt, recordedAt: event.at,
        threadId: event.payload.threadId, dispositionVersion: scope.version, threshold: scope.threshold,
        score: null, phase: 'excluded', reasons: scope.reasons });
    } else if (event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation') {
      const candidate = event.payload.input.candidates.find(candidate => candidate.id === dispositionId);
      const score = event.payload.scores.find(score => score.partId === dispositionId);
      if (!candidate || !score) continue;
      const context = candidate.context as { disposition: { version: number; threshold: number }; activationPhase?: string };
      const world = event.payload.input.world;
      samples.push({ eventId: event.id, cycleId: world.cycleId, worldId: world.id,
        sequence: world.sequence, capturedAt: world.capturedAt, recordedAt: event.at,
        threadId: cycles.get(world.cycleId)?.threadId ?? null, dispositionVersion: context.disposition.version,
        threshold: context.disposition.threshold, score: score.score,
        phase: context.activationPhase === 'associated' ? 'associated' : context.activationPhase === 'baseline' ? 'baseline' : 'direct',
        reasons: [] });
    }
  }
  return samples.sort((a, b) => a.sequence - b.sequence || a.capturedAt.localeCompare(b.capturedAt) || a.recordedAt.localeCompare(b.recordedAt));
}
