import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { ActivationInput } from '../../packages/core/src/contracts.js';
import { PartSchema } from '../../packages/core/src/domain.js';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';

test('retrieval keys enter cached vectors but never scoring or custom activation prompts', async () => {
  const store = new SqliteStore(':memory:');
  const texts: string[] = [];
  let input: ActivationInput | undefined;
  class Embeddings extends MockEmbeddings {
    override async embed(text: string) { texts.push(text); return [1]; }
  }
  class Decisions extends MockDecisions {
    override async score(value: ActivationInput) { input = value; return super.score(value); }
  }
  try {
    const app = new Application(store, { embeddings: new Embeddings(), decisions: new Decisions(), reasoning: new MockReasoning() });
    const agent = app.createAgent();
    const part = store.list('part', agent.id)[0]!;
    const change = { origin: 'researcher_edit' as const, reason: 'Retrieval metadata', sourceIds: [] };
    const changed = app.runtime.mutations.patch(part.id, part.version, { retrievalKeys: ['Pet', 'Animal', 'unique_retrieval_marker'] }, change);
    await app.message(agent.id, 'Hello');
    assert.ok(texts.some(text => text.includes('unique_retrieval_marker')));
    assert.ok(input);
    assert.ok(input.candidates.every(candidate => !('retrievalKeys' in candidate)));
    const custom = renderTaskPrompt(agent.id, 'activation', { ...input, candidates: [changed] }, () => '{{ candidates|json_encode }}');
    assert.ok(!custom.includes('unique_retrieval_marker'));
    const before = texts.length;
    app.runtime.mutations.patch(part.id, store.get('part', part.id).version, { retrievalKeys: ['new_retrieval_marker'] }, change);
    await app.message(agent.id, 'Hello again');
    assert.ok(texts.slice(before).some(text => text.includes('new_retrieval_marker')));
    assert.deepEqual(store.versions('part', part.id).find(record => record.state.version === changed.version)!.state.retrievalKeys, changed.retrievalKeys);
    const { retrievalKeys: _keys, ...legacy } = part;
    assert.equal(PartSchema.parse(legacy).retrievalKeys, undefined);
    assert.throws(() => PartSchema.parse({ ...part, retrievalKeys: [''] }));
  } finally { store.close(); }
});
