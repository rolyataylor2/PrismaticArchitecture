import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileChatExecutionContract, ExecutionContractSchema } from '../../packages/core/src/execution-contract.js';
import type { ActionBid } from '../../packages/core/src/domain.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import type { Executor } from '../../packages/core/src/contracts.js';

const bid = (id: string, kind: 'say' | 'ask' | 'wait' = 'say'): ActionBid => ({
  id, partId: `part_${id}`, action: { kind, text: 'Selected intention' },
  argument: 'My reason', identityFit: [], executionOrder: ['Preserve my order'],
});
const compile = (bids = [bid('first'), bid('second', 'ask')]) => compileChatExecutionContract({
  agentId: 'agent', cycleId: 'cycle', threadId: 'thread', bids, predictions: [],
});

test('chat contract preserves selected order and provenance without inventing tool permission', () => {
  const bids = [bid('first'), bid('second', 'ask')];
  const before = structuredClone(bids);
  const contract = compile(bids);
  assert.deepEqual(contract.commands.map(command => command.bidId), ['first', 'second']);
  assert.deepEqual(contract.commands.map(command => command.action), bids.map(item => item.action));
  assert.equal(contract.threadId, 'thread');
  assert.equal(contract.decisionId, 'cycle');
  assert.deepEqual(contract.authority, { capabilities: ['chat_output'], tools: [], allowEquivalentMethods: false });
  assert.ok(Object.isFrozen(contract.commands[0]!.action));
  assert.throws(() => { contract.commands[0]!.action.text = 'Changed intent'; }, TypeError);
  assert.deepEqual(bids, before);
  assert.equal(Object.isFrozen(bids[0]!.action), false);
});

test('contracts reject empty/duplicate commands, wait mixing and authority expansion', () => {
  assert.throws(() => compile([]));
  assert.throws(() => compile([bid('same'), bid('same')]));
  assert.throws(() => compile([bid('first'), bid('wait', 'wait')]));
  const contract = compile();
  assert.equal(ExecutionContractSchema.safeParse({ ...contract,
    authority: { ...contract.authority, tools: [{ serverId: 'server', toolName: 'send_email' }] } }).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract,
    authority: { ...contract.authority, allowEquivalentMethods: true } }).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, predictionReferences: [{ id: 'prediction', version: 1, partId: 'unselected' }] }).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, limits: { ...contract.limits, maxSteps: 0 } }).success, false);
  assert.equal(compile([bid('wait', 'wait')]).successCriteria, 'selected_wait_acknowledged');
});

test('only open same-Agent selected-contributor prediction references enter the contract', () => {
  const contract = compileChatExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [bid('first')],
    predictions: [
      { id: 'relevant', version: 2, agentId: 'agent', partId: 'part_first', status: 'open' },
      { id: 'resolved', version: 1, agentId: 'agent', partId: 'part_first', status: 'resolved' },
      { id: 'other_agent', version: 1, agentId: 'other', partId: 'part_first', status: 'open' },
      { id: 'other_part', version: 1, agentId: 'agent', partId: 'part_other', status: 'open' },
      { id: 'gap', version: 1, agentId: 'agent', partId: null, status: 'open' },
    ] });
  assert.deepEqual(contract.predictionReferences, [{ id: 'relevant', version: 2, partId: 'part_first' }]);
});

test('ordinary constructed runtime hands off frozen contracts and persists attribution on async reports', async () => {
  const store = new SqliteStore(':memory:');
  let captured: Parameters<Executor['execute']>[0] | undefined;
  const executor: Executor = { async execute(input) {
    captured = input;
    return { id: 'operation', agentId: input.agentId, cycleId: input.cycleId,
      action: input.bid.action, status: 'running', facts: [] };
  } };
  try {
    const app = new Application(store, undefined, executor);
    const agent = app.createAgent();
    enableExecutive(app, agent.id);
    const result = await app.message(agent.id, 'Hello.', 'user', 'original_thread');
    assert.ok(captured?.contract);
    assert.ok(Object.isFrozen(captured.contract));
    const contract = captured.contract;
    assert.equal(contract.threadId, 'original_thread');
    assert.ok(result.cycle.selectedBidIds?.includes(contract.commands[0]!.bidId));
    assert.equal(result.execution?.contractId, contract.id);
    const event = store.events(agent.id).find(event => event.type === 'execution.contract');
    assert.ok(event?.type === 'execution.contract');
    assert.deepEqual(event.payload, contract);
    assert.equal(JSON.stringify(contract).includes('worldId'), false);
    assert.throws(() => app.reportExecution({ ...result.execution!, status: 'completed', contractId: 'forged' }), /contract reference/);
    const completed = app.reportExecution({ ...result.execution!, status: 'completed' });
    assert.equal(completed.contractId, contract.id);
    assert.equal(store.executions(agent.id)[0]!.contractId, contract.id);
  } finally { store.close(); }
});
