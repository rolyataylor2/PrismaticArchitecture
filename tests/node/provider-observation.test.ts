import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { observeProvider, providerOperationContext } from '../../packages/sdk/src/provider-observation.js';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('ordinary isolated simulation records distinct provider operation pairs without exposing audit to cognition', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const runId = startSimulationTest(app, 'observatory-fresh-context-control', 'fixture', source.id).id;
    for (let attempt = 0; attempt < 1000 && listSimulationRuns(app).find(run => run.id === runId)!.status === 'running'; attempt++)
      await new Promise(resolve => setTimeout(resolve, 10));
    const run = listSimulationRuns(app).find(item => item.id === runId)!; assert.equal(run.status, 'completed', run.error ?? '');
    const events = store.events(run.agentId).filter(event => event.type === 'provider.operation');
    const report = analyzeSimulation(store, run); assert.ok(report.providerOperations.length > 0);
    assert.equal(events.length, report.providerOperations.length * 2);
    assert.ok(report.providerOperations.some(item => item.component === 'reasoning'));
    assert.ok(report.providerOperations.some(item => item.component === 'decisions'));
    for (const operation of report.providerOperations) {
      assert.equal(operation.phase, 'returned'); assert.equal(operation.parentOperationId, null);
      assert.equal(operation.validation, 'not_reported'); assert.equal(operation.usage, null); assert.equal(operation.cost, null);
      assert.ok(operation.elapsedMs! >= 0); assert.match(operation.input.hash, /^[a-f0-9]{64}$/); assert.match(operation.output!.hash, /^[a-f0-9]{64}$/);
      assert.notEqual(operation.input.id, operation.output!.id);
      assert.ok(!JSON.stringify(operation.input.arguments).includes('provider.operation'));
      if (['choose', 'chooseAffect', 'question', 'affectInquiry'].includes(operation.method)) {
        assert.equal(operation.input.worldId, null); assert.equal(operation.cycleId, null);
        assert.ok(!(operation.input.arguments[0] as object).hasOwnProperty('world'));
      }
    }
    assert.equal(store.events(source.id).filter(event => event.type === 'provider.operation').length, 0);
    const bytes = JSON.stringify(store.events(run.agentId)); analyzeSimulation(store, run); assert.equal(JSON.stringify(store.events(run.agentId)), bytes);
    const cognition = store.events(run.agentId).find(event => event.type === 'construction.inference_started' && event.payload.task === 'part_cognition');
    assert.ok(cognition && cognition.type === 'construction.inference_started');
    const input = cognition.payload;
    const http = observeProvider(store, new OpenAIProvider('test-only-not-a-credential', 'gpt-4.1-nano', async () =>
      new Response('secret vendor body must not appear', { status: 429 })), 'reasoning');
    await assert.rejects(http.constructed(input), /HTTP 429/);
    const failed = store.events(run.agentId).at(-1)!; assert.equal(failed.type, 'provider.operation');
    if (failed.type !== 'provider.operation') throw new Error('Missing operation failure');
    assert.equal(failed.payload.phase, 'failed'); assert.equal(failed.payload.error!.httpStatus, 429); assert.equal(failed.payload.error!.retryable, true);
    assert.ok(!JSON.stringify(failed).includes('secret vendor body')); assert.ok(!JSON.stringify(failed).includes('test-only-not-a-credential'));
    const invalid = observeProvider(store, new OpenAIProvider('test-only-not-a-credential', 'gpt-4.1-nano', async () =>
      Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"result":{}}' }] }] })), 'reasoning');
    await assert.rejects(invalid.constructed(input), /invalid structured output/);
    const rejected = store.events(run.agentId).at(-1)!;
    assert.ok(rejected.type === 'provider.operation'); assert.ok(rejected.payload.error!.issues.length > 0); assert.equal(rejected.payload.error!.category, 'validation');
    assert.equal(rejected.payload.output, null);
  } finally { await app.close(); store.close(); }
});

test('provider observation preserves errors and input/output identity with safe validation locations', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const args = { agentId: agent.id, task: 'simulation_evaluation', marker: 'exact argument' };
    let received: unknown;
    const target = { label: 'Explicit plumbing provider', async request(input: unknown) { received = input; return { marker: 'exact output' }; } };
    const provider = observeProvider(store, target, 'reasoning');
    const result = await provider.request(args); assert.equal(received, args); assert.deepEqual(result, { marker: 'exact output' });
    const failure = new Error('untrusted-secret-value');
    const broken = observeProvider(store, { label: 'Failure fixture', async request(_input: unknown) { throw failure; } }, 'decisions');
    await assert.rejects(broken.request(args), error => error === failure);
    const validation = observeProvider(store, { label: 'Validation fixture', async request(_input: unknown) { return z.object({ score: z.number() }).parse({ score: 'invalid' }); } }, 'decisions');
    await assert.rejects(validation.request(args), z.ZodError);
    const operations = store.events(agent.id).flatMap(event => event.type === 'provider.operation' ? [event.payload] : []);
    assert.equal(operations.length, 6); assert.ok(!JSON.stringify(operations).includes('untrusted-secret-value'));
    assert.deepEqual(operations.at(-1)!.error!.issues, [{ path: 'score', code: 'invalid_type' }]);
  } finally { await app.close(); store.close(); }
});

test('parallel usage retains exact operation attribution and unknown cache data remains unknown', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    const provider = observeProvider(store, { label: 'Usage plumbing fixture', async request(input: { agentId: string; delay: number; tokens: number; cache: boolean }) {
      await new Promise(resolve => setTimeout(resolve, input.delay));
      store.appendEvent(agent.id, null, 'provider.usage', { operationId: providerOperationContext.getStore()!, provider: 'Usage plumbing fixture',
        task: 'request', inputTokens: input.tokens, outputTokens: 2, cachedInputTokens: 0, cacheReported: input.cache, cacheKey: null });
      return input.tokens;
    } }, 'reasoning');
    await Promise.all([provider.request({ agentId: agent.id, delay: 20, tokens: 11, cache: false }), provider.request({ agentId: agent.id, delay: 0, tokens: 22, cache: true })]);
    const returned = store.events(agent.id).flatMap(event => event.type === 'provider.operation' && event.payload.phase === 'returned' ? [event.payload] : []);
    assert.equal(returned.length, 2);
    for (const operation of returned) {
      assert.equal(operation.usage!.inputTokens, operation.output!.value);
      assert.equal(operation.usage!.cachedInputTokens, operation.output!.value === 11 ? null : 0);
      assert.equal(operation.usage!.eventIds.length, 1);
      assert.equal(operation.cost, null);
    }
  } finally { await app.close(); store.close(); }
});
