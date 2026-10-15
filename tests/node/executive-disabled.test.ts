import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { ExecutiveProfileSchema, defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { id, type Execution } from '../../packages/core/src/domain.js';
import { api } from '../../packages/sdk/src/api.js';

test('legacy profiles default off and explicit disablement selects without Executive connections', async () => {
  const { enabled: _enabled, ...legacy } = defaultExecutiveProfile();
  assert.equal(ExecutiveProfileSchema.parse(legacy).enabled, false);
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    assert.equal(store.executiveProfile(agent.id).enabled, true);
    store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: false, revision: 1 }, 0);
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'fixture', transport: 'stdio', command: process.execPath, args: [], timeoutMs: 1000, envSecretRefs: {} }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'fixture', toolName: 'must-not-discover' }] }, 0);
    store.executiveSkills = () => { throw new Error('Disabled cognition must not load skills'); };
    app.executiveConnections.agentCatalog = async () => { throw new Error('Disabled cognition must not discover tools'); };
    const executions = store.executions.bind(store);
    store.executions = () => { throw new Error('Disabled cognition must not load execution or guidance state'); };
    const result = await app.message(agent.id, 'Hello.');
    store.executions = executions;
    assert.equal(result.cycle.status, 'completed');
    assert.ok(result.cycle.selectedBidIds?.length);
    assert.equal(result.execution, null); assert.deepEqual(result.executions, []);
    assert.deepEqual(store.executions(agent.id), []);
    assert.equal(store.eventsByType(agent.id, ['execution.contract', 'execution.handoff', 'speech.realization_started']).length, 0);
    const world = store.world(result.cycle.worldId);
    for (const field of ['externalCapabilities', 'externalSkills', 'externalExecutionRequests', 'externalSkillDocuments', 'selectedActivity']) assert.equal(field in world, false);
    assert.equal(await app.observeExecution(agent.id, 'missing', [{ source: 'Executive', kind: 'observes', text: 'progress', referenceId: null, timestamp: null }]), null);
    await assert.rejects(app.consultExecution(agent.id, 'missing', [{ source: 'Executive', kind: 'observes', text: 'progress', referenceId: null, timestamp: null }], 'review'), /disabled/);
    await assert.rejects(app.message(agent.id, 'Use this skill', 'user', undefined, ['missing']), /disabled/);
    assert.equal(store.cycles(agent.id).length, 1);
  } finally { await app.close(); store.close(); }
});

test('explicit opt-in executes; switching off removes feedback and preserves selections without replay', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    const { revision, ...settings } = store.executiveProfile(agent.id);
    await api(app, 'PUT', `/api/agents/${agent.id}/executive-profile`, { ...settings, enabled: true, expectedRevision: revision });
    const enabled = await app.message(agent.id, 'Hello.');
    assert.ok(enabled.execution);
    const executionId = enabled.execution.id;
    assert.ok(store.recentFacts(agent.id, null).some(fact => fact.referenceId === executionId));
    await api(app, 'PUT', `/api/agents/${agent.id}/executive-profile`, { ...settings, enabled: false, expectedRevision: 1 });
    const disabled = await app.message(agent.id, 'Another thought.');
    assert.equal(disabled.execution, null);
    assert.ok(!store.world(disabled.cycle.worldId).facts.some(fact => fact.referenceId === executionId));
    assert.equal(store.executions(agent.id).length, 1);
    assert.ok(store.eventsByType(agent.id, ['execution.contract']).length);
    await api(app, 'PUT', `/api/agents/${agent.id}/executive-profile`, { ...settings, enabled: true, expectedRevision: 2 });
    assert.equal(store.executions(agent.id).length, 1);
  } finally { await app.close(); store.close(); }
});


test('direct runtime callers cannot inject Executive context while disconnected', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: false, revision: 1 }, 0);
    const result = await app.runtime.run(agent.id, [{ source: 'user', kind: 'says', text: 'Hello.', timestamp: null, referenceId: null }], undefined,
      { status: 'available', permissionRevision: 0, tools: [] },
      [{ id: 'document', digest: '0'.repeat(64), name: 'fixture', description: 'External instructions', reviewRevision: 1, instructions: 'Do an operation.' }]);
    const world = store.world(result.cycle.worldId);
    assert.equal(world.externalCapabilities, undefined); assert.equal(world.externalSkillDocuments, undefined);
    assert.equal(result.execution, null);
    const checkpoint = store.startCycle(agent.id);
    store.saveCycle({ ...checkpoint, kind: 'attention_monitor', status: 'completed' });
    store.saveWorld({ ...world, id: checkpoint.worldId, cycleId: checkpoint.id, sequence: checkpoint.sequence,
      facts: [{ source: 'External execution', kind: 'observes', text: 'CHECKPOINT_FEEDBACK', timestamp: checkpoint.startedAt,
        referenceId: null, originCycleId: checkpoint.id }] });
    assert.ok(!store.recentFacts(agent.id, null).some(fact => fact.text === 'CHECKPOINT_FEEDBACK'));
  } finally { await app.close(); store.close(); }
});

// Module permissions are external dispatch plumbing, not a cognition hypothesis.
for (const speaking of [false, true]) for (const tools of [false, true]) {
  test(`Executive modules dispatch independently (speaking ${speaking}, tools ${tools})`, async () => {
    const store = new SqliteStore(':memory:');
    let operational = false; const dispatched: string[] = [];
    class Reasoning extends MockReasoning {
      override async constructed(input: ConstructedInput) {
        const output = await super.constructed(input);
        if (input.task !== 'part_cognition' || !operational) return output;
        const generated = PartGenerationSchema.parse(output);
        generated.cognition.proposal = { action: { kind: 'operate', text: 'Explicit operational fixture', operation: {
          successCriteria: 'Fixture completed', constraints: [], steps: [], verification: null,
        } }, argument: 'Module dispatch plumbing', identityFit: [], executionOrder: [] };
        return generated;
      }
    }
    const execute = async (input: Parameters<import('../../packages/core/src/contracts.js').Executor['execute']>[0]): Promise<Execution> => {
      dispatched.push(input.bid.action.kind);
      return { id: id('execution'), agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action, status: 'completed', facts: [] };
    };
    class Decisions extends MockDecisions {
      override async choose(context: Parameters<MockDecisions['choose']>[0]) {
        const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
        return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Explicit module dispatch fixture', identityConflict: '' };
      }
    }
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, { execute });
    try {
      const agent = app.createAgent(); const profile = store.executiveProfile(agent.id);
      store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking, tools }, revision: 1 }, 0);
      if (!tools) {
        store.executiveSkills = () => { throw new Error('Tools-disabled cognition must not load skills'); };
        app.executiveConnections.agentCatalog = async () => { throw new Error('Tools-disabled cognition must not discover MCP tools'); };
      }
      const speech = await app.message(agent.id, 'Hello.', 'user', 'speech'); await app.runtime.idle(agent.id);
      assert.equal(Boolean(speech.execution), speaking);
      assert.ok(speech.cycle.selectedBidIds?.length);
      operational = true;
      const operation = await app.message(agent.id, 'Do the fixture operation.', 'user', 'operation'); await app.runtime.idle(agent.id);
      assert.equal(Boolean(operation.execution), tools);
      assert.equal(dispatched.includes('operate'), tools);
      if (!tools) {
        const world = store.world(operation.cycle.worldId);
        assert.equal(world.externalCapabilities, undefined); assert.equal(world.externalSkills, undefined);
        await assert.rejects(app.consultExecution(agent.id, 'missing', [{ source: 'Executive', kind: 'observes', text: 'checkpoint', referenceId: null, timestamp: null }], 'review'), /disabled/);
      }
      assert.equal(store.eventsByType(agent.id, ['infrastructure.error']).length, 0);
    } finally { await app.close(); store.close(); }
  });
}

test('legacy enabled Executive profiles preserve both module permissions', () => {
  const { modules: _modules, ...legacy } = defaultExecutiveProfile();
  assert.deepEqual(ExecutiveProfileSchema.parse({ ...legacy, enabled: true }).modules, { speaking: true, tools: true });
});


test('default Executive dispatches speech without discovering tools or injecting tool context', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    assert.equal(store.executiveProfile(agent.id).enabled, true);
    assert.deepEqual(store.executiveProfile(agent.id).modules, { speaking: true, tools: false });
    app.executiveConnections.agentCatalog = async () => { throw new Error('Speech-only defaults must not discover tools'); };
    store.executiveSkills = () => { throw new Error('Speech-only defaults must not load skills'); };
    const result = await app.message(agent.id, 'Hello.');
    assert.ok(result.execution);
    assert.ok(['say', 'ask'].includes(result.execution.action.kind));
    const world = store.world(result.cycle.worldId);
    assert.equal(world.externalCapabilities, undefined); assert.equal(world.externalSkills, undefined);
    assert.equal(world.externalSkillDocuments, undefined);
    await assert.rejects(app.message(agent.id, 'Use a skill', 'user', undefined, ['missing']), /disabled/);
  } finally { await app.close(); store.close(); }
});
