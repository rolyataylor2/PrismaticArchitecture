import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { factualWorld } from '../../packages/core/src/experienced.js';
import { ExternalCapabilitiesSchema, isLegacyCapabilityFact } from '../../packages/core/src/mcp-configuration.js';

test('large current capability catalogs remain one immutable snapshot field without factual accumulation', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url)), '--many'], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  const tools = Array.from({ length: 60 }, (_, index) => ({ serverId: 'local', toolName: `catalog_${index}` }));
  store.saveMcpPermissions(agent.id, { revision: 1, tools }, 0);
  try {
    const first = await app.message(agent.id, 'Hello.', 'user', 'thread');
    const world = store.world(first.cycle.worldId);
    assert.equal(world.externalCapabilities?.tools.length, 60, 'Catalog size cannot trip the 50 incoming-fact limit');
    assert.equal(world.externalCapabilities?.permissionRevision, 1);
    assert.ok(Object.isFrozen(world.externalCapabilities?.tools));
    assert.equal(world.facts.filter(fact => fact.originCycleId === first.cycle.id).length, 1);
    const before = structuredClone(world);
    for (let index = 0; index < 3; index++) {
      const result = await app.message(agent.id, `Follow-up ${index}.`, 'user', 'thread');
      const current = store.world(result.cycle.worldId);
      assert.equal(current.externalCapabilities?.tools.length, 60);
      assert.equal(current.facts.some(fact => fact.text.includes('Capability fixture')), false);
      assert.equal(factualWorld(current).externalCapabilities, undefined, 'Schemas cannot become prediction outcome evidence');
    }
    store.saveMcpPermissions(agent.id, { revision: 2, tools: [tools[0]!] }, 1);
    const changed = await app.message(agent.id, 'Changed permissions.', 'user', 'thread');
    assert.deepEqual(store.world(changed.cycle.worldId).externalCapabilities?.tools.map(tool => tool.toolName), ['catalog_0']);
    store.saveMcpPermissions(agent.id, { revision: 3, tools: [] }, 2);
    const revoked = await app.message(agent.id, 'Permissions revoked.', 'user', 'thread');
    assert.equal(store.world(revoked.cycle.worldId).externalCapabilities, undefined);
    assert.deepEqual(store.world(first.cycle.worldId), before, 'Revocation never rewrites earlier capability snapshots');
    assert.equal(store.recentFacts(agent.id, null, 'thread').some(fact => fact.text.includes('Capability fixture')), false);
  } finally { await app.executiveConnections.close(); store.close(); }
});

test('unavailable capability metadata is explicit and legacy generated records are projected out without changing history', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent();
  try {
    const legacy = { source: 'External capabilities', kind: 'observes' as const,
      text: 'Available permitted tool: {"serverId":"old","toolName":"echo"}', referenceId: null, timestamp: null };
    const first = await app.runtime.run(agent.id, [legacy, { ...legacy, source: 'user', kind: 'says', text: 'Hello.' }], 'thread');
    const snapshot = structuredClone(store.world(first.cycle.worldId));
    assert.ok(snapshot.facts.some(fact => fact.text === legacy.text));
    assert.equal(store.recentFacts(agent.id, null, 'thread').some(isLegacyCapabilityFact), false);
    assert.equal(factualWorld(snapshot).facts.some(isLegacyCapabilityFact), false);
    assert.equal(isLegacyCapabilityFact({ ...legacy, source: 'user' }), false, 'Ordinary testimony is not silently removed');
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'missing', transport: 'http', url: 'http://127.0.0.1:1/mcp',
      timeoutMs: 100, bearerSecretRef: 'missing/reference' }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'missing', toolName: 'echo' }] }, 0);
    const second = await app.message(agent.id, 'Still here.', 'user', 'thread');
    const world = store.world(second.cycle.worldId);
    assert.deepEqual(world.externalCapabilities, { status: 'unavailable', permissionRevision: 1, tools: [] });
    assert.equal(world.facts.some(isLegacyCapabilityFact), false);
    assert.deepEqual(store.world(first.cycle.worldId), snapshot);
    assert.equal(ExternalCapabilitiesSchema.safeParse({ status: 'unavailable', permissionRevision: 1,
      tools: [{ serverId: 'missing', toolName: 'echo', key: 'missing/echo', description: '', inputSchema: {} }] }).success, false);
  } finally { await app.executiveConnections.close(); store.close(); }
});
