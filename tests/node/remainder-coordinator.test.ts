import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SelectedRemainderHandoff } from '../../packages/sdk/src/remainder-handoff.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';
import { prepareRemainderInstruction } from '../../packages/core/src/remainder-instruction.js';
import { RemainderAuthoritySchema } from '../../packages/core/src/remainder-authority.js';
import type { ActionBid } from '../../packages/core/src/domain.js';

function fixture(mode: 'success' | 'consume_failure' | 'cancel_failure' | 'settlement_failure' | 'unexpected_effect' | 'deadline') {
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent(); const origin = store.startCycle(agent.id, 'thread');
  const step = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
  const initial: ActionBid = { id: 'initial', partId: 'part', action: { kind: 'operate', text: 'Prescribed fixture goal', operation: {
    successCriteria: 'Separate check returns 42', constraints: ['Preserve earlier effects'], steps: [step, step], verification: { ...step, path: ['value'], expectedJson: '42' } } },
    argument: 'Prescribed operational control; not a learning observation', identityFit: [], executionOrder: [] };
  store.saveCycle({ ...origin, status: 'completed', selectedBidIds: ['initial'] });
  const parent = compileExecutionContract({ agentId: agent.id, cycleId: origin.id, threadId: 'thread', bids: [initial], predictions: [] });
  store.appendEvent(agent.id, origin.id, 'execution.contract', parent);
  store.saveExecution({ id: 'parent', agentId: agent.id, cycleId: origin.id, action: initial.action, contractId: parent.id, status: 'running', facts: [],
    operational: { attempts: 0, verified: false, reason: 'Prescribed held worker', traceRefs: [] } });
  store.appendEvent(agent.id, origin.id, 'execution.tool_trace', { contractId: parent.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 42 } });
  store.appendEvent(agent.id, origin.id, 'execution.tool_trace', { contractId: parent.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded' } });
  store.appendEvent(agent.id, origin.id, 'execution.checkpoint_boundary', { contractId: parent.id, executionId: 'parent', completedSteps: 1, traceRefs: ['trace'] });
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath, args: [], envSecretRefs: {}, timeoutMs: 1000 }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
  const cycle = store.startCycle(agent.id, 'thread');
  const bid: ActionBid = { ...structuredClone(initial), id: 'correction' };
  assert.ok(bid.action.kind === 'operate'); bid.action.operation.steps = [step];
  bid.action.operation.remainderCorrection = { executionId: 'parent', checkpointTraceId: 'trace' };
  store.saveCycle({ ...cycle, selectedBidIds: ['correction'] }); store.appendEvent(agent.id, cycle.id, 'part.bid_created', bid);
  let live = true; let cancels = 0; let waits = 0;
  const workers = {
    owns: () => live, atCheckpoint: () => mode !== 'consume_failure' && live,
    cancel: () => {
      cancels++; assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 1, 'Consumption commits before external cancellation');
      if (mode === 'cancel_failure') throw new Error('Prescribed cancellation failure');
      live = false;
    },
    wait: async () => {
      waits++;
      if (mode === 'settlement_failure') throw new Error('Prescribed worker report failure');
      if (mode === 'deadline') return new Promise<void>(() => {});
      const previous = store.executions(agent.id)[0]!;
      store.saveExecution({ ...previous, status: 'blocked', operational: { attempts: mode === 'unexpected_effect' ? 2 : 1, verified: false,
        reason: 'Prescribed local settlement', traceRefs: mode === 'unexpected_effect' ? ['trace', 'unexplained'] : ['trace'] } });
    },
  };
  const prepared = prepareRemainderInstruction(store, { agentId: agent.id, threadId: 'thread', cycleId: cycle.id, bid, executionId: 'parent', checkpointTraceId: 'trace' },
    { ...workers, atCheckpoint: () => true });
  const authority = RemainderAuthoritySchema.parse({ parentExecutionId: prepared.parentExecutionId, parentContractId: prepared.parentContractId,
    checkpointTraceId: prepared.checkpointTraceId, completedSteps: prepared.completedSteps, completedTraceRefs: prepared.completedTraceRefs,
    deadlineAt: prepared.deadlineAt, limits: { ...prepared.limits, ...(mode === 'deadline' ? { maxDurationMs: 100 } : {}) } });
  const contract = compileExecutionContract({ agentId: agent.id, cycleId: cycle.id, threadId: 'thread', bids: [bid], predictions: [], remainder: authority });
  store.appendEvent(agent.id, cycle.id, 'execution.contract', contract);
  return { store, app, agent, contract, bid, coordinator: new SelectedRemainderHandoff(store, app.inspection, workers), counts: () => ({ cancels, waits }) };
}

for (const mode of ['success', 'consume_failure', 'cancel_failure', 'settlement_failure', 'unexpected_effect', 'deadline'] as const) {
  test(`prescribed remainder worker coordinator ${mode} preserves once-only authority and factual settlement`, async () => {
    const f = fixture(mode);
    try {
      const result = await f.coordinator.handoff({ contract: f.contract, bid: f.bid });
      assert.equal(result.ready, mode === 'success'); assert.equal(result.consumed, mode !== 'consume_failure');
      assert.equal(f.store.eventsByType(f.agent.id, ['execution.remainder_ready']).length, mode === 'success' ? 1 : 0);
      assert.equal(f.store.eventsByType(f.agent.id, ['execution.tool_trace']).length, 2, 'Worker handoff itself does not submit a successor');
      const parent = f.store.executions(f.agent.id)[0]!;
      assert.equal(parent.status === 'continued', mode === 'success'); assert.equal(parent.operational?.verified, false);
      if (mode === 'success') {
        assert.deepEqual(f.counts(), { cancels: 1, waits: 1 });
        const replay = await f.coordinator.handoff({ contract: f.contract, bid: f.bid });
        assert.equal(replay.ready, false); assert.equal(replay.consumed, true); assert.deepEqual(f.counts(), { cancels: 1, waits: 1 });
      } else {
        const failures = f.store.eventsByType(f.agent.id, ['execution.remainder_handoff_failed']);
        assert.equal(failures.length, 1); assert.ok(failures[0]!.type === 'execution.remainder_handoff_failed');
        assert.equal(failures[0]!.payload.consumed, mode !== 'consume_failure');
        assert.deepEqual(f.counts(), mode === 'consume_failure' ? { cancels: 0, waits: 0 } : mode === 'cancel_failure' ? { cancels: 1, waits: 0 } : { cancels: 1, waits: 1 });
      }
    } finally { await f.app.close(); f.store.close(); }
  });
}
