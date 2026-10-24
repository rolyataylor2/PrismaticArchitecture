import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { independentEvidenceSimulations } from '../../packages/sdk/src/independent-evidence-simulations.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('independent-evidence comparisons run ordinary isolated cognition and retain inconclusive fixture provenance', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent('Preserved independent-evidence source'); const before = JSON.stringify(store.events(source.id));
    for (const definition of independentEvidenceSimulations) {
      assert.ok(simulationTests.includes(definition));
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      const deadline = Date.now() + 60000; let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!;
      }
      assert.equal(run.status, 'completed', run.error ?? definition.id); assert.equal(run.stages.length, definition.steps.length);
      assert.equal(run.evidenceBasis, 'fixture'); assert.notEqual(run.agentId, source.id);
      assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive'));
      assert.ok(store.consolidations(run.agentId).every(sleep => sleep.status === 'completed'));
    }
    assert.equal(JSON.stringify(store.events(source.id)), before);
  } finally { await app.close(); store.close(); }
});
