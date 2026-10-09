import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { DecisionProvider, PartContext } from '../../packages/core/src/contracts.js';
import { snapshot, api } from '../../packages/sdk/src/api.js';

test('threads isolate facts, activation, stickiness and private thought continuity across restart while sharing learning', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-threads-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const contexts: PartContext[] = [];
  class Decisions extends MockDecisions {
    override async recall(input: Parameters<NonNullable<DecisionProvider['recall']>>[0]) { return input.entries.map(entry => ({ partId: entry.memory.id, score: 4 })); }
    override async score(input: Parameters<DecisionProvider['score']>[0]) { return [...input.candidates.map(part => ({ partId: part.id, score: 3 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))]; }
  }
  class Embeddings extends MockEmbeddings { override async embed(_text: string) { return [1, 0]; } }
  class Reasoning extends MockReasoning {
    override async cognize(context: PartContext) {
      contexts.push(context);
      const output = await super.cognize(context);
      const text = context.world.facts.at(-1)!.text;
      return { ...output, thought: `${context.part.name}: ${text}` };
    }
  }
  const providers = { decisions: new Decisions(), embeddings: new Embeddings(), reasoning: new Reasoning() };
  try {
    let app = new Application(store, providers);
    const agent = app.createAgent('Thread Agent');
    const a = await app.message(agent.id, 'a:first', 'user', 'thread-a');
    const curiosity = store.list('part', agent.id).find(part => part.name === 'My Need To Understand Others')!;
    app.runtime.mutations.patch(curiosity.id, curiosity.version, { stickiness: { retained: true, unresolved: true, concern: 'Concern in A' }, beliefs: ['Shared learned lesson'] },
      { origin: 'researcher_edit', reason: 'Thread isolation fixture', sourceIds: [] }, a.cycle.id);
    app.runtime.predictions.encode(curiosity.id, store.world(a.cycle.worldId), { gist: 'Shared lesson', content: 'I learned something.', context: [] });
    contexts.length = 0;
    const b = await app.message(agent.id, 'b:first', 'user', 'thread-b');
    assert.equal(b.cycle.threadId, 'thread-b');
    for (const context of contexts) {
      assert.deepEqual(context.world.facts.map(fact => fact.text), ['b:first']);
      assert.equal(context.activation.previous, 0);
      assert.equal(context.part.stickiness.retained, false);
      assert.deepEqual(context.recentThoughts, []);
    }
    const bCuriosity = contexts.find(context => context.part.id === curiosity.id)!;
    assert.deepEqual(bCuriosity.part.beliefs, ['Shared learned lesson']);
    assert.equal(bCuriosity.memories[0]!.gist, 'Shared lesson');
    assert.equal(snapshot(app, agent.id, 'thread-a').parts.find(part => part.id === curiosity.id)!.stickiness.retained, true);
    assert.equal(snapshot(app, agent.id, 'thread-b').parts.find(part => part.id === curiosity.id)!.stickiness.retained, false);

    store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    contexts.length = 0;
    await app.message(agent.id, 'a:second', 'user', 'thread-a');
    for (const context of contexts) {
      assert.ok(context.world.facts.some(fact => fact.text === 'a:first'));
      assert.ok(context.world.facts.every(fact => !fact.text.includes('b:first')));
      assert.equal(context.activation.previous, 3);
      assert.equal(context.recentThoughts!.length, 1);
      assert.equal(context.recentThoughts![0]!.thought, `${context.part.name}: a:first`);
    }
    assert.equal(contexts.find(context => context.part.id === curiosity.id)!.part.stickiness.concern, 'Concern in A');
    assert.deepEqual(store.recentFacts(agent.id, 8), []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('legacy thread registration preserves historical events and rejects reassignment or foreign cycles', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent(); const other = app.createAgent('Other');
    const result = await app.message(agent.id, 'I am uncertain about a personal conversation.');
    const before = store.events(agent.id);
    store.assignCyclesToThread(agent.id, 'legacy-thread', [result.cycle.id]);
    store.assignCyclesToThread(agent.id, 'legacy-thread', [result.cycle.id]);
    assert.equal(store.cycle(result.cycle.id).threadId, 'legacy-thread');
    assert.deepEqual(store.events(agent.id), before);
    assert.throws(() => store.assignCyclesToThread(agent.id, 'different-thread', [result.cycle.id]), /another thread/);
    assert.throws(() => store.assignCyclesToThread(other.id, 'foreign-thread', [result.cycle.id]), /ownership/);
    const fresh = await api(app, 'POST', `/api/agents/${agent.id}/message`, { text: 'New thread hello', threadId: 'fresh-thread' }) as { cycle: { id: string } };
    assert.deepEqual(store.world(store.cycle(fresh.cycle.id).worldId).facts.map(fact => fact.text), ['New thread hello']);
  } finally { store.close(); }
});
