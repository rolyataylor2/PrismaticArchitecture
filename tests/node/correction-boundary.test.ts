import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCorrectionBoundary } from '../../packages/core/src/correction-boundary.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';
import type { Store, CognitiveEvent } from '../../packages/core/src/contracts.js';
import type { ActionBid } from '../../packages/core/src/domain.js';

test('correction boundary plumbing rejects advanced, unsettled, superseded and unrelated prefix evidence', () => {
  const step = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
  const bid: ActionBid = { id: 'bid', partId: 'part', action: { kind: 'operate', text: 'Fixture task', operation: {
    steps: [step, step], verification: { ...step, path: ['value'], expectedJson: '42' }, successCriteria: 'Fixture criterion', constraints: [] } },
  argument: 'Prescribed plumbing only', identityFit: [], executionOrder: [] };
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', threadId: 'thread', bids: [bid], predictions: [] });
  const base = { agentId: 'agent', cycleId: 'cycle', at: new Date().toISOString() };
  const events: CognitiveEvent[] = [
    { ...base, id: 'contract-event', sequence: 1, type: 'execution.contract', payload: contract },
    { ...base, id: 'submit', sequence: 2, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'trace',
      serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 42 } } },
    { ...base, id: 'finish', sequence: 3, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'trace',
      serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded' } } },
    { ...base, id: 'boundary', sequence: 4, type: 'execution.checkpoint_boundary', payload: {
      contractId: contract.id, executionId: 'execution', completedSteps: 1, traceRefs: ['trace'] } },
  ];
  const execution = { id: 'execution', agentId: 'agent', cycleId: 'cycle', action: bid.action, contractId: contract.id, status: 'running', facts: [] };
  const store = { executions: () => [execution], cycle: () => ({ id: 'cycle', agentId: 'agent', threadId: 'thread', status: 'completed', selectedBidIds: ['bid'] }),
    eventsByType: () => events } as unknown as Store;
  const input = { agentId: 'agent', threadId: 'thread', executionId: 'execution', boundaryId: 'boundary' };
  assert.equal(verifyCorrectionBoundary(store, input, () => true).remainingSteps, contract.limits.maxSteps - 1);
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true, () => false), /live suspended checkpoint/);
  assert.equal(verifyCorrectionBoundary(store, input, () => true, (_agent, _execution, count) => count === 1).boundary.completedSteps, 1);
  const byCheckpoint = { agentId: 'agent', threadId: 'thread', executionId: 'execution', checkpointTraceId: 'trace' };
  assert.equal(verifyCorrectionBoundary(store, byCheckpoint, () => true).boundary.completedSteps, 1);
  const budget = verifyCorrectionBoundary(store, byCheckpoint, () => true);
  assert.equal(budget.deadlineAt, Date.parse(events[0]!.at) + contract.limits.maxDurationMs);
  assert.ok(budget.remainingDurationMs > 0 && budget.remainingDurationMs <= contract.limits.maxDurationMs);
  assert.throws(() => verifyCorrectionBoundary(store, { ...byCheckpoint, checkpointTraceId: 'earlier' }, () => true), /superseded/);
  assert.throws(() => verifyCorrectionBoundary(store, { ...input, checkpointTraceId: 'trace' }, () => true), /exactly one/);
  assert.throws(() => verifyCorrectionBoundary(store, input, () => false), /locally owned/);
  assert.throws(() => verifyCorrectionBoundary(store, { ...input, threadId: 'foreign' }, () => true), /selected thread/);
  assert.throws(() => verifyCorrectionBoundary(store, { ...input, boundaryId: 'old' }, () => true), /superseded/);
  const response = events.splice(2, 1)[0]!;
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true), /settled successful/);
  events.splice(2, 0, response);
  const originalTime = events[0]!.at; events[0]!.at = '2000-01-01T00:00:00.000Z';
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true), /expired execution/);
  events[0]!.at = originalTime;
  const reached = events[3]!;
  assert.ok(reached.type === 'execution.checkpoint_boundary');
  reached.payload.completedSteps = 2; reached.payload.traceRefs = ['trace', 'trace_2']; reached.sequence = 6;
  const firstResponse = events[2]!; firstResponse.sequence = 4;
  const secondSubmit: CognitiveEvent = { ...base, id: 'submit_2', sequence: 3, type: 'execution.tool_trace', payload: {
    contractId: contract.id, traceId: 'trace_2', serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 42 } } };
  const secondFinish: CognitiveEvent = { ...base, id: 'finish_2', sequence: 5, type: 'execution.tool_trace', payload: {
    contractId: contract.id, traceId: 'trace_2', serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded' } } };
  events.splice(2, 0, secondSubmit); events.splice(4, 0, secondFinish);
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true), /settled successful/, 'Overlapping submitted calls cannot masquerade as a settled sequential prefix');
  events.splice(4, 1); events.splice(2, 1);
  firstResponse.sequence = 3; reached.sequence = 4; reached.payload.completedSteps = 1; reached.payload.traceRefs = ['trace'];
  events.push({ ...base, id: 'pending-reservation', sequence: 5, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'reservation', serverId: 'local', toolName: 'echo', phase: 'authorized', arguments: { value: 42 } } });
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true), /pending or additional tool authorization/);
  events.pop();
  events.push({ ...events[1]!, id: 'next-submit', sequence: 5 } as CognitiveEvent);
  assert.throws(() => verifyCorrectionBoundary(store, input, () => true), /advanced/);
});
