import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { PredictionSchema } from '../../packages/core/src/domain.js';

test('retired prediction fields remain immutable historical evidence without returning to live state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-prediction-history-'));
  const path = join(directory, 'state.sqlite'); const store = new SqliteStore(path); const raw = new DatabaseSync(path);
  try {
    const app = new Application(store); const agent = app.createAgent(); const part = store.list('part', agent.id)[0]!;
    const cycle = store.startCycle(agent.id);
    const prediction = PredictionSchema.parse({ id: 'historical-prediction', agentId: agent.id, version: 1, schemaVersion: 1,
      partId: part.id, createdCycle: cycle.id, status: 'open', evaluation: null, memoryId: null,
      expectation: 'A reply may arrive', confidence: .5, horizon: 'Next exchange', evaluateAfterCycle: null,
      capsule: { interpretation: 'Contact is open', details: [], entities: [], activation: 2, spike: 0, sourceIds: [] } });
    const original = JSON.stringify({ ...prediction, attention: [{ target: 'reply', cues: ['A response'] }] });
    const change = JSON.stringify({ origin: 'researcher_edit', reason: 'Historical serialization fixture', sourceIds: [] });
    raw.prepare('INSERT INTO entities(kind,id,agent_id,version,body) VALUES(?,?,?,?,?)').run('prediction', prediction.id, agent.id, 1, original);
    raw.prepare('INSERT INTO versions(kind,id,version,body,change,at) VALUES(?,?,?,?,?,?)').run('prediction', prediction.id, 1, original, change, cycle.startedAt);
    assert.throws(() => store.get('prediction', prediction.id), /attention/);
    const current = JSON.stringify({ ...prediction, version: 2 });
    raw.prepare('UPDATE entities SET version=2,body=? WHERE kind=? AND id=?').run(current, 'prediction', prediction.id);
    raw.prepare('INSERT INTO versions(kind,id,version,body,change,at) VALUES(?,?,?,?,?,?)').run('prediction', prediction.id, 2, current, change, cycle.startedAt);
    assert.equal('attention' in store.get('prediction', prediction.id), false);
    const versions = store.versions('prediction', prediction.id);
    assert.equal(versions.length, 2); assert.ok(versions.every(version => !('attention' in version.state)));
    assert.equal(versions[0]!.state.expectation, prediction.expectation);
    assert.equal((raw.prepare("SELECT body FROM versions WHERE kind='prediction' AND id=? AND version=1").get(prediction.id) as { body: string }).body, original);
    assert.throws(() => raw.prepare("UPDATE versions SET body=? WHERE kind='prediction' AND id=? AND version=1").run(current, prediction.id), /immutable/);
  } finally { raw.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
