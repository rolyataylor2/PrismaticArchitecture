import { z } from 'zod';
import type { Store } from './contracts.js';
import type { ActionBid } from './domain.js';

/** Mediated selected intent and reported operational status; no world, tools, private state or audit lookup is exposed. */
export const SelectedCommitmentSchema = z.strictObject({
  id: z.string(), cycleId: z.string(), threadId: z.string().nullable(), selectedAt: z.string(),
  proposals: z.array(z.strictObject({ bidId: z.string(), partId: z.string(), kind: z.string(), text: z.string(), argument: z.string(),
    executionOrder: z.array(z.string()), validWhile: z.array(z.string()), constraints: z.array(z.string()), successCriteria: z.string().nullable() })),
  status: z.enum(['selected', 'running', 'completed', 'blocked', 'failed', 'unverified', 'continued', 'needs_guidance', 'pending']),
});
export type SelectedCommitment = z.infer<typeof SelectedCommitmentSchema>;

export function commitmentProposals(bids: ActionBid[]): SelectedCommitment['proposals'] {
  return bids.map(bid => ({ bidId: bid.id, partId: bid.partId, kind: bid.action.kind, text: bid.action.text,
    argument: bid.argument, executionOrder: [...bid.executionOrder], validWhile: [...(bid.validWhile ?? [])],
    constraints: bid.action.kind === 'act' ? [...bid.action.constraints] : bid.action.kind === 'operate' ? [...bid.action.operation.constraints] : [],
    successCriteria: bid.action.kind === 'act' ? bid.action.successCriteria : bid.action.kind === 'operate' ? bid.action.operation.successCriteria : null }));
}

export function recentCommitments(store: Store, agentId: string, threadId: string | null, limit = 12): SelectedCommitment[] {
  const chosen = store.eventsByType(agentId, ['self.commitment']).flatMap(event => event.type === 'self.commitment'
    && event.payload.threadId === threadId ? [event.payload] : []).slice(-limit);
  if (!store.executiveProfile(agentId).enabled) return chosen;
  const contracts = store.eventsByType(agentId, ['execution.contract']);
  return chosen.map(record => {
    const ids = new Set(record.proposals.map(proposal => proposal.bidId));
    const relevantContracts = new Set(contracts.flatMap(event => event.type === 'execution.contract'
      && event.payload.commands.some(command => ids.has(command.bidId)) ? [event.payload.id] : []));
    const reports = store.executions(agentId).filter(execution => execution.contractId && relevantContracts.has(execution.contractId));
    const rejected = store.eventsByType(agentId, ['execution.bid_rejected']).some(event => event.type === 'execution.bid_rejected'
      && event.payload.bidIds.some(bidId => ids.has(bidId)));
    const status = reports.some(report => report.status === 'running') ? 'running'
      : reports.some(report => report.status === 'unverified') ? 'unverified'
        : reports.some(report => report.status === 'failed') ? 'failed'
          : reports.some(report => report.status === 'blocked') || rejected ? 'blocked'
            : reports.length && reports.every(report => report.status === 'completed') ? 'completed'
              : reports.at(-1)?.status ?? record.status;
    return { ...record, status };
  });
}
