import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('activation projection preserves exact association signals, rounds, eligibility and separate admission read-only', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const id = startSimulationTest(app, 'activation-associations', 'fixture', source.id).id;
    for (let attempt = 0; attempt < 1000 && listSimulationRuns(app).find(run => run.id === id)!.status === 'running'; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    const run = listSimulationRuns(app).find(run => run.id === id)!; assert.equal(run.status, 'completed', run.error ?? '');
    assert.equal(run.evidenceBasis, 'fixture');
    const events = store.events(run.agentId); const bytes = JSON.stringify(events); const projection = analyzeSimulation(store, run);
    assert.ok(projection.stages.some(stage => stage.activationDetails.some(item => item.phase === 'associated')));
    for (const stage of projection.stages) {
      assert.ok(stage.eligibility.length); assert.ok(stage.admission.length);
      for (const detail of stage.activationDetails) {
        const event = events.find(event => event.id === detail.eventId)!; assert.ok(event.type === 'construction.judgment');
        const candidate = event.payload.input.candidates.find(candidate => candidate.id === detail.dispositionId)!;
        const context = candidate.context as { associationSignals?: unknown[]; baselineActivation?: number };
        assert.deepEqual(detail.associationSignals, context.associationSignals ?? []);
        assert.equal(detail.score, event.payload.scores.find(score => score.partId === detail.dispositionId)!.score);
        assert.equal(detail.directScore, context.baselineActivation ?? null);
        assert.equal(detail.scoreDifference, context.baselineActivation === undefined ? null : detail.score! - context.baselineActivation);
      }
      for (const round of stage.admission) for (const scope of round.scopes) {
        if (scope.status === 'below_threshold') assert.ok(scope.score! < scope.threshold);
        if (scope.status === 'admitted' || scope.status === 'budget_deferred') assert.ok(scope.score! >= scope.threshold);
      }
    }
    assert.equal(JSON.stringify(store.events(run.agentId)), bytes); assert.equal(store.events(source.id).length, 0);
    const historical = { ...run, agentId: source.id };
    const missing = analyzeSimulation(store, historical);
    assert.ok(missing.stages.every(stage => !stage.eligibility.length && !stage.admission.length && !stage.activationDetails.length));
  } finally { await app.close(); store.close(); }
});
