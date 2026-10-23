import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThoughtResourcesSchema, thoughtResourceModel, type ThoughtResources } from '../../packages/core/src/thought-resources.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { AgentReasoningProvider } from '../../packages/providers/src/agent-reasoning.js';
import { MockReasoning } from '../../packages/providers/src/mock.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { api } from '../../packages/sdk/src/api.js';

const settings = { enabled: true, intuitiveModel: 'gpt-4.1-nano', deliberativeModel: 'gpt-4.1-mini' };
const input: ConstructedInput = { agentId: 'fixture', task: 'part_cognition', world: { id: 'world', agentId: 'fixture', cycleId: 'cycle',
  sequence: 1, capturedAt: '2026-10-14T00:00:00.000Z', facts: [{ source: 'Fixture observer', kind: 'observes', text: 'A bird chirps.', originCycleId: 'cycle', timestamp: '2026-10-14T00:00:00.000Z', referenceId: null }] }, dispositions: [], memories: [], workingParts: [] };

test('routing is per thought; urgency does not reduce complex or uncertain work to intuitive inference', async () => {
  let assessment: ThoughtResources = { difficulty: 'complex', uncertainty: 'low', urgency: 'urgent', reason: 'Interacting constraints' };
  const calls: { model: string; input: ConstructedInput }[] = []; const records: string[] = [];
  const resolve = (_agentId: string, model = 'primary') => {
    class Provider extends MockReasoning {
      override async constructed(context: ConstructedInput) { calls.push({ model, input: context });
        return context.task === 'thought_resources' ? assessment : super.constructed(context); }
    }
    return new Provider();
  };
  const router = new AgentReasoningProvider(new MockReasoning(), resolve, { settings: () => settings,
    record: (_input, _assessment, model) => { records.push(model); } });
  await router.constructed(input);
  assert.deepEqual(calls.map(call => call.model), [settings.intuitiveModel, settings.deliberativeModel]);
  assert.equal(calls[0]!.input.world, input.world); assert.equal(calls[1]!.input.world, input.world);
  assessment = { difficulty: 'simple', uncertainty: 'low', urgency: 'urgent', reason: 'Familiar recognition' };
  await router.constructed(input);
  assert.equal(records.at(-1), settings.intuitiveModel);
  assert.equal(thoughtResourceModel(settings, { ...assessment, uncertainty: 'high' }), settings.deliberativeModel);
  assert.throws(() => ThoughtResourcesSchema.parse({ ...assessment, difficulty: 'urgent' }));
  calls.length = 0;
  const disabled = new AgentReasoningProvider(new MockReasoning(), resolve, { settings: () => ({ ...settings, enabled: false }), record: () => assert.fail('Disabled routing') });
  await disabled.constructed(input); assert.deepEqual(calls.map(call => call.model), ['primary']);
});

test('routing configuration persists, stays private and rejects unsupported models and unavailable provider keys', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-thought-routing-')); const path = join(directory, 'agent.sqlite');
  let store = new SqliteStore(path); let app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  try {
    const agent = app.createAgent();
    const saved = await api(app, 'PATCH', `/api/agents/${agent.id}/settings`, { model: settings.intuitiveModel, apiKey: 'sk-routing-fixture-never-a-real-key', thoughtRouting: settings }) as { thoughtRouting: unknown };
    assert.deepEqual(saved.thoughtRouting, settings); assert.equal('apiKey' in saved, false);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/settings`, { model: settings.intuitiveModel, thoughtRouting: { ...settings, deliberativeModel: 'grok-4.3' } }), /thought model provider/);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/settings`, { model: settings.intuitiveModel, thoughtRouting: { ...settings, deliberativeModel: 'invented' } }), /supported/);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(store.agentProviderSettings(agent.id)!.thoughtRouting, settings);
    assert.ok(app.promptSettings(agent.id).some(prompt => prompt.task === 'thought_resources' && prompt.inspection));
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('actual routed models have separate observed calls without a duplicate primary-model operation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-routing-observation-')); const store = new SqliteStore(':memory:');
  const originalFetch = globalThis.fetch; const requests: string[] = []; const mock = new MockReasoning();
  let result: unknown;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { model: string }; requests.push(request.model);
    const value = requests.length === 1 ? { difficulty: 'complex', uncertainty: 'high', urgency: 'urgent', reason: 'Explicit transport fixture' } : result;
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: value }) }] }] }));
  };
  const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  try {
    const agent = app.createAgent(); const cycle = store.startCycle(agent.id);
    const context: ConstructedInput = { ...input, agentId: agent.id, world: { ...input.world!, agentId: agent.id, id: cycle.worldId!, cycleId: cycle.id } };
    result = await mock.constructed(context);
    await api(app, 'PATCH', `/api/agents/${agent.id}/settings`, { model: settings.intuitiveModel, apiKey: 'sk-routing-fixture-never-a-real-key', thoughtRouting: settings });
    await app.providers.reasoning.constructed!(context);
    assert.deepEqual(requests, [settings.intuitiveModel, settings.deliberativeModel]);
    const operations = store.eventsByType(agent.id, ['provider.operation']).flatMap(event => event.type === 'provider.operation' && event.payload.phase === 'returned' ? [event.payload] : []);
    assert.deepEqual(operations.map(operation => [operation.task, operation.provider]), [['thought_resources', `openai/${settings.intuitiveModel}`], ['part_cognition', `openai/${settings.deliberativeModel}`]]);
    assert.ok(operations.every(operation => operation.parentOperationId === null));
    const record = store.eventsByType(agent.id, ['cognition.resources'])[0]!;
    assert.equal(record.type, 'cognition.resources');
    if (record.type === 'cognition.resources') assert.equal(record.payload.model, settings.deliberativeModel);
  } finally { globalThis.fetch = originalFetch; await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('committed thought provenance links prediction outcomes without leaking model audit into cognition', async () => {
  const { thoughtModelEvidence, repeatedPredictionContradiction } = await import('../../packages/sdk/src/thought-model-evidence.js');
  const { PredictionSchema } = await import('../../packages/core/src/domain.js');
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const first = await app.message(agent.id, 'A bird chirps.', 'observer', 'routing');
    const thought = store.eventsByType(agent.id, ['part.thought'])[0]!;
    assert.equal(thought.type, 'part.thought'); if (thought.type !== 'part.thought') throw new Error('Missing thought');
    const source = thought.payload.inferenceSource!; assert.ok(source);
    const operation = store.eventsByType(agent.id, ['provider.operation']).find(event => event.type === 'provider.operation' && event.payload.operationId === source.operationId && event.payload.phase === 'returned')!;
    assert.equal(operation.type, 'provider.operation');
    if (operation.type === 'provider.operation') assert.equal(operation.payload.provider, source.provider);
    for (let index = 0; index < 2; index++) {
      const prediction = PredictionSchema.parse({ id: `routing-outcome-${index}`, agentId: agent.id, version: 1, schemaVersion: 1,
        partId: thought.payload.partId, createdCycle: first.cycle.id, expectation: 'Explicit engineering attribution fixture', confidence: 0.5,
        capsule: { interpretation: 'Fixture only', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
        horizon: 'Authored later fixture evidence', evaluateAfterCycle: null, status: 'resolved', evaluation: null, memoryId: null,
        cognitionOrigin: { thoughtEventId: thought.id, partVersion: thought.payload.partSnapshot.version, dispositions: [] } });
      store.save('prediction', prediction, 0, { origin: 'researcher_edit', reason: 'Explicit attribution plumbing fixture, not psychological validation', sourceIds: [] });
      store.appendEvent(agent.id, first.cycle.id, 'prediction.outcome_checked', { partId: prediction.partId, predictionId: prediction.id, outcome: 'incorrect', provider: 'Fixture judgment' });
    }
    const scopeInput = { ...input, agentId: agent.id, world: store.world(first.cycle.worldId!) };
    assert.equal(repeatedPredictionContradiction(store, scopeInput, source.provider, 2), true);
    assert.equal(repeatedPredictionContradiction(store, scopeInput, 'unrelated/provider', 2), false);
    assert.equal(repeatedPredictionContradiction(store, { ...scopeInput, dispositionBindings: [{ entityId: 'other', dispositionId: 'other' }] }, source.provider, 2), false);
    const report = thoughtModelEvidence(store, agent.id);
    assert.equal(report.unattributedThoughts, 0);
    assert.equal(report.providers.find(row => row.provider === source.provider)!.incorrect, 2);
    store.appendEvent(agent.id, first.cycle.id, 'prediction.outcome_checked', { partId: thought.payload.partId, predictionId: 'routing-outcome-1', outcome: 'correct', provider: 'Fixture judgment' });
    assert.equal(repeatedPredictionContradiction(store, scopeInput, source.provider, 2), false);
    const second = await app.message(agent.id, 'Another bird chirps.', 'observer', 'routing');
    const world = store.world(second.cycle.worldId!);
    assert.ok(world.thoughtHistory?.length);
    assert.equal(JSON.stringify(world.thoughtHistory).includes('operationId'), false);
    assert.equal(JSON.stringify(world.thoughtHistory).includes(source.provider), false);
  } finally { await app.close(); store.close(); }
});

test('a later simple thought can escalate for attributed prediction history without sending audit to its provider', async () => {
  const calls: string[] = []; let reason = '';
  class Provider extends MockReasoning {
    constructor(readonly model: string) { super(); }
    override async constructed(context: ConstructedInput) {
      calls.push(`${this.model}:${context.task}`);
      assert.equal('predictionHistory' in context, false);
      return super.constructed(context);
    }
  }
  const router = new AgentReasoningProvider(new MockReasoning(), (_agentId, model = 'primary') => new Provider(model), {
    settings: () => settings, historyEscalation: (_context, _provider, threshold) => { assert.equal(threshold, 2); return true; },
    record: (_input, _assessment, _model, recordedReason) => { reason = recordedReason; },
  });
  await router.constructed(input);
  assert.deepEqual(calls, [`${settings.intuitiveModel}:thought_resources`, `${settings.deliberativeModel}:part_cognition`]);
  assert.equal(reason, 'repeated_prediction_contradiction');
});

test('malformed workload assessment fails before generation instead of silently using another model', async () => {
  let generated = false;
  class InvalidAssessment extends MockReasoning {
    override async constructed(context: ConstructedInput) {
      if (context.task === 'thought_resources') return { difficulty: 'urgent' };
      generated = true; return super.constructed(context);
    }
  }
  const router = new AgentReasoningProvider(new MockReasoning(), () => new InvalidAssessment(), {
    settings: () => settings, record: () => assert.fail('Malformed assessment must not be recorded as a route'),
  });
  await assert.rejects(router.constructed(input)); assert.equal(generated, false);
});

test('ordinary Self inquiry can revise an intuitive proposal with deliberative resources and exact bid attribution', async () => {
  const { MockDecisions, MockEmbeddings } = await import('../../packages/providers/src/mock.js');
  const { thoughtModelEvidence } = await import('../../packages/sdk/src/thought-model-evidence.js');
  const directory = mkdtempSync(join(tmpdir(), 'prism-inquiry-routing-')); const store = new SqliteStore(':memory:');
  const originalFetch = globalThis.fetch; const requests: { task: string; model: string }[] = [];
  const product = await new MockReasoning().constructed(input);
  let assessments = 0;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { model: string; text: { format: { schema: { properties: { result: { properties: Record<string, unknown> } } } } } };
    const schemaText = JSON.stringify(request.text.format.schema.properties.result);
    let task: string; let result: unknown;
    if (schemaText.includes('"difficulty"')) {
      task = 'thought_resources'; const complex = assessments++ > 0;
      result = { difficulty: complex ? 'complex' : 'simple', uncertainty: complex ? 'high' : 'low', urgency: 'routine', reason: 'Explicit model-routing transport fixture' };
    } else if (schemaText.includes('"formation"')) { task = 'part_cognition'; result = product; }
    else if (schemaText.includes('"SUFFICIENT"')) { task = 'cognition_coverage'; result = { operation: 'SUFFICIENT', reason: 'Explicit transport fixture abstention' }; }
    else if (schemaText.includes('"NO_CHANGE"')) { task = 'experiential_formation'; result = { operation: 'NO_CHANGE', reason: 'Explicit transport fixture abstention' }; }
    else if (!schemaText.includes('"response"') && schemaText.includes('"target_parts"')) {
      task = 'deliberation'; result = { why_deliberate: 'Explicit inquiry fixture uncertainty', primary_c: 'curiosity', secondary_c: null, missing_information: 'How the constraints interact', question: 'Consider the interacting constraints more carefully.', target_parts: [store.list('part')[0]!.id] };
    } else if (Object.keys(request.text.format.schema.properties.result.properties ?? {}).join(',') === 'text') {
      task = 'speech'; result = { text: 'Reconsidered response.' };
    } else {
      task = 'answer'; result = { response: 'After reconsideration I recommend a different response.', bid_disposition: 'replace',
        new_bid: { action: { kind: 'say', text: 'Reconsidered response.' }, argument: 'Explicit revised proposal fixture', identityFit: [], executionOrder: [] } };
    }
    requests.push({ task, model: request.model });
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] }));
  };
  class Inquiring extends MockDecisions {
    calls = 0;
    override async choose(context: Parameters<InstanceType<typeof MockDecisions>['choose']>[0]) { return this.calls++ === 0
      ? { choice: 'DELIBERATE', explanation: 'Explicit inquiry plumbing fixture', identityConflict: '' }
      : { choice: context.contributions.find(contribution => contribution.bid)!.bid!.id, explanation: 'Explicit revised-bid transport selection', identityConflict: '' };  }
  }
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new Inquiring(), embeddings: new MockEmbeddings() }, undefined, undefined, new SecretVault(join(directory, 'vault')));
  try {
    const agent = app.createAgent();
    await api(app, 'PATCH', `/api/agents/${agent.id}/settings`, { model: settings.intuitiveModel, apiKey: 'sk-routing-fixture-never-a-real-key', thoughtRouting: settings });
    const completed = await app.message(agent.id, 'A bird chirps.', 'observer', 'inquiry-routing');
    assert.equal(completed.cycle.status, 'completed');
    assert.ok(requests.some(request => request.task === 'part_cognition' && request.model === settings.intuitiveModel));
    assert.ok(requests.some(request => request.task === 'answer' && request.model === settings.deliberativeModel));
    const report = thoughtModelEvidence(store, agent.id);
    const initial = report.bids.find(bid => bid.source?.provider === `openai/${settings.intuitiveModel}`)!;
    const revised = report.bids.find(bid => bid.source?.provider === `openai/${settings.deliberativeModel}`)!;
    assert.ok(initial); assert.ok(revised); assert.equal(initial.partId, revised.partId);
    assert.equal(initial.selected, false); assert.equal(revised.selected, true); assert.equal(report.unattributedBids, 0);
    assert.equal(report.thoughts[0]!.source!.provider, `openai/${settings.intuitiveModel}`, 'Reconsideration does not rewrite initial thought authorship');
  } finally { globalThis.fetch = originalFetch; await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
