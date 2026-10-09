import test from 'node:test';
import assert from 'node:assert/strict';
import { FactSchema } from '../../packages/core/src/domain.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';

test('facts preserve timestamps and speakers and render readable dialogue without operation IDs', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'I feel uncertain about sharing something personal.', 'Bill', 'thread');
    const original = store.world(first.cycle.worldId).facts[0]!;
    const second = await app.message(agent.id, 'Please continue.', 'Bill', 'thread');
    const world = store.world(second.cycle.worldId);
    assert.equal(world.facts.filter(fact => fact.text === original.text).length, 1);
    assert.equal(world.facts.find(fact => fact.text === original.text)?.timestamp, original.timestamp);
    assert.equal(original.kind, 'says');
    assert.ok(world.facts.every(fact => fact.timestamp && Number.isFinite(Date.parse(fact.timestamp))));
    assert.ok(!world.facts.some(fact => fact.source === 'external execution status'));
    if (first.execution) {
      assert.ok(world.facts.some(fact => fact.source === 'Agent' && fact.kind === (first.execution!.action.kind === 'wait' ? 'does' : 'says') && fact.text === first.execution!.action.text));
      const rendered = renderTaskPrompt(agent.id, 'activation', { world, candidates: [] });
      assert.ok(rendered.includes(`[${original.timestamp}] Bill says: ${original.text}`));
      assert.ok(!rendered.includes(first.execution.id));
    }
    const explicit = '2000-01-01T00:00:00.000Z';
    const third = await app.runtime.run(agent.id, [{ source: 'Environment', kind: 'observes', timestamp: explicit, text: 'The door is open.', referenceId: null }], 'thread');
    assert.equal(store.world(third.cycle.worldId).facts.at(-1)?.timestamp, explicit);
  } finally { store.close(); }
});

test('legacy dialogue kinds remain readable without inventing an occurrence timestamp', () => {
  for (const kind of ['utterance', 'prior_output']) {
    const fact = FactSchema.parse({ source: 'Bill', kind, text: 'Hello.', referenceId: null });
    assert.equal(fact.kind, 'says'); assert.equal(fact.timestamp, null);
  }
});
