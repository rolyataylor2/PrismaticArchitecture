import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';

test('explicit initialization preserves demo defaults, isolates authored identities and never seeds demo psychology', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'identity-initialization-'));
  const store = new SqliteStore(join(directory, 'state.sqlite')), app = new Application(store);
  try {
    const demo = app.createAgent('Demo');
    assert.ok(store.get('identity', demo.id).traits.some(t => t.answer.includes('friend')));
    const seed = { source: 'authored-test', identity: { traits: [{ question: 'What matters?', answer: 'Independence.', keywords: ['independence'] }] } };
    const first = app.createAgent('First', 'constructed', seed), second = app.createAgent('Second', 'persistent', seed);
    const a = store.get('identity', first.id), b = store.get('identity', second.id);
    assert.equal(a.traits.length, 1); assert.equal(a.traits[0]!.role, 'self_definition');
    assert.notEqual(a.traits[0]!.id, b.traits[0]!.id);
    seed.identity.traits[0]!.answer = 'Changed external draft';
    assert.equal(a.traits[0]!.answer, 'Independence.');
    assert.equal(store.list('part', second.id).length, 0);
    const empty = app.createAgent('Empty', 'constructed', { source: 'empty-authoring', identity: { traits: [] } });
    assert.deepEqual(store.get('identity', empty.id).traits, []);
    const count = store.list('agent').length;
    assert.throws(() => app.createAgent('Invalid', 'constructed', { source: '', identity: { traits: [] } }));
    assert.equal(store.list('agent').length, count);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
