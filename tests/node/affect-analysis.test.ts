import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { affectFixture } from './affect-analysis-fixture.js';
import { analyzeAffect } from '../../packages/sdk/src/affect-analysis.js';
import { api } from '../../packages/sdk/src/api.js';

test('affect analysis preserves lifetime cohorts, window origins, late outcomes and failed audit without mutating state', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, decisions, reasoning } = affectFixture(store); const agent = app.createAgent();
    const first = await app.message(agent.id, 'An uncertain inspection fixture experience', 'host', 'analysis-thread');
    const cycle1 = store.cycle(first.cycle.id); store.saveCycle({ ...cycle1, startedAt: '2026-01-01T12:00:00.000Z' });
    const baseline = store.list('prediction', agent.id).find(prediction => prediction.createdCycle === first.cycle.id)!; assert.ok(baseline);
    store.save('prediction', { ...baseline, version: baseline.version + 1, status: 'abandoned' }, baseline.version,
      { origin: 'researcher_edit', reason: 'Explicit inspection fixture abandonment', sourceIds: [] });
    decisions.mode = 'no_change';
    const second = await app.message(agent.id, 'Later uncertain evidence', 'host', 'analysis-thread');
    store.saveCycle({ ...store.cycle(second.cycle.id), startedAt: '2026-01-02T12:00:00.000Z' });
    const originated = store.list('prediction', agent.id).find(prediction => prediction.createdCycle === second.cycle.id && !prediction.gapOrigin)!; assert.ok(originated);
    const third = await app.message(agent.id, 'Focus lifetime has elapsed', 'host', 'analysis-thread');
    store.saveCycle({ ...store.cycle(third.cycle.id), startedAt: '2026-01-03T12:00:00.000Z' });
    const current = store.get('prediction', originated.id);
    store.save('prediction', { ...current, version: current.version + 1, status: 'resolved', evaluation: {
      assessment: 'contradicted', interpretation: 'Explicit later fixture outcome', causalAttribution: 'Fixture observation; no causal claim',
      evidence: ['Fixture evidence supplied after the period ended'], evidenceWorldId: third.cycle.worldId } }, current.version,
      { origin: 'researcher_edit', reason: 'Explicit inspection fixture late outcome', sourceIds: [] });
    const before = store.events(agent.id).length;
    const report = analyzeAffect(store, agent.id); assert.equal(report.periods.length, 1);
    const period = report.periods[0]!; assert.equal(period.end?.kind, 'expired'); assert.equal(period.feedback.completedCycles, 2);
    assert.ok(period.predictionEvidence.some(item => item.prediction.id === baseline.id && item.cohort === 'baseline'));
    assert.ok(period.predictionEvidence.some(item => item.prediction.id === originated.id && item.cohort === 'originated' && item.versions.length >= 2));
    assert.equal(period.feedback.contradicted, 1); assert.equal(period.feedback.learningProgress, 'unavailable');
    const window = analyzeAffect(store, agent.id, { from: '2026-01-02T00:00:00.000Z', to: '2026-01-02T23:59:59.999Z' });
    assert.equal(window.periods.length, 1); assert.equal(window.periods[0]!.feedback.completedCycles, 2);
    assert.equal(window.periods[0]!.windowFeedback.completedCycles, 1); assert.equal(window.periods[0]!.windowFeedback.contradicted, 1);
    assert.equal(window.periods[0]!.windowFeedback.baselinePredictions, 0); assert.ok(window.timeline.every(item => item.cycleId === second.cycle.id));
    assert.equal(analyzeAffect(store, agent.id, { threadId: 'foreign' }).periods.length, 0);
    assert.equal(analyzeAffect(store, agent.id, { partId: 'foreign' }).timeline.length, 0);
    const response = await api(app, 'POST', `/api/agents/${agent.id}/affect-analysis`, { threadId: 'analysis-thread' }); assert.deepEqual(response, analyzeAffect(store, agent.id, { threadId: 'analysis-thread' }));
    assert.equal(store.events(agent.id).length, before);
    await assert.rejects(() => api(app, 'POST', `/api/agents/${agent.id}/affect-analysis`, { from: 'bad' }));
    await assert.rejects(() => api(app, 'POST', `/api/agents/${agent.id}/affect-analysis`, { from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }));
    decisions.mode = 'select'; reasoning.fail = true;
    await assert.rejects(() => app.message(agent.id, 'Controlled failed attempt', 'host', 'analysis-thread'));
    const failed = analyzeAffect(store, agent.id); assert.equal(failed.periods.length, 1); assert.equal(failed.totals.failedCycles, 1);
    assert.ok(failed.timeline.some(item => !item.completed && item.type === 'self.affect_decision'));
  } finally { store.close(); }
});

test('experienced affect remains inspectable without selected focus, and agents are isolated', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, decisions } = affectFixture(store); const agent = app.createAgent(); const other = app.createAgent(); decisions.mode = 'no_change';
    await app.message(agent.id, 'Experience without deliberate focus', 'host', 'experience-thread');
    const report = analyzeAffect(store, agent.id); assert.equal(report.periods.length, 0);
    const transition = report.timeline.find(item => item.type === 'self.experienced_transition'); assert.ok(transition);
    assert.ok(JSON.stringify(transition.detail).includes('Sadness alongside curiosity'));
    assert.equal(analyzeAffect(store, other.id).timeline.length, 0);
  } finally { store.close(); }
});

 test('lifetime analysis is identical after SQLite reopen without inference or execution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-affect-analysis-')); const path = join(directory, 'agent.sqlite');
  let store = new SqliteStore(path);
  try {
    const { app } = affectFixture(store); const agent = app.createAgent();
    await app.message(agent.id, 'An uncertain persisted inspection experience', 'host', 'persisted');
    const before = analyzeAffect(store, agent.id); const count = store.events(agent.id).length;
    assert.equal(before.periods.length, 1); assert.equal(before.periods[0]!.behavior[0]!.bids[0]!.action!.text, 'Revised recommendation');
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(analyzeAffect(store, agent.id), before); assert.equal(store.events(agent.id).length, count);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
