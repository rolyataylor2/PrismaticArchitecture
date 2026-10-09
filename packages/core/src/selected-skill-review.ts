import { isDeepStrictEqual } from 'node:util';
import type { Store } from './contracts.js';
import type { ExecutionContract } from './execution-contract.js';
import type { Execution } from './domain.js';

/** Verify attribution without giving Self access to registry or audit state. */
export function selectedSkillReview(store: Store, contract: ExecutionContract) {
  const command = contract.commands[0];
  const review = command?.action.kind === 'operate' ? command.action.operation.skillReview : undefined;
  const cycle = store.cycle(contract.cycleId);
  const recorded = store.eventsByType(contract.agentId, ['execution.contract'], [contract.cycleId])
    .some(event => event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
  const expressed = store.eventsByType(contract.agentId, ['part.bid_created', 'execution.handoff'], [contract.cycleId])
    .some(event => {
      const bid = event.type === 'part.bid_created' ? event.payload : event.type === 'execution.handoff' ? event.payload.bid : null;
      return !!bid && !!command && bid.id === command.bidId && bid.partId === command.partId && isDeepStrictEqual(bid.action, command.action);
    });
  if (!review || !recorded || !expressed || cycle.agentId !== contract.agentId
    || (cycle.threadId ?? null) !== contract.threadId || !cycle.selectedBidIds?.includes(command!.bidId))
    throw new Error('Procedure review requires the recorded Self-selected instruction');
  return review;
}

export function verifyProcedureReviewReport(store: Store, execution: Execution): void {
  if (execution.action.kind !== 'operate' || !execution.action.operation.skillReview) return;
  const operational = execution.operational;
  if (!operational || operational.attempts !== 0 || operational.traceRefs.length)
    throw new Error('Procedure review cannot submit tools');
  const toolEvents = store.eventsByType(execution.agentId, ['execution.tool_trace'], [execution.cycleId]);
  if (toolEvents.some(event => event.type === 'execution.tool_trace' && event.payload.contractId === execution.contractId))
    throw new Error('Procedure review cannot contain tool ledger entries');
  if (execution.status === 'blocked' && !operational.verified) return;
  const event = store.eventsByType(execution.agentId, ['execution.contract'], [execution.cycleId])
    .find(item => item.type === 'execution.contract' && item.payload.id === execution.contractId);
  if (event?.type !== 'execution.contract') throw new Error('Procedure review completion requires its selected contract');
  const contract = event.payload;
  const review = selectedSkillReview(store, contract);
  const receipts = store.eventsByType(execution.agentId, ['execution.procedure_review'], [execution.cycleId])
    .filter(item => item.type === 'execution.procedure_review' && item.payload.contractId === contract.id);
  const receipt = receipts[0]?.type === 'execution.procedure_review' ? receipts[0].payload : undefined;
  const version = receipt && store.executiveSkillHistory(execution.agentId, review.skillId).find(item => item.version === receipt.resultVersion);
  if (execution.status !== 'completed' || !operational.verified || !isDeepStrictEqual(execution.action, contract.commands[0]!.action)
    || receipts.length !== 1 || !receipt || receipt.skillId !== review.skillId || receipt.sourceVersion !== review.version
    || receipt.resultVersion !== review.version + 1 || receipt.decision !== review.decision || receipt.reason !== review.reason
    || !/^[a-f0-9]{64}$/.test(receipt.packageDigest) || version?.change.reviewContractId !== contract.id
    || version.change.kind !== review.decision || version.change.reason !== review.reason
    || version.status !== (review.decision === 'approval' ? 'active' : 'rejected'))
    throw new Error('Procedure review completion requires its durable selected decision and version');
}
