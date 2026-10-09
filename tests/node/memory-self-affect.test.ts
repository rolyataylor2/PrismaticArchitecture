import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { ordinaryMemory } from '../../packages/core/src/domain.js';

test('memory stores carried Self affect separately and excludes it from recall', async () => {
  const store = new SqliteStore(':memory:');
  const requests: ConstructedInput[] = []; const judgments: JudgmentInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      product.cognition.affect = 'I feel hopeful.';
      if (product.memoryReflection) product.memoryReflection.affect = 'I feel doubtful.';
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { judgments.push(input); return super.judge(input); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'We have an opportunity to learn.', 'host', 'affect');
    const first = store.list('memory', agent.id);
    assert.ok(first.length);
    assert.deepEqual(first[0]!.selfAffectAtFormation, []);
    await app.message(agent.id, 'Let us consider another possibility.', 'host', 'affect');
    const request = requests.at(-1)!;
    const expected = request.world!.experienced!.posture.map(({ partId, affect }) => ({ partId, affect }));
    assert.ok(expected.length);
    assert.equal(expected[0]!.affect, 'I feel hopeful.');
    const memory = store.list('memory', agent.id).find(memory => memory.createdCycle === request.world!.cycleId)!;
    assert.deepEqual(memory.selfAffectAtFormation, expected);
    assert.equal(memory.encoding!.affect, 'I feel doubtful.');
    const outcome = app.runtime.predictions.encode(memory.partId!, request.world!,
      { content: 'I interpreted the outcome.', gist: 'An outcome', context: [] });
    assert.deepEqual(outcome.selfAffectAtFormation, expected);
    assert.equal('selfAffectAtFormation' in ordinaryMemory(memory), false);
    assert.equal('selfAffectAtFormation' in ordinaryMemory({ ...memory, encoding: undefined }), false);
    for (const input of requests) for (const recalled of input.memories ?? []) assert.equal('selfAffectAtFormation' in recalled, false);
    for (const input of judgments.filter(input => input.task === 'memory_accessibility')) {
      for (const candidate of input.candidates) assert.equal('selfAffectAtFormation' in (candidate.context as { memory: object }).memory, false);
    }
    const { selfAffectAtFormation: _affect, ...legacy } = memory;
    store.save('memory', { ...legacy, version: memory.version + 1 }, memory.version,
      { origin: 'researcher_edit', reason: 'Legacy compatibility fixture', sourceIds: [] });
    assert.equal(store.get('memory', memory.id).selfAffectAtFormation, undefined);
  } finally { store.close(); }
});
