import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { BackgroundExecutiveExecutor } from '../../packages/executive/src/background-executor.js';
import { NativeExecutiveExecutor } from '../../packages/executive/src/native-executor.js';
import { compileExecutionContract, ExecutionContractSchema } from '../../packages/core/src/execution-contract.js';
import { ActionSchema, type ActionBid, type SelfContext } from '../../packages/core/src/domain.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { ToolGateway } from '../../packages/executive/src/mcp-client-manager.js';
import { evaluateSkillEvidence } from '../../packages/core/src/executive-skill-evidence.js';
import type { CognitiveEvent } from '../../packages/core/src/contracts.js';
import { PrimitiveProposalSchema } from '../../packages/core/src/primitives.js';

const step = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
const bid = (): ActionBid => ({ id: 'bid', partId: 'part', action: { kind: 'operate', text: 'Set and check the requested fixture value',
  operation: { successCriteria: 'The separate read returns 42', constraints: ['Use only the selected fixture value'],
    steps: [step], verification: { ...step, path: ['value'], expectedJson: '42' } } },
  argument: 'Selected strategy', identityFit: [], executionOrder: ['Set then check'] });
const compile = (selected: ActionBid) => compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [selected], predictions: [] });

test('local checkpoint ownership expires on release and cancellation and cannot cross Agents', async () => {
  for (const cancel of [false, true]) {
    let release!: () => void; let reached!: () => void;
    const review = new Promise<void>(resolve => { release = resolve; });
    const boundary = new Promise<void>(resolve => { reached = resolve; });
    let calls = 0;
    const gateway: ToolGateway = { catalog: async () => [], call: async () => ({ status: 'succeeded',
      result: { structuredContent: { value: 42 } }, traceId: `trace_${++calls}` }) };
    const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway,
      undefined, undefined, async () => { reached(); await review; });
    const workers = new BackgroundExecutiveExecutor(native, { executions: () => [], report: () => {}, reportError: () => { assert.fail('Worker failed'); } });
    try {
      const selected = bid();
      const running = await workers.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected,
        contract: { ...compile(selected), executionMode: 'background' } });
      assert.equal(workers.atCheckpoint('agent', running.id, 1), false, 'Scheduled work has not reached a boundary');
      await boundary;
      assert.equal(workers.atCheckpoint('agent', running.id, 1), true);
      assert.equal(workers.atCheckpoint('other', running.id, 1), false);
      assert.equal(workers.atCheckpoint('agent', running.id, 2), false);
      if (cancel) {
        workers.cancel('agent', running.id);
        assert.equal(workers.atCheckpoint('agent', running.id, 1), false, 'Cancellation revokes admission synchronously');
      } else release();
      await workers.wait('agent', running.id);
      assert.equal(workers.atCheckpoint('agent', running.id, 1), false);
      assert.equal(calls, cancel ? 1 : 2);
    } finally { release(); await workers.close(); }
  }
});

test('checkpoint boundaries preserve completed calls and cancel without awaiting review settlement', async () => {
  for (const cancel of [false, true]) {
    let calls = 0; let release!: () => void; let reached!: () => void; let held: number | null = null;
    const review = new Promise<void>(resolve => { release = resolve; });
    const boundary = new Promise<void>(resolve => { reached = resolve; });
    const gateway: ToolGateway = { catalog: async () => [], call: async () => ({ status: 'succeeded',
      result: { structuredContent: { value: 42 } }, traceId: `trace_${++calls}` }) };
    const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway,
      undefined, undefined, async (_contract, completedSteps) => { assert.equal(completedSteps, 1); assert.equal(held, 1); reached(); await review; });
    const selected = bid(); const controller = new AbortController();
    const result = native.executeControlled({ agentId: 'agent', cycleId: 'cycle', bid: selected, contract: compile(selected) },
      { executionId: 'execution', signal: controller.signal, checkpoint: count => { held = count; } });
    await boundary; assert.equal(calls, 1, 'The verifier cannot pass a pending checkpoint');
    if (cancel) controller.abort(new Error('Selected pause'));
    else release();
    const ended = await result;
    assert.equal(held, null, 'Resume and cancellation release the live checkpoint even before pending inference settles');
    assert.equal(ended.status, cancel ? 'blocked' : 'completed'); assert.equal(calls, cancel ? 1 : 2);
    assert.deepEqual(ended.operational!.traceRefs, cancel ? ['trace_1'] : ['trace_1', 'trace_2']);
    release();
  }
});

test('a checkpoint review cannot extend the duration budget or submit its next call after expiry', async () => {
  let calls = 0; let held: number | null = null;
  const gateway: ToolGateway = { catalog: async () => [], call: async () => ({ status: 'succeeded',
    result: { structuredContent: { value: 42 } }, traceId: `trace_${++calls}` }) };
  const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway,
    undefined, undefined, async () => { await new Promise<void>(() => {}); });
  const selected = bid(); const contract = compile(selected);
  const keepAlive = setInterval(() => {}, 100);
  try {
    const ended = await native.executeControlled({ agentId: 'agent', cycleId: 'cycle', bid: selected,
      contract: { ...contract, limits: { ...contract.limits, maxDurationMs: 30 } } },
    { executionId: 'execution', signal: new AbortController().signal, checkpoint: count => { held = count; } });
    assert.equal(ended.status, 'blocked'); assert.equal(calls, 1); assert.equal(held, null, 'Deadline clears a live wait while review remains unresolved');
    assert.deepEqual(ended.operational!.traceRefs, ['trace_1']);
  } finally { clearInterval(keepAlive); }
});

test('native execution preserves exact selected steps and separates tool success from observable verification', async () => {
  let calls = 0;
  const gateway: ToolGateway = { catalog: async () => [], call: async () => {
    calls++; return { status: 'succeeded', result: { structuredContent: { value: 42 } }, traceId: `trace_${calls}` };
  } };
  const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway);
  const selected = bid(); const contract = compile(selected);
  assert.equal(PrimitiveProposalSchema.safeParse({ action: selected.action, argument: 'Fixture', identityFit: [], executionOrder: [] }).success, false,
    'Retained primitive inference cannot acquire operational strategy authority');
  assert.deepEqual(contract.authority.tools, [{ serverId: 'local', toolName: 'echo' }]);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, authority: { ...contract.authority,
    tools: [...contract.authority.tools, { serverId: 'local', toolName: 'secret' }] } }).success, false);
  const result = await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected, contract });
  assert.equal(result.status, 'completed'); assert.equal(result.operational?.verified, true); assert.equal(calls, 2);
  const unverified = bid(); if (unverified.action.kind === 'operate') unverified.action.operation.verification = null;
  assert.equal((await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: unverified, contract: compile(unverified) })).status, 'unverified');
  const missing = bid(); if (missing.action.kind === 'operate') { missing.action.operation.steps = []; missing.action.operation.verification = null; }
  const guidance = await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: missing, contract: compile(missing) });
  assert.equal(guidance.status, 'needs_guidance');
  assert.equal(guidance.guidance?.goal, missing.action.text);
  assert.equal(guidance.operational?.attempts, 0);
  const noGuidance = compile(missing);
  assert.equal((await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: missing,
    contract: { ...noGuidance, limits: { ...noGuidance.limits, maxGuidanceRequests: 0 } } })).status, 'blocked');
  assert.equal(calls, 3, 'A missing plan does not fabricate a tool call');
  assert.equal(ActionSchema.safeParse({ kind: 'operate', text: 'Goal', operation: { ...((selected.action.kind === 'operate') ? selected.action.operation : {}),
    steps: [{ ...step, argumentsJson: 'not JSON' }] } }).success, false);
});

test('an explicitly selected verification-only strategy checks the goal without replaying mutation steps', async () => {
  const selected = bid(); assert.ok(selected.action.kind === 'operate');
  selected.action.operation.steps = [];
  let calls = 0;
  const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => ({
    catalog: async () => [], call: async () => { calls++; return { status: 'succeeded', result: { structuredContent: { value: 42 } }, traceId: 'verification' }; },
  }));
  const contract = compile(selected);
  const result = await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected, contract });
  const base = { agentId: 'agent', cycleId: 'cycle', at: new Date().toISOString() };
  const events: CognitiveEvent[] = [
    { ...base, id: 'contract', sequence: 1, type: 'execution.contract', payload: contract },
    { ...base, id: 'submitted', sequence: 2, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'verification', serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 42 } } },
    { ...base, id: 'finished', sequence: 3, type: 'execution.tool_trace', payload: { contractId: contract.id, traceId: 'verification', serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded', result: { structuredContent: { value: 42 } } } } },
  ];
  assert.equal(evaluateSkillEvidence(selected.action.operation, result, events).result, 'passed', 'Prescribed verification-only ledger supports independent evidence checking');
  const response = events[2]!; assert.ok(response.type === 'execution.tool_trace');
  response.payload.outcome = { status: 'succeeded', result: { structuredContent: { value: 43 } } };
  assert.equal(evaluateSkillEvidence(selected.action.operation, result, events).result, 'failed', 'Completion reports cannot override a contradictory verification result');
  assert.equal(calls, 1); assert.equal(result.status, 'completed'); assert.equal(result.operational?.verified, true);
  assert.equal(result.guidance, undefined);
});

test('native budgets and ambiguous submitted outcomes stop further tool submissions', async () => {
  let calls = 0;
  const gateway: ToolGateway = { catalog: async () => [], call: async () => { calls++; return { status: 'unverified', code: 'transport_error', traceId: 'trace' }; } };
  const native = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway);
  const selected = bid(); const contract = compile(selected);
  assert.equal((await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected,
    contract: { ...contract, limits: { ...contract.limits, maxSteps: 1 } } })).status, 'blocked');
  assert.equal(calls, 0);
  assert.equal((await native.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected, contract })).status, 'unverified');
  assert.equal(calls, 1, 'Response loss cannot cause an automatic retry or verification call');
  const lowSensitivity = (await import('../../packages/core/src/executive-sensitivity.js')).defaultExecutiveSensitivity();
  for (const signal of ['failure', 'drift', 'surprise', 'novelty', 'uncertainty'] as const) {
    lowSensitivity[signal] = { threshold: 1, minThreshold: 0, maxThreshold: 1, cooldownMs: 86400000 };
  }
  const conservative = new NativeExecutiveExecutor({ execute: async () => { throw new Error('Not chat'); } }, async () => gateway, lowSensitivity);
  const ambiguous = await conservative.execute({ agentId: 'agent', cycleId: 'cycle', bid: selected,
    contract: { ...contract, sensitivity: lowSensitivity } });
  assert.equal(ambiguous.status, 'unverified');
  assert.equal(ambiguous.operational?.diagnostics?.reactions[0]?.response, 'stop', 'Sensitivity cannot authorize repeating unresolved submissions');
  assert.equal(calls, 2);
});

test('ordinary Agent pipeline selects an operational bid, calls real MCP and preserves private ledger and later-thread feedback', async () => {
  const store = new SqliteStore(':memory:');
  let operate = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition' || !operate) return output;
      const generated = PartGenerationSchema.parse(output);
      const action = bid().action;
      if (action.kind === 'operate') action.operation.steps = [{ serverId: 'local', toolName: 'progress', argumentsJson: '{}' }];
      generated.cognition.proposal = { action, argument: 'Deterministic plumbing fixture, not model observation', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false);
      const selected = context.contributions.find(contribution => contribution.bid?.action)?.bid;
      assert.ok(selected);
      return { choice: selected.id, selectedBidIds: [selected.id], explanation: 'Plumbing fixture selection', identityConflict: '' };
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }, { serverId: 'local', toolName: 'progress' }] }, 0);
  try {
    const first = await app.message(agent.id, 'Use the selected fixture strategy.', 'user', 'original');
    assert.equal(first.execution?.status, 'completed'); assert.equal(first.execution?.operational?.verified, true);
    const ledger = store.eventsByType(agent.id, ['execution.tool_trace'], [first.cycle.id]);
    assert.equal(ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
    const contract = store.eventsByType(agent.id, ['execution.contract'], [first.cycle.id])[0]!;
    assert.ok(contract.type === 'execution.contract');
    const progress = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'progress');
    assert.equal(progress.length, 2);
    assert.ok(progress.every(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.payload.id));
    const action = contract.payload.commands[0]!.action; assert.ok(action.kind === 'operate');
    assert.equal(evaluateSkillEvidence(action.operation, first.execution!, [contract, ...ledger]).result, 'passed');
    await assert.rejects(app.executiveConnections.executionGateway(contract.payload), /Self-selected/, 'Completed contracts cannot be replayed');
    const before = structuredClone(store.world(first.cycle.worldId));
    operate = false;
    const later = await app.message(agent.id, 'What happened?', 'user', 'original');
    const world = store.world(later.cycle.worldId);
    assert.ok(world.facts.some(fact => fact.text.includes('verified: true')));
    assert.equal(world.facts.some(fact => fact.text.includes('"structuredContent"')), false, 'Raw tool responses stay in audit');
    const other = await app.message(agent.id, 'Unrelated encounter.', 'user', 'other');
    assert.equal(store.world(other.cycle.worldId).facts.some(fact => fact.text.includes('verified: true')), false);
    assert.deepEqual(store.world(first.cycle.worldId), before, 'Execution cannot modify its originating snapshot');
  } finally { await app.executiveConnections.close(); store.close(); }
});
