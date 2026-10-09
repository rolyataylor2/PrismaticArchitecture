import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { runExperiment, experimentNames } from '../../packages/sdk/src/experiments.js';

test('HTTP researcher API shares durable state, rejects foreign-origin edits, and streams replayable events', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const abort = new AbortController();
  try {
    const created = await fetch(`${base}/api/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'HTTP Agent', consolidationProfile: 'persistent' }) });
    assert.equal(created.status, 200);
    const agent = await created.json() as { id: string };
    const renamed = await fetch(`${base}/api/agents/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Renamed HTTP Agent' }) });
    assert.equal(renamed.status, 200);
    const renamedData = await renamed.json() as { name: string; version: number };
    assert.equal(renamedData.name, 'Renamed HTTP Agent');
    assert.equal(renamedData.version, 2);
    const foreign = await fetch(`${base}/api/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: JSON.stringify({ name: 'Rejected' }) });
    assert.equal(foreign.status, 403);
    const invalid = await fetch(`${base}/api/agents/${agent.id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400);
    const stream = await fetch(`${base}/api/agents/${agent.id}/stream`, { signal: abort.signal });
    assert.equal(stream.headers.get('content-type'), 'text/event-stream');
    const reader = stream.body!.getReader(); const first = await reader.read();
    assert.ok(new TextDecoder().decode(first.value).includes('part.mutation_applied'));
    await reader.cancel();
    const turn = await fetch(`${base}/api/agents/${agent.id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'I am uncertain about a personal vulnerability.' }) });
    assert.equal(turn.status, 200);
    const snapshot = await (await fetch(`${base}/api/agents/${agent.id}`)).json() as { cycles: unknown[]; parts: unknown[] };
    assert.equal(snapshot.cycles.length, 1); assert.equal(snapshot.parts.length, 6);
    assert.equal(store.cycles(agent.id).length, 1);
    const last = store.events(agent.id).at(-2)!;
    const resumed = await fetch(`${base}/api/agents/${agent.id}/stream`, { headers: { 'Last-Event-ID': String(last.sequence) }, signal: abort.signal });
    const resumedReader = resumed.body!.getReader();
    const text = new TextDecoder().decode((await resumedReader.read()).value);
    assert.ok(text.includes('cycle.completed')); assert.ok(!text.includes('part.mutation_applied'));
    await resumedReader.cancel();
  } finally { abort.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
test('all predefined experiments save reports; therapy uses normal cognition and survives sleep', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store);
    for (const name of experimentNames) {
      const run = await runExperiment(app, name); assert.equal(run.status, 'completed');
      if (name === 'therapy') {
        assert.ok(run.stages.some(s => s.name === 'novel analogous context'));
        assert.ok(run.stages.some(s => s.name === 'delayed retest'));
        const versions = store.list('part', run.agentId).flatMap(p => store.versions('part', p.id));
        assert.equal(versions.some(v => v.change.origin === 'researcher_edit'), false);
        assert.ok(versions.some(v => v.change.origin === 'consolidation'));
      }
    }
    assert.equal(store.experiments().length, experimentNames.length);
  } finally { store.close(); }
});
