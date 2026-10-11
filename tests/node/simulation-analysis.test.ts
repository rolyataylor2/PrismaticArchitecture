import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { PredictionSchema } from '../../packages/core/src/domain.js';

test('run analytics preserves rounds and version changes, isolates recorded evidence and survives restart read-only', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-observatory-'));
  const path = join(directory, 'research.sqlite'); let store = new SqliteStore(path);
  const app = new Application(store);
  try {
    const source = app.createAgent('Source');
    await app.message(source.id, 'Private source conversation', 'host', 'source');
    const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let attempt = 0; run.status === 'running' && attempt < 1000; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      run = listSimulationRuns(app).find(item => item.id === started.id)!;
    }
    assert.equal(run.status, 'completed', run.error ?? 'run did not settle');
    const before = store.events(run.agentId).length;
    const report = analyzeSimulation(store, run);
    assert.equal(report.stages.length, 4); assert.equal(report.summary.controls, 1);
    assert.equal(report.stages[0]!.changes.dispositions.length, run.stages[0]!.dispositions.length);
    assert.equal(report.stages[1]!.changes.dispositions.length, 0, 'unchanged snapshots do not count as new development');
    for (const row of report.activation) for (const cell of row.cells) {
      assert.equal(cell.rounds.length, run.stages[cell.stageIndex]!.activations.filter(item => item.dispositionId === row.dispositionId).length);
    }
    assert.ok(report.stages.some(stage => stage.trace.some(event => event.lane === 'Self')));
    assert.ok(report.stages.every(stage => stage.trace.every(event => event.cycleId === stage.cycleId && event.runId === run.id && event.parentEventId === (event.type === 'runtime.validation' ? (event.payload as { inputEventId: string }).inputEventId : null))));
    assert.ok(!JSON.stringify(report).includes('Private source conversation'));
    assert.deepEqual(await api(app, 'GET', `/api/simulation-tests/${run.id}/analysis`), report);
    await assert.rejects(() => api(app, 'GET', '/api/simulation-tests/missing/analysis'));
    assert.equal(store.events(run.agentId).length, before);
    const historical = structuredClone(run);
    const prediction = PredictionSchema.parse({ id: 'explicit-ledger-fixture', agentId: run.agentId, version: 1, schemaVersion: 1,
      partId: null, createdCycle: run.stages[0]!.cycleId, expectation: 'An explicit test expectation', confidence: 0.9,
      capsule: { interpretation: 'Explicit plumbing fixture', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'After later evidence', evaluateAfterCycle: null, status: 'open', evaluation: null, memoryId: null });
    historical.stages[0]!.predictions = [prediction]; historical.stages[1]!.predictions = [prediction];
    historical.stages[2]!.predictions = [{ ...prediction, version: 2, status: 'resolved', evaluation: {
      assessment: 'ambiguous', interpretation: 'Insufficient evidence', causalAttribution: 'Unknown', evidence: [], evidenceWorldId: 'explicit-fixture-world' } }];
    historical.stages[3]!.predictions = historical.stages[2]!.predictions;
    const ledger = analyzeSimulation(store, historical).predictions.find(item => item.prediction.id === prediction.id)!;
    assert.equal(ledger.administrativeStatus, 'resolved'); assert.equal(ledger.expectationAssessment, 'ambiguous');
    assert.equal(ledger.evidenceSufficiency, 'not established'); assert.equal(ledger.originStage, 0);
    assert.deepEqual(ledger.versions.map(item => item.prediction.version), [1, 2]);
    assert.ok(ledger.calibration.startsWith('unavailable'));
    const activation = historical.stages[0]!.activations[0]!;
    historical.stages[0]!.activations.push({ ...activation, score: 0, active: false });
    const repeated = analyzeSimulation(store, historical).activation.find(row => row.dispositionId === activation.dispositionId)!.cells[0]!;
    assert.equal(repeated.rounds.length, 2); assert.equal(repeated.rounds[0]!.score, activation.score); assert.equal(repeated.rounds[1]!.score, 0);
    historical.stages[0]!.cycleId = 'unavailable-historical-cycle';
    assert.equal(analyzeSimulation(store, historical).stages[0]!.traceAvailable, false);
    assert.ok(analyzeSimulation(store, historical).gaps.some(gap => gap.includes('no recorded')));
    await app.close(); store.close(); store = new SqliteStore(path);
    assert.deepEqual(analyzeSimulation(store, run), report); assert.equal(store.events(run.agentId).length, before);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
