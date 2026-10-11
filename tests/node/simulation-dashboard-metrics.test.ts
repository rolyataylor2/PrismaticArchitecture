import test from 'node:test';
import assert from 'node:assert/strict';
import type { SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { criterionRecurrence, stageMetrics, trajectories } from '../../apps/web/src/simulation-metrics.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('dashboard denominators separate failed runs, unresolved semantic measures and absent criteria', () => {
  const make = (id: string, status: SimulationRun['status'], measures: SimulationRun['measures']) => ({ id, status, measures } as SimulationRun);
  const result = criterionRecurrence([
    make('a', 'completed', [{ criterion: 'Recall', outcome: 'observed' }, { criterion: 'Theory', outcome: 'observed', assessmentKind: 'semantic' }].map(m => ({ ...m, evidence: 'recorded' } as SimulationRun['measures'][number]))),
    make('b', 'completed', [{ criterion: 'Recall', outcome: 'not_observed', evidence: 'recorded' }]),
    make('c', 'failed', [{ criterion: 'Recall', outcome: 'observed', evidence: 'partial' }]),
  ]);
  assert.deepEqual(result[0]!.counts, { observed: 1, not_observed: 1, inconclusive: 0, missing: 0 });
  assert.equal(result[0]!.n, 2); assert.equal(result[0]!.pattern, 'Varies across trials');
  assert.deepEqual(result[1]!.counts, { observed: 0, not_observed: 0, inconclusive: 1, missing: 1 });
  assert.equal(result[1]!.pattern, 'Unresolved');
});

test('dashboard preserves recorded zero, absent execution instrumentation and final activation rounds', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Metrics source');
  try {
    const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    for (let i = 0; i < 1000 && listSimulationRuns(app).find(r => r.id === started.id)!.status === 'running'; i++) await new Promise(r => setTimeout(r, 10));
    const run = listSimulationRuns(app).find(r => r.id === started.id)!; assert.equal(run.status, 'completed');
    const original = structuredClone(run); const stage = structuredClone(run.stages[0]!);
    stage.activations = [{ dispositionId: 'd', name: 'scope', score: 3, active: true }, { dispositionId: 'd', name: 'scope', score: 1, active: false }];
    delete stage.executions; assert.equal(stageMetrics(stage).executions, null); assert.equal(stageMetrics(stage).active, 0); assert.equal(stageMetrics(stage).scored, 1);
    stage.executions = []; assert.equal(stageMetrics(stage).executions, 0);
    const missing = structuredClone(run); missing.id = 'missing'; missing.stages.forEach(s => { delete s.executions; });
    const chart = trajectories([run, missing], 'executions'); assert.equal(chart[0]!.n, 1); assert.equal(chart[0]!.mean, run.stages[0]!.executions!.length);
    assert.deepEqual(run, original, 'semantic projection never mutates saved evidence');
  } finally { await app.close(); store.close(); }
});
