import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api, snapshot } from '../../packages/sdk/src/api.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { saveSimulationMetricReview, simulationResearch } from '../../packages/sdk/src/simulation-research.js';
import { compareSimulationStages, aggregateSimulations, type SimulationComparison } from '../../packages/sdk/src/simulation-comparison.js';
import type { SimulationReport } from '../../packages/sdk/src/simulation-report.js';
import { ConflictError } from '../../packages/core/src/contracts.js';

test('stage-scoped external judgments preserve independent versions, matched methods, local evidence, whole-run aggregation and restart isolation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-longitudinal-')); const path = join(directory, 'research.sqlite');
  let store = new SqliteStore(path); let app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run); const before = snapshot(app, run.agentId); const sourceBefore = snapshot(app, source.id);
    const input = { metricId: 'learning_stability', verdict: 'inconclusive', reviewer: 'Explicit longitudinal research fixture',
      operationalization: 'Authored observation count to test scope matching; no cognitive quality grade.', rationale: 'External descriptive harness value.',
      limitations: 'Mock cognition and no independent psychological criterion.', value: 10, unit: 'authored observations', expectedVersion: 0, evidenceReferences: ['/stages/0'] };
    const whole = saveSimulationMetricReview(store, run.id, input);
    const baseline = saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 0, value: 2 });
    const followUp = saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 2, value: 7, evidenceReferences: ['/stages/2'] });
    assert.equal(whole.version, 1); assert.equal(baseline.version, 1); assert.equal(followUp.version, 1);
    const records = () => simulationResearch(store, run.id).metricReviews;
    let comparison = await api(app, 'POST', '/api/simulation-tests/compare-stages', { leftRunId: run.id, rightRunId: run.id, leftIndex: 0, rightIndex: 2 }) as SimulationComparison;
    let dimension = comparison.dimensionReviews.find(item => item.metricId === input.metricId)!;
    assert.equal(dimension.left!.id, baseline.id); assert.equal(dimension.right!.id, followUp.id); assert.equal(dimension.difference, 5);
    assert.equal(compareSimulationStages(run, run, 0, 1, records()).dimensionReviews.find(item => item.metricId === input.metricId)!.right, null);
    assert.equal(aggregateSimulations([run], records())[0]!.dimensionReviews.find(item => item.metricId === input.metricId)!.methodGroups[0]!.mean, 10);
    assert.throws(() => saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 0 }), ConflictError);
    assert.throws(() => saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 999 }), /Unknown dimension review stage/);
    assert.throws(() => saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 1 }), /own stage evidence citation/);
    assert.throws(() => saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 1, evidenceReferences: [`/runs/foreign/stages/1`] }), /own stage/);
    const revision = saveSimulationMetricReview(store, run.id, { ...input, stageIndex: 2, expectedVersion: 1, value: 9, unit: 'different units', evidenceReferences: ['/stages/2/thoughts'] });
    assert.equal(revision.previousId, followUp.id); assert.equal(revision.version, 2);
    comparison = await api(app, 'POST', '/api/simulation-tests/compare-stages', { leftRunId: run.id, rightRunId: run.id, leftIndex: 0, rightIndex: 2 }) as SimulationComparison;
    dimension = comparison.dimensionReviews.find(item => item.metricId === input.metricId)!; assert.equal(dimension.difference, null); assert.match(dimension.limitation, /units/);
    const report = await api(app, 'GET', `/api/simulation-tests/${run.id}/report`) as SimulationReport;
    assert.equal(report.unknown.find(item => item.key === 'dimension:learning_stability')!.reviewId, whole.id);
    assert.equal(report.unknown.find(item => item.key === 'stage-dimension:learning_stability:2')!.reviewId, revision.id);
    assert.deepEqual(report.stageDimensionReviews.map(item => item.id), [baseline.id, revision.id]);
    assert.deepEqual(snapshot(app, run.agentId), before); assert.deepEqual(snapshot(app, source.id), sourceBefore); assert.equal(JSON.stringify(listSimulationRuns(app).find(item => item.id === run.id)), bytes);
    const saved = records(); await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(records(), saved); assert.deepEqual(await api(app, 'POST', '/api/simulation-tests/compare-stages', { leftRunId: run.id, rightRunId: run.id, leftIndex: 0, rightIndex: 2 }), comparison);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
