import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { OllamaProvider } from '../../packages/providers/src/ollama.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { AgentReasoningProvider } from '../../packages/providers/src/agent-reasoning.js';
import { MockReasoning } from '../../packages/providers/src/mock.js';
import { constructedOutputs, constructedTasks, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { promptCatalog } from '../../packages/providers/src/prompts.js';
import { promptInspection } from '../../packages/providers/src/prompt-inspection.js';
import { MemorySchema, PredictionSchema } from '../../packages/core/src/domain.js';
import { PartGenerationSchema } from '../../packages/core/src/constructed-domain.js';
import { constructedOutputSchema } from '../../packages/providers/src/constructed-schema.js';
import { partProposalSchema } from '../../packages/providers/src/deliberation-schema.js';
import { strictOutputSchema } from '../../packages/providers/src/openai.js';
import { z } from 'zod';

const world = { id: 'world_fixture_782349', agentId: 'agent', cycleId: 'cycle', sequence: 1, capturedAt: '2026-10-03T10:00:00Z',
  facts: [{ source: 'observer', kind: 'observes' as const, text: 'An ordinary scene.', timestamp: null, referenceId: null }], thoughtHistory: [] };
const productBranch = (schema: any) => schema.properties ? schema : schema.anyOf[0];

test('Part generation and deliberation navigation schemas require actual current-thread stance options', async () => {
  const navigation = { type: 'navigate', action: null, stateId: 'available_stance', argument: 'Revisit openness.', identityFit: [], executionOrder: [] };
  for (const stanceHistory of [[], [{ id: 'available_stance', cycleId: 'earlier_cycle', posture: [] }]]) {
    const currentWorld = { ...world, experienced: { prospective: [], rememberedInterpretations: [], posture: [], stanceHistory } };
    const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world: currentWorld, memories: [] };
    const product = PartGenerationSchema.parse(await new MockReasoning().constructed(input));
    product.cognition.proposal = navigation as typeof product.cognition.proposal;
    const generation = constructedOutputSchema(input);
    assert.equal(generation.safeParse({ ...product, cognition: { ...product.cognition, proposal: undefined } }).success, false,
      'Runtime requires an explicit proposal or null, never an omitted proposal');
    assert.equal(generation.safeParse({ ...product, cognition: { ...product.cognition, proposal: null } }).success, true);
    const answer = partProposalSchema({ part: { id: 'part' }, world: currentWorld }).answer;
    const response = { response: 'I could revisit openness.', bid_disposition: 'replace', new_bid: navigation };
    assert.equal(generation.safeParse(product).success, stanceHistory.length > 0);
    assert.equal(answer.safeParse(response).success, stanceHistory.length > 0);
    assert.equal(generation.safeParse({ ...product, cognition: { ...product.cognition, proposal: { ...navigation, stateId: 'invented_stance' } } }).success, false);
    assert.equal(answer.safeParse({ ...response, new_bid: { ...navigation, stateId: 'invented_stance' } }).success, false);
    for (const schema of [generation, answer]) {
      for (const wire of [z.toJSONSchema(schema), strictOutputSchema(z.toJSONSchema(schema))]) {
        const options: any[] = [];
        const visit = (node: any) => {
          if (!node || typeof node !== 'object') return;
          if (node.properties?.type?.const === 'navigate') options.push(node);
          Object.values(node).forEach(visit);
        };
        visit(wire);
        assert.equal(options.length > 0, stanceHistory.length > 0, 'Both vendor schemas exclude navigation without history');
        for (const option of options) assert.deepEqual(option.properties.stateId.enum ?? [option.properties.stateId.const], ['available_stance']);
      }
    }
  }
});

test('live provider wire schemas restrict formation citations to current recall and reject stale references', async () => {
  const memory = MemorySchema.parse({ id: 'recalled_memory', agentId: 'agent', version: 1, schemaVersion: 1,
    partId: 'former_part', content: 'I felt heard.', gist: 'Feeling heard', context: [], ancestorIds: [], predictionId: null, createdCycle: 'past_cycle' });
  for (const memories of [[], [memory]]) {
    const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world, memories, dispositions: [], predictions: [] };
    const product = PartGenerationSchema.parse(await new MockReasoning().constructed(input));
    for (const field of ['evidenceMemoryIds', 'counterevidenceMemoryIds'] as const) {
      let invalid = false;
      const inspectSchema = (schema: any) => {
        const references = productBranch(schema).properties.formation.properties[field];
        if (memories.length) assert.deepEqual(references.items.enum ?? [references.items.const], [memory.id]);
        else assert.equal(references.maxItems, 0);
      };
      const responseProduct = () => ({ ...product, formation: { ...product.formation,
        [field]: invalid ? ['unrecalled_historical_memory'] : memories.map(item => item.id) } });
      const openaiTransport: typeof fetch = async (_url, options) => {
        const body = JSON.parse(options!.body as string);
        inspectSchema(body.text.format.schema.properties.result);
        return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: responseProduct() }) }] }] }));
      };
      const ollamaTransport: typeof fetch = async (_url, options) => {
        inspectSchema(JSON.parse(options!.body as string).format);
        return new Response(JSON.stringify({ message: { content: JSON.stringify(responseProduct()) } }));
      };
      const providers = [new OpenAIProvider('fixture-credential', 'fixture-model', openaiTransport),
        new OllamaProvider('fixture-model', 'http://localhost:11434', ollamaTransport)];
      for (const provider of providers) {
        const output = PartGenerationSchema.parse(await provider.constructed(input));
        assert.deepEqual(output.formation[field], memories.map(item => item.id));
      }
      invalid = true;
      for (const provider of providers) await assert.rejects(provider.constructed(input), /invalid structured output/);
    }
  }
});

test('OpenAI prediction attention distinguishes omission from present array values', async () => {
  const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world, memories: [], dispositions: [] };
  const output = PartGenerationSchema.parse(await new MockReasoning().constructed(input));
  output.cognition.prediction = {
    expectation: 'Someone will respond in the next exchange.',
    capsule: { interpretation: 'Contact is open.', details: ['An ordinary scene'], entities: [], activation: 2, spike: 0, sourceIds: [] },
    confidence: 0.5, horizon: 'next exchange', evaluateAfterCycle: null,
  };
  for (const attention of [
    { __present: false, __value: null },
    { __present: true, __value: [] },
    { __present: true, __value: [{ target: 'next exchange', cues: ['someone responds'] }] },
  ]) {
    const transport: typeof fetch = async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      const predictionEnvelope = productBranch(body.text.format.schema.properties.result).properties.cognition.properties.prediction;
      const prediction = predictionEnvelope.anyOf.find((branch: any) => branch.properties?.__present.const === true)
        .properties.__value.anyOf.find((branch: any) => branch.type === 'object');
      const branches = prediction.properties.attention.anyOf;
      assert.equal(branches[0].properties.__present.const, false);
      assert.equal(branches[0].properties.__value.type, 'null');
      assert.equal(branches[1].properties.__present.const, true);
      assert.equal(branches[1].properties.__value.type, 'array', 'Present attention cannot be null');
      const result = { ...output, cognition: { ...output.cognition, prediction: {
        __present: true, __value: { ...output.cognition.prediction, attention },
      } } };
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] });
    };
    const result = PartGenerationSchema.parse(await new OpenAIProvider('fixture-credential', 'fixture-model', transport).constructed(input));
    assert.deepEqual(result.cognition.prediction?.attention, attention.__present ? attention.__value : undefined);
  }
});

test('an assembled Part cannot generate another prediction while its supplied prediction is open', async () => {
  const draft = { expectation: 'A reply will follow.',
    capsule: { interpretation: 'Contact is open.', details: [], entities: [], activation: 2, spike: 0, sourceIds: [] },
    confidence: 0.5, horizon: 'next exchange', evaluateAfterCycle: null };
  const pending = PredictionSchema.parse({ ...draft, id: 'pending', agentId: 'agent', version: 1, schemaVersion: 1,
    partId: 'part', createdCycle: 'past_cycle', status: 'open', evaluation: null, memoryId: null });
  const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world, memories: [], predictions: [pending] };
  const product = PartGenerationSchema.parse(await new MockReasoning().constructed({ ...input, predictions: [] }));
  const schema = constructedOutputSchema(input);
  assert.equal(schema.safeParse({ ...product, cognition: { ...product.cognition, prediction: draft } }).success, false);
  assert.equal(schema.safeParse({ ...product, cognition: { ...product.cognition, prediction: null } }).success, true);
  const wire = z.toJSONSchema(schema) as any;
  assert.equal(productBranch(wire).properties.cognition.properties.prediction.type, 'null');
  assert.equal(constructedOutputSchema({ ...input, predictions: [] }).safeParse({ ...product, cognition: { ...product.cognition, prediction: draft } }).success, true);
});

test('assembled live-provider schemas couple subjective reflection with its gist', async () => {
  const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world, memories: [] };
  const product = PartGenerationSchema.parse(await new MockReasoning().constructed(input));
  const schema = constructedOutputSchema(input);
  assert.ok(product.memoryReflection && product.memoryGist);
  assert.equal(schema.safeParse(product).success, true);
  assert.equal(schema.safeParse({ ...product, memoryReflection: null, memoryGist: null }).success, true);
  assert.equal(schema.safeParse({ ...product, memoryReflection: null }).success, false);
  assert.equal(schema.safeParse({ ...product, memoryGist: null }).success, false);
});
test('OpenAI and Ollama dispatch every constructed generation task with strict products and editable catalog contracts', async () => {
  const fixture = new MockReasoning();
  for (const task of constructedTasks) {
    const input: ConstructedInput = { task, agentId: 'agent', ...(['experiential_formation', 'disposition_learning', 'memory_reinterpretation', 'memory_synthesis', 'effortful_recall'].includes(task) ? {} : { world }), ...(task === 'part_cognition' ? { workingParts: [] } : {}),
      memories: [], predictions: [], dispositions: [],
      ...(task === 'memory_synthesis' ? { synthesisPolicy: { detailPolicy: 'preserve_details' as const, synthesisInstructions: '' },
        dispositions: [{ id: 'cold', agentId: 'agent', version: 1, schemaVersion: 1, name: 'Cold Weather Travel', concern: 'Notice cold travel', cues: ['cold car'], scope: 'cold travel', prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }] } : {}),
      ...(task === 'disposition_learning' ? { dispositionHistory: [], observations: { episodes: [], coactivations: [] }, learningTraces: [{ cycleId: 'selected-learning-cycle', sequence: 1, threadId: 'selected-thread',
        activations: [{ dispositionId: 'painting', scope: 'paint + surface + intention', score: 3, active: true }], thoughts: [] }] } : {}) };
    const output = await fixture.constructed(input);
    const requests: string[] = [];
    const openaiTransport: typeof fetch = async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      requests.push(typeof body.input === 'string' ? body.input : body.input.map((message: { content: string }) => message.content).join(''));
      const checkSupportedUnions = (node: any) => {
        if (!node || typeof node !== 'object') return;
        assert.equal('oneOf' in node, false, 'OpenAI does not support oneOf in structured output schemas');
        Object.values(node).forEach(checkSupportedUnions);
      };
      checkSupportedUnions(body.text.format.schema);
      assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.ok(!('previous_response_id' in body));
      if (task === 'part_cognition') {
        for (const product of body.text.format.schema.properties.result.anyOf) {
          assert.deepEqual(Object.keys(product.properties), ['formation', 'memoryReflection', 'memoryGist', 'cognition']);
          assert.deepEqual(Object.keys(product.properties.cognition.properties), ['interpretation', 'beliefs', 'affect', 'affectProposals', 'thought', 'evidenceSummary', 'prediction', 'localGoal', 'proposal']);
        }
      }
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: output }) }] }] }));
    };
    const ollamaTransport: typeof fetch = async (_url, options) => {
      const body = JSON.parse(options!.body as string); requests.push(body.messages[1].content);
      assert.ok(body.format); assert.equal(body.stream, false);
      return new Response(JSON.stringify({ message: { content: JSON.stringify(output) } }));
    };
    assert.deepEqual(await new OpenAIProvider('fixture-credential', 'fixture-model', openaiTransport).constructed(input), constructedOutputs[task].parse(output));
    assert.deepEqual(await new OllamaProvider('fixture-model', 'http://localhost:11434', ollamaTransport).constructed(input), constructedOutputs[task].parse(output));
    assert.equal(requests.length, 2, 'Each provider makes exactly one transport request');
    assert.ok(requests.every(prompt => prompt.includes(`Task: ${task}`)));
    if (task === 'part_cognition') assert.ok(requests.every(prompt => prompt.includes('formation, memoryReflection, memoryGist, cognition')));
    if (task === 'memory_synthesis') {
      assert.ok(requests.every(prompt => prompt.includes('preserve_details')));
      assert.ok(promptInspection[task]!.variables.some(variable => variable.name === 'synthesisPolicy'));
    }
    if (task === 'disposition_learning') {
      assert.ok(requests.every(prompt => prompt.includes('selected-learning-cycle') && prompt.includes('selected-thread')));
      assert.ok(promptInspection[task]!.variables.some(variable => variable.name === 'learningTraces'));
    }
    assert.equal(promptCatalog.some(entry => entry.task === task), true, 'Every active generation task is editable');
    assert.ok(promptInspection[task]?.outputSchema);
    if (!input.world) assert.ok(requests.every(prompt => !prompt.includes(world.id)));
  }
});

test('Jev batches independent WorldState disposition and memory judgments; Agent routing retains the owning Agent', async () => {
  for (const task of ['memory_accessibility', 'disposition_activation'] as const) {
    const input: JudgmentInput = { task, agentId: 'agent', world,
      candidates: [{ id: 'a', question: 'Score a independently', context: { clue: 'a' } }, { id: 'b', question: 'Score b independently', context: { clue: 'b' } }] };
    const jev = new JevDecisions({ scores: async request => {
      assert.equal(request.questions.length, 2); assert.ok(request.state.includes(world.id));
      if (task === 'disposition_activation') assert.ok(!request.state.includes('Perception:')); assert.ok(request.state.includes(`Task: ${task}`));
      assert.ok(request.questions.every(question => question.kind === 'Score' && question.minimum === 0 && question.maximum === 4));
      return request.questions.map(question => ({ partId: question.id, score: 3 }));
    }, choice: async () => { throw new Error('Independent activation cannot use a winner-take-all choice'); } });
    assert.deepEqual(await jev.judge(input), [{ partId: 'a', score: 3 }, { partId: 'b', score: 3 }]);
    assert.equal(promptCatalog.some(entry => entry.task === task), true); assert.ok(promptInspection[task]?.outputSchema);
  }
  const seen: string[] = [];
  class Routed extends MockReasoning {
    override async constructed(input: ConstructedInput) { seen.push(input.agentId); return super.constructed(input); }
  }
  const router = new AgentReasoningProvider(new MockReasoning(), agentId => { assert.equal(agentId, 'selected-agent'); return new Routed(); });
  await router.constructed({ task: 'disposition_learning', agentId: 'selected-agent', memories: [], predictions: [] });
  assert.deepEqual(seen, ['selected-agent']);
});

test('first-pass inquiry targets only supplied continuity IDs and excludes invented new-Part IDs', async () => {
  const inquiry = { type: 'deliberate', action: null, argument: 'My expectation needs questioning.', identityFit: [], executionOrder: [], target_parts: ['supplied_part'], question: 'Why am I expecting that?' };
  const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', world, memories: [] };
  const product = PartGenerationSchema.parse(await new MockReasoning().constructed(input));
  const schema = constructedOutputSchema(input);
  assert.equal(schema.safeParse({ ...product, cognition: { ...product.cognition, proposal: inquiry } }).success, false);
  const constrained = constructedOutputSchema({ ...input, workingParts: [{ id: 'supplied_part' }] } as ConstructedInput);
  assert.equal(constrained.safeParse({ ...product, cognition: { ...product.cognition, proposal: inquiry } }).success, true);
  assert.equal(constrained.safeParse({ ...product, cognition: { ...product.cognition, proposal: { ...inquiry, target_parts: ['invented_part'] } } }).success, false);
  assert.equal(constrained.safeParse({ ...product, cognition: { ...product.cognition, proposal: { ...inquiry, target_parts: ['supplied_part', 'supplied_part'] } } }).success, false);
});

test('Part requests share an exact world prefix, isolate private suffixes, and report cache usage', async () => {
  const { XaiProvider } = await import('../../packages/providers/src/xai.js');
  const captured: any[] = []; const usage: any[] = [];
  const inputs: ConstructedInput[] = ['first-private-memory', 'second-private-memory'].map(content => ({ task: 'part_cognition', agentId: 'agent', world,
    memories: [MemorySchema.parse({ id: 'private-memory', agentId: 'agent', version: 1, schemaVersion: 1, partId: 'owner', content, gist: content, context: [], ancestorIds: [], predictionId: null, createdCycle: 'past_cycle' })], workingParts: [] }));
  let result: unknown;
  const provider = new XaiProvider('fixture-credential', 'grok-4.3', async (_url, options) => {
    captured.push(JSON.parse(options!.body as string));
    return Response.json({ status: 'completed', usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 2000 }, output_tokens: 100 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] });
  }, undefined, record => usage.push(record));
  for (const input of inputs) { result = await new MockReasoning().constructed(input); await provider.constructed(input); }
  assert.equal(captured[0].input.length, 2);
  assert.ok(captured[0].input.every((message: { content: string }) => !message.content.includes('{#') && !message.content.includes('private_scope_context')));
  assert.deepEqual(captured[0].input[0], captured[1].input[0]);
  const snapshot = captured[0].input[0].content.split('Complete immutable WorldState and decaying thought history: ')[1].split('\n')[0];
  assert.deepEqual(JSON.parse(snapshot), world);
  assert.ok(!captured[0].input[0].content.includes('first-private-memory'));
  assert.ok(!captured[1].input[0].content.includes('second-private-memory'));
  assert.ok(captured[0].input[1].content.includes('first-private-memory'));
  assert.ok(!captured[0].input[1].content.includes('second-private-memory'));
  assert.equal(captured[0].prompt_cache_key, captured[1].prompt_cache_key);
  assert.equal(captured[0].store, false); assert.equal(captured[0].previous_response_id, undefined);
  assert.equal(usage.length, 2); assert.equal(usage[0].cycleId, world.cycleId);
  assert.equal(usage[0].usage.cachedInputTokens, 2000);
  result = await new MockReasoning().constructed({ ...inputs[0]!, agentId: 'another-agent' });
  await provider.constructed({ ...inputs[0]!, agentId: 'another-agent' });
  assert.notEqual(captured[2].prompt_cache_key, captured[0].prompt_cache_key);
  const overridden = new XaiProvider('fixture-credential', 'grok-4.3', async (_url, options) => {
    assert.equal(JSON.parse(options!.body as string).input, 'Researcher override');
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] });
  }, () => 'Researcher override');
  await overridden.constructed(inputs[0]!);
});


test('Twig cache boundaries preserve full prompt rendering and valid cross-section overrides', async () => {
  const { renderTaskPrompt, renderTaskPromptMessages } = await import('../../packages/providers/src/prompts.js');
  const data = { world, memories: [], workingParts: [] };
  const messages = renderTaskPromptMessages('agent', 'part_cognition', data);
  assert.ok(Array.isArray(messages));
  assert.equal((messages as string[]).join(''), renderTaskPrompt('agent', 'part_cognition', data));
  const override = () => '{% set phrase = "researcher words" %}{# private_scope_context #}{{ phrase }}';
  assert.equal(renderTaskPromptMessages('agent', 'part_cognition', data, override), 'researcher words');
});
