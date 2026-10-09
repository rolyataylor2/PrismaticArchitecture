import { isDeepStrictEqual } from 'node:util';
import { now } from './domain.js';
import type { Store } from './contracts.js';
import type { Inspection } from './inspection.js';
import { ExecutionContractSchema, type ExecutionContract } from './execution-contract.js';
import { executionProcedure } from './skill-invocation.js';

/** Independent handoff evidence; no psychological judgment or restart dispatch. */
export function verifyRemainderHandoff(store: Store, contract: ExecutionContract, stopped = false): void {
  const authority = contract.remainder;
  if (!authority) return;
  const events = store.eventsByType(contract.agentId, ['execution.contract', 'execution.remainder_claim', 'execution.remainder_ready', 'execution.tool_trace']);
  const recorded = events.find(event => event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
  const claim = events.filter(event => event.type === 'execution.remainder_claim' && event.payload.contractId === contract.id);
  const ready = events.filter(event => event.type === 'execution.remainder_ready' && event.payload.contractId === contract.id);
  const parent = store.executions(contract.agentId).find(item => item.id === authority.parentExecutionId);
  const original = events.find(event => event.type === 'execution.contract' && event.payload.id === authority.parentContractId);
  if (!recorded || claim.length !== 1 || claim[0]!.type !== 'execution.remainder_claim' || !isDeepStrictEqual(claim[0]!.payload.authority, authority)
    || ready.length !== 1 || ready[0]!.type !== 'execution.remainder_ready' || ready[0]!.payload.parentExecutionId !== authority.parentExecutionId
    || ready[0]!.cycleId !== contract.cycleId || claim[0]!.cycleId !== contract.cycleId
    || ready[0]!.sequence <= claim[0]!.sequence || !parent || parent.contractId !== authority.parentContractId
    || parent.status !== (stopped ? 'blocked' : 'continued') || (!stopped && parent.continuedByContractId !== contract.id)
    || parent.operational?.verified || parent.operational?.attempts !== authority.completedSteps
    || !isDeepStrictEqual(parent.operational.traceRefs, authority.completedTraceRefs)
    || !original || original.type !== 'execution.contract' || original.payload.cycleId !== parent.cycleId
    || !isDeepStrictEqual(original.payload.commands[0]?.action, parent.action))
    throw new Error('Remainder requires a ready successor handoff with preserved stopped parent');
  const sourceCycle = store.cycle(parent.cycleId); const cycle = store.cycle(contract.cycleId);
  if (sourceCycle.agentId !== contract.agentId || cycle.agentId !== contract.agentId || sourceCycle.status === 'failed' || cycle.status === 'failed'
    || sourceCycle.sequence >= cycle.sequence || (sourceCycle.threadId ?? null) !== contract.threadId || (cycle.threadId ?? null) !== contract.threadId
    || contract.commands.some(command => !cycle.selectedBidIds?.includes(command.bidId))
    || original.payload.commands.some(command => !sourceCycle.selectedBidIds?.includes(command.bidId)))
    throw new Error('Remainder handoff must preserve selected same-Agent thread lineage');
  const procedure = executionProcedure(original.payload)!;
  const action = contract.commands[0]!.action;
  if (parent.action.kind !== 'operate' || action.kind !== 'operate' || action.text !== parent.action.text
    || action.operation.successCriteria !== procedure.successCriteria || [...procedure.constraints, ...parent.action.operation.constraints].some(value => !action.operation.constraints.includes(value)))
    throw new Error('Remainder handoff cannot change the selected goal, criterion or constraints');
  const ledger = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === authority.parentContractId);
  const submitted = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
  const reservations = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorized');
  const settled = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorization_finished');
  if (submitted.length !== authority.completedSteps || (reservations.length && (reservations.length !== submitted.length || settled.length !== reservations.length)))
    throw new Error('Stopped remainder parent has additional or pending submissions');
  let previousCompletion = original.sequence;
  if (reservations.some(reservation => reservation.type === 'execution.tool_trace' && settled.filter(event =>
    event.type === 'execution.tool_trace' && event.payload.traceId === reservation.payload.traceId && event.sequence > reservation.sequence && event.sequence < claim[0]!.sequence).length !== 1))
    throw new Error('Stopped remainder parent reservations lack matching settlement');
  submitted.forEach((event, index) => {
    if (event.type !== 'execution.tool_trace') throw new Error('Invalid stopped prefix');
    const step = procedure.steps[index];
    const responses = ledger.filter(item => item.type === 'execution.tool_trace' && item.payload.traceId === event.payload.traceId && item.payload.phase === 'finished');
    const response = responses[0];
    if (!step || event.payload.traceId !== authority.completedTraceRefs[index] || event.payload.serverId !== step.serverId || event.payload.toolName !== step.toolName
      || !isDeepStrictEqual(event.payload.arguments, JSON.parse(step.argumentsJson)) || responses.length !== 1 || !response || response.type !== 'execution.tool_trace'
      || event.sequence <= previousCompletion || response.payload.serverId !== step.serverId || response.payload.toolName !== step.toolName
      || response.payload.outcome?.status !== 'succeeded' || response.sequence <= event.sequence || response.sequence >= claim[0]!.sequence)
      throw new Error('Stopped remainder prefix must match independently settled selected operations');
    previousCompletion = response.sequence;
  });
  const currentLimits = store.executiveProfile(contract.agentId).limits;
  if (Object.entries(contract.limits).some(([key, value]) => value > currentLimits[key as keyof typeof contract.limits]))
    throw new Error('Remainder handoff exceeds current framework limits');
  if (authority.limits.maxSteps > original.payload.limits.maxSteps - authority.completedSteps
    || Object.entries(contract.limits).some(([key, value]) => value > authority.limits[key as keyof typeof contract.limits])
    || authority.deadlineAt > Math.min(Date.parse(original.at) + original.payload.limits.maxDurationMs, original.payload.remainder?.deadlineAt ?? Infinity))
    throw new Error('Remainder handoff cannot renew the original budget');
}

/** Caller has confirmed local worker cessation before requesting this transaction. */
export function recordRemainderReady(store: Store, inspection: Inspection, input: ExecutionContract,
  owns: (agentId: string, executionId: string) => boolean): void {
  const contract = ExecutionContractSchema.parse(input);
  inspection.atomic(() => {
    if (!contract.remainder || owns(contract.agentId, contract.remainder.parentExecutionId)) throw new Error('Remainder parent worker has not stopped');
    if (store.cycle(contract.cycleId).status !== 'running' || Date.now() >= contract.remainder.deadlineAt)
      throw new Error('Remainder ready handoff requires a current unexpired selected cycle');
    if (store.eventsByType(contract.agentId, ['execution.remainder_ready']).some(event => event.type === 'execution.remainder_ready' && event.payload.contractId === contract.id))
      throw new Error('Remainder ready handoff was already recorded');
    inspection.emit(contract.agentId, contract.cycleId, 'execution.remainder_ready', { contractId: contract.id, parentExecutionId: contract.remainder.parentExecutionId });
    verifyRemainderHandoff(store, contract, true);
    const parent = store.executions(contract.agentId).find(item => item.id === contract.remainder!.parentExecutionId)!;
    const continued = { ...parent, status: 'continued' as const, continuedByContractId: contract.id,
      operational: { ...parent.operational!, reason: 'A selected remainder continues after the recorded stopped prefix; the whole goal has not been verified.' },
      facts: [...parent.facts, { source: 'External execution', kind: 'observes' as const, timestamp: now(), originCycleId: contract.cycleId,
        referenceId: parent.id, text: `The stopped prefix continues under selected remainder contract ${contract.id}. Earlier effects remain; the whole goal is not yet verified.` }] };
    store.saveExecution(continued); inspection.emit(parent.agentId, parent.cycleId, 'execution.status', continued);
  });
}
