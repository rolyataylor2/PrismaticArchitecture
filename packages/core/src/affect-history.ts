import type { Store } from './contracts.js';
import type { Cycle } from './domain.js';
import { AffectCycleSchema, type AffectCycle } from './affect-domain.js';
import { activeAffect, affectFeedback } from './affect.js';

export function affectCycles(store: Store, agentId: string): AffectCycle[] {
  const completed = new Set(store.cycles(agentId).filter(cycle => cycle.status === 'completed' && cycle.kind !== 'attention_monitor').map(cycle => cycle.id));
  return store.eventsByType(agentId, ['self.affect_cycle'], [...completed]).flatMap(event =>
    event.type === 'self.affect_cycle' && event.cycleId && completed.has(event.cycleId) ? [AffectCycleSchema.parse(event.payload)] : []);
}

/** Completed cognition in one thread alone advances voluntary-focus lifetime. */
export function priorAffect(store: Store, current: Cycle) {
  const prior = store.cycles(current.agentId).filter(cycle => cycle.status === 'completed' && cycle.kind !== 'attention_monitor'
    && cycle.threadId === current.threadId && cycle.sequence < current.sequence);
  const allowed = new Set(prior.map(cycle => cycle.id));
  const records = affectCycles(store, current.agentId).filter(record => allowed.has(record.cycleId));
  const latest = records.at(-1);
  const sequence = prior.length + 1;
  const focusBefore = latest?.focusAfter ?? null;
  const activeFocus = activeAffect(focusBefore, current.agentId, current.threadId ?? null, sequence);
  const periodId = focusBefore?.periodId ?? records.flatMap(record => record.decisions.flatMap(decision =>
    decision.resultingFocus ? [decision.resultingFocus.periodId] : [])).at(-1);
  const related = periodId ? records.filter(record => record.usedFocus?.periodId === periodId
    || (record.focusBefore?.periodId === periodId && record.sequence <= record.focusBefore.expiresAfterSequence)
    || record.decisions.some(decision => decision.resultingFocus?.periodId === periodId)) : [];
  const entry = related.flatMap(record => record.decisions).find(decision => decision.resultingFocus?.periodId === periodId
    && ['started', 'switched'].includes(decision.boundary));
  const entryRecord = entry ? related.find(record => record.cycleId === entry.cycleId) : undefined;
  const originated = records.flatMap(record => record.originated.filter(origin => origin.periodId === periodId).map(origin => origin.predictionId));
  return { sequence, focusBefore, activeFocus,
    feedback: periodId ? affectFeedback({ periodId, completedCycles: related.filter(record => record.usedFocus?.periodId === periodId
      || (record.focusBefore?.periodId === periodId && record.sequence <= record.focusBefore.expiresAfterSequence)).length,
      baselinePredictionIds: entryRecord?.baselinePredictionIds ?? [], originatedPredictionIds: originated,
      predictions: store.list('prediction', current.agentId) }) : null };
}

/** Live choice history follows serialized commits, independently of observation or adapter completion order. */
export function currentAffect(store: Store, current: Cycle, rootWorldId?: string) {
  const base = priorAffect(store, current);
  const commits = store.eventsByType(current.agentId, ['self.affect_committed']).flatMap(event =>
    event.type === 'self.affect_committed' && event.payload.record.threadId === (current.threadId ?? null) ? [event.payload] : []);
  const last = commits.at(-1);
  const root = rootWorldId ?? (current.kind === 'attention_monitor' ? last?.rootWorldId : undefined) ?? current.worldId;
  if (!last) return { ...base, shouldReconsider: true, rootWorldId: root };
  const sequence = last.record.sequence + (last.rootWorldId === root ? 0 : 1);
  const focusBefore = last.record.focusAfter;
  const activeFocus = activeAffect(focusBefore, current.agentId, current.threadId ?? null, sequence);
  const records = commits.map(commit => commit.record);
  const periodId = focusBefore?.periodId ?? records.flatMap(record => record.decisions.flatMap(decision =>
    decision.resultingFocus ? [decision.resultingFocus.periodId] : [])).at(-1);
  const related = periodId ? records.filter(record => record.usedFocus?.periodId === periodId
    || record.focusBefore?.periodId === periodId) : [];
  const entry = records.find(record => record.decisions.some(decision => decision.resultingFocus?.periodId === periodId
    && ['started', 'switched'].includes(decision.boundary)));
  const origins = store.eventsByType(current.agentId, ['self.affect_prediction_origin']).flatMap(event =>
    event.type === 'self.affect_prediction_origin' && event.payload.periodId === periodId ? [event.payload.predictionId] : []);
  const committedCycles = new Set(records.map(record => record.cycleId));
  const legacyOrigins = affectCycles(store, current.agentId).filter(record => !committedCycles.has(record.cycleId))
    .flatMap(record => record.originated.filter(origin => origin.periodId === periodId).map(origin => origin.predictionId));
  return { sequence, focusBefore, activeFocus, rootWorldId: root,
    shouldReconsider: last.rootWorldId !== root || !last.offersConsidered,
    feedback: periodId ? affectFeedback({ periodId,
      completedCycles: new Set(related.map(record => record.sequence)).size,
      baselinePredictionIds: entry?.baselinePredictionIds ?? [],
      originatedPredictionIds: [...new Set([...origins, ...legacyOrigins])],
      predictions: store.list('prediction', current.agentId) }) : null };
}
