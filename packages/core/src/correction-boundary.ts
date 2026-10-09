import { isDeepStrictEqual } from 'node:util';
import type { Store } from './contracts.js';
import { executionProcedure } from './skill-invocation.js';

/** Evidence check only. A caller must still select, consume and suspend a correction atomically. */
export function verifyCorrectionBoundary(store: Store, input: {
  agentId: string; threadId: string | null; executionId: string; boundaryId?: string; checkpointTraceId?: string;
}, owns: (agentId: string, executionId: string) => boolean,
held?: (agentId: string, executionId: string, completedSteps: number) => boolean) {
  if (Boolean(input.boundaryId) === Boolean(input.checkpointTraceId)) throw new Error('Correction must name exactly one boundary or checkpoint reference');
  const execution = store.executions(input.agentId).find(item => item.id === input.executionId);
  if (!execution || execution.agentId !== input.agentId || execution.status !== 'running' || !execution.contractId || !owns(input.agentId, execution.id))
    throw new Error('Correction boundary requires a live locally owned running execution');
  if (store.eventsByType(input.agentId, ['execution.remainder_claim']).some(event => event.type === 'execution.remainder_claim'
    && event.payload.authority.parentExecutionId === execution.id)) throw new Error('Correction boundary has already been consumed');
  const cycle = store.cycle(execution.cycleId);
  if (cycle.agentId !== input.agentId || cycle.status === 'failed' || (cycle.threadId ?? null) !== input.threadId)
    throw new Error('Correction boundary is outside the selected thread');
  const events = store.eventsByType(input.agentId, ['execution.contract', 'execution.checkpoint_boundary', 'execution.tool_trace'], [cycle.id]);
  const contract = events.find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
  const boundary = events.filter(event => event.type === 'execution.checkpoint_boundary' && event.payload.executionId === execution.id).at(-1);
  if (!contract || contract.type !== 'execution.contract' || contract.payload.commands.length !== 1
    || contract.payload.agentId !== input.agentId || contract.payload.cycleId !== cycle.id || contract.payload.threadId !== input.threadId
    || !cycle.selectedBidIds?.includes(contract.payload.commands[0]!.bidId)
    || !isDeepStrictEqual(contract.payload.commands[0]!.action, execution.action)
    || !boundary || boundary.type !== 'execution.checkpoint_boundary'
    || boundary.agentId !== input.agentId || boundary.cycleId !== cycle.id
    || (input.boundaryId ? boundary.id !== input.boundaryId : boundary.payload.traceRefs.at(-1) !== input.checkpointTraceId)
    || boundary.payload.contractId !== contract.payload.id) throw new Error('Correction boundary is missing or superseded');
  const startedAt = Date.parse(contract.at);
  const checkedAt = Date.now(); const deadlineAt = Math.min(startedAt + contract.payload.limits.maxDurationMs, contract.payload.remainder?.deadlineAt ?? Infinity);
  if (!Number.isFinite(startedAt) || checkedAt >= deadlineAt)
    throw new Error('Correction cannot renew an expired execution duration budget');
  const operation = executionProcedure(contract.payload);
  const count = boundary.payload.completedSteps;
  const submitted = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.payload.id && event.payload.phase === 'submitted');
  if (!operation || count < 1 || !Number.isInteger(count) || count > operation.steps.length || count >= contract.payload.limits.maxSteps || submitted.length !== count
    || boundary.payload.traceRefs.length !== count || new Set(boundary.payload.traceRefs).size !== count)
    throw new Error('Execution advanced beyond the requested correction boundary');
  if (held && !held(input.agentId, execution.id, count)) throw new Error('Correction requires the exact live suspended checkpoint');
  const reservations = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.payload.id && event.payload.phase === 'authorized');
  const settledReservations = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.payload.id && event.payload.phase === 'authorization_finished');
  if (reservations.length && (reservations.length !== count || settledReservations.length !== count
    || reservations.some(reservation => reservation.type === 'execution.tool_trace' && settledReservations.filter(event =>
      event.type === 'execution.tool_trace' && event.payload.traceId === reservation.payload.traceId && event.sequence > reservation.sequence && event.sequence < boundary.sequence).length !== 1)))
    throw new Error('Correction boundary has pending or additional tool authorization');
  let previousCompletion = contract.sequence;
  submitted.forEach((event, index) => {
    if (event.type !== 'execution.tool_trace') throw new Error('Invalid boundary trace');
    const step = operation.steps[index]!;
    const responses = events.filter(item => item.type === 'execution.tool_trace' && item.payload.contractId === contract.payload.id
      && item.payload.traceId === event.payload.traceId && item.payload.phase === 'finished');
    const response = responses[0];
    if (event.agentId !== input.agentId || event.cycleId !== cycle.id || event.sequence <= previousCompletion
      || event.payload.traceId !== boundary.payload.traceRefs[index] || event.payload.serverId !== step.serverId || event.payload.toolName !== step.toolName
      || !isDeepStrictEqual(event.payload.arguments, JSON.parse(step.argumentsJson)) || responses.length !== 1
      || !response || response.type !== 'execution.tool_trace' || response.sequence <= event.sequence || response.sequence >= boundary.sequence
      || response.payload.serverId !== step.serverId || response.payload.toolName !== step.toolName
      || response.agentId !== input.agentId || response.cycleId !== cycle.id
      || response.payload.outcome?.status !== 'succeeded') throw new Error('Correction prefix lacks matching settled successful operations');
    previousCompletion = response.sequence;
  });
  return { contract: contract.payload, boundary: boundary.payload, remainingSteps: contract.payload.limits.maxSteps - count,
    deadlineAt, remainingDurationMs: deadlineAt - checkedAt };
}
