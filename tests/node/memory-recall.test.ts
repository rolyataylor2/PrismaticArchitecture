import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { memoryEntries, relevantMemories } from '../../packages/core/src/memory-recall.js';
import { WorldStateSchema, freeze } from '../../packages/core/src/domain.js';
import type { MemoryRelevanceInput, PartContext } from '../../packages/core/src/contracts.js';

function fixture() {
  const store = new SqliteStore(':memory:');
  const app = new Application(store);
  const agent = app.createAgent();
  const parts = store.list('part', agent.id);
  const world = freeze(WorldStateSchema.parse({ id: 'world_recall', agentId: agent.id, cycleId: 'cycle_recall', sequence: 1,
    capturedAt: '2026-10-02T18:15:00Z', facts: [{ kind: 'says', source: 'User', text: 'How was your day?', timestamp: '2026-10-02T18:15:00Z', referenceId: null }], thoughtHistory: [] }));
  const change = { origin: 'researcher_edit' as const, reason: 'Fixture memories', sourceIds: [] };
  for (let i = 0; i < 5; i++) store.save('memory', { id: `recall_${i}`, agentId: agent.id, partId: parts[i === 4 ? 1 : 0]!.id,
    version: 1, schemaVersion: 1, gist: `Gist ${i}`, content: `I experienced private ${i}`, context: ['my selected detail'], ancestorIds: ['opaque_ancestor'], predictionId: null, createdCycle: 'fixture' }, 0, change);
  return { store, app, agent, parts, world, change };
}

test('recall ranks independently, preserves exact current content/timestamp, excludes other owners and ancestry', async () => {
  const { store, app, agent, parts, world, change } = fixture();
  try {
    const timestamp = store.versions('memory', 'recall_0')[0]!.at;
    store.save('memory', { ...store.get('memory', 'recall_0'), version: 2, content: 'I used to fear it; now I welcome it.' }, 1, change);
    let rendered = '';
    const decisions = new JevDecisions({ async scores(request) { rendered = request.state; return request.questions.map(q => ({ partId: q.id, score: Number(q.id.slice(-1)) + 1 })); }, async choice() { throw Error('unused'); } });
    const input: MemoryRelevanceInput = { world, purpose: 'recall', entries: memoryEntries(store, world, [parts[0]!]) };
    assert.equal(input.entries[0]!.timestamp, timestamp);
    const selected = await relevantMemories(decisions, app.inspection, input, { memoryRelevanceThreshold: 0.5, memoryRecallLimit: 2 });
    assert.deepEqual(selected.map(m => m.id), ['recall_3', 'recall_2']);
    assert.ok(rendered.includes('I used to fear it; now I welcome it.'));
    assert.ok(!rendered.includes('private 4'));
    assert.ok(!rendered.includes('opaque_ancestor'));
    assert.equal(store.get('memory', 'recall_0').version, 2);
    const events = store.eventsByType(agent.id, ['memory.relevance_scored']);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type === 'memory.relevance_scored' && events[0]!.payload.scores[3]!.relevance, 1);
  } finally { store.close(); }
});

test('recall rejects duplicate, missing, foreign and malformed scores; empty streams skip inference', async () => {
  const { store, app, parts, world } = fixture();
  try {
    const input: MemoryRelevanceInput = { world, purpose: 'recall', entries: memoryEntries(store, world, [parts[0]!]) };
    class Broken extends MockDecisions {
      override async recall() { return [{ partId: 'recall_0', score: 4 }, { partId: 'recall_0', score: 4 }]; }
    }
    await assert.rejects(relevantMemories(new Broken(), app.inspection, input, {}), /exactly once/);
    class Foreign extends MockDecisions { override async recall() { return input.entries.map(() => ({ partId: 'foreign', score: 2 })); } }
    await assert.rejects(relevantMemories(new Foreign(), app.inspection, input, {}), /exactly once/);
    class Malformed extends MockDecisions { override async recall() { return [{ partId: 'recall_0', score: 5 }]; } }
    await assert.rejects(relevantMemories(new Malformed(), app.inspection, input, {}), /invalid scores/);
    assert.deepEqual(await relevantMemories(new Broken(), app.inspection, { ...input, entries: [] }, {}), []);
  } finally { store.close(); }
});

test('memory candidate discovery skips embeddings, retains memoryless/sticky Parts and recalls only owner memories', async () => {
  const { store, agent, parts } = fixture();
  const seen: PartContext[] = [];
  class Decisions extends MockDecisions {
    override async recall(input: MemoryRelevanceInput) { return input.entries.map(entry => ({ partId: entry.memory.id, score: entry.memory.id === 'recall_4' ? 4 : 0 })); }
    override async score(input: Parameters<MockDecisions['score']>[0]) { return [...input.candidates.map(part => ({ partId: part.id, score: 3 })), ...(input.primitives ?? []).map(p => ({ partId: p.id, score: 0 }))]; }
    override async shouldPredict() { return false; }
  }
  class Reasoning extends MockReasoning { override async cognize(context: PartContext) { seen.push(context); return super.cognize(context); } }
  class Embeddings extends MockEmbeddings { override async embed(): Promise<number[]> { throw Error('memory mode must skip embeddings'); } }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new Embeddings() });
    app.runtime.mutations.patch(parts[0]!.id, parts[0]!.version, { stickiness: { retained: true, unresolved: true, concern: 'Unresolved fixture' } }, { origin: 'researcher_edit', reason: 'Sticky fixture', sourceIds: [] });
    app.updateAgentActivationSettings(agent.id, { memorySearchEnabled: true, memoryRelevanceThreshold: 0.75, memoryRecallLimit: 1 });
    await app.message(agent.id, 'How was your day?');
    const candidateEvent = store.eventsByType(agent.id, ['activation.vector_candidates'])[0]!;
    assert.equal(candidateEvent.type, 'activation.vector_candidates');
    if (candidateEvent.type !== 'activation.vector_candidates') return;
    assert.ok(candidateEvent.payload.candidates.some(c => c.partId === parts[1]!.id && c.reasons.includes('relevant_memory')));
    assert.ok(candidateEvent.payload.candidates.some(c => c.reasons.includes('no_memories')));
    assert.ok(candidateEvent.payload.candidates.some(c => c.partId === parts[0]!.id && c.reasons.includes('sticky_unresolved')));
    assert.ok(seen.find(context => context.part.id === parts[0]!.id)?.memories.length === 0);
    for (const context of seen) {
      assert.ok(context.memories.every(memory => memory.partId === context.part.id));
      assert.ok(context.memories.length <= 1);
      assert.equal(Object.isFrozen(context.world), true);
    }
    assert.ok(seen.find(context => context.part.id === parts[1]!.id)?.memories.some(m => m.id === 'recall_4'));
    const self = store.eventsByType(agent.id, ['self.arbitration_started'])[0]!;
    assert.ok(!JSON.stringify(self.payload).includes('I experienced private'));
    assert.equal(app.agentActivationSettings(agent.id).memorySearchEnabled, true);
  } finally { store.close(); }
});

test('large memory streams scan every batch against identical immutable WorldState and select globally', async () => {
  const { store, app, parts, world } = fixture();
  try {
    const base = memoryEntries(store, world, [parts[0]!])[0]!;
    const entries = Array.from({ length: 205 }, (_, i) => ({ ...base, memory: { ...base.memory, id: `batch_${i}` } }));
    const sizes: number[] = [];
    class Decisions extends MockDecisions {
      override async recall(input: MemoryRelevanceInput) {
        assert.equal(input.world, world);
        assert.equal(Object.isFrozen(input.world), true);
        sizes.push(input.entries.length);
        return input.entries.map(entry => ({ partId: entry.memory.id, score: entry.memory.id === 'batch_204' ? 4 : 1 }));
      }
    }
    const selected = await relevantMemories(new Decisions(), app.inspection, { world, purpose: 'recall', entries }, { memoryRecallLimit: 1 });
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.deepEqual(selected.map(memory => memory.id), ['batch_204']);
  } finally { store.close(); }
});

test('recall settings validate bounds and preserve non-default values across restart', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'onto-recall-'));
  const path = join(directory, 'recall.sqlite');
  let store = new SqliteStore(path);
  try {
    let app = new Application(store);
    const agent = app.createAgent();
    for (const settings of [{ memoryRelevanceThreshold: -1 }, { memoryRelevanceThreshold: 1.1 }, { memoryRecallLimit: 0 }, { memoryRecallLimit: 1.5 }]) {
      assert.throws(() => app.updateAgentActivationSettings(agent.id, settings));
    }
    app.updateAgentActivationSettings(agent.id, { memorySearchEnabled: true, memoryRelevanceThreshold: 0.75, memoryRecallLimit: null });
    store.close(); store = new SqliteStore(path); app = new Application(store);
    const settings = app.agentActivationSettings(agent.id);
    assert.equal(settings.memorySearchEnabled, true);
    assert.equal(settings.memoryRelevanceThreshold, 0.75);
    assert.equal(settings.memoryRecallLimit, null);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
