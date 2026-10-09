import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { Application } from './persistent-fixture.js';
import { partContext } from '../../packages/core/src/context.js';
import { memoryEntries, scoreMemoryEntries } from '../../packages/core/src/memory-recall.js';
import { MockDecisions } from '../../packages/providers/src/mock.js';
import type { WorldState, Activation } from '../../packages/core/src/domain.js';

const change = { origin: 'researcher_edit' as const, reason: 'Explicit memory references', sourceIds: [] };
test('overlapping source timelines and explicit Part references survive restart without rewriting history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'memory-links-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store);
    const agent = app.createAgent();
    const [first, second] = store.list('part', agent.id);
    const worlds: WorldState[] = [];
    for (let i = 0; i < 3; i++) {
      const cycle = store.startCycle(agent.id);
      const world: WorldState = { id: cycle.worldId, cycleId: cycle.id, agentId: agent.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt, facts: [] };
      store.saveWorld(world); worlds.push(world); store.saveCycle({ ...cycle, status: 'completed' });
    }
    const a = app.runtime.predictions.encode(first!.id, worlds[0]!, { content: 'I felt abandoned.', gist: 'Abandonment', context: [] }, null, [worlds[0]!.id, worlds[1]!.id]);
    const b = app.runtime.predictions.encode(second!.id, worlds[1]!, { content: 'They were busy.', gist: 'An explanation', context: [] }, null, [worlds[1]!.id, worlds[2]!.id]);
    await api(app, 'PATCH', `/api/memories/${a.id}`, { expectedVersion: 1, patch: { referencingPartIds: [first!.id, second!.id] } });
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/worlds`), worlds);
    const activation: Activation = { partId: second!.id, score: 3, previous: 0, delta: 3, active: true, similarity: 0, reasons: [] };
    assert.deepEqual(partContext(store, worlds[2]!, second!, activation).memories.map(m => m.id), [a.id, b.id]);
    const entries = memoryEntries(store, worlds[2]!, [first!, second!]);
    assert.equal(entries.filter(e => e.memory.id === a.id).length, 2);
    assert.equal((await scoreMemoryEntries(new MockDecisions(), { world: worlds[2]!, purpose: 'candidates', entries })).length, 2);
    const outsider = app.createAgent();
    const foreignPart = store.list('part', outsider.id)[0]!;
    assert.throws(() => store.save('memory', { ...a, version: 3, referencingPartIds: [foreignPart.id] }, 2, change), /Agent mismatch/);
    assert.throws(() => store.save('memory', { ...a, version: 3, ancestorIds: ['missing'] }, 2, change), /not found/);
    store.save('memory', { ...store.get('memory', a.id), version: 3, referencingPartIds: [] }, 2, change);
    assert.deepEqual(partContext(store, worlds[2]!, second!, activation).memories.map(m => m.id), [b.id]);
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.get('memory', a.id).ancestorIds, [worlds[0]!.id, worlds[1]!.id]);
    assert.deepEqual(store.get('memory', b.id).ancestorIds, [worlds[1]!.id, worlds[2]!.id]);
    assert.deepEqual(store.versions('memory', a.id)[1]!.state.referencingPartIds, [first!.id, second!.id]);
    assert.equal(store.versions('memory', a.id)[0]!.state.content, 'I felt abandoned.');
    assert.deepEqual(store.world(worlds[1]!.id), worlds[1]);
    assert.deepEqual(store.worlds(agent.id), worlds);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
