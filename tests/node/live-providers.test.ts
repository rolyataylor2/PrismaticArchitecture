import { OllamaProvider } from '../../packages/providers/src/ollama.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { OpenAIProvider, strictOutputSchema, decodeOutput } from '../../packages/providers/src/openai.js';
import { JevHttpTransport } from '../../packages/providers/src/jev-http.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { configuredProviders } from '../../packages/providers/src/config.js';
import { loadLocalEnvironment, projectEnvironmentValue } from '../../packages/providers/src/environment.js';
import { PartPatchSchema, type SelfContext } from '../../packages/core/src/domain.js';
import type { PartContext } from '../../packages/core/src/contracts.js';
import { demoIdentity, demoParts } from '../../packages/sdk/src/seed.js';
import { defaultPrimitives } from '../../packages/core/src/primitives.js';
import { partProposalSchema } from '../../packages/providers/src/deliberation-schema.js';

const self: SelfContext = { identity: { ...demoIdentity, id: 'agent', agentId: 'agent', version: 1, schemaVersion: 2 }, contributions: [{ partId: 'part', name: 'Test contributor', thought: 'I need clarity.', interpretation: 'Unclear.', evidenceSummary: [], prediction: null, bid: null }], deliberation: [] };
const inquiry = { why_deliberate: 'Need evidence.', primary_c: 'curiosity', secondary_c: 'clarity', missing_information: 'The basis for a claim.', target_parts: ['part'], question: 'What did you observe?' };
const world = { id: 'world-secret', agentId: 'agent', cycleId: 'cycle', sequence: 1, capturedAt: 'now', facts: [] };

test('OpenAI reports token exhaustion without accepting incomplete cognition', async () => {
  const provider = new OpenAIProvider('test-only', 'gpt-4.1-nano', async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.reasoning, undefined);
    assert.equal(body.max_output_tokens, 4096);
    return Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] });
  });
  await assert.rejects(provider.question(self), /OpenAI response incomplete \(max_output_tokens\)/);
});

test('GPT-5 nano uses requested minimal reasoning while GPT-4.1 requests stay unchanged', async () => {
  for (const model of ['gpt-5-nano', 'gpt-5-nano-2025-08-07', 'gpt-4.1-nano']) {
    const provider = new OpenAIProvider('test-only', model, async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.deepEqual(body.reasoning, model.startsWith('gpt-5-nano') ? { effort: 'minimal' } : undefined);
      assert.equal(body.max_output_tokens, 4096);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: inquiry }) }] }] });
    });
    assert.deepEqual(await provider.question(self), inquiry);
  }
});

test('OpenAI action discriminators cannot emit an explicitly present null', () => {
  const schemas = partProposalSchema({ part: { id: 'part' } });
  for (const [schema, field] of [[schemas.cognition, 'proposal'], [schemas.answer, 'new_bid']] as const) {
    const wire = strictOutputSchema(z.toJSONSchema(schema)) as any;
    const branches = (node: any): any[] => node.anyOf ? node.anyOf.flatMap(branches) : [node];
    const actions = branches(wire.properties[field]).filter((branch: any) =>
      branches(branch.properties?.action ?? {}).some((action: any) => action.type === 'object'));
    assert.ok(actions.length > 0);
    for (const action of actions) {
      assert.ok(action.required.includes('type'));
      assert.deepEqual(action.properties.type, { type: 'string', const: 'action' });
      assert.ok(branches(action.properties.action).some((shape: any) => shape.properties?.kind?.const === 'operate'),
        'Operational actions retain their explicit union discriminator');
    }
  }
  const result = { interpretation: 'I want to respond.', thought: 'I need clarity.', evidenceSummary: [],
    proposal: { type: 'action', action: { kind: 'say', text: 'I need clarity.' }, argument: 'Express my need.', identityFit: [], executionOrder: [] } };
  assert.deepEqual(schemas.cognition.parse(decodeOutput(result)), result);
  assert.equal(schemas.cognition.safeParse({ ...result, proposal: { ...result.proposal, type: null } }).success, false);
  const operation = { ...result, proposal: { ...result.proposal, action: { kind: 'operate', text: 'Inspect a selected tool',
    operation: { successCriteria: 'A result is observed', constraints: [], steps: [], verification: null } } } };
  assert.deepEqual(schemas.cognition.parse(decodeOutput(operation)), operation);
  assert.equal(schemas.cognition.safeParse({ ...operation, proposal: { ...operation.proposal, type: null } }).success, false);
});

test('primitive provider wire schemas forbid strategies and internal inquiries on both passes', async () => {
  const proposal = { action: { kind: 'say', text: 'I do not know yet.' }, argument: 'Missing knowledge.', identityFit: [], executionOrder: [] };
  const primitive = defaultPrimitives().find(item => item.id === 'primitive_13')!;
  for (const Provider of [OpenAIProvider, OllamaProvider]) {
    let answering = false;
    const transport: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const openai = Provider === OpenAIProvider;
      const schema = openai ? body.text.format.schema.properties.result : body.format;
      const bid = answering ? schema.properties.new_bid.anyOf[0] : schema.properties.proposal;
      assert.equal(bid.type, 'object');
      assert.equal(bid.properties.executionOrder.maxItems, 0);
      assert.equal('target_parts' in bid.properties, false);
      const result = answering ? { response: 'I lack a preference.', bid_disposition: 'replace', new_bid: proposal }
        : { interpretation: 'A preference question.', thought: 'I do not know yet.', evidenceSummary: [], proposal };
      return Response.json(openai ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] }
        : { message: { content: JSON.stringify(result) } });
    };
    const provider = Provider === OpenAIProvider ? new OpenAIProvider('test-only', undefined, transport)
      : new OllamaProvider('test-model', undefined, transport);
    assert.deepEqual((await provider.primitive({ world, primitive })).proposal, proposal);
    answering = true;
    assert.deepEqual((await provider.primitiveAnswer({ world, primitive, currentBid: null, deliberation: [] }, 'Do you like sea monkeys?')).new_bid, proposal);
  }
});

test('OpenAI strict schema preserves omitted fields and explicit nullable patches', () => {
  const original = z.toJSONSchema(PartPatchSchema);
  const wire = strictOutputSchema(original) as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
  assert.deepEqual(wire.required, Object.keys(wire.properties));
  assert.equal(wire.additionalProperties, false);
  const patch = decodeOutput({ name: { __present: false, __value: null }, beliefs: { __present: true, __value: ['I can trust carefully.'] },
    emotionalCharge: { __present: true, __value: null } });
  assert.deepEqual(PartPatchSchema.parse(patch), { beliefs: ['I can trust carefully.'], emotionalCharge: null });
  assert.throws(() => PartPatchSchema.parse(decodeOutput({ beliefs: { __present: true, __value: null } })));
  assert.throws(() => PartPatchSchema.parse(decodeOutput({ name: { __present: false, __value: null } })));
  assert.deepEqual(decodeOutput({ mutation: { name: { __present: false, __value: null } } }), { mutation: null });
});

test('OpenAI uses isolated Responses requests with bounded output and validated envelopes', async () => {
  const provider = new OpenAIProvider('test-only', undefined, async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'gpt-4.1-nano');
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 4096);
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(Object.keys(body.text.format.schema.properties.result.properties), ['why_deliberate', 'primary_c', 'secondary_c', 'missing_information', 'target_parts', 'question']);
    assert.equal(typeof body.input, 'string');
    assert.match(body.input, /world-blind Self/);
    assert.match(body.input, /honesty/);
    assert.equal(body.previous_response_id, undefined);
    assert.equal(JSON.stringify(body).includes(world.id), false);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: inquiry }) }] }] });
  });
  assert.deepEqual(await provider.question(self), inquiry);
  for (const reply of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"result":["invalid"]}' }] }] },
  ]) {
    await assert.rejects(new OpenAIProvider('test-only', undefined, async () => Response.json(reply)).question(self));
  }
  await assert.rejects(new OpenAIProvider('test-only', undefined, async () => new Response('sensitive vendor body', { status: 401 })).question(self), /^InfrastructureError: OpenAI HTTP 401$/);
});

test('OpenAI cannot create another prediction while the owning Part has one open', async () => {
  const context: PartContext = { world,
    part: { ...demoParts[0]!, id: 'part', agentId: 'agent', version: 1, schemaVersion: 1 }, memories: [],
    activation: { partId: 'part', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true },
    prediction: { id: 'prediction', agentId: 'agent', partId: 'part', version: 1, schemaVersion: 1,
      expectation: 'I expect a reply.', capsule: { interpretation: 'I asked for contact.', details: [], entities: [], activation: 3, spike: 3, sourceIds: [] },
      confidence: 0.5, horizon: 'Next turn', evaluateAfterCycle: null, createdCycle: 'previous', status: 'open', evaluation: null, memoryId: null },
  };
  const provider = new OpenAIProvider('test-only', undefined, async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal('prediction' in body.text.format.schema.properties.result.properties, false);
    assert.equal(typeof body.input, 'string');
    assert.match(body.input, /Time: now/);
    assert.match(body.input, /I expect a reply/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: {
      interpretation: 'I wait.', thought: 'I want a reply.', evidenceSummary: [], proposal: null,
    } }) }] }] });
  });
  const cognition = await provider.cognize(context);
  assert.equal('prediction' in cognition, false);
  await assert.rejects(async () => provider.predict({ ...context, cognition }), /another open prediction/);
});

test('OpenAI outcome reflection requires resolution and preserves bounded outcome context', async () => {
  const prediction: NonNullable<PartContext['prediction']> = { id: 'prediction', agentId: 'agent', partId: 'part', version: 1, schemaVersion: 1,
    expectation: 'I expect a reply.', capsule: { interpretation: 'I asked for contact.', details: [], entities: [], activation: 3, spike: 3, sourceIds: [] },
    confidence: 0.5, horizon: 'Next turn', evaluateAfterCycle: null, createdCycle: 'previous', status: 'open', evaluation: null, memoryId: null };
  const context: Parameters<OpenAIProvider['evaluate']>[0] = { world, prediction, laterEvidence: [], outcome: 'correct' as const, activation: { partId: 'part', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true }, part: { ...demoParts[0]!, id: 'part', agentId: 'agent', version: 1, schemaVersion: 1 }, memories: [] };
  let result: Record<string, unknown> = { operation: 'continue', revision: null, evaluation: null, memory: null, mutation: null, reason: 'Waiting for evidence.' };
  const provider = new OpenAIProvider('test-only', undefined, async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.text.format.schema.properties.result.properties.operation.const, 'resolve');
    assert.equal(body.text.format.schema.properties.result.properties.evaluation.properties.evidenceWorldId.const, world.id);
    assert.match(body.input, /outcome check is correct/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] });
  });
  await assert.rejects(provider.evaluate(context), /invalid structured output/);
  result = { ...result, operation: 'resolve', evaluation: { assessment: 'confirmed', interpretation: 'The reply arrived.', causalAttribution: 'They replied.', evidence: ['Reply'], evidenceWorldId: world.id } };
  assert.equal((await provider.evaluate(context)).operation, 'resolve');
  result = { ...result, evaluation: { ...(result.evaluation as object), evidenceWorldId: 'invented_world' } };
  await assert.rejects(provider.evaluate(context), /invalid structured output/);
});

test('OpenAI sends the Agent-resolved task prompt with the bounded request', async () => {
  const provider = new OpenAIProvider('test-only', 'gpt-4.1-nano', async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.match(body.input, /Agent-specific deliberation prompt/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: inquiry }) }] }] });
  }, (agentId, task) => `${agentId} Agent-specific ${task} prompt`);
  assert.deepEqual(await provider.question(self), inquiry);
});

test('Jev HTTP batches independent Scores and isolates Choice while retaining distributions', async () => {
  let calls = 0;
  const provider = new JevDecisions(new JevHttpTransport('test-only', undefined, async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init!.body as string);
    calls++;
    assert.equal(body.model, 'jev-latest');
    if (calls === 1) {
      assert.equal(typeof body.state, 'string');
      assert.match(body.state, /World snapshot world-secret/);
      assert.match(body.state, /trust/);
      assert.deepEqual(Object.keys(body.questions), ['one', 'two']);
      const answers = Object.fromEntries(Object.entries(body.questions).map(([id, value]) => {
        const q = value as { type: string; criteria: string[]; instructions: string };
        assert.equal(q.type, 'score');
        assert.match(q.instructions, /candidate one|candidate two/);
        return [id, { type: 'score', score: 3.8, confidence: 0.9,
          legend: Object.fromEntries(q.criteria.map((label, index) => [index, label])), probabilities: { 0: 0, 1: 0, 2: 0, 3: 0.2, 4: 0.8 } }];
      }));
      return Response.json({ answers });
    }
    assert.equal(typeof body.state, 'string');
    assert.match(body.state, /## Identity/);
    assert.deepEqual(Object.keys(body.questions), ['DELIBERATE']);
    assert.equal(body.questions.DELIBERATE.type, 'score');
    assert.equal(JSON.stringify(body).includes(world.id), false);
    return Response.json({ answers: { DELIBERATE: { type: 'score', score: 4, confidence: 1, legend: Object.fromEntries(body.questions.DELIBERATE.criteria.map((label: string, index: number) => [index, label])), probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } } });
  }));
  const scores = await provider.score({ world, candidates: ['one', 'two'].map((id, index) => ({ ...demoParts[index]!, id, agentId: 'agent', version: 1, schemaVersion: 1, triggers: ['trust'] })) });
  assert.deepEqual(scores.map(s => s.score), [3.8, 3.8]);
  assert.equal(scores[0]!.distribution?.length, 5);
  assert.equal((await provider.choose(self)).choice, 'DELIBERATE');
  assert.equal(calls, 2);
});

test('Jev accepts rounded probability totals at the tolerance boundary and preserves reported values', async () => {
  const levels = ['Dormant', 'Stirred', 'Active', 'Strong', 'Dominant'];
  const request = { state: 'Test context.', questions: [{ id: 'one', kind: 'Score' as const, question: 'Trigger match?', minimum: 0 as const, maximum: 4 as const, criteria: levels }] };
  for (const last of [0.19, 0.21]) {
    const probabilities = { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 4: last };
    const transport = new JevHttpTransport('test-only', undefined, async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const answer = body.questions.selection
        ? { type: 'choice', choice: '4', confidence: 0.5, probabilities }
        : { type: 'score', score: 2, confidence: 0.5, probabilities, legend: Object.fromEntries(levels.map((label, index) => [index, label])) };
      return Response.json({ answers: { [body.questions.selection ? 'selection' : 'one']: answer } });
    });
    const expected = Object.entries(probabilities).map(([label, probability]) => ({ label, probability }));
    assert.deepEqual((await transport.scores(request))[0]!.distribution, expected);
    assert.deepEqual((await transport.choice({ state: 'Test context.', choices: ['0', '1', '2', '3', '4'] })).distribution, expected);
  }
  for (const probabilities of [
    { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.189 },
    { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.211 },
    { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.4 },
    { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, extra: 0.2 },
  ]) {
    const transport = new JevHttpTransport('test-only', undefined, async () => Response.json({ answers: {
      selection: { type: 'choice', choice: '0', confidence: 0.5, probabilities },
    } }));
    await assert.rejects(transport.choice({ state: 'Test context.', choices: ['0', '1', '2', '3', '4'] }), /invalid probability distribution/);
  }
});

test('Jev rejects missing, out of bounds, and unavailable judgments without mock fallback', async () => {
  const request = { state: 'Trigger match context.', questions: [{ id: 'one', kind: 'Score' as const, question: 'Trigger match?', minimum: 0 as const, maximum: 4 as const }] };
  for (const answers of [{}, { one: { type: 'score', score: 9, confidence: 1, probabilities: { 4: 1 }, legend: {} } }]) {
    await assert.rejects(new JevHttpTransport('test-only', undefined, async () => Response.json({ answers })).scores(request));
  }
  const invalid = new JevHttpTransport('test-only', undefined, async () => Response.json({ answers: { selection: { type: 'choice', choice: 'invented', confidence: 1, probabilities: { invented: 1 } } } }));
  await assert.rejects(invalid.choice({ state: 'Identity has no bids.', choices: ['DELIBERATE'] }), /unavailable/);
  assert.throws(() => configuredProviders({ PRISM_PROVIDER: 'openai' }), /OPENAI_API_KEY/);
  assert.throws(() => configuredProviders({ PRISM_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only' }), /JEV_API_KEY/);
  const configured = configuredProviders({ PRISM_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only', TYPESAFE_API_KEY: 'test-only' });
  assert.equal(configured.reasoning.label, 'openai/gpt-4.1-nano');
  assert.equal(configured.decisions.label, 'jev/jev-latest');
  assert.match(configuredProviders({}).reasoning.label, /mock/);
});

test('local environment loading tolerates absence and preserves exported overrides', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-env-'));
  const key = 'PRISM_ENV_TEST_VALUE';
  const previous = process.env[key];
  try {
    loadLocalEnvironment(join(directory, 'missing'));
    const path = join(directory, '.env');
    writeFileSync(path, `${key}=from-file\n`);
    delete process.env[key]; loadLocalEnvironment(path); assert.equal(process.env[key], 'from-file');
    process.env[key] = 'exported'; loadLocalEnvironment(path); assert.equal(process.env[key], 'exported');
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});


test('Part cognition instructions live in the editable task template for both providers', async () => {
  const context: PartContext = { world,
    part: { ...demoParts[0]!, id: 'part', agentId: 'agent', version: 1, schemaVersion: 1 }, memories: [], prediction: null,
    activation: { partId: 'part', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true },
  };
  const result = { interpretation: 'I wait.', thought: 'I want a reply.', evidenceSummary: [], proposal: null };
  for (const vendor of ['openai', 'ollama']) {
    const requests: Record<string, any>[] = [];
    const transport: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(init!.body as string));
      const output = requests.length === 1 ? result : inquiry;
      return vendor === 'openai'
        ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: output }) }] }] })
        : Response.json({ message: { content: JSON.stringify(output) } });
    };
    const resolver = () => 'Custom task template.';
    const provider = vendor === 'openai' ? new OpenAIProvider('test-only', undefined, transport, resolver)
      : new OllamaProvider('test-model', undefined, transport, resolver);
    await provider.cognize(context);
    await provider.question(self);
    const cognitionSchema = vendor === 'openai' ? requests[0]!.text.format.schema.properties.result : requests[0]!.format;
    assert.deepEqual(Object.keys(cognitionSchema.properties).sort(), ['affectProposals', 'evidenceSummary', 'interpretation', 'proposal', 'thought']);
    const cognitionSystem = vendor === 'openai' ? requests[0]!.instructions : requests[0]!.messages[0].content;
    const selfSystem = vendor === 'openai' ? requests[1]!.instructions : requests[1]!.messages[0].content;
    assert.ok(!cognitionSystem.includes('PersonaGPT'));
    assert.ok(!selfSystem.includes('PersonaGPT'));
    const input = vendor === 'openai' ? requests[0]!.input : requests[0]!.messages[1].content;
    assert.equal(input, 'Custom task template.');
  }
});

test('OpenAI and Ollama generate prediction drafts in a separate owner-scoped request', async () => {
  const context = { world, part: { ...demoParts[0]!, id: 'part', agentId: 'agent', version: 1, schemaVersion: 1 as const }, memories: [], prediction: null,
    activation: { partId: 'part', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true },
    cognition: { interpretation: 'I want to test my expectation.', thought: 'I expect a reply.', evidenceSummary: [], proposal: null } };
  const draft = { expectation: 'I expect a reply.', capsule: { interpretation: 'I asked for contact.', details: ['I asked'], entities: [], activation: 3, spike: 3, sourceIds: [world.id] }, confidence: 0.5, horizon: 'Next reply', evaluateAfterCycle: 2 };
  for (const vendor of ['openai', 'ollama']) {
    let calls = 0;
    const transport: typeof fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(init!.body as string);
      const schema = vendor === 'openai' ? body.text.format.schema.properties.result : body.format;
      assert.ok(schema.properties.expectation); assert.equal('thought' in schema.properties, false);
      const input = vendor === 'openai' ? body.input : body.messages[1].content;
      assert.match(input, /Jev has selected yes/); assert.match(input, /I want to test my expectation/);
      assert.ok(!input.includes('PersonaGPT'));
      return vendor === 'openai'
        ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: draft }) }] }] })
        : Response.json({ message: { content: JSON.stringify(draft) } });
    };
    const provider = vendor === 'openai' ? new OpenAIProvider('test-only', undefined, transport) : new OllamaProvider('test-model', undefined, transport);
    assert.deepEqual(await provider.predict(context), draft); assert.equal(calls, 1);
  }
});

test('primitive-only Self inquiry wire formats restrict targets to available contributor IDs', async () => {
  const context: SelfContext = { ...self, contributions: ['primitive_11', 'primitive_12'].map((partId, index) => ({
    sourceKind: 'primitive', partId, name: index ? 'Respond' : 'Addressed to me',
    thought: 'I register this greeting.', interpretation: 'Directed communication.', evidenceSummary: [], prediction: null,
    bid: { id: `bid_${index}`, partId, sourceKind: 'primitive', action: { kind: 'say', text: 'Hello.' }, argument: 'Acknowledge.', identityFit: [], executionOrder: [] },
  })) };
  for (const kind of ['openai', 'ollama']) {
    let target = 'primitive_12';
    const transport: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const schema = kind === 'openai' ? body.text.format.schema.properties.result : body.format;
      assert.deepEqual(schema.properties.target_parts.items.enum, ['primitive_11', 'primitive_12']);
      assert.equal(schema.properties.target_parts.maxItems, 2);
      const prompt = kind === 'openai' ? body.input : body.messages[1].content;
      assert.match(prompt, /Allowed target_parts IDs: primitive_11, primitive_12/);
      assert.equal(prompt.includes(world.id), false);
      const result = { ...inquiry, target_parts: [target] };
      return kind === 'openai'
        ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] })
        : Response.json({ message: { content: JSON.stringify(result) } });
    };
    const provider = kind === 'openai' ? new OpenAIProvider('test-only', undefined, transport) : new OllamaProvider('test-model', undefined, transport);
    assert.deepEqual((await provider.question(context)).target_parts, ['primitive_12']);
    target = 'bid_1';
    await assert.rejects(provider.question(context), /invalid structured output/);
  }
});

test('disabled primitive provider schemas require no cognition or inquiry bid', async () => {
  const primitive = { id: 'primitive_11', name: 'Addressed to me', bidsEnabled: false, aspects: ['Directed communication'], thoughtPrompt: 'Notice address.', bidPrompt: 'Acknowledge.' };
  for (const kind of ['openai', 'ollama']) {
    let answering = false;
    const transport: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const schema = kind === 'openai' ? body.text.format.schema.properties.result : body.format;
      const prompt = kind === 'openai' ? body.input : body.messages[1].content;
      assert.match(prompt, /Bids are disabled/);
      if (answering) {
        assert.equal(schema.properties.new_bid.type, 'null');
        assert.deepEqual(schema.properties.bid_disposition.enum, ['retain', 'withdraw']);
      } else assert.equal(schema.properties.proposal.type, 'null');
      const result = answering ? { response: 'I notice direct address.', bid_disposition: 'retain', new_bid: null }
        : { interpretation: 'Directed communication.', thought: 'This is directed at me.', evidenceSummary: [], proposal: null };
      return kind === 'openai'
        ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] })
        : Response.json({ message: { content: JSON.stringify(result) } });
    };
    const provider = kind === 'openai' ? new OpenAIProvider('test-only', undefined, transport) : new OllamaProvider('test-model', undefined, transport);
    assert.equal((await provider.primitive({ world, primitive })).proposal, null);
    answering = true;
    assert.equal((await provider.primitiveAnswer({ world, primitive, currentBid: null, deliberation: [] }, 'What did you notice?')).new_bid, null);
  }
});


test('xAI uses its own Responses endpoint and disables reasoning without sharing sessions', async () => {
  const { XaiProvider } = await import('../../packages/providers/src/xai.js');
  const provider = new XaiProvider('xai-test-only', 'grok-4.3', async (url, init) => {
    assert.equal(url, 'https://api.x.ai/v1/responses');
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer xai-test-only');
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.reasoning, { effort: 'none' });
    assert.equal(body.store, false); assert.equal(body.previous_response_id, undefined);
    assert.equal(body.prompt_cache_key, undefined, 'Self does not share Part world cache routing');
    assert.equal(body.model, 'grok-4.3'); assert.equal(body.text.format.strict, true);
    assert.equal(body.input.includes('world-secret'), false);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: inquiry }) }] }] });
  });
  assert.equal(provider.label, 'xai/grok-4.3');
  assert.deepEqual(await provider.question(self), inquiry);
  assert.throws(() => configuredProviders({ PRISM_PROVIDER: 'xai', OPENAI_API_KEY: 'must-not-use-this' }), /XAI_API_KEY/);
  assert.equal(configuredProviders({ PRISM_PROVIDER: 'xai', XAI_API_KEY: 'test-only', PRISM_DECISIONS: 'mock' }).reasoning.label, 'xai/grok-4.3');
});

test('Jev identifies context limits without retaining vendor bodies or retrying unrelated failures', async () => {
  const { ContextLimitError } = await import('../../packages/core/src/contracts.js');
  for (const [status, detail, limited] of [[400, 'Input token length exceeds the context limit. private-body', true], [400, 'Invalid rubric. private-body', false], [401, 'Unauthorized. private-body', false]] as const) {
    const transport = new JevHttpTransport('test-only', 'jev-latest', async () => Response.json({ error: detail }, { status }));
    await assert.rejects(transport.scores({ state: 'An ordinary scene.', questions: [{ id: 'candidate', kind: 'Score', minimum: 0, maximum: 4, question: 'Is it relevant?' }] }), error => {
      assert.equal(error instanceof ContextLimitError, limited);
      assert.equal((error as Error).message.includes('private-body'), false);
      return true;
    });
  }
});

test('Prism configuration accepts legacy environment values and gives new names precedence', () => {
  assert.equal(projectEnvironmentValue('DB', { ONTOAGENTIC_DB: 'old.sqlite' }), 'old.sqlite');
  assert.equal(projectEnvironmentValue('DB', { ONTOAGENTIC_DB: 'old.sqlite', PRISM_DB: 'new.sqlite' }), 'new.sqlite');
  assert.equal(projectEnvironmentValue('DB', {}), undefined);
  assert.equal(configuredProviders({ ONTOAGENTIC_PROVIDER: 'mock', ONTOAGENTIC_DECISIONS: 'mock' }).reasoning.label, 'deterministic/mock-reasoning-v1');
  assert.equal(configuredProviders({ ONTOAGENTIC_PROVIDER: 'invalid', PRISM_PROVIDER: 'mock', PRISM_DECISIONS: 'mock' }).reasoning.label, 'deterministic/mock-reasoning-v1');
});
