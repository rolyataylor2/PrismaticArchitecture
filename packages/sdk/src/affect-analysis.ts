import { z } from 'zod';
import type { Store, CognitiveEvent, EventPayloads } from '../../core/src/contracts.js';
import type { SelectedAffect } from '../../core/src/affect-domain.js';
import { affectCycles } from '../../core/src/affect-history.js';
import { affectFeedback } from '../../core/src/affect.js';

type TimelineKind = 'part.affect_proposals' | 'self.affect_decision' | 'self.affect_baseline' | 'part.focused_bid_revision' | 'self.choice' | 'self.experienced_transition';
export type AffectTimelineItem = { eventId: string; cycleId: string; at: string; sequence: number; threadId: string | null; completed: boolean; type: string; detail: EventPayloads[TimelineKind]; periodIds: string[] };

export const AffectAnalysisFilterSchema = z.strictObject({
  from: z.iso.datetime().optional(), to: z.iso.datetime().optional(),
  threadId: z.string().min(1).nullable().optional(), partId: z.string().min(1).optional(),
}).refine(value => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), 'Start must precede end');
export type AffectAnalysisFilter = z.infer<typeof AffectAnalysisFilterSchema>;

/** Researcher-only projection. Lifetime cohorts retain outcomes resolving outside a display window. */
export function analyzeAffect(store: Store, agentId: string, supplied: AffectAnalysisFilter = {}) {
  store.get('agent', agentId);
  const filter = AffectAnalysisFilterSchema.parse(supplied);
  const cycles = store.cycles(agentId);
  const cycleMap = new Map(cycles.map(cycle => [cycle.id, cycle]));
  const records = affectCycles(store, agentId);
  const events = store.eventsByType(agentId, ['part.affect_proposals', 'self.affect_decision', 'self.affect_baseline',
    'part.focused_bid_revision', 'part.bid_created', 'self.choice', 'self.experienced_transition']);
  const predictions = store.list('prediction', agentId);
  const fitsTime = (at: string) => (!filter.from || Date.parse(at) >= Date.parse(filter.from))
    && (!filter.to || Date.parse(at) <= Date.parse(filter.to));
  const fitsThread = (thread: string | null) => filter.threadId === undefined || thread === filter.threadId;
  const fitsCycle = (cycleId: string) => { const cycle = cycleMap.get(cycleId); return !!cycle && fitsTime(cycle.startedAt) && fitsThread(cycle.threadId ?? null); };
  const committed = new Set(cycles.filter(cycle => cycle.status === 'completed' && cycle.kind !== 'attention_monitor').map(cycle => cycle.id));
  const periodMap = new Map<string, SelectedAffect>();
  for (const record of records) for (const focus of [record.focusBefore, record.focusAfter, record.usedFocus,
    ...record.decisions.map(decision => decision.resultingFocus)]) if (focus) periodMap.set(focus.periodId, focus);
  const eventRef = (event: CognitiveEvent) => ({ eventId: event.id, cycleId: event.cycleId!, at: event.at });
  const periods = [...periodMap.values()].filter(focus => fitsThread(focus.threadId)
    && (!filter.partId || focus.proposals.some(proposal => proposal.partId === filter.partId))).map(focus => {
    const decisions = records.flatMap(record => record.decisions).filter(decision => decision.previousFocus?.periodId === focus.periodId
      || decision.resultingFocus?.periodId === focus.periodId);
    const entry = decisions.find(decision => decision.resultingFocus?.periodId === focus.periodId && ['started', 'switched'].includes(decision.boundary));
    const entryRecord = records.find(record => record.cycleId === entry?.cycleId);
    const exposed = records.filter(record => record.usedFocus?.periodId === focus.periodId
      || (record.focusBefore?.periodId === focus.periodId && record.sequence <= record.focusBefore.expiresAfterSequence));
    const origins = records.flatMap(record => record.originated.filter(origin => origin.periodId === focus.periodId)
      .map(origin => ({ ...origin, cycleId: record.cycleId })));
    const revisions = events.flatMap(event => event.type === 'part.focused_bid_revision' && event.payload.focusId === focus.periodId
      && event.cycleId && committed.has(event.cycleId) ? [{ ...eventRef(event), ...event.payload }] : []);
    const boundaries: { cycleId: string; at: string; kind: 'switched' | 'expired' | 'navigation' }[] = [];
    for (const record of records) {
      if (record.navigationStateId && record.usedFocus?.periodId === focus.periodId) boundaries.push({ cycleId: record.cycleId,
        at: cycleMap.get(record.cycleId)!.startedAt, kind: 'navigation' });
      for (const decision of record.decisions) if (decision.endedPeriodId === focus.periodId && ['switched', 'expired'].includes(decision.boundary))
        boundaries.push({ cycleId: record.cycleId, at: cycleMap.get(record.cycleId)!.startedAt, kind: decision.boundary as 'switched' | 'expired' });
    }
    const end = boundaries.at(0) ?? null;
    const startAt = cycleMap.get(focus.startedCycleId)!.startedAt;
    const windowCycles = exposed.filter(record => fitsCycle(record.cycleId));
    const originatedPredictionIds = origins.map(origin => origin.predictionId);
    const feedback = affectFeedback({ periodId: focus.periodId, completedCycles: exposed.length,
      baselinePredictionIds: entryRecord?.baselinePredictionIds ?? [], originatedPredictionIds, predictions });
    const windowFeedback = affectFeedback({ periodId: focus.periodId, completedCycles: windowCycles.length,
      baselinePredictionIds: entryRecord && fitsCycle(entryRecord.cycleId) ? entryRecord.baselinePredictionIds : [],
      originatedPredictionIds: origins.filter(origin => fitsCycle(origin.cycleId)).map(origin => origin.predictionId), predictions });
    const behavior = exposed.flatMap(record => events.flatMap(event => event.type === 'self.choice' && event.cycleId === record.cycleId
      ? [{ ...eventRef(event), ...event.payload, bids: events.flatMap(source => source.type === 'part.bid_created'
        && (event.payload.selectedBidIds ?? [event.payload.choice]).includes(source.payload.id) ? [source.payload] : []) }] : []));
    const evaluations = exposed.map(record => ({ cycleId: record.cycleId,
      baseline: events.flatMap(event => event.type === 'self.affect_baseline' && event.cycleId === record.cycleId ? [event.payload] : []),
      final: behavior.filter(choice => choice.cycleId === record.cycleId) }));
    const parts = [...new Set([...focus.proposals.map(proposal => proposal.partId), ...revisions.map(revision => revision.partId)])].map(partId => {
      const part = store.versions('part', partId).at(0)?.state;
      return { partId, name: part?.name ?? focus.proposals.find(proposal => proposal.partId === partId)?.name ?? partId,
        dispositionIds: part?.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [] };
    });
    const predictionEvidence = predictions.filter(prediction => originatedPredictionIds.includes(prediction.id)
      || entryRecord?.baselinePredictionIds.includes(prediction.id)).map(prediction => ({ prediction,
        cohort: originatedPredictionIds.includes(prediction.id) ? 'originated' as const : 'baseline' as const,
        origin: origins.find(origin => origin.predictionId === prediction.id) ?? null,
        versions: store.versions('prediction', prediction.id) }));
    return { id: focus.periodId, focus, startAt, end, decisions, parts, feedback, windowFeedback,
      exposedCycleIds: exposed.map(record => record.cycleId), windowCycleIds: windowCycles.map(record => record.cycleId),
      revisions, behavior, evaluations, predictionEvidence, renewals: decisions.filter(decision => decision.boundary === 'renewed').length,
      visible: (!filter.to || Date.parse(startAt) <= Date.parse(filter.to))
        && (!filter.from || !end || Date.parse(end.at) >= Date.parse(filter.from)) };
  }).filter(period => period.visible);
  const allowedPeriods = new Set(periods.map(period => period.id));
  const timeline = events.filter(event => event.cycleId && fitsCycle(event.cycleId)).flatMap<AffectTimelineItem>(event => {
    const cycle = cycleMap.get(event.cycleId!)!;
    const base = { ...eventRef(event), sequence: cycle.sequence, threadId: cycle.threadId ?? null,
      completed: committed.has(cycle.id), type: event.type };
    if (event.type === 'part.affect_proposals') return !filter.partId || event.payload.partId === filter.partId
      ? [{ ...base, detail: event.payload, periodIds: [] as string[] }] : [];
    if (event.type === 'self.affect_decision') { const decision = event.payload;
      const ids = [decision.previousFocus?.periodId, decision.resultingFocus?.periodId].filter((id): id is string => !!id);
      return !filter.partId || ids.some(id => allowedPeriods.has(id)) ? [{ ...base, detail: decision, periodIds: ids }] : [];
    }
    if (event.type === 'part.focused_bid_revision') return !filter.partId || event.payload.partId === filter.partId
      ? [{ ...base, detail: event.payload, periodIds: [event.payload.focusId] }] : [];
    if (event.type === 'self.experienced_transition') return !filter.partId || [...event.payload.before, ...event.payload.chosen, ...event.payload.resulting].some(stance => stance.partId === filter.partId)
      ? [{ ...base, detail: event.payload, periodIds: records.filter(record => record.cycleId === cycle.id && record.usedFocus).map(record => record.usedFocus!.periodId) }] : [];
    if (event.type === 'self.affect_baseline' || event.type === 'self.choice') return !filter.partId || records.some(record => record.cycleId === cycle.id
      && record.usedFocus && allowedPeriods.has(record.usedFocus.periodId)) ? [{ ...base, detail: event.payload,
        periodIds: records.filter(record => record.cycleId === cycle.id && record.usedFocus).map(record => record.usedFocus!.periodId) }] : [];
    return [];
  });
  const committedChoices = store.eventsByType(agentId, ['self.affect_committed']).flatMap(event => event.type === 'self.affect_committed' ? [event] : []);
  const latestByThread = new Map<string | null, typeof committedChoices[number]>();
  for (const event of committedChoices) {
    const previous = latestByThread.get(event.payload.record.threadId);
    if (!previous || event.payload.record.sequence >= previous.payload.record.sequence) latestByThread.set(event.payload.record.threadId, event);
  }
  const latestCommittedChoices = [...latestByThread.values()].filter(event => fitsThread(event.payload.record.threadId)
    && (!filter.partId || [...(event.payload.record.focusAfter?.proposals ?? []), ...(event.payload.record.focusBefore?.proposals ?? [])].some(proposal => proposal.partId === filter.partId)))
    .map(event => ({ eventId: event.id, cycleId: event.cycleId!, at: event.at, threadId: event.payload.record.threadId,
      sourceStatus: cycleMap.get(event.cycleId!)?.status ?? null, choiceEpoch: event.payload.record.sequence,
      focus: event.payload.record.focusAfter, record: event.payload.record }));
  const range = cycles.filter(cycle => cycle.kind !== 'attention_monitor').map(cycle => cycle.startedAt).sort();
  return { agentId, filter, lifetime: { from: range.at(0) ?? null, to: range.at(-1) ?? null },
    threads: [...new Set(cycles.map(cycle => cycle.threadId ?? null))], latestCommittedChoices, periods, timeline,
    totals: { periods: periods.length, completedCycles: new Set(timeline.filter(item => item.completed).map(item => item.cycleId)).size,
      failedCycles: new Set(timeline.filter(item => !item.completed && cycleMap.get(item.cycleId)?.status === 'failed').map(item => item.cycleId)).size,
      revisions: periods.reduce((sum, period) => sum + period.revisions.filter(revision => fitsCycle(revision.cycleId)).length, 0) },
    limitations: ['Display windows select cycle start times; overlapping periods retain lifetime statistics separately from window-origin cohorts.',
      'Prediction outcomes use the latest recorded version, including resolutions after the displayed window or period ended.',
      'Baseline scoring enacts no action and may already reflect carried focus in the immutable snapshot; differences do not establish causality.',
      'No calibrated binary probabilities or comparable learning measurements are recorded: Brier scores and learning progress are unavailable.',
      'Meaningful usefulness requires Part interpretation; correctness does not establish disposition maturity. Completed-observation cohorts are historical; latest committed choices remain valid records even if later source processing fails.'] };
}
export type AffectAnalysis = ReturnType<typeof analyzeAffect>;
