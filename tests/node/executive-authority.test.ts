import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { Executor } from '../../packages/core/src/contracts.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';

test('a replacement executor cannot change arguments, reorder steps, overlap submissions or exceed the selected strategy', async () => {
  const store = new SqliteStore(':memory:');
  const tool = { serverId: 'local', toolName: 'echo' };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      const output = PartGenerationSchema.parse(result);
      output.cognition.proposal = { action: { kind: 'operate', text: 'Echo the selected value', operation: {
        successCriteria: 'The selected check returns 8', constraints: ['Only selected values 7 and 8 in order'],
        steps: [{ ...tool, argumentsJson: '{"value":7}' }], verification: { ...tool, argumentsJson: '{"value":8}', path: ['value'], expectedJson: '8' },
      } }, argument: 'Authority plumbing fixture', identityFit: [], executionOrder: [] };
      return output;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const selected = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(selected);
      return { choice: selected.id, selectedBidIds: [selected.id], explanation: 'Fixture', identityConflict: '' };
    }
  }
  let app: Application;
  const replacement: Executor = { async execute(input) {
    assert.ok(input.contract);
    const gateway = await app.executiveConnections.executionGateway(input.contract);
    assert.equal((await gateway.call(tool, { value: 999 })).status, 'blocked');
    assert.equal((await gateway.call(tool, { value: 8 })).status, 'blocked', 'The verification step cannot run before the selected first step');
    const pending = gateway.call(tool, { value: 7 });
    assert.equal((await gateway.call(tool, { value: 7 })).status, 'blocked', 'Framework rejects overlapping calls');
    assert.equal((await pending).status, 'succeeded');
    assert.equal((await gateway.call(tool, { value: 999 })).status, 'blocked', 'A later verifier cannot change payload');
    assert.equal((await gateway.call(tool, { value: 8 })).status, 'succeeded');
    assert.equal((await gateway.call(tool, { value: 7 })).status, 'blocked', 'A retained gateway cannot repeat a completed strategy');
    return { id: 'replacement_execution', agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action,
      status: 'completed', facts: [] };
  } };
  app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, replacement);
  const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [tool] }, 0);
  try {
    await app.message(agent.id, 'Exercise the chosen fixture strategy.');
    const submissions = store.eventsByType(agent.id, ['execution.tool_trace']).filter(event =>
      event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    assert.equal(submissions.length, 2);
    assert.deepEqual(submissions.map(event => event.type === 'execution.tool_trace' && event.payload.arguments?.value), [7, 8]);
  } finally { await app.executiveConnections.close(); store.close(); }
});

test('framework duration budgets abort submitted calls and cannot be reset by replacement gateways', async () => {
  const store = new SqliteStore(':memory:');
  const slow = { serverId: 'local', toolName: 'slow' }; const echo = { serverId: 'local', toolName: 'echo' };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Run slow fixture', operation: {
        successCriteria: 'A later check returns 42', constraints: [], steps: [{ ...slow, argumentsJson: '{}' }],
        verification: { ...echo, argumentsJson: '{"value":42}', path: ['value'], expectedJson: '42' },
      } }, argument: 'Prescribed deadline plumbing fixture', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture', identityConflict: '' };
    }
  }
  let app: Application;
  const replacement: Executor = { async execute(input) {
    assert.ok(input.contract);
    const gateway = await app.executiveConnections.executionGateway(input.contract);
    const outcome = await gateway.call(slow, {}); // Intentionally omit adapter timeout/cancellation.
    assert.equal(outcome.status, 'unverified');
    const recreated = await app.executiveConnections.executionGateway(input.contract);
    const later = await recreated.call(echo, { value: 42 });
    assert.equal(later.status, 'blocked'); assert.ok('code' in later); assert.equal(later.code, 'budget_exhausted');
    return { id: 'deadline_execution', agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action,
      status: 'unverified', facts: [], operational: { attempts: 1, verified: false, reason: 'Submitted response exceeded the host deadline', traceRefs: [outcome.traceId] } };
  } };
  app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, replacement);
  const agent = app.createAgent(); const profile = defaultExecutiveProfile(); profile.revision = 1; profile.limits.maxDurationMs = 200;
  store.saveExecutiveProfile(agent.id, profile, 0);
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [slow, echo] }, 0);
  try {
    await app.executiveConnections.agentCatalog(agent.id);
    const result = await app.message(agent.id, 'Run the selected slow strategy.');
    assert.equal(result.execution?.status, 'unverified');
    const submissions = store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    assert.equal(submissions.length, 1, 'No retry or verifier can submit after the captured deadline');
  } finally { await app.close(); store.close(); }
});
