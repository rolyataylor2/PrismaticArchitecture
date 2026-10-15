import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { api } from '../../packages/sdk/src/api.js';

test('provider connections retain independent encrypted keys, route generation and images and remove only the selected provider', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-providers-'));
  const path = join(directory, 'agents.sqlite'); const vault = new SecretVault(join(directory, 'vault'));
  let store = new SqliteStore(path); let app = new Application(store, undefined, undefined, undefined, vault);
  const originalFetch = globalThis.fetch;
  try {
    const agent = app.createAgent('Providers'); const other = app.createAgent('Isolated');
    const route = `/api/agents/${agent.id}`;
    const keys = { openai: 'openai-provider-test-secret', xai: 'xai-provider-test-secret', jev: 'jev-provider-test-secret', cloudflare: 'cloudflare-provider-test-secret' };
    for (const [provider, apiKey] of Object.entries(keys)) {
      const result = await api(app, 'POST', `${route}/providers`, { provider, apiKey, ...(provider === 'cloudflare' ? { accountId: 'a'.repeat(32) } : {}) });
      assert.equal(JSON.stringify(result).includes(apiKey), false);
      assert.equal(vault.decrypt(store.agentProviderConnections(agent.id).find(item => item.provider === provider)!.encryptedApiKey), apiKey);
    }
    assert.equal(store.agentProviderConnections(other.id).length, 0);
    await assert.rejects(api(app, 'POST', `${route}/providers`, { provider: 'unknown', apiKey: 'test' }));
    await assert.rejects(api(app, 'POST', `${route}/providers`, { provider: 'openai', apiKey: 'bad key' }));
    await api(app, 'PATCH', `${route}/settings`, { model: 'gpt-4.1-mini' });
    await api(app, 'PATCH', `${route}/settings`, { model: 'grok-4.3' });
    await api(app, 'PATCH', `${route}/classifier-settings`, { model: 'jev-latest' });
    assert.equal(app.agentClassifierSettings(agent.id).hasAgentKey, true);
    assert.equal(store.agentImageSettings(agent.id)!.accountId, 'a'.repeat(32));
    await assert.rejects(api(app, 'POST', `${route}/providers`, { provider: 'cloudflare', apiKey: 'test-key' }), /Account ID is required/);
    assert.equal(store.agentImageSettings(agent.id)!.accountId, 'a'.repeat(32));
    globalThis.fetch = async (url, init) => {
      const headers = init!.headers as Record<string, string>;
      if (String(url).includes('cloudflare.com')) {
        assert.equal(headers.Authorization, `Bearer ${keys.cloudflare}`);
        return Response.json({ success: true, result: { image: 'YWJj' } });
      }
      assert.equal(String(url), 'https://api.x.ai/v1/responses');
      assert.equal(headers.Authorization, `Bearer ${keys.xai}`);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: { text: 'draft' } }) }] }] });
    };
    assert.deepEqual(await app.identityAuthoringProvider(agent.id).author(z.object({ text: z.string() }), 'Write a draft'), { text: 'draft' });
    assert.equal((await app.generateAgentImage(agent.id, 'Portrait')).avatar, 'data:image/jpeg;base64,YWJj');
    for (const secret of Object.values(keys)) assert.equal(readFileSync(path, 'utf8').includes(secret), false);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store, undefined, undefined, undefined, vault);
    assert.equal(store.agentProviderConnections(agent.id).length, 4);
    await api(app, 'DELETE', `${route}/providers/xai`, {});
    assert.equal(store.agentProviderConnections(agent.id).length, 3);
    assert.equal(store.agentProviderSettings(agent.id)!.model, 'grok-4.3');
    await api(app, 'PATCH', `${route}/settings`, { model: 'gpt-4.1-mini' });
    assert.equal(app.agentInferenceSettings(agent.id).hasUsableKey, true);
    const branchId = 'agent_provider_branch'; store.branchAgent(agent.id, branchId);
    assert.equal(store.agentProviderConnections(branchId).length, 3);
    store.deleteAgent(branchId); assert.throws(() => store.agentProviderConnections(branchId));
    assert.equal(store.agentProviderConnections(agent.id).length, 3);
  } finally {
    globalThis.fetch = originalFetch; await app.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
