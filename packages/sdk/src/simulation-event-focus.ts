import type { CognitiveEvent } from '../../core/src/contracts.js';
import type { SimulationRun } from './simulation-tests.js';
/** Exact identifier-field references and frozen ownership; prose and temporal neighbors establish neither. */
export function simulationEventFocus(run: SimulationRun, events: CognitiveEvent[], payload: unknown) {
  const parts = new Set(run.stages.flatMap(stage => stage.parts.map(part => part.id)));
  const predictions = new Map(run.stages.flatMap(stage => stage.predictions).map(item => [item.id, item.partId]));
  const memories = new Map(run.stages.flatMap(stage => stage.memories).map(item => [item.id, item.partId]));
  const bids = new Map(events.flatMap(event => event.type === 'part.bid_created' || event.type === 'primitive.bid_created'
    ? [[event.payload.id, event.payload.partId] as const] : event.type === 'part.focused_bid_revision' && event.payload.resultingBid
      ? [[event.payload.resultingBid.id, event.payload.resultingBid.partId] as const] : []));
  const contracts = new Set(events.flatMap(event => event.type === 'execution.contract' ? [event.payload.id] : []));
  const references = new Set<string>();
  function scan(value: unknown, key: string) {
    if (typeof value === 'string' && /(?:^id$|Ids?$|^choice$)/.test(key)) references.add(value);
    else if (Array.isArray(value)) value.forEach(item => scan(item, key));
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([field, item]) => scan(item, field));
  }
  scan(payload, '');
  const ids = [...references]; const directPartIds = ids.filter(id => parts.has(id));
  const predictionIds = ids.filter(id => predictions.has(id)); const memoryIds = ids.filter(id => memories.has(id)); const bidIds = ids.filter(id => bids.has(id));
  const owningPartIds = [...new Set([...directPartIds, ...predictionIds.map(id => predictions.get(id)), ...memoryIds.map(id => memories.get(id)), ...bidIds.map(id => bids.get(id))])]
    .filter((id): id is string => !!id && parts.has(id));
  return { directPartIds, owningPartIds, predictionIds, memoryIds, bidIds, contractIds: ids.filter(id => contracts.has(id)) };
}
