import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRemainderInstruction } from '../../packages/core/src/remainder-instruction.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import type { ActionBid } from '../../packages/core/src/domain.js';
import type { CognitiveEvent, Store } from '../../packages/core/src/contracts.js';

test('selected remainder preparation preserves prefix evidence and bounds future authority without dispatch', () => {
  const step = (value: number) => ({ serverId: 'local', toolName: 'echo', argumentsJson: JSON.stringify({ value }) });
  const original: ActionBid = { id: 'initial', partId: 'part', action: { kind: 'operate', text: 'Preserve the document inventory', operation: {
    successCriteria: 'All documents accounted for', constraints: ['Preserve both versions'], steps: [step(1), step(2)],
    verification: { ...step(3), path: ['value'], expectedJson: '3' } } }, argument: 'Prescribed initial fixture', identityFit: [], executionOrder: [] };
  const correction: ActionBid = { ...structuredClone(original), id: 'correction', argument: 'Prescribed correction; no psychological validity claim' };
  assert.ok(correction.action.kind === 'operate');
  correction.action.operation.steps = [step(4)]; correction.action.operation.constraints.push('Review ambiguity');
  const profile = defaultExecutiveProfile(); profile.limits.maxSteps = 3;
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'origin', threadId: 'thread', bids: [original], predictions: [], profile });
  const base = { agentId: 'agent', cycleId: 'origin', at: new Date().toISOString() };
  const events: CognitiveEvent[] = [
    { ...base, id: 'contract', sequence: 1, type: 'execution.contract', payload: contract },
    { ...base, id: 'submit', sequence: 2, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 1 } } },
    { ...base, id: 'finish', sequence: 3, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded' } } },
    { ...base, id: 'boundary', sequence: 4, type: 'execution.checkpoint_boundary', payload: { contractId: contract.id, executionId: 'execution', completedSteps: 1, traceRefs: ['trace'] } },
    { ...base, cycleId: 'review', id: 'expressed', sequence: 5, type: 'part.bid_created', payload: correction },
  ];
  let selected = ['correction']; let reviewThread = 'thread'; let running = true; let held = true;
  let grants = [{ serverId: 'local', toolName: 'echo' }];
  const execution = { id: 'execution', agentId: 'agent', cycleId: 'origin', action: original.action, contractId: contract.id, status: 'running', facts: [] };
  const store = { executions: () => [execution], cycle: (id: string) => id === 'origin'
    ? { id, agentId: 'agent', threadId: 'thread', sequence: 1, status: 'completed', selectedBidIds: ['initial'] }
    : { id, agentId: 'agent', threadId: reviewThread, sequence: 2, status: running ? 'running' : 'completed', selectedBidIds: selected },
    eventsByType: (_agent: string, types: string[], cycles?: string[]) => events.filter(event => types.includes(event.type) && (!cycles || cycles.includes(event.cycleId!))),
    executiveProfile: () => profile, mcpPermissions: () => ({ revision: 1, tools: grants }),
  } as unknown as Store;
  const input = { agentId: 'agent', threadId: 'thread', cycleId: 'review', bid: correction, executionId: 'execution', checkpointTraceId: 'trace' };
  const worker = { owns: () => true, atCheckpoint: () => held };
  let before = structuredClone(events);
  correction.action.operation.remainderCorrection = { executionId: 'execution', checkpointTraceId: 'trace' };
  assert.throws(() => prepareRemainderInstruction(store, { ...input, checkpointTraceId: 'other' }, worker), /expressed correction reference/);
  before = structuredClone(events);
  const prepared = prepareRemainderInstruction(store, input, worker);
  assert.equal('remainderCorrection' in prepared.procedure, false);
  assert.deepEqual(prepared.completedTraceRefs, ['trace']); assert.equal(prepared.completedSteps, 1);
  assert.deepEqual(prepared.procedure.steps, [step(4)], 'The fresh remainder contains no replayed prefix');
  assert.equal(prepared.limits.maxSteps, 2);
  assert.equal(prepared.deadlineAt, Date.parse(events[0]!.at) + contract.limits.maxDurationMs);
  assert.ok(Object.isFrozen(prepared.procedure.steps)); assert.deepEqual(events, before, 'Preparation cannot consume, dispatch or rewrite history');
  selected = []; assert.throws(() => prepareRemainderInstruction(store, input, worker), /Self-selected/); selected = ['correction'];
  reviewThread = 'other'; assert.throws(() => prepareRemainderInstruction(store, input, worker), /Self-selected/); reviewThread = 'thread';
  running = false; assert.throws(() => prepareRemainderInstruction(store, input, worker), /Self-selected/); running = true;
  const forged = structuredClone(correction); forged.argument = 'Unrecorded replacement';
  assert.throws(() => prepareRemainderInstruction(store, { ...input, bid: forged }, worker), /Self-selected/);
  held = false; assert.throws(() => prepareRemainderInstruction(store, input, worker), /live suspended/); held = true;
  grants = []; assert.throws(() => prepareRemainderInstruction(store, input, worker), /current permission/); grants = [{ serverId: 'local', toolName: 'echo' }];
  profile.limits.maxSteps = 1; assert.throws(() => prepareRemainderInstruction(store, input, worker), /remaining original or current/); profile.limits.maxSteps = 3;
  profile.limits.maxDurationMs = 5;
  profile.limits.maxRetries = 0;
  const tightened = prepareRemainderInstruction(store, input, worker);
  assert.equal(tightened.limits.maxDurationMs, 5); assert.equal(tightened.limits.maxRetries, 0);
  profile.limits.maxDurationMs = contract.limits.maxDurationMs;
  correction.action.operation.steps.push(step(5));
  assert.throws(() => prepareRemainderInstruction(store, input, worker), /remaining original or current/, 'Verification also consumes the remaining step budget');
  correction.action.operation.steps.pop();
  correction.action.operation.verification!.toolName = 'inventory';
  assert.throws(() => prepareRemainderInstruction(store, input, worker), /current permission/, 'A granted primary step does not grant the verifier');
  correction.action.operation.verification!.toolName = 'echo';
  correction.action.operation.steps = [];
  assert.equal(prepareRemainderInstruction(store, input, worker).procedure.steps.length, 0, 'A selected verifier alone can assess the completed prefix');
  correction.action.operation.steps = [step(4)];
  correction.action.operation.constraints = []; assert.throws(() => prepareRemainderInstruction(store, input, worker), /constraints/);
  correction.action.operation.constraints = ['Preserve both versions'];
  correction.action.operation.successCriteria = 'A different result'; assert.throws(() => prepareRemainderInstruction(store, input, worker), /criterion/);
  correction.action.operation.successCriteria = 'All documents accounted for';
  correction.action.text = 'Delete everything'; assert.throws(() => prepareRemainderInstruction(store, input, worker), /goal/);
  correction.action.text = original.action.text;
  events[0]!.at = '2000-01-01T00:00:00.000Z'; assert.throws(() => prepareRemainderInstruction(store, input, worker), /expired/);
});
