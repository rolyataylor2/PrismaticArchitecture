import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultExecutiveProfile, type ExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';
import type { ActionBid, SelfContext } from '../../packages/core/src/domain.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';

test('explicit profile copy preserves both histories and isolation, rejecting stale source and target revisions', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent('Source'); const target = app.createAgent('Target');
    const identity = structuredClone(store.get('identity', target.id));
    const configured = { ...defaultExecutiveProfile(), revision: 1, modules: { speaking: true, tools: false }, executionMode: 'background' as const };
    store.saveExecutiveProfile(source.id, configured, 0);
    const path = `/api/agents/${target.id}/executive-profile/copy`;
    const input = { sourceAgentId: source.id, sourceRevision: 1, expectedRevision: 0, reason: 'Reuse explicit external settings' };
    await assert.rejects(api(app, 'POST', path, { ...input, sourceRevision: 0 }), /changed/);
    assert.equal(store.executiveProfile(target.id).revision, 0);
    const copied = await api(app, 'POST', path, input);
    assert.deepEqual(copied, configured);
    assert.deepEqual(store.executiveProfile(source.id), configured);
    assert.equal(store.executiveProfileHistory(target.id).length, 2);
    assert.equal(store.eventsByType(target.id, ['executive.profile_copied']).length, 1);
    assert.deepEqual(store.get('identity', target.id), identity);
    assert.deepEqual(store.mcpPermissions(target.id).tools, []);
    assert.deepEqual(store.executiveSkills(target.id), []);
    assert.deepEqual(store.executions(target.id), []); assert.equal(store.cycles(target.id).length, 0);
    await assert.rejects(api(app, 'POST', path, input), /changed/);
    await assert.rejects(api(app, 'POST', path, { ...input, sourceAgentId: target.id, expectedRevision: 1 }), /different Agents/);
    assert.equal(store.eventsByType(target.id, ['executive.profile_copied']).length, 1);
  } finally { await app.close(); store.close(); }
});

test('external profiles survive restart, preserve immutable history and isolate Agents without psychological changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-profile-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    let app = new Application(store); const first = app.createAgent(); const second = app.createAgent();
    const identity = structuredClone(store.get('identity', first.id));
    const { revision, ...settings } = defaultExecutiveProfile();
    const saved = await api(app, 'PUT', `/api/agents/${first.id}/executive-profile`, {
      ...settings, expectedRevision: revision, limits: { ...settings.limits, maxSteps: 3 }, learningMode: 'disabled',
    }) as ExecutiveProfile;
    assert.equal(saved.revision, 1); assert.equal(saved.limits.maxSteps, 3);
    assert.equal(store.executiveProfile(second.id).revision, 0);
    await assert.rejects(api(app, 'PUT', `/api/agents/${first.id}/executive-profile`, { ...settings, expectedRevision: 0 }), /changed/);
    await assert.rejects(api(app, 'PUT', `/api/agents/${first.id}/executive-profile`, { ...settings, expectedRevision: 1, runtime: 'openclaw' }));
    await assert.rejects(api(app, 'PUT', `/api/agents/${first.id}/executive-profile`, { ...settings, expectedRevision: 1,
      sensitivity: { ...settings.sensitivity, novelty: { ...settings.sensitivity.novelty, threshold: 1 } } }));
    assert.equal(store.executiveProfileHistory(first.id).length, 2);
    assert.deepEqual(store.get('identity', first.id), identity); assert.equal(store.cycles(first.id).length, 0);
    store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(store.executiveProfile(first.id), saved);
    const history = await api(app, 'GET', `/api/agents/${first.id}/executive-profile/history`) as ExecutiveProfile[];
    const { revision: oldRevision, ...restored } = history[0]!;
    assert.equal(oldRevision, 0);
    await api(app, 'PUT', `/api/agents/${first.id}/executive-profile`, { ...restored, expectedRevision: 1 });
    assert.equal(store.executiveProfile(first.id).revision, 2);
    assert.equal(store.executiveProfileHistory(first.id)[1]!.limits.maxSteps, 3, 'Restoration appends rather than rewriting');
    const db = new DatabaseSync(path);
    try {
      assert.throws(() => db.exec('UPDATE executive_profile_history SET revision=99'), /immutable/);
      assert.throws(() => db.exec('DELETE FROM executive_profile_history'), /immutable/);
    } finally { db.close(); }
    store.deleteAgent(first.id);
    assert.throws(() => store.executiveProfile(first.id));
    assert.deepEqual(store.executiveProfile(second.id), defaultExecutiveProfile());
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

const selected: ActionBid = { id: 'bid', partId: 'part', action: { kind: 'operate', text: 'Run explicit fixture strategy',
  operation: { successCriteria: 'The separate check returns true', constraints: [],
    steps: [{ serverId: 'fixture', toolName: 'act', argumentsJson: '{}' }],
    verification: { serverId: 'fixture', toolName: 'check', argumentsJson: '{}', path: ['done'], expectedJson: 'true' } } },
  argument: 'Plumbing fixture', identityFit: [], executionOrder: [] };

test('schema 21 upgrades without altering existing registry, grants or Agent identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-upgrade-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const agent = new Application(store).createAgent(); const identity = store.get('identity', agent.id);
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'fixture', transport: 'http', url: 'https://example.invalid/mcp', timeoutMs: 1000 }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'fixture', toolName: 'act' }] }, 0);
    const registry = store.mcpRegistry(); const permissions = store.mcpPermissions(agent.id);
    store.close();
    const db = new DatabaseSync(path);
    try { db.exec('DROP TABLE executive_skill_history; DROP TABLE executive_skills; DROP TABLE executive_profile_history; DROP TABLE executive_profiles; PRAGMA user_version=21;'); }
    finally { db.close(); }
    store = new SqliteStore(path);
    assert.deepEqual(store.executiveProfile(agent.id), defaultExecutiveProfile());
    assert.deepEqual(store.mcpRegistry(), registry); assert.deepEqual(store.mcpPermissions(agent.id), permissions);
    assert.deepEqual(store.get('identity', agent.id), identity);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('handoffs capture profile settings immutably while exact strategies retain narrower authority', () => {
  const profile = defaultExecutiveProfile(); profile.revision = 4; profile.limits.maxSteps = 1;
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [selected], predictions: [], profile });
  profile.limits.maxSteps = 50; profile.sensitivity.novelty.threshold = 0.8;
  assert.equal(contract.profileRevision, 4); assert.equal(contract.limits.maxSteps, 1);
  assert.equal(contract.sensitivity?.novelty.threshold, 0.5);
  assert.equal(contract.authority.allowEquivalentMethods, false);
  assert.throws(() => { contract.limits.maxSteps = 50; });
});

test('normal cognitive handoff uses durable profile budgets before any tool submission', async () => {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.proposal = { action: selected.action, argument: 'Prescribed plumbing fixture, not model observation', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false); assert.equal('executiveProfile' in context, false);
      const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid;
      assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const profile = defaultExecutiveProfile();
    profile.enabled = true; profile.revision = 1; profile.limits.maxSteps = 1; profile.sensitivity.drift.threshold = 0.7;
    store.saveExecutiveProfile(agent.id, profile, 0);
    const result = await app.message(agent.id, 'Run the selected strategy.');
    assert.equal(result.execution?.status, 'blocked'); assert.equal(result.execution?.operational?.attempts, 0);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
    const event = store.eventsByType(agent.id, ['execution.contract'], [result.cycle.id])[0]!;
    assert.ok(event.type === 'execution.contract');
    assert.equal(event.payload.profileRevision, 1); assert.equal(event.payload.limits.maxSteps, 1);
    assert.equal(event.payload.sensitivity?.drift.threshold, 0.7);
    assert.equal(result.execution?.operational?.diagnostics?.reactions[0]?.response, 'request_guidance');
  } finally { await app.executiveConnections.close(); store.close(); }
});
