import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { cognitiveStrategySimulations } from '../../packages/sdk/src/cognitive-strategy-simulations.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('cognitive strategy experiments use ordinary concerns, feedback and review controls without prescribing conclusions', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent('Preserved cognitive strategy source'); const before = JSON.stringify(store.events(source.id));
    for (const definition of cognitiveStrategySimulations) {
      assert.ok(simulationTests.includes(definition));
      assert.deepEqual(definition.seeds.map(seed => seed.name), ['Avoid Wasted Effort']);
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      const deadline = Date.now() + 30000;
      let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
        run = listSimulationRuns(app).find(run => run.id === started.id)!;
      }
      assert.equal(run.status, 'completed', run.error ?? definition.id);
      assert.equal(run.stages.length, definition.steps.length);
      assert.equal(run.evidenceBasis, 'fixture'); assert.notEqual(run.agentId, source.id);
      assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive'), 'Mock outputs cannot validate emergent cognitive learning');
      assert.equal(store.consolidations(run.agentId).length, 2);
      assert.equal(store.consolidations(run.agentId)[0]?.options?.reviewPredictions, definition.id !== 'cognitive-strategy-no-review');
    }
    assert.equal(JSON.stringify(store.events(source.id)), before);
  } finally { await app.close(); store.close(); }
});
