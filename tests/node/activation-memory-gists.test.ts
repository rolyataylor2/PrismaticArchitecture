import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import type { ActivationInput } from '../../packages/core/src/contracts.js';

test('Jev receives all owner-scoped timestamped current gists without memory content or developmental metadata', async () => {
  const store = new SqliteStore(':memory:');
  let input: ActivationInput | undefined;
  class Decisions extends MockDecisions {
    override async score(value: ActivationInput) { input = value; return super.score(value); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), embeddings: new MockEmbeddings(), reasoning: new MockReasoning() });
    const agent = app.createAgent();
    const part = store.list('part', agent.id)[0]!;
    const change = { origin: 'researcher_edit' as const, reason: 'Memory fixture', sourceIds: [] };
    for (let i = 0; i < 5; i++) store.save('memory', { id: `secret_memory_id_${i}`, agentId: agent.id, partId: part.id,
      version: 1, schemaVersion: 1, gist: `Remembered gist ${i}`, content: `Private detailed content ${i}`, context: [], ancestorIds: [], predictionId: null, createdCycle: 'fixture' }, 0, change);
    const originalTime = store.versions('memory', 'secret_memory_id_0')[0]!.at;
    store.save('memory', { ...store.get('memory', 'secret_memory_id_0'), version: 2, gist: 'Revised current gist' }, 1, change);
    app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    await app.message(agent.id, 'Today I am reflecting on earlier experiences.');
    assert.ok(input);
    const context = input.partActivationContext!.find(item => item.partId === part.id)!;
    assert.equal(context.memories.length, 5);
    assert.deepEqual(context.memories[0], { timestamp: originalTime, gist: 'Revised current gist' });
    let rendered = '';
    const jev = new JevDecisions({ async scores(request) { rendered = request.state; return request.questions.map(question => ({ partId: question.id, score: 2 })); }, async choice() { throw new Error('Unused'); } });
    await jev.score(input);
    assert.ok(rendered.includes(`${originalTime}: Revised current gist`));
    assert.ok(rendered.includes('Remembered gist 4'));
    assert.ok(rendered.indexOf('Revised current gist') > rendered.indexOf(`### ${part.name}`));
    assert.ok(rendered.includes('When WorldState mentions time'));
    for (const excluded of ['secret_memory_id_', 'Private detailed content', '#### Provenance', '#### Lineage', '#### Associations', '- Version:', 'schema version:']) assert.ok(!rendered.includes(excluded), excluded);
  } finally { store.close(); }
});
