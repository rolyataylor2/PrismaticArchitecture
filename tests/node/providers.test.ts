import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaProvider } from '../../packages/providers/src/ollama.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { configuredProviders } from '../../packages/providers/src/config.js';
import { demoIdentity, demoParts } from '../../packages/sdk/src/seed.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

const self: SelfContext = { identity: { ...demoIdentity, id: 'agent', agentId: 'agent', version: 1, schemaVersion: 2 }, contributions: [], deliberation: [] };
test('Ollama uses isolated schema-constrained requests and validates output', async () => {
  const requests: Record<string, unknown>[] = [];
  const transport: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(init!.body as string) as Record<string, unknown>);
    return new Response(JSON.stringify({ message: { content: JSON.stringify([{ partId: 'DELIBERATE', score: 4 }]) } }));
  };
  const provider = new OllamaProvider('test-model', 'http://localhost:11434', transport);
  assert.equal((await provider.choose(self)).choice, 'DELIBERATE');
  assert.equal(requests[0]!.stream, false);
  assert.ok(requests[0]!.format);
  assert.equal(JSON.stringify(requests[0]).includes('worldId'), false);
  const invalid = new OllamaProvider('test', undefined, async () => new Response('{}'));
  await assert.rejects(invalid.choose(self), /invalid structured output/);
  const edited = new OllamaProvider('test-model', 'http://localhost:11434', async (_url, init) => {
    const request = JSON.parse(init!.body as string);
    assert.match(request.messages[1].content, /^agent arbitration prompt/);
    return Response.json({ message: { content: JSON.stringify([{ partId: 'DELIBERATE', score: 4 }]) } });
  }, () => 'agent arbitration prompt');
  await edited.choose(self);
});
test('Jev contract preserves a shared Score request and bounded world-blind choices', async () => {
  let calls = 0;
  const world = { id: 'w', agentId: 'agent', cycleId: 'c', sequence: 1, capturedAt: 'now', facts: [] };
  const provider = new JevDecisions({
    async scores(request) {
      calls++; if (request.questions[0]?.id === 'DELIBERATE') { assert.match(request.state, /custom arbitration prompt/); return [{ partId: 'DELIBERATE', score: 4 }]; } assert.match(request.state, /custom activation prompt/); assert.equal(request.questions.length, 2);
      assert.ok(request.questions.every(q => q.kind === 'Score'));
      assert.ok(request.questions.every(q => q.question.includes('task directions in state')));
      assert.ok(request.questions.every(q => q.question.includes('candidate')));
      return request.questions.map(q => ({ partId: q.id, score: 4 }));
    },
    async choice(request) { assert.match(request.state, /custom arbitration prompt/); assert.deepEqual(request.choices, ['DELIBERATE']); return { choice: 'DELIBERATE', explanation: 'No proposals', identityConflict: '' }; },
  }, (agentId, task) => `${agentId === 'agent' ? 'custom' : 'unexpected-agent'} ${task} prompt`);
  const results = await provider.score({ world, candidates: ['a', 'b'].map((id, index) => ({ ...demoParts[index]!, id, agentId: 'agent', version: 1, schemaVersion: 1, triggers: [index === 0 ? 'one' : 'two'] })) });
  assert.equal(calls, 1); assert.deepEqual(results.map(r => r.score), [4, 4]);
  await provider.choose(self);
  assert.throws(() => configuredProviders({ PRISM_DECISIONS: 'jev' }), /transport/);
});
