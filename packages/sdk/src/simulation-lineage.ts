import type { Bid } from '../../core/src/domain.js';
import type { CognitiveEvent } from '../../core/src/contracts.js';
import type { SimulationRun } from './simulation-tests.js';
/** Exact recorded-ID joins. Visibility, selection, authority and verified action stay distinct. */
export function simulationLineage(run: SimulationRun, events: CognitiveEvent[]) {
  const bids = new Map<string, { bid: Bid; eventIds: string[] }>();
  for (const event of events) {
    if (event.type === 'part.bid_created' || event.type === 'primitive.bid_created') {
      const old = bids.get(event.payload.id); bids.set(event.payload.id, { bid: event.payload, eventIds: [...(old?.eventIds ?? []), event.id] });
    }
    if (event.type === 'part.focused_bid_revision' && event.payload.resultingBid) {
      const bid = event.payload.resultingBid; const old = bids.get(bid.id);
      bids.set(bid.id, { bid, eventIds: [...(old?.eventIds ?? []), event.id] });
    }
    if (event.type === 'self.arbitration_started') for (const contribution of event.payload.contributions) {
      if (contribution.bid && !bids.has(contribution.bid.id)) bids.set(contribution.bid.id, { bid: contribution.bid, eventIds: [] });
    }
  }
  const contracts = events.flatMap(event => event.type === 'execution.contract' ? [{ eventId: event.id, contract: event.payload }] : []);
  const trails = [...bids.values()].map(({ bid, eventIds }) => {
    const name = run.stages.flatMap(stage => stage.parts).find(part => part.id === bid.partId)?.name ??
      run.stages.flatMap(stage => stage.thoughts).find(thought => thought.partId === bid.partId)?.name ?? 'Historical contributor';
    const expressions = events.flatMap(event => event.type === 'self.arbitration_started' ? event.payload.contributions
      .filter(contribution => contribution.bid?.id === bid.id).map(contribution => ({ eventId: event.id, contribution })) : []);
    const decisions = events.flatMap(event => event.type === 'self.choice' && (event.payload.choice === bid.id || event.payload.selectedBidIds?.includes(bid.id)
      || event.payload.scores?.some(score => score.partId === bid.id)) ? [{ eventId: event.id, at: event.at, choice: event.payload,
        selected: (event.payload.selectedBidIds ?? [event.payload.choice]).includes(bid.id),
        scores: event.payload.scores?.filter(score => score.partId === bid.id) ?? [] }] : []);
    const selectedContracts = contracts.filter(entry => entry.contract.commands.some(command => command.bidId === bid.id));
    const contractIds = new Set(selectedContracts.map(entry => entry.contract.id));
    const executions = events.flatMap(event => event.type === 'execution.status' && event.payload.contractId && contractIds.has(event.payload.contractId)
      ? [{ eventId: event.id, at: event.at, execution: event.payload }] : []);
    const tools = events.flatMap(event => event.type === 'execution.tool_trace' && contractIds.has(event.payload.contractId)
      ? [{ eventId: event.id, at: event.at, ...event.payload }] : []);
    const withdrawals = events.flatMap(event => event.type === 'part.bid_withdrawn' && event.payload.bidId === bid.id ? [{ eventId: event.id, ...event.payload }] : []);
    const finalExecutions = [...new Map(executions.map(item => [item.execution.id, item])).values()];
    return { bid, name, eventIds, expressions, decisions, contracts: selectedContracts, executions, finalExecutions, tools, withdrawals,
      replacementOf: bid.replacesBidId ?? null,
      knowledge: selectedContracts.flatMap(entry => entry.contract.selectedSkill ? [{ eventId: entry.eventId, contractId: entry.contract.id,
        method: entry.contract.selectedSkill }] : []),
      status: finalExecutions.some(item => item.execution.operational?.verified === true) ? 'verified operation recorded' : finalExecutions.some(item => item.execution.status === 'completed')
        ? 'completed execution recorded' : selectedContracts.length ? 'contract authority recorded' : decisions.some(item => item.selected) ? 'choice recorded; no captured contract' : 'not recorded as selected',
      gaps: [...(!eventIds.length ? ['Original bid creation event unavailable; bid is preserved in an arbitration input.'] : []),
        ...(!expressions.length ? ['Self visibility context unavailable.'] : []),
        ...(!decisions.length ? ['No linked Self scoring/selection record. Absence does not establish rejection.'] : []),
        ...(!selectedContracts.length ? ['No captured contract authority; a proposal or recorded choice does not establish execution.'] : []),
        ...(selectedContracts.length && !executions.length ? ['No captured execution status for this contract.'] : [])] };
  });
  const predictions = [...new Map(run.stages.flatMap(stage => stage.predictions).map(prediction => [prediction.id, prediction])).values()].map(prediction => ({
    prediction, origin: prediction.cognitionOrigin ? events.find(event => event.id === prediction.cognitionOrigin!.thoughtEventId) ?? null : null,
    checks: events.filter(event => event.type === 'prediction.outcome_checked' && event.payload.predictionId === prediction.id),
    interpretations: events.filter(event => event.type === 'prediction.evaluation' && event.payload.prediction.id === prediction.id),
    memory: prediction.memoryId ? run.stages.flatMap(stage => stage.memories).find(memory => memory.id === prediction.memoryId) ?? null : null,
    memoryEvents: events.filter(event => event.type === 'memory.episodic_created' && event.payload.id === prediction.memoryId),
    contracts: contracts.filter(entry => entry.contract.predictionReferences.some(reference => reference.id === prediction.id)),
    gaps: [...(!prediction.cognitionOrigin ? ['Cognition-origin event reference was not recorded.'] : []),
      ...(prediction.cognitionOrigin && !events.some(event => event.id === prediction.cognitionOrigin!.thoughtEventId) ? ['Origin event lies outside captured run evidence.'] : []),
      ...(prediction.memoryId && !run.stages.some(stage => stage.memories.some(memory => memory.id === prediction.memoryId)) ? ['Linked memory snapshot unavailable.'] : [])] }));
  return { bids: trails, predictions, limitations: ['Explicit IDs establish recorded provenance, not psychological causation.',
    'Visibility episodes and score rounds remain distinct; chronological proximity does not assign a selection to a particular inference input.',
    'Contract authority, completed status, operational verification and whole-goal success are separate.'] };
}
