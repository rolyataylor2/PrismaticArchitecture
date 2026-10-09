import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { partContext, selfContext } from '../../packages/core/src/context.js';
import { PartSchema, id, freeze, type Activation, type PredictionUpdate, type WorldState } from '../../packages/core/src/domain.js';

const change = { origin: 'researcher_edit' as const, reason: 'Test explicit change', sourceIds: [] };
function fixture() {
  const store = new SqliteStore(':memory:');
  const app = new Application(store);
  const agent = app.createAgent();
  const part = store.list('part', agent.id)[0]!;
  const cycle = store.startCycle(agent.id);
  const world: WorldState = freeze({ id: cycle.worldId, cycleId: cycle.id, agentId: agent.id, sequence: cycle.sequence,
    capturedAt: cycle.startedAt, facts: [{ source: 'Bill', kind: 'says', text: 'I am uncertain.', referenceId: null, timestamp: cycle.startedAt }] });
  store.saveWorld(world);
  return { store, app, agent, part, world };
}
test('durable current state, immutable versions, stale-write rejection, restore as new version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-test-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const agent = app.createAgent('Persistence');
    const original = store.list('part', agent.id)[0]!;
    app.runtime.mutations.patch(original.id, 1, { beliefs: ['I now have another view.'] }, change);
    assert.throws(() => app.runtime.mutations.patch(original.id, 1, { name: 'Stale' }, change), /changed/);
    const restored = app.runtime.mutations.restore(original.id, 1, 2);
    assert.equal(restored.version, 3); assert.deepEqual(restored.beliefs, original.beliefs);
    assert.deepEqual(restored.provenance, original.provenance);
    assert.equal(store.versions('part', original.id)[1]!.state.beliefs[0], 'I now have another view.');
    store.close(); store = new SqliteStore(path);
    assert.equal(store.get('part', original.id).version, 3);
    assert.equal(store.versions('part', original.id).length, 3);
    assert.throws(() => { store.get('part', original.id).beliefs.push('silent change'); }, TypeError);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('one open prediction, revision history and capsules survive all terminal paths', () => {
  const { store, app, part, world } = fixture();
  try {
    const draft = { expectation: 'I expect rejection.', capsule: { interpretation: 'Disclosure seems risky.', details: ['I feel uncertain.'],
      entities: ['Bill'], activation: 3, spike: 2, sourceIds: [world.id] }, confidence: 0.8, horizon: 'After the reply', evaluateAfterCycle: 10 };
    for (const operation of ['resolve', 'abandon', 'expire', 'invalidate'] as const) {
      const prediction = app.runtime.predictions.form(part.id, world, draft);
      assert.throws(() => app.runtime.predictions.form(part.id, world, draft), /open prediction/);
      assert.throws(() => store.save('prediction', { ...prediction, id: id('prediction') }, 0, change), /UNIQUE/);
      const revised = app.runtime.predictions.apply(prediction, world, { operation: 'revise', revision: { ...draft, expectation: 'I expect hesitation.' },
        evaluation: null, memory: null, mutation: null, reason: 'I reconsidered the likely response.' });
      assert.equal(store.versions('prediction', prediction.id)[0]!.state.expectation, draft.expectation);
      assert.deepEqual(revised.capsule, draft.capsule);
      const update: PredictionUpdate = { operation, revision: null, evaluation: operation === 'resolve' ? {
        assessment: 'partly_confirmed', interpretation: 'Only part of my expectation happened.', causalAttribution: 'An interruption also mattered.',
        evidence: ['They paused before answering.'], evidenceWorldId: world.id,
      } : null, memory: null, mutation: null, reason: 'Owner supplied lifecycle judgment.' };
      const closed = app.runtime.predictions.apply(revised, world, update);
      assert.notEqual(closed.status, 'open');
      assert.equal(store.versions('prediction', prediction.id).length, 3);
      if (operation === 'resolve') assert.equal(closed.evaluation?.assessment, 'partly_confirmed'); // Before expected cycle 10.
    }
  } finally { store.close(); }
});
test('private current memory is directly available, conflicting memories and opaque ancestry remain separate', () => {
  const { store, app, agent, part, world } = fixture();
  try {
    const other = store.list('part', agent.id)[1]!;
    const a = app.runtime.predictions.encode(part.id, world, { content: 'He abandoned me.', gist: 'Abandonment', context: [] });
    const b = app.runtime.predictions.encode(other.id, world, { content: 'He needed to leave for work.', gist: 'Work', context: [] });
    const activation: Activation = { partId: part.id, score: 3, previous: 0, delta: 3, active: true, similarity: 0.1, reasons: ['vector'] };
    const context = partContext(store, world, part, activation);
    assert.deepEqual(context.memories.map(m => m.id), [a.id]);
    assert.deepEqual(a.ancestorIds, b.ancestorIds);
    assert.equal('store' in context, false); assert.equal('world' in context.memories[0]!, false);
    assert.throws(() => partContext(store, world, other, activation), /ownership/);
    const next = { ...a, version: 2, content: 'I felt abandoned; I now wonder what happened.' };
    store.save('memory', next, 1, { ...change, origin: 'consolidation' });
    assert.equal(store.get('memory', a.id).content, next.content);
    assert.equal(store.versions('memory', a.id)[0]!.state.content, 'He abandoned me.');
    assert.throws(() => store.save('memory', { ...next, version: 3, partId: other.id }, 2, change), /ownership/);
    // The external researcher inspector can independently retrieve objective evidence.
    assert.deepEqual(store.world(a.ancestorIds[0]!).facts, world.facts);
    const self = selfContext(store.get('identity', agent.id), [], []);
    assert.deepEqual(Object.keys(self).sort(), ['contributions', 'deliberation', 'identity']);
  } finally { store.close(); }
});
test('transactions roll back psychology and audit without publishing uncommitted events', () => {
  const { store, app, part, world } = fixture();
  try {
    const published: string[] = []; app.inspection.subscribe(e => published.push(e.type));
    assert.throws(() => app.inspection.atomic(() => {
      app.runtime.predictions.encode(part.id, world, { content: 'Uncommitted episode', gist: 'pending', context: [] });
      throw new Error('abort');
    }), /abort/);
    assert.deepEqual(store.list('memory', part.agentId), []);
    assert.deepEqual(published, []);
  } finally { store.close(); }
});

test('new Part names describe concise motivations while legacy state and history remain readable', () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const part = store.list('part', agent.id)[0]!;
    assert.ok(store.list('part', agent.id).every(p => p.name.trim().split(/\s+/).length < 6));
    assert.equal(PartSchema.parse({ ...part, name: 'A Previously Stored Name With Six Words' }).name, 'A Previously Stored Name With Six Words');
    const change = { origin: 'researcher_edit' as const, reason: 'Explicit motivational rename', sourceIds: [] };
    const renamed = app.runtime.mutations.patch(part.id, part.version, { name: 'Need To Complete My Homework' }, change);
    assert.equal(renamed.id, part.id);
    assert.equal(store.versions('part', part.id)[0]!.state.name, part.name);
    assert.throws(() => app.runtime.mutations.patch(part.id, renamed.version, { name: 'My Need To Complete All Homework' }, change), /fewer than six words/);
    const { id: _id, agentId: _agentId, version: _version, schemaVersion: _schema, ...draft } = part;
    assert.throws(() => app.runtime.mutations.create(agent.id, { ...draft, name: 'My Need To Complete All Homework' }, change), /fewer than six words/);
    assert.deepEqual(store.get('part', part.id).beliefs, part.beliefs);
  } finally { store.close(); }
});
