import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { affectCycles, affectPredictionOrigins, priorAffect, currentAffect } from '../../packages/core/src/affect-history.js';
import { analyzeAffect } from '../../packages/sdk/src/affect-analysis.js';
import { affectFixture } from './affect-analysis-fixture.js';

// Plumbing regression for a preserved live-trial failure, not psychological evidence.
test('creation-time origins survive a later legacy pass that relabels an existing prediction as new', async () => {
  const store = new SqliteStore(':memory:');
  const { app } = affectFixture(store);
  try {
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'An uncertain first observation', 'host', 'origin-history');
    const baseline = store.list('prediction', agent.id).find(prediction => prediction.createdCycle === first.cycle.id)!;
    assert.ok(baseline);
    store.save('prediction', { ...baseline, version: baseline.version + 1, status: 'abandoned' }, baseline.version,
      { origin: 'researcher_edit', reason: 'Explicit bookkeeping fixture permits another prediction', sourceIds: [] });
    const second = await app.message(agent.id, 'A later uncertainty while reconsidering focus', 'host', 'origin-history');
    const records = affectCycles(store, agent.id), entry = records.at(-1)!;
    const prediction = store.list('prediction', agent.id).find(item => item.createdCycle === second.cycle.id && !item.gapOrigin)!;
    assert.ok(prediction);assert.notEqual(entry.focusAfter!.periodId, records[0]!.focusAfter!.periodId);
    assert.ok(entry.baselinePredictionIds.includes(prediction.id));
    const origin = affectPredictionOrigins(store, agent.id).find(item => item.predictionId === prediction.id)!;
    assert.equal(origin.periodId, records[0]!.focusAfter!.periodId);
    // Reproduce an old second Self pass's incorrect summary while retaining the actual origin event.
    const malformed = { ...entry, decisions: [], focusBefore: entry.focusAfter, usedFocus: entry.focusAfter,
      originated: [{ predictionId: prediction.id, periodId: entry.focusAfter!.periodId, stage: 'part_cognition' as const }] };
    store.appendEvent(agent.id, second.cycle.id, 'self.affect_cycle', malformed);
    const count = store.events(agent.id).length;
    const next = { ...second.cycle, id: 'next-fixture-cycle', sequence: second.cycle.sequence + 1 };
    assert.equal(priorAffect(store, next).feedback!.originatedPredictions, 0);
    assert.equal(currentAffect(store, next).feedback!.originatedPredictions, 0);
    const analysis = analyzeAffect(store, agent.id);
    const selected = analysis.periods.find(period => period.id === entry.focusAfter!.periodId)!;
    assert.equal(selected.feedback.originatedPredictions, 0);
    assert.equal(selected.feedback.completedCycles, 1, "Repeated summaries do not create additional completed cognition");
    assert.ok(selected.predictionEvidence.some(item => item.prediction.id === prediction.id && item.cohort === 'baseline'));
    assert.equal(analysis.periods.find(period => period.id === origin.periodId)!.feedback.originatedPredictions, 1);
    assert.deepEqual(affectCycles(store, agent.id).at(-1), malformed, 'Raw malformed history is preserved for inspection');
    assert.equal(store.events(agent.id).length, count, 'Projection does not rewrite history');
    // A filtered-out explicit origin must not become a new legacy attribution elsewhere.
    assert.ok(!affectPredictionOrigins(store, agent.id, [{ ...records[0]!, originated: [malformed.originated[0]!] }])
      .some(item => item.predictionId === prediction.id));
    // Historical data without a creation event still retains its authored origin.
    const legacy = { predictionId: baseline.id, periodId: 'legacy-period', stage: 'part_cognition' as const };
    assert.ok(affectPredictionOrigins(store, agent.id, [{ ...records[0]!, originated: [legacy] }])
      .some(item => item.predictionId === baseline.id && item.periodId === legacy.periodId));
  } finally { await app.close();store.close(); }
});

test('multiple Self passes in one source cycle summarize actual prediction origins without relabeling earlier thoughts', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:');
  const { app, reasoning, decisions } = affectFixture(store);
  let release!: () => void, chosen!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  const committed = new Promise<void>(resolve => { chosen = resolve; });
  const constructed = reasoning.constructed.bind(reasoning);
  reasoning.constructed = async input => {
    if (input.task === 'part_cognition' && input.dispositions?.[0]?.id === 'slow-origin') await slow;
    return constructed(input);
  };
  decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
  let pending: ReturnType<typeof app.message> | undefined;
  try {
    const agent = app.createAgent();
    for (const id of ['fast-origin', 'slow-origin']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1,
      name: id, concern: `An authored ${id} concern`, scope: id, cues: [id], prerequisites: [], threshold: 2, memoryIds: [],
      sourcePredictionId: null, temporary: false, active: true }, 0,
      { origin: 'seed', reason: 'Explicit concurrent origin-bookkeeping fixture', sourceIds: [] });
    app.inspection.subscribe(event => { if (event.type === 'self.affect_committed') chosen(); });
    pending = app.message(agent.id, 'An uncertainty admits independently completing perspectives.', 'host', 'multiple-origin-passes');
    await committed;release();
    const result = await pending;
    const records = affectCycles(store, agent.id).filter(record => record.cycleId === result.cycle.id);
    assert.ok(records.length >= 2, 'The fixture must exercise repeated Self passes in one cycle');
    const predictions = store.list('prediction', agent.id).filter(prediction => prediction.createdCycle === result.cycle.id);
    assert.ok(predictions.some(prediction => !prediction.gapOrigin), 'An actual Part prediction precedes focus selection');
    const events = store.eventsByType(agent.id, ['self.affect_prediction_origin']);
    for (const record of records) for (const origin of record.originated) assert.ok(events.some(event => event.type === 'self.affect_prediction_origin'
      && event.payload.predictionId === origin.predictionId && event.payload.periodId === origin.periodId && event.payload.stage === origin.stage));
    assert.doesNotThrow(() => analyzeAffect(store, agent.id));
  } finally { release();await pending?.catch(() => {});await app.close();store.close(); }
});
