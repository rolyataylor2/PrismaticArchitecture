import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { startDream, listSimulationRuns, replaySimulation } from '../../packages/sdk/src/simulation-tests.js';
import { dreamState } from '../../packages/sdk/src/dream-state.js';
import { api } from '../../packages/sdk/src/api.js';

async function ended(app: Application, id: string) {
  for (let i = 0; i < 1000; i++) { const run = listSimulationRuns(app).find(item => item.id === id)!; if (run.status !== 'running') return run; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Dream did not settle');
}
test('default dream branches actual developed psychology and history, leaves the source unchanged, and preserves restart evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-dream-')); const file = join(directory, 'state.sqlite'); let store = new SqliteStore(file);
  try {
    const app = new Application(store); const source = app.createAgent('Developed dream base');
    await app.message(source.id, 'A friend listened when I described uncertainty.', 'friend', 'source');
    const before = dreamState(store, source.id); const sourceEvents = store.events(source.id);
    const run = startDream(app, 'conversation-starters', 'fixture', source.id);
    assert.equal(run.dream!.keepChanges, false); assert.notEqual(run.agentId, source.id);
    assert.deepEqual(run.dream!.sourceBefore, before); assert.equal(run.specification.seeds.length, 0);
    assert.equal(run.dream!.before.memories.length, before.memories.length); assert.equal(run.dream!.before.cycles.length, before.cycles.length);
    const map = run.dream!.identifierMap;
    for (const memory of before.memories) {
      const copied = store.get('memory', map[memory.id]!); assert.equal(copied.content, memory.content); assert.equal(copied.agentId, run.agentId);
      assert.equal(store.versions('memory', copied.id).length, store.versions('memory', memory.id).length);
      for (const ancestor of memory.ancestorIds) if (map[ancestor]) assert.equal(store.world(map[ancestor]!).agentId, run.agentId);
    }
    const terminal = await ended(app, run.id); assert.equal(terminal.status, 'completed', terminal.error ?? ''); assert.ok(terminal.dream!.after);
    assert.deepEqual(dreamState(store, source.id), before); assert.deepEqual(store.events(source.id), sourceEvents);
    const facts = terminal.stages.flatMap(stage => stage.observations ?? []);
    assert.ok(facts.some(fact => fact.source === 'Sensor audio' && fact.text.startsWith('Experience says: '))); assert.ok(!facts.some(fact => fact.source === 'Scenario observer'));
    assert.throws(() => replaySimulation(app, run.id, 'Fresh-test replay cannot recover a developed dream'), /developed Agent state/);
    const frozen = JSON.stringify(terminal); await app.close(); store.close(); store = new SqliteStore(file);
    assert.equal(JSON.stringify(listSimulationRuns(new Application(store)).find(item => item.id === run.id)), frozen);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('explicit permanent dream experiences the base directly and blocks competing messages and edits', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Permanent base');
  try {
    const before = store.cycles(source.id).length;
    const run = startDream(app, 'conversation-starters', 'fixture', source.id, true);
    assert.equal(run.agentId, source.id); assert.equal(run.dream!.keepChanges, true);
    await assert.rejects(app.message(source.id, 'Competing message'), /experiencing a dream/);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${source.id}`, { name: 'Competing rename' }), /dream to finish/);
    const terminal = await ended(app, run.id); assert.equal(terminal.status, 'completed', terminal.error ?? '');
    assert.ok(store.cycles(source.id).length > before); assert.equal(terminal.dream!.after!.cycles.length, store.cycles(source.id).length);
    assert.deepEqual(terminal.dream!.sourceBefore, terminal.dream!.before);
  } finally { await app.close(); store.close(); }
});
test('dream rejects real Executive authority and frozen failure evidence does not alter the isolated source', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Failure base');
  try {
    const profile = store.executiveProfile(source.id); store.saveExecutiveProfile(source.id, { ...profile, enabled: true, revision: profile.revision + 1 }, profile.revision);
    assert.throws(() => startDream(app, 'conversation-starters', 'configured', source.id), /Disconnect/);
    const enabled = store.executiveProfile(source.id); store.saveExecutiveProfile(source.id, { ...enabled, enabled: false, revision: enabled.revision + 1 }, enabled.revision);
    const failing = new Application(store, { ...app.providers, reasoning: new Proxy(app.providers.reasoning, { get(target, key, receiver) { if (key === 'label') return 'authored-infrastructure-failure'; if (key === 'constructed') return async () => { throw new Error('Authored provider interruption'); }; return Reflect.get(target, key, receiver); } }) });
    const before = dreamState(store, source.id);
    const run = startDream(failing, 'conversation-starters', 'configured', source.id);
    const terminal = await ended(failing, run.id); assert.equal(terminal.status, 'failed'); assert.ok(terminal.dream!.after); assert.match(terminal.error!, /Authored provider interruption/);
    assert.deepEqual(dreamState(store, source.id), before); await failing.close();
  } finally { await app.close(); store.close(); }
});
test('permanent interruption preserves completed experience and dead-host recovery does not replay it', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Interrupted permanent base');
  const failing = new Application(store, { ...app.providers, reasoning: new Proxy(app.providers.reasoning, {
    get(target, key, receiver) {
      if (key === 'label') return 'authored-later-interruption';
      if (key === 'constructed') return async (...args: Parameters<NonNullable<typeof target.constructed>>) => {
        if (store.cycles(source.id).some(cycle => cycle.status === 'completed')) throw new Error('Authored interruption after first experience');
        return target.constructed!(...args);
      };
      return Reflect.get(target, key, receiver);
    },
  }) });
  try {
    const run = startDream(failing, 'conversation-starters', 'configured', source.id, true);
    const terminal = await ended(failing, run.id);
    assert.equal(terminal.status, 'failed'); assert.ok(terminal.stages.length >= 1);
    assert.ok(terminal.dream!.after!.cycles.some(cycle => cycle.status === 'completed'));
    assert.ok(terminal.dream!.after!.memories.length > terminal.dream!.before.memories.length);
    const retained = dreamState(store, source.id);
    // Authored plumbing fixture represents a stopped host, not a cognitive outcome.
    store.saveExperiment({ ...terminal, status: 'running', dream: { ...terminal.dream!, hostPid: 99999999 } });
    const restarted = new Application(store);
    const recovered = listSimulationRuns(restarted).find(item => item.id === run.id)!;
    assert.equal(recovered.status, 'failed'); assert.match(recovered.error!, /host process ended/);
    assert.deepEqual(recovered.dream!.after, retained); assert.deepEqual(dreamState(store, source.id), retained);
    await restarted.close();
  } finally { await failing.close(); await app.close(); store.close(); }
});
test('dream continuity protocol exercises ordinary experience and sleep without authored psychology', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Continuity protocol base');
  try {
    const run = await ended(app, startDream(app, 'dream-context-continuity', 'fixture', source.id).id);
    assert.equal(run.status, 'completed', run.error ?? ''); assert.equal(run.stages.length, 5);
    assert.equal(run.specification.seeds.length, 0); assert.ok(run.dream!.after!.consolidations.length > 0);
    assert.equal(store.cycles(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
