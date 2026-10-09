import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { selfChoices } from '../../packages/core/src/context.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

test('Self retains full cycle contributions and inquiries; NOTHING is available only after two complete rounds', async () => {
  const store = new SqliteStore(':memory:');
  const inputs: SelfContext[] = [];
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      return [...input.candidates.map(part => ({ partId: part.id, score: 4 })), ...(input.primitives ?? []).map(p => ({ partId: p.id, score: 0 }))];
    }
    override async choose(context: SelfContext) {
      inputs.push(context);
      return { choice: inputs.length <= 2 ? 'DELIBERATE' : 'NOTHING', explanation: 'Fixture bounded choice.', identityConflict: '' };
    }
  }
  let round = 0;
  class Reasoning extends MockReasoning {
    override async question(context: SelfContext) {
      round++;
      return { ...await super.question(context), question: `Clarify round ${round}`, target_parts: context.contributions.map(c => c.partId) };
    }
    override async answer(): ReturnType<MockReasoning['answer']> {
      return { response: `Response from round ${round}`, bid_disposition: 'withdraw', new_bid: null };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'I am uncertain about personal vulnerability.');
    assert.equal(result.execution, null);
    assert.deepEqual(inputs.map(c => c.completedDeliberationRounds), [0, 1, 2]);
    assert.deepEqual(inputs.map(c => selfChoices(c).includes('NOTHING')), [false, false, true]);
    const final = inputs[2]!;
    assert.equal(final.inquiries!.length, 2);
    assert.equal(final.deliberation.length, final.contributions.length * 2);
    assert.ok(final.contributionHistory!.some(c => c.bid));
    assert.ok(final.contributions.every(c => !c.bid));
    assert.equal('world' in final, false);
    let state = '';
    const jev = new JevDecisions({ async scores(request) { state = request.state; assert.ok(request.questions.some(q => q.id === 'NOTHING')); return request.questions.map(q => ({ partId: q.id, score: q.id === 'NOTHING' ? 4 : 0 })); }, async choice() { throw new Error('Self must use Scores'); } });
    await jev.choose(final);
    assert.ok(state.includes('Clarify round 1')); assert.ok(state.includes('Clarify round 2'));
    assert.ok(state.includes('Response from round 1')); assert.ok(state.includes('Response from round 2'));
    assert.ok(state.includes(final.contributionHistory!.find(c => c.bid)!.bid!.id));
    for (const text of ['Give concise', 'Autobiographical', 'memoryless', 're-evaluation']) assert.ok(!state.includes(text), text);
    assert.ok(!('world' in final));
    await jev.choose({ ...final, inquiries: [{ question: 'Part proposed inquiry', target_parts: [final.contributions[0]!.partId], sourceBidId: 'earlier_bid' }] });
    assert.ok(state.includes('Part proposed inquiry'));
    const rejected = new JevDecisions({ async scores() { return [{ partId: 'NOTHING', score: 4 }]; }, async choice() { throw new Error('Self must use Scores'); } });
    await assert.rejects(rejected.choose(inputs[0]!), /unavailable Self score/);
  } finally { store.close(); }
});

test('runtime rejects NOTHING before deliberation, even from a custom decision provider', async () => {
  const store = new SqliteStore(':memory:');
  class Decisions extends MockDecisions { override async choose() { return { choice: 'NOTHING', explanation: 'Fixture bounded choice.', identityConflict: '' }; } }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'I feel uncertain.'), /not proposed/);
    assert.equal(store.executions(agent.id).length, 0);
  } finally { store.close(); }
});
