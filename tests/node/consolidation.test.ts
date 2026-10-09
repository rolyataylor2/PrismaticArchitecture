import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { ConsolidationContext } from '../../packages/core/src/consolidation-domain.js';

test('sleep conservatively digests owner traces, versions memory, forms relationship and adjusts triggers/associations', async () => {
  const store = new SqliteStore(':memory:');
  const inputs: ConsolidationContext[] = [];
  class Reasoning extends MockReasoning {
    override async consolidate(context: ConsolidationContext) { inputs.push(context); return super.consolidate(context); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const empty = await app.consolidation.run(agent.id);
    assert.ok(empty.changes.every(c => !c.accepted));
    for (let i = 0; i < 2; i++) {
      await app.message(agent.id, 'I am uncertain and afraid to share vulnerability in this personal conversation.', 'Bill');
      await app.message(agent.id, 'Thank you for sharing. I respect you.', 'Bill');
    }
    const before = store.list('part', agent.id).length;
    const run = await app.consolidation.run(agent.id);
    assert.equal(run.status, 'completed');
    assert.ok(run.changes.some(c => c.accepted && c.proposal.kind === 'update'));
    assert.ok(run.changes.some(c => c.accepted && c.proposal.kind === 'memory_revision'));
    assert.ok(run.changes.some(c => c.accepted && c.proposal.kind === 'formation'));
    const parts = store.list('part', agent.id);
    assert.equal(parts.length, before + 1);
    const caution = parts.find(p => p.name === 'My Fear Of Rejection')!;
    const bill = parts.find(p => p.name === 'My Trust In Bill')!;
    assert.ok(bill.lineage.includes(caution.id));
    assert.ok(caution.associations.some(a => a.targetPartId === bill.id));
    assert.equal(caution.triggers.some(t => t.includes('Bill')), false);
    assert.ok(bill.provenance.length > 0);
    assert.ok(store.list('memory', agent.id).every(m => m.version === 2));
    assert.ok(store.versions('memory', store.list('memory', agent.id)[0]!.id)[0]!.state.content.includes('I risked'));
    for (const input of inputs) {
      assert.equal('world' in input, false);
      assert.equal('store' in input, false);
      assert.ok(input.memories.every(m => m.partId === input.part.id));
      assert.ok(input.predictions.every(p => p.partId === input.part.id));
      assert.ok(input.population.every(p => !('beliefs' in p) && !('memories' in p)));
    }
    const again = await app.consolidation.run(agent.id);
    assert.ok(again.changes.every(c => !c.accepted));
    assert.equal(store.list('part', agent.id).length, before + 1);
  } finally { store.close(); }
});
test('ancestor replay is explicit, restricted to ancestry and interpreted by current owner', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about vulnerability and personal rejection.', 'Bill');
    await app.message(agent.id, 'Thank you for sharing. I respect you.', 'Bill');
    const memory = store.list('memory', agent.id)[0]!;
    await assert.rejects(app.consolidation.replay(memory.id, 'not-an-ancestor', 'I want to reconsider a conflict.'), /ancestor/);
    const replayed = await app.consolidation.replay(memory.id, memory.ancestorIds[0]!, 'My current trust conflicts with the old experience.');
    assert.equal(replayed.version, 2);
    assert.deepEqual(replayed.ancestorIds, memory.ancestorIds);
    assert.ok(store.events(agent.id).some(e => e.type === 'memory.ancestor_replayed'));
  } finally { store.close(); }
});

test('ordinary sleep does not read raw audit history and rejects attempts to revise another owner memory', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async consolidate(_context: ConsolidationContext): ReturnType<MockReasoning['consolidate']> {
      return { proposals: [{ kind: 'memory_revision', memoryId: 'unavailable-memory', content: 'Invalid replacement', gist: 'Invalid', reason: 'Attempted foreign-memory edit' }] };
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    store.events = () => { throw new Error('Raw audit history must not be read by ordinary sleep'); };
    store.world = () => { throw new Error('Objective ancestor must not be read by ordinary sleep'); };
    const result = await app.consolidation.run(agent.id);
    assert.equal(result.status, 'completed');
    assert.ok(result.changes.every(c => !c.accepted && c.explanation.includes('Rejected by mutation validation')));
    assert.equal(store.list('memory', agent.id).length, 0);
  } finally { store.close(); }
});
