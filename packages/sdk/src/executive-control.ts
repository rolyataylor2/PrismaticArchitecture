import { isDeepStrictEqual } from 'node:util';
import { id, now, type Execution } from '../../core/src/domain.js';
import type { Executor, Store } from '../../core/src/contracts.js';
import type { Inspection } from '../../core/src/inspection.js';
import { ExecutionContractSchema } from '../../core/src/execution-contract.js';

/** Explicit selected control, with no goal selection or replay authority. */
export class SelectedExecutionControl {
  constructor(private readonly store: Store, private readonly inspection: Inspection, private readonly workers: {
    owns(agentId: string, executionId: string): boolean;
    cancel(agentId: string, executionId: string): void; wait(agentId: string, executionId: string): Promise<void>;
  }) {}
  async pause(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    const contract = ExecutionContractSchema.parse(input.contract); const action = input.bid.action;
    if (action.kind !== 'operate' || !action.operation.intervention) throw new Error('Expected selected pause directive');
    const executionId = id('execution');
    const result = (status: Execution['status'], reason: string, verified = false): Execution => ({
      id: executionId, agentId: input.agentId, cycleId: input.cycleId, action, contractId: contract.id, status,
      operational: { attempts: 0, verified, reason, traceRefs: [] }, facts: [{ source: 'External execution', kind: 'observes',
        timestamp: now(), originCycleId: input.cycleId, referenceId: executionId, text: `Selected pause: ${status}. ${reason}` }],
    });
    let target: Execution;
    try {
      target = this.inspection.atomic(() => {
        const cycle = this.store.cycle(contract.cycleId);
        const recorded = this.store.eventsByType(input.agentId, ['execution.contract'], [cycle.id]).find(event =>
          event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
        if (!recorded || contract.agentId !== input.agentId || contract.cycleId !== input.cycleId || cycle.status !== 'running'
          || cycle.agentId !== input.agentId || contract.commands.length !== 1 || contract.commands[0]!.bidId !== input.bid.id
          || !cycle.selectedBidIds?.includes(input.bid.id) || !isDeepStrictEqual(contract.commands[0]!.action, action)
          || contract.authority.capabilities[0] !== 'execution_control') throw new Error('Pause requires a recorded current Self-selected contract');
        if (Date.now() >= Date.parse(recorded.at) + contract.limits.maxDurationMs) throw new Error('Pause directive duration budget expired');
        if (this.store.eventsByType(input.agentId, ['execution.intervention'], [cycle.id]).some(event =>
          event.type === 'execution.intervention' && event.payload.contractId === contract.id)) throw new Error('Pause directive was already consumed');
        const target = this.store.executions(input.agentId).find(item => item.id === action.operation.intervention!.executionId);
        if (!target?.contractId || target.action.kind !== 'operate' || target.status !== 'running') throw new Error('Pause target is not a running operational execution owned by this Agent');
        const origin = this.store.cycle(target.cycleId);
        const original = this.store.eventsByType(input.agentId, ['execution.contract'], [origin.id]).find(event =>
          event.type === 'execution.contract' && event.payload.id === target.contractId);
        if (origin.agentId !== input.agentId || origin.status === 'failed' || origin.sequence >= cycle.sequence
          || (origin.threadId ?? null) !== contract.threadId || !original || original.type !== 'execution.contract'
          || original.payload.commands.some(command => !origin.selectedBidIds?.includes(command.bidId))) throw new Error('Pause target must be an earlier selected activity in this thread');
        if (!this.workers.owns(input.agentId, target.id)) throw new Error('No active local worker owns the pause target');
        this.inspection.emit(input.agentId, cycle.id, 'execution.intervention', { contractId: contract.id, executionId,
          targetExecutionId: target.id, targetContractId: target.contractId, state: 'requested' });
        return target;
      });
    } catch (error) { return result('blocked', error instanceof Error ? error.message : String(error)); }
    // Authority consumption commits before the external control effect; receipt failures cannot masquerade as no operation.
    try { this.workers.cancel(input.agentId, target.id); }
    catch { return result('blocked', 'The pause was consumed, but the local target ended before control could be applied.'); }
    try { await this.workers.wait(input.agentId, target.id); }
    catch { return result('unverified', 'Local interruption was requested, but its outcome could not be independently recorded. Earlier effects are not reversed.'); }
    const stopped = this.store.executions(input.agentId).find(item => item.id === target.id);
    if (!stopped || stopped.status === 'running' || stopped.status === 'pending') return result('unverified', 'Local interruption lacks a recorded stopped target.');
    this.inspection.emit(input.agentId, input.cycleId, 'execution.intervention', { contractId: contract.id, executionId,
      targetExecutionId: target.id, targetContractId: target.contractId!, state: 'stopped', parentStatus: stopped.status });
    const attention = this.store.eventsByType(input.agentId, ['execution.attention'], [input.cycleId]).find(event =>
      event.type === 'execution.attention' && event.payload.executionId === target.id);
    if (attention?.type === 'execution.attention') this.inspection.emit(input.agentId, input.cycleId, 'execution.attention', {
      ...attention.payload, state: 'intervention', at: now(), reasons: [...attention.payload.reasons,
        'Self selected an explicit pause and the host confirmed local work has stopped. Earlier external effects remain.'],
    });
    return result('completed', `The local worker has stopped; the original activity reports ${stopped.status}. Earlier effects are not reversed; this confirms no success of the original goal.`, true);
  }
}
