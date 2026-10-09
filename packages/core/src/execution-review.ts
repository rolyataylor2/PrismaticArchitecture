import { z } from 'zod';
import { freeze } from './domain.js';
import type { Store } from './contracts.js';

/** Previously expressed selected intention, never a raw audit or operational observation. */
export const SelectedActivitySchema = z.strictObject({
  executionId: z.string().min(1).max(200), goal: z.string().min(1).max(16000),
  successCriteria: z.string().min(1).max(16000), constraints: z.string().min(1).max(16000).array().max(30),
});
export type SelectedActivity = z.infer<typeof SelectedActivitySchema>;
export function selectedActivity(store: Store, agentId: string, executionId: string, threadId: string | null): SelectedActivity | null {
  const execution = store.executions(agentId).find(item => item.id === executionId);
  if (!execution || execution.status !== 'running' || execution.action.kind !== 'operate' || !execution.contractId) return null;
  const cycle = store.cycle(execution.cycleId);
  if (cycle.status === 'failed' || cycle.agentId !== agentId || (cycle.threadId ?? null) !== threadId) return null;
  const event = store.eventsByType(agentId, ['execution.contract'], [cycle.id]).find(event => event.type === 'execution.contract'
    && event.payload.id === execution.contractId && event.payload.commands.every(command => cycle.selectedBidIds?.includes(command.bidId)));
  if (!event || event.type !== 'execution.contract') return null;
  const command = event.payload.commands[0]?.action;
  if (command?.kind !== 'operate') return null;
  return freeze(SelectedActivitySchema.parse({ executionId, goal: command.text, successCriteria: command.operation.successCriteria,
    constraints: command.operation.constraints }));
}
