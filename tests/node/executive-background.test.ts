import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

function fixture(slow = false) {
  let operate = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition' || !operate) return output;
      const generated = PartGenerationSchema.parse(output);
      const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Execute background fixture strategy', operation: {
        successCriteria: 'Separate verification returns 42', constraints: [],
        steps: slow ? [{ serverId: 'local', toolName: 'slow', argumentsJson: '{}' }, echo] : [echo],
        verification: { ...echo, path: ['value'], expectedJson: '42' },
      } }, argument: 'Prescribed plumbing fixture; not a configured-model observation', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false);
      const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }, { serverId: 'local', toolName: 'slow' }] }, 0);
  store.saveExecutiveProfile(agent.id, { ...defaultExecutiveProfile(), enabled: true, revision: 1, executionMode: 'background' }, 0);
  return { app, store, agent, stopProposals: () => { operate = false; } };
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Fixture event did not arrive'); await new Promise(resolve => setTimeout(resolve, 5)); }
}

test('background execution outlives its cognitive cycle and reports only to its originating thread', async () => {
  const { app, store, agent, stopProposals } = fixture();
  try {
    const first = await app.message(agent.id, 'Run the selected fixture.', 'user', 'origin');
    assert.equal(first.cycle.status, 'completed'); assert.equal(first.execution?.status, 'running');
    const before = structuredClone(store.world(first.cycle.worldId));
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    const final = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    assert.equal(final.status, 'completed'); assert.equal(final.operational?.verified, true);
    assert.equal(final.contractId, first.execution!.contractId); assert.equal(final.cycleId, first.cycle.id);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [first.cycle.id]).filter(event =>
      event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
    stopProposals();
    const later = await app.message(agent.id, 'What happened?', 'user', 'origin');
    assert.ok(store.world(later.cycle.worldId).facts.some(fact => fact.text.includes('verified: true')));
    const other = await app.message(agent.id, 'Unrelated.', 'user', 'other');
    assert.equal(store.world(other.cycle.worldId).facts.some(fact => fact.referenceId === final.id), false);
    assert.deepEqual(store.world(first.cycle.worldId), before);
    const event = store.eventsByType(agent.id, ['execution.contract'], [first.cycle.id])[0]!;
    assert.ok(event.type === 'execution.contract');
    await assert.rejects(app.executiveConnections.executionGateway(event.payload), /Self-selected/);
  } finally { await app.close(); store.close(); }
});

test('cancelling an in-flight MCP operation remains unverified and prevents later strategy calls', async () => {
  const { app, store, agent } = fixture(true);
  try {
    const first = await app.message(agent.id, 'Run slow fixture.', 'user', 'origin');
    const submitted = () => store.eventsByType(agent.id, ['execution.tool_trace'], [first.cycle.id]).filter(event =>
      event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    await until(() => submitted().length === 1);
    await assert.rejects(api(app, 'POST', `/api/agents/${app.createAgent().id}/executions/${first.execution!.id}/cancel`, {}), /not running/);
    await api(app, 'POST', `/api/agents/${agent.id}/executions/${first.execution!.id}/cancel`, {});
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    const final = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    assert.equal(final.status, 'unverified'); assert.equal(final.operational?.verified, false);
    assert.equal(submitted().length, 1, 'Cancellation cannot cause retry or verification after response loss');
    assert.throws(() => app.reportExecution({ ...final, status: 'running' }), /restart/);
  } finally { await app.close(); store.close(); }
});

test('parallel-job budget blocks a second operation and cancellation before start submits no tools', async () => {
  const { app, store, agent } = fixture(true);
  try {
    const first = await app.message(agent.id, 'Run slow fixture.', 'user', 'origin');
    const second = await app.message(agent.id, 'Run another fixture.', 'user', 'origin');
    assert.equal(second.execution?.status, 'blocked');
    assert.ok(second.execution?.facts.some(fact => fact.text.includes('parallel-job budget')));
    app.cancelExecution(agent.id, first.execution!.id);
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    const final = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    assert.equal(final.status, 'blocked');
    assert.equal(final.operational?.attempts, 0);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
  } finally { await app.close(); store.close(); }
});

test('a failed originating cycle cannot authorize a queued worker or fabricate completion', async () => {
  const { app, store, agent } = fixture();
  try {
    const first = await app.message(agent.id, 'Run the selected fixture.', 'user', 'origin');
    store.saveCycle({ ...first.cycle, status: 'failed', error: 'Explicit infrastructure failure fixture' });
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    const final = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    assert.equal(final.status, 'unverified'); assert.equal(final.operational?.attempts, 0);
    assert.ok(final.facts.some(fact => fact.text.includes('external worker stopped')));
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
  } finally { await app.close(); store.close(); }
});


for (const disableModule of [false, true]) test(`disabling ${disableModule ? 'Tool execution module' : 'Executive'} during background work blocks later submissions and disconnects feedback`, async () => {
  const { app, store, agent } = fixture(true);
  try {
    const first = await app.message(agent.id, 'Run slow fixture.', 'user', 'origin');
    const submitted = () => store.eventsByType(agent.id, ['execution.tool_trace'], [first.cycle.id]).filter(event =>
      event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    await until(() => submitted().length === 1);
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: disableModule, modules: { ...profile.modules, tools: false }, revision: profile.revision + 1 }, profile.revision);
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    assert.equal(submitted().length, 1, 'An earlier captured contract cannot submit after disabling');
    assert.notEqual(store.executions(agent.id)[0]!.status, 'completed');
    const next = await app.message(agent.id, 'Continue thinking.', 'user', 'origin');
    assert.equal(next.execution, null);
    assert.ok(!store.world(next.cycle.worldId).facts.some(fact => fact.referenceId === first.execution!.id));
    assert.equal(store.cycles(agent.id).length, 2, 'Disabled results do not trigger checkpoint cognition');
  } finally { await app.close(); store.close(); }
});
