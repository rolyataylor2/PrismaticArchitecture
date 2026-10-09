import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { PartContext, DecisionProvider } from '../../packages/core/src/contracts.js';
import { renderPartPrompt, renderTaskPrompt } from '../../packages/providers/src/prompts.js';

class Decisions extends MockDecisions {
  override async score(input: Parameters<DecisionProvider['score']>[0]) {
    return [...input.candidates.map(candidate => ({ partId: candidate.id, score: 3 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
  }
  override async choose(context: Parameters<DecisionProvider['choose']>[0]) {
    return { choice: context.contributions.find(c => c.bid)!.bid!.id, explanation: 'Select first bid', identityConflict: '' };
  }
}
class Embeddings extends MockEmbeddings { override async embed(_text: string) { return [1, 0]; } }
class Reasoning extends MockReasoning {
  contexts: PartContext[] = [];
  override async cognize(context: PartContext) {
    this.contexts.push(context);
    const output = await super.cognize(context);
    return { ...output,
      thought: `Thought:${context.part.id}:${context.world.facts.at(-1)!.text}`,
      proposal: { action: { kind: 'say' as const, text: `Reply:${context.world.facts.at(-1)!.text}` },
        argument: 'My proposal', identityFit: [], executionOrder: [] } };
  }
}

test('full thread transcript survives beyond 100 facts, in order, without duplication or other-thread messages', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store, { decisions: new Decisions(), embeddings: new Embeddings(), reasoning: new Reasoning() });
    const agent = app.createAgent();
    await app.message(agent.id, 'Other thread secret', 'user', 'b');
    let last;
    for (let i = 0; i < 60; i++) last = await app.message(agent.id, `message-${i}`, 'user', 'a');
    const world = store.world(last!.cycle.worldId);
    assert.ok(world.facts.length > 100);
    const transcript = world.facts.filter(f => f.kind === 'says').map(f => f.text);
    const expected = Array.from({ length: 59 }, (_, i) => [`message-${i}`, `Reply:message-${i}`]).flat();
    assert.deepEqual(transcript, [...expected, 'message-59']);
    assert.ok(world.facts.every(f => !f.text.includes('Other thread secret')));
    assert.ok(world.facts.every(f => f.timestamp && Number.isFinite(Date.parse(f.timestamp))));
    assert.ok(world.facts.every(f => !f.text.includes('Operation execution_')));
    const firstCycle = store.cycles(agent.id).find(cycle => cycle.threadId === 'a')!;
    const original = store.world(firstCycle.worldId).facts.find(fact => fact.text === 'message-0')!;
    assert.equal(world.facts.find(fact => fact.text === 'message-0')?.timestamp, original.timestamp);
    assert.equal(store.recentFacts(agent.id, 8, 'a').length, 8);
  } finally { store.close(); }
});

test('thoughts decay steadily, Self-selected bids decay slower, and shared snapshots preserve privacy across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-thoughts-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const reasoning = new Reasoning();
  const providers = { decisions: new Decisions(), embeddings: new Embeddings(), reasoning };
  try {
    let app = new Application(store, providers);
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'first', 'user', 'a');
    const eventsBefore = store.events(agent.id);
    const selectedPart = eventsBefore.find(e => e.type === 'part.bid_created' && e.payload.id === first.cycle.selectedBidId)!;
    assert.equal(selectedPart.type, 'part.bid_created');
    if (selectedPart.type !== 'part.bid_created') throw new Error('Missing bid');
    store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    reasoning.contexts = [];
    await app.message(agent.id, 'isolated', 'user', 'b');
    assert.deepEqual(reasoning.contexts[0]!.world.thoughtHistory, []);
    reasoning.contexts = [];
    const second = await app.message(agent.id, 'second', 'user', 'a');
    const world = store.world(second.cycle.worldId);
    assert.ok(world.thoughtHistory!.length > 1);
    assert.deepEqual(new Set(world.thoughtHistory!.map(t => t.retention)), new Set([0.8, 0.9]));
    const selected = world.thoughtHistory!.find(t => t.selectedBySelf)!;
    assert.equal(selected.partId, selectedPart.payload.partId);
    for (const context of reasoning.contexts) {
      assert.equal(context.world, reasoning.contexts[0]!.world);
      assert.ok(context.world.thoughtHistory!.some(t => t.partId !== context.part.id));
      assert.ok(context.memories.every(m => m.partId === context.part.id));
      assert.throws(() => { context.world.thoughtHistory![0]!.retention = 0; }, TypeError);
      const rendered = renderPartPrompt(agent.id, 'cognition', context);
      assert.ok(rendered.includes('## Internal Thought History'));
      assert.ok(rendered.includes(selected.thought));
    }
    assert.ok(world.thoughtHistory!.every(t => Object.keys(t).every(key =>
      ['id', 'cycleId', 'partId', 'partName', 'thought', 'selectedBySelf', 'age', 'retention'].includes(key))));
    const self = store.events(agent.id).find(e => e.cycleId === second.cycle.id && e.type === 'self.arbitration_started')!;
    assert.equal('world' in self.payload, false);
    assert.equal('thoughtHistory' in self.payload, false);
    assert.throws(() => renderTaskPrompt(agent.id, 'arbitration', self.payload, () => '{{ world.thoughtHistory }}'));
    let current = second;
    for (let turn = 3; turn <= 6; turn++) current = await app.message(agent.id, `turn-${turn}`, 'user', 'a');
    const retained = store.world(current.cycle.worldId).thoughtHistory!.filter(t => t.cycleId === first.cycle.id);
    assert.equal(retained.length, 1);
    assert.equal(retained[0]!.retention, 0.5);
    for (let turn = 7; turn <= 11; turn++) current = await app.message(agent.id, `turn-${turn}`, 'user', 'a');
    assert.ok(store.world(current.cycle.worldId).thoughtHistory!.every(t => t.cycleId !== first.cycle.id));
    assert.deepEqual(store.events(agent.id).slice(0, eventsBefore.length), eventsBefore);
    assert.deepEqual(store.world(first.cycle.worldId).thoughtHistory, []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('Self selection of a deliberation-revised bid retains its originating Part thought even if execution fails', async () => {
  const store = new SqliteStore(':memory:');
  class DeliberationDecisions extends Decisions {
    override async choose(context: Parameters<DecisionProvider['choose']>[0]) {
      return context.deliberation.length
        ? super.choose(context)
        : { choice: 'DELIBERATE', explanation: 'Ask for revision', identityConflict: '' };
    }
  }
  class DeliberationReasoning extends Reasoning {
    override async question(context: Parameters<MockReasoning['question']>[0]) {
      return { ...await super.question(context), target_parts: [context.contributions[0]!.partId], question: 'Would you revise your proposal?' };
    }
    override async answer(_context: PartContext, _question: string) {
      return { response: 'I have revised my proposal.', bid_disposition: 'replace' as const, new_bid: { action: { kind: 'say' as const, text: 'Revised reply' },
        argument: 'My revised proposal', identityFit: [], executionOrder: [] } };
    }
  }
  try {
    const providers = { decisions: new DeliberationDecisions(), embeddings: new Embeddings(), reasoning: new DeliberationReasoning() };
    const app = new Application(store, providers, { async execute() { throw new Error('External failure'); } });
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'first', 'user', 'a'), /External failure/);
    const first = store.cycles(agent.id)[0]!;
    const bids = store.eventsByType(agent.id, ['part.bid_created'], [first.id]);
    const selected = bids.find(e => e.type === 'part.bid_created' && e.payload.id === first.selectedBidId)!;
    assert.equal(selected.type, 'part.bid_created');
    if (selected.type !== 'part.bid_created') throw new Error('Missing bid');
    assert.equal(selected.payload.action?.text, 'Revised reply');
    const result = await new Application(store, providers).message(agent.id, 'second', 'user', 'a');
    const retained = store.world(result.cycle.worldId).thoughtHistory!;
    assert.equal(retained.find(t => t.selectedBySelf)!.partId, selected.payload.partId);
    assert.equal(retained.find(t => t.selectedBySelf)!.retention, 0.9);
  } finally { store.close(); }
});


test('legacy thought events without Part snapshots remain usable and immutable when chat resumes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-legacy-thoughts-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const providers = { decisions: new Decisions(), embeddings: new Embeddings(), reasoning: new Reasoning() };
  try {
    const app = new Application(store, providers);
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'legacy message', 'user', 'a');
    const names = new Map(store.list('part', agent.id).map(part => [part.id, part.name]));
    store.close();
    const db = new DatabaseSync(path);
    try {
      // Fixture-only downgrade to the historical event shape; restore immutability before reopening.
      db.exec('DROP TRIGGER events_no_update');
      db.prepare("UPDATE events SET payload = json_remove(payload, '$.partSnapshot', '$.predictionSnapshot') WHERE type = 'part.thought'").run();
      db.exec("CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END");
    } finally { db.close(); }
    store = new SqliteStore(path);
    const before = store.events(agent.id);
    const result = await new Application(store, providers).message(agent.id, 'resume chat', 'user', 'a');
    assert.equal(result.cycle.status, 'completed');
    const history = store.world(result.cycle.worldId).thoughtHistory!;
    assert.ok(history.length > 0);
    for (const thought of history) {
      assert.equal(thought.cycleId, first.cycle.id);
      assert.equal(thought.partName, names.get(thought.partId));
      assert.ok(thought.thought.includes('legacy message'));
    }
    assert.deepEqual(store.events(agent.id).slice(0, before.length), before);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
