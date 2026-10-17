import { z } from 'zod';
import type { Disposition, WorldState } from './domain.js';
import type { Store } from './contracts.js';
import type { Inspection } from './inspection.js';

export const LongTermInterestSchema = z.number().min(0).max(1);
export const ShortTermInterestSchema = z.number().min(-1).max(1);
export const DispositionInterestSettingsSchema = z.strictObject({
  longTermWeight: z.number().min(0).max(1).default(0.45),
  shortTermWeight: z.number().min(0).max(1).default(0.35),
  longTermSelectionGain: z.number().min(0).max(0.1).default(0.005),
  shortTermSelectionGain: z.number().min(0).max(0.5).default(0.05),
  longTermHalfLifeMinutes: z.number().min(1).max(5256000).default(43200),
  shortTermHalfLifeMinutes: z.number().min(1).max(5256000).default(30),
});
export type DispositionInterestSettings = z.infer<typeof DispositionInterestSettingsSchema>;
export const defaultInterestSettings = DispositionInterestSettingsSchema.parse({});
// Removing defaults is necessary for PATCH: omitted fields must retain saved values.
export const DispositionInterestSettingsPatchSchema = z.strictObject({
  longTermWeight: DispositionInterestSettingsSchema.shape.longTermWeight.removeDefault().optional(),
  shortTermWeight: DispositionInterestSettingsSchema.shape.shortTermWeight.removeDefault().optional(),
  longTermSelectionGain: DispositionInterestSettingsSchema.shape.longTermSelectionGain.removeDefault().optional(),
  shortTermSelectionGain: DispositionInterestSettingsSchema.shape.shortTermSelectionGain.removeDefault().optional(),
  longTermHalfLifeMinutes: DispositionInterestSettingsSchema.shape.longTermHalfLifeMinutes.removeDefault().optional(),
  shortTermHalfLifeMinutes: DispositionInterestSettingsSchema.shape.shortTermHalfLifeMinutes.removeDefault().optional(),
});

type InterestTrace = Pick<Disposition, 'longTermInterest' | 'shortTermInterest' | 'interestUpdatedAt'>;
/** Pure projection on the experience clock. Inspection and rescoring never reinforce. */
export function dispositionInterest(trace: InterestTrace, at: string, settings = defaultInterestSettings) {
  const minutes = trace.interestUpdatedAt ? Math.max(0, (Date.parse(at) - Date.parse(trace.interestUpdatedAt)) / 60000) : 0;
  const longTermInterest = (trace.longTermInterest ?? 0) * 2 ** (-minutes / settings.longTermHalfLifeMinutes);
  const shortTermInterest = (trace.shortTermInterest ?? 0) * 2 ** (-minutes / settings.shortTermHalfLifeMinutes);
  return { longTermInterest, shortTermInterest,
    threshold: Math.min(2.35, Math.max(1.4, 2 - settings.longTermWeight * longTermInterest - settings.shortTermWeight * shortTermInterest)) };
}

export function interestDisposition(disposition: Disposition, at: string, settings = defaultInterestSettings): Disposition {
  return { ...disposition, ...dispositionInterest(disposition, at, settings),
    interestUpdatedAt: disposition.interestUpdatedAt && disposition.interestUpdatedAt > at ? disposition.interestUpdatedAt : at };
}

/** Explicit allowlist: environmental relevance scorer is blind to attention policy. */
export function activationDisposition(disposition: Disposition) {
  return { id: disposition.id, version: disposition.version, name: disposition.name, concern: disposition.concern,
    scope: disposition.scope, cues: disposition.cues };
}

/** Latest experienced time, never the browser's time or the number of passes. */
export function interestTime(store: Store, agentId: string): string {
  const observations = store.worlds(agentId).map(world => world.capturedAt);
  return observations.sort().at(-1) ?? store.cycles(agentId).map(cycle => cycle.startedAt).sort().at(-1)
    ?? store.versions('agent', agentId)[0]!.at;
}

export function reinforceDispositionInterests(store: Store, inspection: Inspection, world: WorldState,
  selections: { id: string; partId: string }[]): void {
  if (!selections.length) return;
  inspection.atomic(() => {
    const seen = new Set(store.eventsByType(world.agentId, ['disposition.interest_updated']).flatMap(event =>
      event.type === 'disposition.interest_updated' ? event.payload.selectionIds : []));
    const sources = new Map<string, Set<string>>();
    for (const selection of selections) {
      if (seen.has(selection.id)) continue;
      const part = store.get('part', selection.partId);
      if (part.agentId !== world.agentId) throw new Error('Interest selection owner mismatch');
      for (const binding of part.instance?.dispositionBindings ?? []) {
        const ids = sources.get(binding.dispositionId) ?? new Set<string>();
        ids.add(selection.id); sources.set(binding.dispositionId, ids);
      }
    }
    const settings = DispositionInterestSettingsSchema.parse(store.agentActivationSettings(world.agentId).dispositionInterests ?? {});
    for (const [dispositionId, ids] of sources) {
      const current = store.get('disposition', dispositionId);
      if (current.agentId !== world.agentId || !current.active || current.deleted) continue;
      const at = current.interestUpdatedAt && current.interestUpdatedAt > world.capturedAt ? current.interestUpdatedAt : world.capturedAt;
      const decayed = dispositionInterest(current, at, settings);
      const trace = { longTermInterest: Math.min(1, decayed.longTermInterest + settings.longTermSelectionGain),
        shortTermInterest: Math.min(1, decayed.shortTermInterest + settings.shortTermSelectionGain), interestUpdatedAt: at };
      const next = interestDisposition({ ...current, ...trace, version: current.version + 1,
        ...(current.development ? { development: { ...current.development, previousVersion: current.version } } : {}) }, at, settings);
      store.save('disposition', next, current.version, { origin: 'organic_cognition',
        reason: 'Self selected an owning proposal; materialize elapsed-time decay and bounded interest reinforcement', sourceIds: [...ids] });
      inspection.emit(world.agentId, world.cycleId, 'disposition.interest_updated', {
        dispositionId, previousVersion: current.version, version: next.version, selectionIds: [...ids], at,
        longTermInterest: trace.longTermInterest, shortTermInterest: trace.shortTermInterest, threshold: next.threshold });
    }
  });
}
