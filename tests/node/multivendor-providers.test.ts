import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CompatibleChatProvider, validateQwenBaseUrl } from '../../packages/providers/src/compatible-chat.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { api } from '../../packages/sdk/src/api.js';
import type { UsageObserver } from '../../packages/providers/src/openai.js';
import { modelProvider } from '../../packages/core/src/generative-models.js';
import { configuredProviders } from '../../packages/providers/src/config.js';

const completion = (result: unknown) => Response.json({ model: 'reported-model', provider: 'Reported backend',
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ result }) } }],
  usage: { prompt_tokens: 15, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } } });
for (const service of ['gemini', 'qwen', 'openrouter'] as const) {
  test(`${service} requests isolated validated JSON with the correct endpoint, key and usage`, async () => {
    const usage: Parameters<UsageObserver>[0][] = [];
    const model = service === 'gemini' ? 'gemini-2.5-flash-lite' : service === 'qwen' ? 'qwen-flash' : 'qwen/qwen3.6-flash';
    const provider = new CompatibleChatProvider(service, `${service}-test-secret`, model, async (url, init) => {
      assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${service}-test-secret`);
      assert.equal(String(url), service === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : service === 'qwen' ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions');
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, model); assert.equal(body.previous_response_id, undefined); assert.equal(body.conversation, undefined);
      assert.equal(body.response_format.type, service === 'qwen' ? 'json_object' : 'json_schema');
      if (service === 'qwen') { assert.equal(body.enable_thinking, false); assert.ok(body.messages[0].content.includes('JSON schema')); }
      if (service === 'openrouter') assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false });
      return completion({ difficulty: 'simple', uncertainty: 'low', urgency: 'routine', reason: 'Transport fixture' });
    }, undefined, record => usage.push(record));
    const result = await provider.constructed({ task: 'thought_resources', agentId: 'agent', dispositions: [], dispositionBindings: [], memories: [], workingParts: [], predictions: [] });
    assert.equal((result as { difficulty: string }).difficulty, 'simple');
    assert.equal(usage[0]!.usage.provider, `${service}/${model}`);
    assert.equal(usage[0]!.usage.servingProvider, 'Reported backend'); assert.equal(usage[0]!.usage.actualModel, 'reported-model');
    assert.equal(usage[0]!.usage.cachedInputTokens, 4);
  });
}

test('chat adapters reject truncation, refusal, malformed output and vendor errors without retaining secrets', async () => {
  for (const response of [
    () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"result":{"text":"partial"}}' } }] }),
    () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'Declined' } }] }),
    () => completion({ wrong: true }),
    () => new Response('sensitive vendor details', { status: 401 }),
  ]) {
    const provider = new CompatibleChatProvider('openrouter', 'private-test-key', 'google/gemini-2.5-flash-lite', async () => response());
    await assert.rejects(provider.author(z.strictObject({ text: z.string() }), 'Write'), error => {
      assert.equal(String(error).includes('private-test-key'), false); assert.equal(String(error).includes('sensitive vendor'), false); return true;
    });
  }
  assert.throws(() => validateQwenBaseUrl('https://example.com/compatible-mode/v1'));
  assert.throws(() => validateQwenBaseUrl('https://dashscope-intl.aliyuncs.com.evil.test/compatible-mode/v1'));
  assert.throws(() => modelProvider('openrouter:openrouter/auto'));
  assert.throws(() => modelProvider('openrouter:google/example:batch'));
});

test('new providers persist independently, drive authoring and runtime routing, and catalog filters incompatible models', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-multivendor-')); const path = join(directory, 'agents.sqlite');
  const vault = new SecretVault(join(directory, 'vault'));
  let store = new SqliteStore(path); let app = new Application(store, undefined, undefined, undefined, vault);
  const originalFetch = globalThis.fetch;
  try {
    const agent = app.createAgent(); const route = `/api/agents/${agent.id}`;
    const endpoint = 'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    for (const provider of ['gemini', 'qwen', 'openrouter'])
      await api(app, 'POST', `${route}/providers`, { provider, apiKey: `${provider}-private-test-key`, ...(provider === 'qwen' ? { baseUrl: endpoint } : {}) });
    const requests: { model: string; url: string; key: string }[] = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/models')) return Response.json({ data: [
        { id: 'qwen/example', name: 'Compatible', supported_parameters: ['structured_outputs'], architecture: { output_modalities: ['text'] } },
        { id: 'google/no-schema', name: 'No schema', supported_parameters: ['response_format'], architecture: { output_modalities: ['text'] } },
        { id: 'google/batch:batch', name: 'Batch only', supported_parameters: ['structured_outputs'], architecture: { output_modalities: ['text'] } },
      ] });
      const body = JSON.parse(init!.body as string); requests.push({ model: body.model, url: String(url), key: (init!.headers as Record<string, string>).Authorization! });
      return completion({ text: 'Draft' });
    };
    for (const [model, service] of [['gemini:gemini-2.5-flash-lite', 'gemini'], ['qwen:qwen-flash', 'qwen'], ['openrouter:qwen/qwen3.6-flash', 'openrouter']]) {
      await api(app, 'PATCH', `${route}/settings`, { model });
      assert.deepEqual(await app.identityAuthoringProvider(agent.id).author(z.strictObject({ text: z.string() }), 'Write'), { text: 'Draft' });
      assert.equal(requests.at(-1)!.key, `Bearer ${service}-private-test-key`);
      assert.ok(!requests.at(-1)!.model.includes(`${service}:`));
      if (service === 'qwen') assert.equal(requests.at(-1)!.url, `${endpoint}/chat/completions`);
    }
    await api(app, 'PATCH', `${route}/settings`, { model: 'openrouter:google/gemini-2.5-flash-lite', thoughtRouting: {
      enabled: true, intuitiveModel: 'openrouter:google/gemini-2.5-flash-lite', deliberativeModel: 'openrouter:qwen/qwen3.6-flash' } });
    await api(app, 'PATCH', `${route}/settings`, { model: 'gemini:gemini-2.5-flash-lite', thoughtRouting: {
      enabled: true, intuitiveModel: 'gemini:gemini-2.5-flash-lite', deliberativeModel: 'qwen:qwen-flash' } });
    await api(app, 'PATCH', `${route}/settings`, { model: 'openrouter:google/gemini-2.5-flash-lite', thoughtRouting: null });
    const catalog = await api(app, 'GET', `${route}/models/openrouter`) as { id: string }[];
    assert.deepEqual(catalog.map(model => model.id), ['openrouter:qwen/example']);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store, undefined, undefined, undefined, vault);
    assert.equal(app.agentInferenceSettings(agent.id).model, 'openrouter:google/gemini-2.5-flash-lite');
    assert.equal(store.agentProviderConnections(agent.id).find(item => item.provider === 'qwen')!.baseUrl, endpoint);
    assert.equal(app.agentInferenceSettings(agent.id).hasAgentKey, true);
  } finally { globalThis.fetch = originalFetch; await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('server configuration recognizes Gemini, Qwen and OpenRouter without sharing their keys', () => {
  assert.equal(configuredProviders({ PRISM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-only' }).reasoning.label, 'gemini/gemini-2.5-flash-lite');
  assert.equal(configuredProviders({ PRISM_PROVIDER: 'qwen', DASHSCOPE_API_KEY: 'test-only' }).reasoning.label, 'qwen/qwen-flash');
  assert.equal(configuredProviders({ PRISM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'test-only' }).reasoning.label, 'openrouter/google/gemini-2.5-flash-lite');
});

test('cross-provider thought routing sends assessment to Gemini and generation to Qwen with independent credentials', async () => {
  const { MockReasoning } = await import('../../packages/providers/src/mock.js');
  const directory = mkdtempSync(join(tmpdir(), 'prism-cross-provider-'));
  const store = new SqliteStore(':memory:'); const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  const originalFetch = globalThis.fetch;
  try {
    const agent = app.createAgent();
    const route = `/api/agents/${agent.id}`;
    for (const provider of ['gemini', 'qwen']) await api(app, 'POST', `${route}/providers`, { provider, apiKey: `${provider}-isolated-test-key` });
    await api(app, 'PATCH', `${route}/settings`, { model: 'gemini:gemini-2.5-flash-lite', thoughtRouting: {
      enabled: true, intuitiveModel: 'gemini:gemini-2.5-flash-lite', deliberativeModel: 'qwen:qwen-flash' } });
    const input: import('../../packages/core/src/constructed-domain.js').ConstructedInput = { task: 'part_cognition', agentId: agent.id,
      world: { id: 'world', agentId: agent.id, cycleId: 'cycle', sequence: 1, capturedAt: '2026-10-15T00:00:00Z', facts: [] }, dispositions: [], memories: [], workingParts: [] };
    const product = await new MockReasoning().constructed(input);
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init!.body as string);
      const gemini = String(url).includes('googleapis.com'); calls.push(gemini ? 'gemini' : 'qwen');
      assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${gemini ? 'gemini' : 'qwen'}-isolated-test-key`);
      assert.equal(body.model, gemini ? 'gemini-2.5-flash-lite' : 'qwen-flash');
      return completion(gemini ? { difficulty: 'complex', uncertainty: 'high', urgency: 'routine', reason: 'Explicit transport fixture' } : product);
    };
    await app.providers.reasoning.constructed!(input);
    assert.deepEqual(calls, ['gemini', 'qwen']);
    const returned = store.eventsByType(agent.id, ['provider.operation']).flatMap(event => event.type === 'provider.operation' && event.payload.phase === 'returned' ? [event.payload.provider] : []);
    assert.deepEqual(returned, ['gemini/gemini-2.5-flash-lite', 'qwen/qwen-flash']);
  } finally { globalThis.fetch = originalFetch; await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
