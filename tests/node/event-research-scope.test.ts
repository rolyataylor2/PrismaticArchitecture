import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Inspection } from '../../packages/core/src/inspection.js';
import { Application } from '../../packages/sdk/src/application.js';
import { researchStageContext } from '../../packages/sdk/src/provider-observation.js';

test('nullable event-scope migration preserves historical bytes and scoped atomic records across both query paths and restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'event-scope-')); const path = join(root, 'state.sqlite'); let store = new SqliteStore(path); let app = new Application(store);
  try {
    const agent = app.createAgent(); const other = app.createAgent(); const old = store.appendEvent(agent.id, null, 'infrastructure.error', { stage: 'authored', message: 'Old evidence' });
    await app.close(); store.close(); const db = new DatabaseSync(path);
    db.exec('ALTER TABLE events DROP COLUMN research_scope; PRAGMA user_version=24;'); db.close();
    store = new SqliteStore(path); app = new Application(store); assert.deepEqual(store.events(agent.id), [old]);
    const scope = { agentId: agent.id, runId: 'authored-run', stageId: 'authored-stage', stageIndex: 0, startEventId: 'authored-start' };
    const event = researchStageContext.run(scope, () => app.inspection.emit(agent.id, null, 'infrastructure.error', { stage: 'authored', message: 'Scoped evidence' }));
    assert.equal(event.cycleId, null); assert.equal(event.researchScope!.runId, scope.runId); assert.ok(!JSON.stringify(event.payload).includes(scope.stageId));
    assert.deepEqual(store.eventsByType(agent.id, ['infrastructure.error']), store.events(agent.id));
    const foreign = researchStageContext.run(scope, () => app.inspection.emit(other.id, null, 'infrastructure.error', { stage: 'authored', message: 'Foreign evidence' }));
    assert.equal(foreign.researchScope, undefined);
    const before = store.events(agent.id);
    assert.throws(() => researchStageContext.run(scope, () => app.inspection.atomic(() => { app.inspection.emit(agent.id, null, 'infrastructure.error', { stage: 'authored', message: 'Rolled back' }); throw new Error('rollback'); })), /rollback/);
    assert.deepEqual(store.events(agent.id), before);
    const brokenObserver = new Inspection(store, () => { throw new Error('scope unavailable'); });
    assert.equal(brokenObserver.emit(other.id, null, 'infrastructure.error', { stage: 'authored', message: 'Still recorded' }).researchScope, undefined);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store); assert.deepEqual(store.events(agent.id), before);
    const check = new DatabaseSync(path);
    try { assert.equal((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 31); assert.throws(() => check.prepare('UPDATE events SET research_scope = NULL WHERE id = ?').run(event.id), /immutable/i); } finally { check.close(); }
  } finally { await app.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
