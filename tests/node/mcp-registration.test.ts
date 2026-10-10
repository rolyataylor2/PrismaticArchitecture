import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { registerAgentMcp } from '../../packages/sdk/src/mcp-registration.js';
import { parseMcpRepositoryFile, previewMcpRepository, searchMcpRegistry } from '../../packages/sdk/src/mcp-repository.js';

test('registration associates one Agent without grants or Executive activation and stale writes are atomic', () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const first = app.createAgent(); const second = app.createAgent();
    const result = registerAgentMcp(store, first.id, { expectedRegistryRevision: 0, expectedPermissionRevision: 0,
      server: { id: 'example', transport: 'http', url: 'https://example.invalid/mcp' } });
    assert.deepEqual(result.permissions.serverIds, ['example']); assert.deepEqual(result.permissions.tools, []);
    assert.equal(store.executiveProfile(first.id).enabled, false); assert.equal(store.cycles(first.id).length, 0);
    assert.deepEqual(store.mcpPermissions(second.id).tools, []); assert.equal(store.mcpPermissions(second.id).serverIds, undefined);
    assert.throws(() => registerAgentMcp(store, second.id, { expectedRegistryRevision: 1, expectedPermissionRevision: 1,
      server: { id: 'stale', transport: 'http', url: 'https://example.invalid' } }), /changed/);
    assert.equal(store.mcpRegistry().servers.length, 1);
    registerAgentMcp(store, second.id, { expectedRegistryRevision: 1, expectedPermissionRevision: 0, serverId: 'example' });
    store.saveMcpPermissions(first.id, { revision: 2, tools: [], serverIds: [] }, 1);
    assert.deepEqual(store.mcpPermissions(second.id).serverIds, ['example']); assert.equal(store.mcpRegistry().servers.length, 1);
    store.saveMcpRegistry({ revision: 2, servers: [] }, 1);
    assert.deepEqual(store.mcpPermissions(second.id).serverIds, []);
  } finally { store.close(); }
});

test('public settings parse supported declarations and replace credential values with references', () => {
  const candidates = parseMcpRepositoryFile(JSON.stringify({ mcpServers: { local: { command: 'node', args: ['server.js'], env: { KEY: 'never-retain-me' } },
    unsupported: { url: 'https://example.invalid', headers: { 'X-Key': 'secret' } } } }), 'mcp.json');
  assert.equal(candidates.length, 1); assert.equal(JSON.stringify(candidates).includes('never-retain-me'), false);
  assert.ok(candidates[0]!.server.transport === 'stdio'); assert.deepEqual(candidates[0]!.server.envSecretRefs, { KEY: 'env:KEY' });
  assert.equal(parseMcpRepositoryFile(JSON.stringify({ name: 'example', packages: [{ registryType: 'npm', identifier: 'pkg', version: '1.2.3', transport: { type: 'stdio' } }] }), 'server.json')[0]!.server.transport, 'stdio');
});

test('official Registry search uses bounded fixed-host metadata and ignores inactive entries', async () => {
  let requested = '';
  const fetcher: typeof fetch = async input => { requested = String(input); return new Response(JSON.stringify({ servers: [
    { server: { name: 'io.example/server', description: 'Example', remotes: [{ type: 'streamable-http', url: 'https://example.invalid/mcp' }] },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } } },
    { server: { name: 'deleted', remotes: [{ type: 'streamable-http', url: 'https://example.invalid' }] },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deleted' } } },
  ] })); };
  const result = await searchMcpRegistry('example & another', fetcher);
  const url = new URL(requested); assert.equal(url.hostname, 'registry.modelcontextprotocol.io'); assert.equal(url.searchParams.get('search'), 'example & another');
  assert.equal(url.searchParams.get('version'), 'latest'); assert.equal(result.candidates.length, 1);
  await assert.rejects(previewMcpRepository('http://localhost/private', fetcher), /public GitHub/);
  await assert.rejects(searchMcpRegistry('example', async () => new Response('x'.repeat(450001))), /size limit/);
});
