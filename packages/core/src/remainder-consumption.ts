import { isDeepStrictEqual } from 'node:util';
import type { ActionBid } from './domain.js';
import type { Store } from './contracts.js';
import type { Inspection } from './inspection.js';
import { ExecutionContractSchema, type ExecutionContract } from './execution-contract.js';
import { prepareRemainderInstruction } from './remainder-instruction.js';
import { RemainderAuthoritySchema } from './remainder-authority.js';

/** Claim only. No worker cessation or successor tool authority is implied. */
export function consumeSelectedRemainder(store: Store, inspection: Inspection, input: {
  contract: ExecutionContract; bid: ActionBid;
}, worker: Parameters<typeof prepareRemainderInstruction>[2]): void {
  inspection.atomic(() => {
    const contract = ExecutionContractSchema.parse(input.contract);
    const authority = contract.remainder;
    if (!authority || contract.remainderRejection) throw new Error('Only accepted selected remainder authority can consume a checkpoint');
    const recorded = store.eventsByType(contract.agentId, ['execution.contract'], [contract.cycleId])
      .find(event => event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
    const command = contract.commands[0]!;
    if (!recorded || contract.commands.length !== 1 || command.bidId !== input.bid.id || command.partId !== input.bid.partId
      || !isDeepStrictEqual(command.action, input.bid.action) || command.argument !== input.bid.argument
      || !isDeepStrictEqual(command.executionOrder, input.bid.executionOrder))
      throw new Error('Remainder consumption requires its exact recorded selected contract and bid');
    if (!Number.isFinite(Date.parse(recorded.at)) || Date.now() >= Math.min(Date.parse(recorded.at) + contract.limits.maxDurationMs, authority.deadlineAt))
      throw new Error('Selected remainder consumption duration budget expired');
    const previous = store.eventsByType(contract.agentId, ['execution.remainder_claim']);
    if (previous.some(event => event.type === 'execution.remainder_claim' && (event.payload.contractId === contract.id
      || event.payload.authority.parentExecutionId === authority.parentExecutionId)))
      throw new Error('Remainder checkpoint or selected contract was already consumed');
    const prepared = prepareRemainderInstruction(store, { agentId: contract.agentId, cycleId: contract.cycleId,
      threadId: contract.threadId, bid: input.bid, executionId: authority.parentExecutionId,
      checkpointTraceId: authority.checkpointTraceId }, worker);
    const canonical = RemainderAuthoritySchema.parse({ parentExecutionId: prepared.parentExecutionId,
      parentContractId: prepared.parentContractId, checkpointTraceId: prepared.checkpointTraceId,
      completedSteps: prepared.completedSteps, completedTraceRefs: prepared.completedTraceRefs,
      deadlineAt: prepared.deadlineAt, limits: prepared.limits });
    const { limits: _oldLimits, ...captured } = authority;
    const { limits: _newLimits, ...current } = canonical;
    // Elapsed review time changes remaining duration, never the absolute deadline.
    if (!isDeepStrictEqual(captured, current) || Object.entries(contract.limits).some(([key, value]) =>
      value > authority.limits[key as keyof typeof contract.limits]
      || (key !== 'maxDurationMs' && value > canonical.limits[key as keyof typeof contract.limits]))
      || contract.limits.maxDurationMs > store.executiveProfile(contract.agentId).limits.maxDurationMs)
      throw new Error('Remainder authority changed since preparation or exceeds current limits');
    inspection.emit(contract.agentId, contract.cycleId, 'execution.remainder_claim', { contractId: contract.id, authority });
  });
}
