import type { Store } from '../../core/src/contracts.js';
import type { ConstructedInput } from '../../core/src/constructed-domain.js';

/** Exact host lineage only. Missing sources are not guessed from settings or similar prose. */
export function thoughtModelEvidence(store: Store, agentId: string) {
  store.get('agent', agentId);
  const events = store.eventsByType(agentId, ['cognition.bid_source', 'cognition.source', 'provider.operation', 'part.thought', 'part.bid_created', 'self.choice', 'execution.contract', 'prediction.outcome_checked']);
  const operations = events.flatMap(event => event.type === 'provider.operation' && event.payload.component === 'reasoning' && event.payload.phase !== 'started' ? [event.payload] : []);
  const predictions = store.list('prediction', agentId);
  const executions = store.executions(agentId);
  const bidRecords = [...new Map(events.flatMap(event => event.type === 'part.bid_created' ? [[event.payload.id, event] as const] : [])).values()].map(event => {
    const bid = event.payload;
    const link = events.findLast(link => (link.type === 'cognition.bid_source' && link.payload.bidId === bid.id && link.payload.partId === bid.partId)
      || (link.type === 'cognition.source' && link.payload.bidId === bid.id));
    const source = link?.type === 'cognition.bid_source' || link?.type === 'cognition.source' ? link.payload.inferenceSource : null;
    const operation = source ? operations.find(operation => operation.operationId === source.operationId && operation.provider === source.provider
      && operation.phase === 'returned' && ['part_cognition', 'answer', 'focused_bid_revision'].includes(operation.task)) : null;
    const contracts = events.flatMap(event => event.type === 'execution.contract' && event.payload.commands.some(command => command.bidId === bid.id) ? [event.payload.id] : []);
    const reports = executions.filter(execution => execution.contractId && contracts.includes(execution.contractId));
    return { bidId: bid.id, partId: bid.partId, cycleId: event.cycleId,
      source: operation ? { operationId: operation.operationId, provider: operation.provider } : null,
      selected: events.some(event => event.type === 'self.choice' && (event.payload.selectedBidIds ?? [event.payload.choice]).includes(bid.id)),
      reports: reports.map(report => ({ executionId: report.id, status: report.status, verified: report.operational?.verified ?? null })) };
  });
  const thoughts = events.flatMap(event => {
    if (event.type !== 'part.thought') return [];
    const source = event.payload.inferenceSource;
    const operation = source ? operations.find(operation => operation.operationId === source.operationId && operation.provider === source.provider
      && operation.task === 'part_cognition' && operation.phase === 'returned') : undefined;
    const formed = predictions.filter(prediction => prediction.cognitionOrigin?.thoughtEventId === event.id);
    const bidIds = new Set(events.flatMap(link => link.type === 'cognition.source' && link.payload.thoughtEventId === event.id
      && link.payload.inferenceSource.operationId === operation?.operationId && link.payload.bidId ? [link.payload.bidId] : []));
    const bids = bidRecords.filter(bid => bidIds.has(bid.bidId));
    return [{ thoughtEventId: event.id, cycleId: event.cycleId, threadId: event.payload.partSnapshot.instance?.threadId ?? null, partId: event.payload.partId,
      bindings: event.payload.partSnapshot.instance?.dispositionBindings ?? [],
      source: operation ? { operationId: operation.operationId, provider: operation.provider } : null,
      predictions: formed.map(prediction => {
        const checked = events.filter(event => event.type === 'prediction.outcome_checked' && event.payload.predictionId === prediction.id).at(-1);
        return { predictionId: prediction.id, status: prediction.status,
          outcome: checked?.type === 'prediction.outcome_checked' ? checked.payload.outcome : null,
          assessment: prediction.evaluation?.assessment ?? null,
          checkSequence: checked?.sequence ?? null };
      }),
      bids }];
  });
  const providers = [...new Set(operations.map(operation => operation.provider))].sort().map(provider => {
    const calls = operations.filter(operation => operation.provider === provider);
    const sourced = thoughts.filter(thought => thought.source?.provider === provider);
    const measured = calls.filter(call => call.elapsedMs !== null);
    const outcomes = sourced.flatMap(thought => thought.predictions);
    const bids = bidRecords.filter(bid => bid.source?.provider === provider);
    const reports = [...new Map(bids.flatMap(bid => bid.reports).map(report => [report.executionId, report])).values()];
    return { provider, calls: calls.length, returned: calls.filter(call => call.phase === 'returned').length,
      failed: calls.filter(call => call.phase === 'failed').length,
      workloadAssessments: calls.filter(call => call.task === 'thought_resources').length,
      generationCalls: calls.filter(call => call.task === 'part_cognition').length,
      measuredCalls: measured.length, totalLatencyMs: measured.reduce((sum, call) => sum + call.elapsedMs!, 0),
      formedPredictions: outcomes.length, checkedPredictions: outcomes.filter(outcome => outcome.outcome !== null).length,
      correct: outcomes.filter(outcome => outcome.outcome === 'correct').length,
      incorrect: outcomes.filter(outcome => outcome.outcome === 'incorrect').length,
      incomplete: outcomes.filter(outcome => outcome.outcome === 'incomplete').length,
      irrelevant: outcomes.filter(outcome => outcome.outcome === 'irrelevant').length,
      proposedBids: bids.length, selectedBids: bids.filter(bid => bid.selected).length,
      executionReports: reports.length,
      independentlyVerifiedReports: reports.filter(report => report.verified === true).length,
      operationIds: calls.map(call => call.operationId), thoughtEventIds: sourced.map(thought => thought.thoughtEventId) };
  });
  return { providers, thoughts, bids: bidRecords, unattributedBids: bidRecords.filter(bid => !bid.source).length, unattributedThoughts: thoughts.filter(thought => !thought.source).length,
    limitations: 'Observed attribution is not model causality. Prediction judgments, subjective assessments, bid selection and external verification are separate outcomes. Failed or unselected actions do not imply prediction error. Latency includes each adapter call, not thought queue delay; absent tokens/cost remain unmeasured.' };
}

function bindingKey(bindings: { entityId: string; dispositionId: string }[]) {
  return JSON.stringify(bindings.map(binding => [binding.entityId, binding.dispositionId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

/** Resource escalation only; this history never enters Part or Self inference context. */
export function repeatedPredictionContradiction(store: Store, input: ConstructedInput, provider: string, threshold: number): boolean {
  const cycle = input.world ? store.cycles(input.agentId).find(cycle => cycle.id === input.world!.cycleId) : undefined;
  if (!cycle) return false;
  const scope = bindingKey(input.dispositionBindings ?? []);
  const outcomes = thoughtModelEvidence(store, input.agentId).thoughts.filter(thought => thought.source?.provider === provider
    && thought.threadId === (cycle.threadId ?? null) && bindingKey(thought.bindings) === scope).flatMap(thought => thought.predictions)
    .filter(prediction => prediction.outcome === 'correct' || prediction.outcome === 'incorrect')
    .sort((a, b) => (a.checkSequence ?? 0) - (b.checkSequence ?? 0)).slice(-threshold);
  return outcomes.length >= threshold && outcomes.every(outcome => outcome.outcome === 'incorrect');
}
