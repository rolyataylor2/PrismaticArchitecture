import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { MemoryRelevanceInput } from '../../packages/core/src/contracts.js';
import type { MemoryOverview, MemorySearchResult } from '../../packages/sdk/src/memory-search.js';

function fixture(path = ':memory:') {
  const store = new SqliteStore(path);
  const searches: MemoryRelevanceInput[] = [];
  class Decisions extends MockDecisions {
    override async recall(input: MemoryRelevanceInput) { searches.push(input); return input.entries.map(entry => ({ partId: entry.memory.id, score: entry.memory.id === 'search_low' ? 1 : 4 })); }
  }
  class Embeddings extends MockEmbeddings {
    override async embed(text: string) { return text.includes('welcome') ? [1, 0] : [0, 1]; }
  }
  const app = new Application(store, { decisions: new Decisions(), embeddings: new Embeddings(), reasoning: new MockReasoning() });
  const agent = app.createAgent(); const other = app.createAgent();
  const parts = store.list('part', agent.id);
  for (const [memoryId, part, content] of [['search_high', parts[0]!, 'I remember a warm welcome.'], ['search_low', parts[1]!, 'I remember an empty train.'],
    ['search_foreign', store.list('part', other.id)[0]!, 'I remember another welcome.']] as const) {
    store.save('memory', { id: memoryId, agentId: part.agentId, partId: part.id, version: 1, schemaVersion: 1,
      content, gist: content, context: ['my own detail'], ancestorIds: ['original_experience'], predictionId: null, createdCycle: 'fixture' }, 0,
    { origin: 'researcher_edit', reason: 'Search fixture', sourceIds: [] });
  }
  return { store, app, agent, other, parts, searches };
}

test('researcher vector and JEV search rank relevant Agent-owned memories without cognition or new history', async () => {
  const { store, app, agent, parts, searches } = fixture();
  try {
    const before = store.events(agent.id).length;
    const timestamp = store.versions('memory', 'search_high')[0]!.at;
    for (const mode of ['vector', 'jev']) {
      const result = await api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode }) as MemorySearchResult[];
      assert.deepEqual(result.map(item => item.memory.id), ['search_high']);
      assert.equal(result[0]!.activation, 1); assert.equal(result[0]!.timestamp, timestamp);
      assert.equal(result[0]!.memory.content, 'I remember a warm welcome.');
    }
    assert.equal(searches[0]!.purpose, 'search');
    assert.equal(searches[0]!.world.facts[0]!.text, 'welcome');
    assert.ok(searches[0]!.entries.every(entry => entry.memory.agentId === agent.id));
    assert.equal(store.events(agent.id).length, before);
    assert.equal(store.cycles(agent.id).length, 0);
    const restricted = await api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'jev', partId: parts[1]!.id });
    assert.deepEqual(restricted, []);
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: ' ', mode: 'jev' }));
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'anything' }));
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'jev', partId: 'unknown_part' }));
    const foreign = store.get('memory', 'search_foreign');
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'jev', partId: foreign.partId }), /another Agent/);
  } finally { store.close(); }
});

test('memory edits and deletion preserve versions/provenance, reject stale edits and exclude removed memories from recall/search', async () => {
  const { store, app, agent, other } = fixture();
  try {
    const original = store.get('memory', 'search_high');
    const formationDate = store.versions('memory', original.id)[0]!.at;
    await api(app, 'PATCH', `/api/memories/${original.id}`, { expectedVersion: 1, patch: { content: 'I remember a kind welcome.' } });
    assert.equal(store.get('memory', original.id).version, 2);
    assert.equal(store.versions('memory', original.id)[0]!.state.content, original.content);
    assert.equal(store.versions('memory', original.id)[0]!.at, formationDate);
    assert.deepEqual(store.get('memory', original.id).ancestorIds, original.ancestorIds);
    await assert.rejects(api(app, 'PATCH', `/api/memories/${original.id}`, { expectedVersion: 1, patch: { gist: 'stale' } }), /Stale memory version/);
    await assert.rejects(api(app, 'PATCH', `/api/memories/${original.id}`, { expectedVersion: 2, patch: { partId: 'different_owner' } }));
    await api(app, 'DELETE', `/api/memories/${original.id}`, { expectedVersion: 2 });
    assert.equal(store.get('memory', original.id).deleted, true);
    assert.equal(store.get('memory', original.id).version, 3);
    assert.equal(store.versions('memory', original.id).length, 3);
    assert.ok(!store.list('memory', agent.id).some(memory => memory.id === original.id));
    assert.ok(store.list('memory', other.id).some(memory => memory.id === 'search_foreign'));
    const inspected = await api(app, 'GET', `/api/memories/${original.id}`) as { versions: unknown[] };
    assert.equal(inspected.versions.length, 3);
    const result = await api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'jev' });
    assert.deepEqual(result, []);
    await assert.rejects(api(app, 'PATCH', `/api/memories/${original.id}`, { expectedVersion: 3, patch: { content: 'revive' } }), /deleted/);
  } finally { store.close(); }
});

test('removed memory and its immutable history survive database restart', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'onto-memory-removal-')); const path = join(directory, 'state.sqlite');
  const original = fixture(path); let reopened: SqliteStore | undefined;
  try {
    await api(original.app, 'DELETE', '/api/memories/search_high', { expectedVersion: 1 });
    original.store.close(); reopened = new SqliteStore(path);
    assert.equal(reopened.get('memory', 'search_high').deleted, true);
    assert.equal(reopened.versions('memory', 'search_high').length, 2);
    assert.equal(reopened.versions('memory', 'search_high')[0]!.state.content, 'I remember a warm welcome.');
    assert.ok(!reopened.list('memory', original.agent.id).some(memory => memory.id === 'search_high'));
  } finally { if (reopened) reopened.close(); else original.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('a JEV search completing after a researcher edit cannot return the stale memory version', async () => {
  const { store, app, agent } = fixture();
  let complete!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  class Decisions extends MockDecisions {
    override async recall(input: MemoryRelevanceInput) {
      started(); await pending;
      return input.entries.map(entry => ({ partId: entry.memory.id, score: entry.memory.id === 'search_high' ? 4 : 0 }));
    }
  }
  try {
    const delayed = new Application(store, { ...app.providers, decisions: new Decisions() });
    const search = api(delayed, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'jev' });
    await ready;
    await api(app, 'PATCH', '/api/memories/search_high', { expectedVersion: 1, patch: { content: 'I remember a different day.' } });
    complete(); assert.deepEqual(await search, []);
  } finally { complete(); store.close(); }
});


test('empty-search overview ranks cognitive recalls and original formation time without inference or mutation', async () => {
  const { store, app, agent, other } = fixture();
  try {
    const old = store.get('memory', 'search_high');
    for (let i = 0; i < 2; i++) app.inspection.emit(agent.id, null, 'construction.inference_started', { task: 'part_cognition', agentId: agent.id, memories: [old, old] });
    app.inspection.emit(agent.id, null, 'memory.relevance_scored', { worldId: 'fixture', purpose: 'recall', provider: 'fixture', scores: [], selectedMemoryIds: ['search_high'] });
    await new Promise(resolve => setTimeout(resolve, 10));
    store.save('memory', { ...old, id: 'newest', ancestorIds: [], content: 'A recent experience.', gist: 'Recent', version: 1 }, 0, { origin: 'researcher_edit', reason: 'Recent fixture', sourceIds: [] });
    store.save('memory', { ...old, content: 'Edited older experience.', version: 2 }, 1, { origin: 'researcher_edit', reason: 'Editing does not change formation date', sourceIds: [] });
    const before = store.events(agent.id).length;
    const overview = await api(app, 'GET', `/api/agents/${agent.id}/memories/overview`) as MemoryOverview;
    assert.equal(overview.mostAccessed[0]!.memory.id, 'search_high');
    assert.equal(overview.mostAccessed[0]!.accessCount, 3, 'Repeated IDs count once per recall context');
    assert.equal(overview.mostRecent[0]!.memory.id, 'newest');
    assert.equal(overview.mostAccessed[0]!.timestamp, store.versions('memory', 'search_high')[0]!.at);
    assert.ok(overview.mostRecent.every(entry => entry.memory.agentId === agent.id));
    assert.equal(store.events(agent.id).length, before);
    await api(app, 'POST', `/api/agents/${agent.id}/memories/search`, { query: 'welcome', mode: 'vector' });
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/memories/overview`), overview, 'Researcher search does not count as cognitive access');
    const current = store.get('memory', 'search_high');
    store.save('memory', { ...current, deleted: true, version: 3 }, 2, { origin: 'researcher_edit', reason: 'Deleted memories leave rankings', sourceIds: [] });
    const after = await api(app, 'GET', `/api/agents/${agent.id}/memories/overview`) as MemoryOverview;
    assert.ok([...after.mostAccessed, ...after.mostRecent].every(entry => entry.memory.id !== current.id));
    assert.equal((await api(app, 'GET', `/api/agents/${other.id}/memories/overview`) as MemoryOverview).mostAccessed[0]!.accessCount, 0);
  } finally { store.close(); }
});
