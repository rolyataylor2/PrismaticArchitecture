import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSelf } from '../../packages/core/src/self-scoring.js';
import { demoIdentity } from '../../packages/sdk/src/seed.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
const context: SelfContext = { identity: { ...demoIdentity, id: 'a', agentId: 'a', version: 1, schemaVersion: 2 }, deliberation: [],
  contributions: ['a', 'b', 'c'].map(id => ({ partId: id, name: id, interpretation: '', thought: '', evidenceSummary: [], prediction: null,
    bid: { id, partId: id, action: { kind: 'say', text: id }, argument: id, identityFit: [], executionOrder: [] } })) };
test('Self selects all bids strictly above two in stable rank order', async () => {
  let calls = 0;
  const result = await scoreSelf(context, async options => {
    calls++;
    return options.map(partId => ({ partId, score: ({ a: 2.1, b: 4, c: 2, DELIBERATE: 1 }[partId] ?? 0) }));
  });
  assert.deepEqual(result.selectedBidIds, ['b', 'a']);
  assert.equal(calls, 1);
  assert.equal(result.choice, 'b');
});
test('Self does not execute bids at or below two', async () => {
  const result = await scoreSelf(context, async options => options.map(partId => ({ partId, score: partId === 'DELIBERATE' ? 0 : 2 })));
  assert.deepEqual(result.selectedBidIds, []);
  assert.equal(result.choice, 'DELIBERATE');
});
test('Self rejects missing, duplicate, invalid and unavailable scores', async () => {
  for (const scores of [[], [{ partId: 'invented', score: 4 }], [{ partId: 'a', score: 5 }], Array.from({ length: 4 }, () => ({ partId: 'a', score: 4 }))]) {
    await assert.rejects(scoreSelf(context, async () => scores));
  }
});
test('Self selects inquiry alone and respects NOTHING eligibility', async () => {
  const result = await scoreSelf(context, async options => options.map(partId => ({ partId, score: partId === 'DELIBERATE' ? 4 : 1 })));
  assert.equal(result.choice, 'DELIBERATE'); assert.deepEqual(result.selectedBidIds, []);
  await assert.rejects(scoreSelf(context, async options => options.map(partId => ({ partId: partId === 'DELIBERATE' ? 'NOTHING' : partId, score: 4 }))));
});

test('selected compatible bids reach the Executor individually with unchanged payloads', async () => {
  const { Application } = await import('./persistent-fixture.js');
  const { SqliteStore } = await import('../../packages/storage/src/sqlite.js');
  const { MockDecisions, MockReasoning, MockEmbeddings } = await import('../../packages/providers/src/mock.js');
  const store = new SqliteStore(':memory:');
  class Decisions extends MockDecisions {
    override async score(input: Parameters<import('../../packages/core/src/contracts.js').DecisionProvider['score']>[0]) {
      return [...input.candidates.map(p => ({ partId: p.id, score: 4 })), ...(input.primitives ?? []).map(p => ({ partId: p.id, score: 0 }))];
    }
    override async choose(input: SelfContext) {
      const ids = input.contributions.flatMap(c => c.bid && c.bid.type !== 'deliberate' ? [c.bid.id] : []).slice(0, 2);
      assert.equal(ids.length, 2);
      return { choice: ids[0]!, selectedBidIds: ids, explanation: 'Fixture compatible set', identityConflict: '' };
    }
  }
  try {
    const executor: import('../../packages/core/src/contracts.js').Executor = { async execute({ agentId, cycleId, bid }) {
      return { id: `execution_${bid.id}`, agentId, cycleId, action: bid.action, status: 'completed', facts: [] };
    } };
    const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() }, executor);
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'I feel uncertain about personal vulnerability.');
    assert.equal(result.executions.length, 2);
    const events = store.events(agent.id);
    const handoffs = events.flatMap(e => e.type === 'execution.handoff' ? [e.payload.bid] : []);
    assert.equal(handoffs.length, 2);
    assert.deepEqual(result.executions.map(e => e.action), handoffs.map(b => b.action));
    assert.equal(result.cycle.selectedBidId, handoffs[0]!.id);
    assert.deepEqual(store.cycle(result.cycle.id).selectedBidIds, handoffs.map(b => b.id));
  } finally { store.close(); }
});
