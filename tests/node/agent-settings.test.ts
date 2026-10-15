import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { AgentReasoningProvider } from '../../packages/providers/src/agent-reasoning.js';
import { Application } from './persistent-fixture.js';
import { api } from '../../packages/sdk/src/api.js';

test('Agent settings save a private model and encrypted API key without exposing the secret', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-agent-settings-'));
  const store = new SqliteStore(join(directory, 'agents.sqlite'));
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault.key')));
    const first = app.createAgent('First'); const second = app.createAgent('Second');
    const secret = 'sk-test-agent-key-plaintext-never-store';
    assert.equal((await api(app, 'GET', `/api/agents/${first.id}/settings`) as { hasUsableKey: boolean }).hasUsableKey, false);
    const saved = await api(app, 'PATCH', `/api/agents/${first.id}/settings`, { model: 'gpt-5-nano', apiKey: secret }) as Record<string, unknown>;
    assert.equal(saved.model, 'gpt-5-nano'); assert.equal(saved.hasAgentKey, true); assert.equal('apiKey' in saved, false);
    const routing = app.providers.reasoning as AgentReasoningProvider;
    assert.equal(routing.labelForAgent(first.id), 'openai/gpt-5-nano');
    assert.equal(routing.labelForAgent(second.id), 'deterministic/mock-reasoning-v1');
    assert.equal((await api(app, 'GET', `/api/agents/${second.id}/settings`) as { model: string }).model, 'gpt-4.1-nano');
    const stored = store.agentProviderSettings(first.id)!;
    assert.notEqual(stored.encryptedApiKey, secret);
    assert.equal(new SecretVault(join(directory, 'vault.key')).decrypt(stored.encryptedApiKey!), secret);
    const serializedDatabase = readFileSync(join(directory, 'agents.sqlite'), 'utf8');
    assert.equal(serializedDatabase.includes(secret), false);
    await api(app, 'PATCH', `/api/agents/${first.id}/settings`, { model: 'gpt-4.1-nano' });
    assert.equal(store.agentProviderSettings(first.id)?.encryptedApiKey, stored.encryptedApiKey, 'blank key keeps the saved Agent key');
    const nonReasoning = await api(app, 'PATCH', `/api/agents/${first.id}/settings`, { model: 'gpt-4.1-mini' }) as { model: string; availableModels: { id: string }[] };
    assert.equal(nonReasoning.model, 'gpt-4.1-mini');
    assert.ok(nonReasoning.availableModels.some(model => model.id === 'gpt-4.1-mini'));
    assert.equal(routing.labelForAgent(first.id), 'openai/gpt-4.1-mini');
    assert.equal(store.agentProviderSettings(first.id)?.encryptedApiKey, stored.encryptedApiKey);
    process.env.OPENAI_API_KEY = 'server-fallback-test-key';
    await api(app, 'PATCH', `/api/agents/${first.id}/settings`, { model: 'gpt-5-nano', clearApiKey: true });
    assert.equal(store.agentProviderSettings(first.id)?.encryptedApiKey, null);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/settings`, { model: 'gpt-4.1', apiKey: secret }), /supported/);
    assert.equal(store.get('agent', second.id).name, 'Second');
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original;
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test('Secret vault uses authenticated encryption and detects tampering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-vault-'));
  try {
    const vault = new SecretVault(join(directory, 'key'));
    const encrypted = vault.encrypt('secret API key');
    assert.notEqual(encrypted, 'secret API key');
    assert.equal(vault.decrypt(encrypted), 'secret API key');
    const pieces = encrypted.split('.'); pieces[2] = `${pieces[2]}x`;
    assert.throws(() => vault.decrypt(pieces.join('.')));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('activation settings are validated, isolated per Agent, and survive restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-activation-'));
  const path = join(directory, 'agents.sqlite');
  let store = new SqliteStore(path);
  try {
    let app = new Application(store);
    const first = app.createAgent(); const second = app.createAgent();
    assert.deepEqual(await api(app, 'GET', `/api/agents/${first.id}/activation-settings`), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: true, reevaluateAfterDeliberation: false, primitivesFirst: false });
    assert.deepEqual(await api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: false }), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: false, reevaluateAfterDeliberation: false, primitivesFirst: false });
    assert.deepEqual(app.agentActivationSettings(second.id), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: true, reevaluateAfterDeliberation: false, primitivesFirst: false });
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: 'false' }));
    await assert.rejects(api(app, 'PATCH', '/api/agents/missing/activation-settings', { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: false }));
    await api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { reevaluateAfterDeliberation: true, primitivesFirst: true });
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { reevaluateAfterDeliberation: 'true' }));
    await api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { primitivesFirst: true });
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { primitivesFirst: 'true' }));
    store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(app.agentActivationSettings(first.id), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: false, reevaluateAfterDeliberation: true, primitivesFirst: true });
    assert.deepEqual(app.agentActivationSettings(second.id), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: true, reevaluateAfterDeliberation: false, primitivesFirst: false });
    await api(app, 'PATCH', `/api/agents/${first.id}/activation-settings`, { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: true });
    assert.deepEqual(app.agentActivationSettings(first.id), { includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1, memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: true, reevaluateAfterDeliberation: true, primitivesFirst: true });
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('Agent deletion survives restart, preserves other Agents, and blocks active work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-delete-'));
  const path = join(directory, 'agents.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store);
    const first = app.createAgent('Delete me'); const second = app.createAgent('Keep me');
    const cycle = store.startCycle(first.id);
    await assert.rejects(api(app, 'DELETE', `/api/agents/${first.id}`, {}), /active Agent work/);
    assert.equal(store.get('agent', first.id).name, 'Delete me');
    store.saveCycle({ ...cycle, status: 'failed', error: 'Stopped for deletion test' });
    store.saveAgentProviderSettings(first.id, { model: 'gpt-5-nano', encryptedApiKey: 'encrypted-test-key' });
    assert.deepEqual(await api(app, 'DELETE', `/api/agents/${first.id}`, {}), { deleted: true });
    assert.throws(() => store.agentProviderSettings(first.id), /not found/);
    assert.deepEqual(store.list('agent').map(agent => agent.id), [second.id]);
    assert.throws(() => store.get('agent', first.id), /not found/);
    assert.deepEqual(store.versions('agent', first.id), []);
    assert.deepEqual(store.cycles(first.id), []);
    assert.deepEqual(store.list('part', first.id), []);
    assert.throws(() => store.startCycle(first.id), /not found/);
    store.close();
    const database = new DatabaseSync(path);
    try {
      for (const table of ['entities', 'versions', 'worlds', 'cycles', 'events', 'executions', 'consolidations', 'experiments', 'cycle_threads', 'agent_provider_settings', 'agent_activation_settings', 'identity_authoring_settings', 'primitive_settings', 'primitive_settings_history', 'prompt_overrides', 'deleted_agents']) {
        const column = table === 'versions' ? "json_extract(body, '$.agentId')" : 'agent_id';
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(first.id)!.n, 0, table);
      }
      assert.throws(() => database.prepare("DELETE FROM versions WHERE kind = 'agent' AND id = ?").run(second.id), /immutable/);
    } finally { database.close(); }
    store = new SqliteStore(path);
    assert.deepEqual(store.list('agent').map(agent => agent.id), [second.id]);
    assert.throws(() => store.get('agent', first.id), /not found/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});


test('provider changes require the correct credential and preserve routing after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-xai-settings-'));
  const path = join(directory, 'agents.sqlite');
  let store = new SqliteStore(path);
  const vault = new SecretVault(join(directory, 'vault.key'));
  try {
    let app = new Application(store, undefined, undefined, undefined, vault);
    const agent = app.createAgent('Provider comparison');
    app.updateAgentInferenceSettings(agent.id, { model: 'gpt-4.1-mini', apiKey: 'openai-test-secret-only' });
    assert.throws(() => app.updateAgentInferenceSettings(agent.id, { model: 'grok-4.3' }), /Changing provider requires/);
    assert.equal(store.agentProviderSettings(agent.id)?.model, 'gpt-4.1-mini');
    app.updateAgentInferenceSettings(agent.id, { model: 'grok-4.3', apiKey: 'xai-test-secret-only' });
    assert.equal((app.providers.reasoning as AgentReasoningProvider).labelForAgent(agent.id), 'xai/grok-4.3');
    store.close(); store = new SqliteStore(path);
    app = new Application(store, undefined, undefined, undefined, vault);
    assert.equal(app.agentInferenceSettings(agent.id).model, 'grok-4.3');
    assert.equal((app.providers.reasoning as AgentReasoningProvider).labelForAgent(agent.id), 'xai/grok-4.3');
    assert.throws(() => app.updateAgentInferenceSettings(agent.id, { model: 'gpt-4.1-mini' }), /Changing provider requires/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
