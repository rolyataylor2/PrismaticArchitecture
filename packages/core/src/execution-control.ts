import type { Store } from './contracts.js';
import type { Execution } from './domain.js';

/** Report integrity independent of an adapter's completion assertion. */
export function verifySelectedPauseReport(store: Store, execution: Execution): void {
  const action = execution.action;
  if (action.kind !== 'operate' || !action.operation.intervention) return;
  const cycle = store.cycle(execution.cycleId);
  const event = store.eventsByType(execution.agentId, ['execution.contract'], [cycle.id]).find(event =>
    event.type === 'execution.contract' && event.payload.id === execution.contractId);
  if (!event || event.type !== 'execution.contract' || cycle.status === 'failed' || cycle.agentId !== execution.agentId
    || event.payload.commands.length !== 1 || !cycle.selectedBidIds?.includes(event.payload.commands[0]!.bidId)
    || JSON.stringify(event.payload.commands[0]!.action) !== JSON.stringify(action)
    || event.payload.authority.capabilities[0] !== 'execution_control'
    || execution.operational?.attempts !== 0 || execution.operational.traceRefs.length || execution.guidance)
    throw new Error('Pause reports require selected execution-control authority without tools or guidance');
  if (execution.status !== 'completed') return;
  const receipt = store.eventsByType(execution.agentId, ['execution.intervention'], [cycle.id]).find(event =>
    event.type === 'execution.intervention' && event.payload.state === 'stopped' && event.payload.executionId === execution.id
    && event.payload.contractId === execution.contractId && event.payload.targetExecutionId === action.operation.intervention!.executionId);
  if (!receipt || receipt.type !== 'execution.intervention') throw new Error('Pause completion requires independently recorded host confirmation');
  const target = store.executions(execution.agentId).find(item => item.id === receipt.payload.targetExecutionId);
  if (!target || target.contractId !== receipt.payload.targetContractId || target.status === 'running' || target.status === 'pending')
    throw new Error('Pause completion cannot invent a stopped target');
}
