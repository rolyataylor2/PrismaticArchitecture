import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { McpClientManager, type McpTrace } from '../../packages/executive/src/mcp-client-manager.js';

test('real MCP progress remains attributed diagnostics and cannot establish success or reset a deadline', async () => {
  const traces: McpTrace[] = [];
  const manager = new McpClientManager(async () => '', event => traces.push(event));
  manager.register({ id: 'progress_server', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 2000 });
  const tool = { serverId: 'progress_server', toolName: 'progress' };
  manager.setAgentPermissions('agent', [tool]);
  try {
    const gateway = manager.gateway('agent', 'selected_contract', [tool]);
    const succeeded = await gateway.call(tool, {});
    assert.equal(succeeded.status, 'succeeded');
    const updates = traces.filter(event => event.phase === 'progress');
    assert.equal(updates.length, 2, JSON.stringify(updates)); assert.deepEqual(updates.map(event => event.progress!.progress), [1, 2]);
    assert.ok(updates.every(event => event.agentId === 'agent' && event.contractId === 'selected_contract' && event.id === succeeded.traceId));
    assert.equal(traces[0]!.phase, 'submitted'); assert.equal(traces.at(-1)!.phase, 'finished');
    const failed = await gateway.call(tool, { fail: true }, AbortSignal.timeout(180));
    assert.equal(failed.status, 'unverified', 'A reported 2/2 does not establish a returned result');
    assert.equal(traces.filter(event => event.phase === 'submitted').length, 2, 'Progress permits no replay');
    assert.equal(traces.filter(event => event.phase === 'progress' && event.id === failed.traceId).at(-1)!.progress!.progress, 2);
  } finally { await manager.close(); }
});

test('real stdio discovery, schema validation and scoped permission intersection', async () => {
  const traces: McpTrace[] = [];
  const manager = new McpClientManager(async () => { throw new Error('No secret'); }, event => traces.push(event));
  manager.register({ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 2000 });
  const echo = { serverId: 'local', toolName: 'echo' }; const secret = { serverId: 'local', toolName: 'secret' };
  manager.setAgentPermissions('agent', [echo, secret]);
  const gateway = manager.gateway('agent', 'contract', [echo]);
  try {
    const catalog = await gateway.catalog();
    assert.deepEqual(catalog.map(tool => tool.key), ['local/echo']);
    assert.equal(manager.health('local'), 'connected');
    assert.equal((await gateway.call(secret, {})).status, 'blocked', 'Server readOnlyHint does not grant authority');
    assert.equal((await manager.gateway('other', 'contract', [echo]).call(echo, { value: 1 })).status, 'blocked');
    assert.equal((await gateway.call(echo, { value: 'wrong' })).status, 'blocked');
    assert.equal(traces.filter(event => event.phase === 'submitted').length, 0);
    const result = await gateway.call(echo, { value: 9 });
    assert.equal(result.status, 'succeeded');
    if ('result' in result) assert.deepEqual(result.result.structuredContent, { value: 9 });
    assert.equal(traces.filter(event => event.phase === 'submitted').length, 1);
    assert.ok(traces.every(event => event.agentId === 'agent' || event.agentId === 'other'));
    manager.setAgentPermissions('agent', []);
    assert.equal((await gateway.call(echo, { value: 10 })).status, 'blocked', 'Existing gateway honors revoked permission');
    assert.deepEqual(await gateway.catalog(), []);
  } finally { await manager.close(); }
});

test('tool timeout is unverified and is never retried automatically', async () => {
  const traces: McpTrace[] = [];
  const manager = new McpClientManager(async () => '', event => traces.push(event));
  manager.register({ id: 'slow_server', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 2000 });
  const tool = { serverId: 'slow_server', toolName: 'slow' };
  manager.setAgentPermissions('agent', [tool]);
  try {
    const gateway = manager.gateway('agent', 'contract', [tool]);
    await gateway.catalog();
    assert.equal((await gateway.call(tool, {}, AbortSignal.timeout(80))).status, 'unverified');
    assert.equal(traces.filter(event => event.phase === 'submitted').length, 1);
  } finally { await manager.close(); }
});

test('real Streamable HTTP connection resolves bearer secrets and rejects malformed wire output after submission', async () => {
  const mcp = new McpServer({ name: 'http-fixture', version: '1.0.0' });
  let calls = 0;
  let corruptOutput = false;
  mcp.registerTool('echo', { inputSchema: z.object({ value: z.number() }), outputSchema: z.object({ value: z.number() }) },
    async ({ value }) => { calls++; return { content: [], structuredContent: { value } }; });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => 'fixture-session', enableJsonResponse: true });
  await mcp.connect(transport);
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer TEST_ONLY_TOKEN') { res.writeHead(401); res.end(); return; }
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const response = await transport.handleRequest(new Request(`http://127.0.0.1${req.url}`, {
        method: req.method ?? 'POST', headers, ...(chunks.length ? { body: Buffer.concat(chunks).toString() } : {}),
      }));
      let body = Buffer.from(await response.arrayBuffer());
      if (corruptOutput && response.headers.get('content-type')?.includes('application/json')) {
        const parsed = JSON.parse(body.toString());
        if (parsed.result?.structuredContent) { parsed.result.structuredContent.value = 'MALFORMED'; body = Buffer.from(JSON.stringify(parsed)); }
      }
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(body);
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const manager = new McpClientManager(async ref => { assert.equal(ref, 'test/bearer'); return 'TEST_ONLY_TOKEN'; });
  manager.register({ id: 'remote', transport: 'http', url: `http://127.0.0.1:${address.port}/mcp`, bearerSecretRef: 'test/bearer', timeoutMs: 2000 });
  const tool = { serverId: 'remote', toolName: 'echo' }; manager.setAgentPermissions('agent', [tool]);
  try {
    const gateway = manager.gateway('agent', 'contract', [tool]);
    assert.equal((await gateway.catalog()).length, 1);
    assert.equal((await gateway.call(tool, { value: 4 })).status, 'succeeded');
    assert.equal(calls, 1);
    corruptOutput = true;
    assert.equal((await gateway.call(tool, { value: 5 })).status, 'unverified', 'Bad response cannot prove a failed or completed goal');
    assert.equal(calls, 2, 'Invalid response cannot silently repeat a possibly consequential operation');
    assert.equal(JSON.stringify(manager.configurations()).includes('TEST_ONLY_TOKEN'), false);
  } finally { await manager.close(); await mcp.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('configuration rejects embedded HTTP credentials and grants do not enable unknown servers', async () => {
  const manager = new McpClientManager(async () => { throw new Error('Missing secret'); });
  assert.throws(() => manager.register({ id: 'bad', transport: 'http', url: 'https://user:password@example.invalid/mcp' }));
  assert.throws(() => manager.setAgentPermissions('agent', [{ serverId: 'unknown', toolName: 'any' }]));
  manager.register({ id: 'missing', transport: 'http', url: 'http://127.0.0.1:1/mcp', bearerSecretRef: 'absent', timeoutMs: 100 });
  const tool = { serverId: 'missing', toolName: 'echo' }; manager.setAgentPermissions('agent', [tool]);
  try {
    assert.equal((await manager.gateway('agent', 'contract', [tool]).call(tool, {})).status, 'blocked');
    assert.equal(manager.health('missing'), 'error');
  } finally { await manager.close(); }
});

test('real tool-list notifications refresh schemas and removals without granting advertised tools', async () => {
  const traces: McpTrace[] = [];
  const manager = new McpClientManager(async () => '', event => traces.push(event), 60000);
  manager.register({ id: 'dynamic', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url)), '--dynamic'], timeoutMs: 2000 });
  const echo = { serverId: 'dynamic', toolName: 'echo' };
  const change = { serverId: 'dynamic', toolName: 'change_catalog' };
  const added = { serverId: 'dynamic', toolName: 'new_tool' };
  manager.setAgentPermissions('agent', [echo, change]);
  const gateway = manager.gateway('agent', 'selected_contract', [echo, change, added]);
  try {
    assert.equal((await gateway.call(echo, { value: 9 })).status, 'succeeded');
    assert.equal((await gateway.call(change, { mode: 'schema' })).status, 'succeeded');
    const catalogs = await Promise.all([gateway.catalog(), manager.discover('dynamic')]);
    assert.equal(catalogs[0]!.some(tool => tool.toolName === 'new_tool'), false);
    assert.equal(catalogs[1]!.some(tool => tool.toolName === 'new_tool'), true);
    const before = traces.filter(event => event.phase === 'submitted').length;
    const invalid = await gateway.call(echo, { value: 9 });
    assert.equal(invalid.status, 'blocked');
    if ('code' in invalid) assert.equal(invalid.code, 'invalid_arguments');
    assert.equal(traces.filter(event => event.phase === 'submitted').length, before, 'New schema blocks before submission, rather than relying on the server error');
    assert.equal((await gateway.call(added, {})).status, 'blocked', 'New advertisement never extends grants');
    assert.equal((await gateway.call(echo, { value: 100 })).status, 'succeeded');
    assert.equal((await gateway.call(change, { mode: 'remove' })).status, 'succeeded');
    assert.equal((await gateway.catalog()).some(tool => tool.toolName === 'echo'), false);
    const removed = await gateway.call(echo, { value: 100 });
    assert.equal(removed.status, 'blocked');
    if ('code' in removed) assert.equal(removed.code, 'unavailable');
  } finally { await manager.close(); }
});
