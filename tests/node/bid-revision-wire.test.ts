import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { bidRevisionWireSchema } from '../../packages/providers/src/bid-revision-wire.js';
import { strictOutputSchema } from '../../packages/providers/src/openai.js';
import { partProposalSchema } from '../../packages/providers/src/deliberation-schema.js';
import { primitiveAnswerSchema } from '../../packages/providers/src/primitive-prompt.js';
import { defaultPrimitives } from '../../packages/core/src/primitives.js';

const world = { id: 'world', agentId: 'agent', cycleId: 'cycle', sequence: 1, capturedAt: 'now', facts: [],
  embodied: true as const };
const proposal = { type: 'action', action: { kind: 'act', text: 'Examine the nearby object',
  successCriteria: 'I observe its accessible surface', constraints: [] }, argument: 'Satisfy curiosity', identityFit: [], executionOrder: [] };

test('wire alternatives encode the existing revision correlation without altering valid products or contextual restrictions', () => {
  const domain = partProposalSchema({ part: { id: 'part' }, world }).answer;
  const wire = bidRevisionWireSchema(domain);
  for (const bid_disposition of ['retain', 'withdraw', 'replace']) for (const new_bid of [null, proposal]) {
    const product = { response: 'My own bounded response', bid_disposition, new_bid };
    const valid = (bid_disposition === 'replace') === (new_bid !== null);
    assert.equal(domain.safeParse(product).success, valid);
    assert.equal(wire.safeParse(product).success, valid);
    if (valid) assert.deepEqual(wire.parse(product), domain.parse(product));
  }
  const replace = { response: 'I prefer this action', bid_disposition: 'replace', new_bid: proposal };
  assert.equal(wire.safeParse({ ...replace, new_bid: { ...proposal, action: { kind: 'say', text: 'Bypass the body' } } }).success, false);
  assert.equal(wire.safeParse({ ...replace, new_bid: { type: 'deliberate', target_parts: ['foreign'], question: 'What next?',
    why_deliberate: 'Need clarity', primary_c: 'curiosity', secondary_c: 'clarity', missing_information: 'Next step' } }).success, false);
  assert.equal(wire.safeParse({ ...replace, affectProposals: [] }).success, true);
  assert.equal(wire.safeParse({ ...replace, prediction: {} }).success, false);
  const json = strictOutputSchema(z.toJSONSchema(z.strictObject({ result: wire }))) as any;
  assert.equal(json.type, 'object'); assert.equal(json.anyOf, undefined);
  assert.equal(json.properties.result.anyOf.length, 3);
  for (const branch of json.properties.result.anyOf) {
    assert.equal(branch.additionalProperties, false);
    assert.ok(branch.required.includes('response'));
    assert.ok(branch.required.includes('bid_disposition'));
    assert.ok(branch.required.includes('new_bid'));
    assert.equal(branch.properties.new_bid.type === 'null', branch.properties.bid_disposition.const !== 'replace');
  }
});

test('disabled primitive bids and ordinary schemas keep their exact generation contract', () => {
  const primitive = { ...defaultPrimitives()[0]!, bidsEnabled: false };
  const disabled = primitiveAnswerSchema(primitive);
  assert.equal(bidRevisionWireSchema(disabled), disabled);
  assert.equal(disabled.safeParse({ response: 'I notice', bid_disposition: 'replace', new_bid: proposal }).success, false);
  const ordinary = z.strictObject({ response: z.string() });
  assert.equal(bidRevisionWireSchema(ordinary), ordinary);
});

test('configured adapters send correlated schemas and reject invalid responses without retry or bid repair', async () => {
  const { OpenAIProvider } = await import('../../packages/providers/src/openai.js');
  const { XaiProvider } = await import('../../packages/providers/src/xai.js');
  const { OllamaProvider } = await import('../../packages/providers/src/ollama.js');
  const { CompatibleChatProvider } = await import('../../packages/providers/src/compatible-chat.js');
  const primitive = { ...defaultPrimitives().find(p => p.id === 'primitive_13')!, bidsEnabled: true };
  const bid = { action: { kind: 'say', text: 'I want to explore' }, argument: 'Express curiosity', identityFit: [], executionOrder: [] };
  for (const vendor of ['openai', 'xai', 'ollama', 'gemini', 'qwen', 'openrouter']) {
    for (const bid_disposition of ['retain', 'withdraw', 'replace']) for (const new_bid of [null, bid]) {
      let calls = 0;
      const output = { response: 'My own response', bid_disposition, new_bid };
      const transport: typeof fetch = async (_url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string);
        const schema = vendor === 'ollama' ? body.format : ['openai', 'xai'].includes(vendor)
          ? body.text.format.schema.properties.result : vendor === 'qwen'
            ? JSON.parse(body.messages[0].content.split('Follow this JSON schema exactly: ')[1]).properties.result
            : body.response_format.json_schema.schema.properties.result;
        assert.equal(schema.anyOf.length, 3);
        const branch = schema.anyOf.find((b: any) => b.properties.bid_disposition.const === bid_disposition);
        assert.equal(branch.properties.new_bid.type, bid_disposition === 'replace' ? 'object' : 'null');
        const content = JSON.stringify(vendor === 'ollama' ? output : { result: output });
        return vendor === 'ollama' ? Response.json({ message: { content } }) : ['openai', 'xai'].includes(vendor)
          ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: content }] }] })
          : Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
      };
      const provider = vendor === 'openai' ? new OpenAIProvider('fixture-key', 'fixture-model', transport)
        : vendor === 'xai' ? new XaiProvider('fixture-key', 'fixture-model', transport)
          : vendor === 'ollama' ? new OllamaProvider('fixture-model', undefined, transport)
            : new CompatibleChatProvider(vendor as 'gemini' | 'qwen' | 'openrouter', 'fixture-key', 'fixture-model', transport);
      const result = provider.primitiveAnswer({ world: { ...world, embodied: undefined }, primitive, currentBid: null, deliberation: [] }, 'What do you advocate?');
      if ((bid_disposition === 'replace') === (new_bid !== null)) assert.deepEqual(await result, output);
      else await assert.rejects(result, /invalid structured output/);
      assert.equal(calls, 1);
    }
  }
});
