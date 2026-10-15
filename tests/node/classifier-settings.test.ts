import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { api } from '../../packages/sdk/src/api.js';
import { partActivationCriteria } from '../../packages/core/src/primitives.js';

test('JEV classifier settings encrypt keys, route owning-Agent calls, preserve provenance and survive restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-classifier-'));
  const database = join(directory, 'agents.sqlite');
  const vault = new SecretVault(join(directory, 'vault'));
  let store = new SqliteStore(database); let app = new Application(store, undefined, undefined, undefined, vault);
  const originalFetch = globalThis.fetch;
  const oldJev = process.env.JEV_API_KEY; const oldTypesafe = process.env.TYPESAFE_API_KEY;
  delete process.env.JEV_API_KEY; delete process.env.TYPESAFE_API_KEY;
  try {
    const agent = app.createAgent('Classifier'); const other = app.createAgent('Unchanged');
    const result = await app.message(agent.id, 'A bird chirps.');
    const world = store.world(result.cycle.worldId);
    const route = `/api/agents/${agent.id}/classifier-settings`;
    const secret = 'jev-classifier-private-test-key';
    await assert.rejects(api(app, 'PATCH', route, { model: 'jev-latest' }), /Add a JEV API key/);
    await assert.rejects(api(app, 'PATCH', route, { model: ' ', apiKey: secret }));
    const saved = await api(app, 'PATCH', route, { model: 'jev-test-model', apiKey: secret });
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal(vault.decrypt(store.agentClassifierSettings(agent.id)!.encryptedApiKey!), secret);
    assert.equal(readFileSync(database, 'utf8').includes(secret), false);
    const encrypted = store.agentClassifierSettings(agent.id)!.encryptedApiKey;
    await api(app, 'PATCH', route, { model: 'jev-test-model' });
    assert.equal(store.agentClassifierSettings(agent.id)!.encryptedApiKey, encrypted);
    assert.equal(store.agentProviderSettings(agent.id), null, 'classifier settings do not modify generative settings');
    assert.match(app.providers.decisions.labelForAgent!(other.id), /mock/);
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.typesafe.ai/v1/systemone');
      assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, 'jev-test-model');
      assert.ok(body.state.includes(world.id));
      return Response.json({ answers: { candidate: { type: 'score', score: 3, confidence: 1,
        legend: Object.fromEntries(partActivationCriteria.map((name, index) => [String(index), name])),
        probabilities: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0 } } } });
    };
    const scores = await app.providers.decisions.judge!({ task: 'disposition_activation', agentId: agent.id, world,
      candidates: [{ id: 'candidate', question: 'Is this relevant?', context: {} }] });
    assert.equal(scores[0]!.score, 3); assert.equal(calls, 1);
    assert.ok(store.eventsByType(agent.id, ['provider.operation']).some(event => event.type === 'provider.operation'
      && event.payload.phase === 'returned' && event.payload.provider === 'jev/jev-test-model'));
    await app.close(); store.close(); store = new SqliteStore(database); app = new Application(store, undefined, undefined, undefined, vault);
    assert.equal(app.agentClassifierSettings(agent.id).provider, 'jev/jev-test-model');
    const branch = 'agent_classifier_branch'; store.branchAgent(agent.id, branch);
    assert.equal(store.agentClassifierSettings(branch)!.encryptedApiKey, encrypted);
    store.deleteAgent(branch); assert.throws(() => store.agentClassifierSettings(branch));
    await assert.rejects(api(app, 'PATCH', route, { model: 'jev-test-model', clearApiKey: true }), /Add a JEV API key/);
    process.env.TYPESAFE_API_KEY = 'server-test-classifier-key';
    await api(app, 'PATCH', route, { model: 'jev-test-model', clearApiKey: true });
    assert.equal(store.agentClassifierSettings(agent.id)!.encryptedApiKey, null);
    const reset = await api(app, 'DELETE', route, {}) as { usesServerProvider: boolean };
    assert.equal(reset.usesServerProvider, true);
    assert.equal(store.agentClassifierSettings(agent.id), undefined);
    assert.match(app.providers.decisions.labelForAgent!(agent.id), /mock/);
    assert.equal(store.agentClassifierSettings(other.id), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldJev === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = oldJev;
    if (oldTypesafe === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = oldTypesafe;
    await app.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
