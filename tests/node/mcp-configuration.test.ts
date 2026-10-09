import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import type { McpRegistry } from '../../packages/core/src/mcp-configuration.js';

test('durable registry and isolated permissions preserve history, reject stale writes and revoke removed servers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-config-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const first = app.createAgent(); const second = app.createAgent();
    const registry = await api(app, 'PUT', '/api/mcp-servers', { expectedRevision: 0,
      servers: [{ id: 'remote', transport: 'http', url: 'https://example.invalid/mcp', bearerSecretRef: 'env:MCP_TEST_KEY' }] }) as McpRegistry;
    assert.equal(registry.revision, 1);
    assert.equal(app.store.mcpPermissions(first.id).revision, 0);
    await api(app, 'PUT', `/api/agents/${first.id}/mcp-permissions`, { expectedRevision: 0, tools: [{ serverId: 'remote', toolName: 'echo' }] });
    assert.deepEqual(store.mcpPermissions(second.id).tools, []);
    await assert.rejects(api(app, 'PUT', '/api/mcp-servers', { expectedRevision: 0, servers: [] }), /changed/);
    await assert.rejects(api(app, 'PUT', `/api/agents/${first.id}/mcp-permissions`, { expectedRevision: 0, tools: [] }), /changed/);
    await assert.rejects(api(app, 'PUT', `/api/agents/${second.id}/mcp-permissions`, { expectedRevision: 0, tools: [{ serverId: 'unknown', toolName: 'echo' }] }), /unregistered/);
    assert.equal(store.mcpPermissionsHistory(second.id).length, 0, 'Rejected write does not append history');
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.mcpRegistry(), { revision: 1, servers: registry.servers });
    assert.equal(store.mcpPermissions(first.id).tools[0]!.toolName, 'echo');
    store.saveMcpRegistry({ revision: 2, servers: [] }, 1);
    assert.deepEqual(store.mcpPermissions(first.id), { revision: 2, tools: [] });
    assert.equal(store.mcpPermissionsHistory(first.id)[1]!.tools.length, 1, 'Revocation preserves previous grants');
    store.saveMcpRegistry({ revision: 3, servers: registry.servers }, 2);
    assert.deepEqual(store.mcpPermissions(first.id).tools, [], 'Re-registering a server cannot resurrect revoked authority');
    const db = new DatabaseSync(path);
    try {
      assert.throws(() => db.exec('UPDATE mcp_registry_history SET body=body'), /immutable/);
      assert.throws(() => db.exec('DELETE FROM mcp_permissions_history'), /immutable/);
    } finally { db.close(); }
    store.deleteAgent(first.id);
    assert.equal(store.mcpRegistryHistory().length, 4, 'Deleting one Agent preserves shared registry');
    assert.deepEqual(store.mcpPermissions(second.id).tools, []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('application capability discovery uses real stdio and observes edits from another Application', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const other = new Application(store);
  const agent = app.createAgent();
  try {
    await api(app, 'PUT', '/api/mcp-servers', { expectedRevision: 0, servers: [{ id: 'local', transport: 'stdio',
      command: process.execPath, args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000 }] });
    const tools = await api(app, 'POST', '/api/mcp-servers/local/discover', {}) as { toolName: string }[];
    assert.ok(tools.some(tool => tool.toolName === 'echo'));
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/mcp-tools`), { revision: 0, tools: [] });
    await api(other, 'PUT', `/api/agents/${agent.id}/mcp-permissions`, { expectedRevision: 0, tools: [{ serverId: 'local', toolName: 'echo' }] });
    const catalog = await api(app, 'GET', `/api/agents/${agent.id}/mcp-tools`) as { tools: { toolName: string }[] };
    assert.deepEqual(catalog.tools.map(tool => tool.toolName), ['echo']);
    await api(other, 'PUT', '/api/mcp-servers', { expectedRevision: 1, servers: [] });
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/mcp-tools`), { revision: 2, tools: [] });
    assert.equal(store.cycles(agent.id).length, 0, 'Capability administration never invokes cognition');
  } finally { await Promise.all([app.executiveConnections.close(), other.executiveConnections.close()]); store.close(); }
});
