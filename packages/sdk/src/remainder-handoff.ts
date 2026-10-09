import { isDeepStrictEqual } from 'node:util';
import type { ActionBid } from '../../core/src/domain.js';
import type { Store } from '../../core/src/contracts.js';
import type { Inspection } from '../../core/src/inspection.js';
import { ExecutionContractSchema, type ExecutionContract } from '../../core/src/execution-contract.js';
import { consumeSelectedRemainder } from '../../core/src/remainder-consumption.js';
import { recordRemainderReady } from '../../core/src/remainder-handoff.js';

export type RemainderHandoffResult = { ready: true; consumed: true }
  | { ready: false; consumed: boolean | null; reason: string };

/** External control only. Readiness never means whole-goal completion or dispatch. */
export class SelectedRemainderHandoff {
  constructor(private readonly store: Store, private readonly inspection: Inspection, private readonly workers: {
    owns(agentId: string, executionId: string): boolean;
    atCheckpoint(agentId: string, executionId: string, completedSteps: number): boolean;
    cancel(agentId: string, executionId: string): void;
    wait(agentId: string, executionId: string): Promise<void>;
  }) {}
  async handoff(input: { contract: ExecutionContract; bid: ActionBid }): Promise<RemainderHandoffResult> {
    const contract = ExecutionContractSchema.parse(input.contract);
    let stage: 'consume' | 'cancel' | 'wait' | 'ready' = 'consume';
    try {
      consumeSelectedRemainder(this.store, this.inspection, { contract, bid: input.bid }, this.workers);
      const parent = contract.remainder!.parentExecutionId;
      stage = 'cancel'; this.workers.cancel(contract.agentId, parent);
      stage = 'wait';
      const recorded = this.store.eventsByType(contract.agentId, ['execution.contract'], [contract.cycleId])
        .find(event => event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
      if (!recorded) throw new Error('Selected remainder deadline origin is unavailable');
      const deadline = Math.min(contract.remainder!.deadlineAt, Date.parse(recorded.at) + contract.limits.maxDurationMs);
      await waitForSettlement(this.workers.wait(contract.agentId, parent), deadline);
      stage = 'ready';
      recordRemainderReady(this.store, this.inspection, contract, (agentId, executionId) => this.workers.owns(agentId, executionId));
      return { ready: true, consumed: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      let consumed: boolean | null = null;
      try {
        consumed = this.store.eventsByType(contract.agentId, ['execution.remainder_claim']).some(event =>
          event.type === 'execution.remainder_claim' && event.payload.contractId === contract.id);
        this.inspection.emit(contract.agentId, contract.cycleId, 'execution.remainder_handoff_failed', { contractId: contract.id, stage, consumed, reason });
      } catch { /* Failed audit/reporting must not fabricate absence of a committed claim. */ }
      return { ready: false, consumed, reason };
    }
  }
}

async function waitForSettlement(settlement: Promise<void>, deadline: number): Promise<void> {
  const remaining = deadline - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) {
    void settlement.catch(() => {});
    throw new Error('Remainder handoff deadline expired before confirmed worker settlement');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([settlement, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Remainder handoff deadline expired before confirmed worker settlement')), remaining);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
