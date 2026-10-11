import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { simulationCandidates, simulationCitation } from '../../packages/sdk/src/simulation-research.js';

test('explicit unfinished cycle and stage records stay external candidates, exclude live and unrelated work, and terminate only on matching identities', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run);
    const normal = analyzeSimulation(store, run); assert.ok(normal.cycleAttempts.length > 0);
    assert.ok(normal.cycleAttempts.every(item => item.end?.type === 'cycle.completed'));
    // Explicitly authored interrupted audit records test inspection, never cognition or hypothesis success.
    const cycle = store.startCycle(run.agentId, run.id); store.appendEvent(run.agentId, cycle.id, 'cycle.started', cycle);
    const foreign = { ...cycle, id: 'authored-unrelated-cycle', threadId: 'another-run' }; store.appendEvent(run.agentId, foreign.id, 'cycle.started', foreign);
    const stage = { runId: run.id, stageId: 'authored-interrupted-stage', stageIndex: run.stages.length, name: 'Authored interruption', phase: 'probe' as const };
    const start = store.appendEvent(run.agentId, null, 'simulation.stage_started', stage);
    const copy = structuredClone(run); copy.finishedAt = new Date(Date.now() + 10).toISOString();
    const audit = JSON.stringify(store.events(run.agentId));
    const projected = analyzeSimulation(store, copy);
    assert.equal(projected.cycleAttempts.length, normal.cycleAttempts.length + 1); assert.equal(projected.cycleAttempts.at(-1)!.end, null);
    const candidates = simulationCandidates(store, copy).filter(item => /unfinished-(cycle|stage)-capture/.test(item.pattern));
    assert.equal(candidates.length, 2);
    for (const candidate of candidates) for (const reference of candidate.evidenceReferences) assert.ok(simulationCitation(store, copy, reference).hash);
    assert.ok(!simulationCandidates(store, { ...copy, status: 'running' }).some(item => /unfinished-(cycle|stage)-capture/.test(item.pattern)));
    assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(JSON.stringify(run), bytes);
    store.appendEvent(run.agentId, foreign.id, 'infrastructure.error', { stage: 'authored', message: 'Unrelated failure' });
    assert.equal(analyzeSimulation(store, copy).cycleAttempts.at(-1)!.end, null);
    store.appendEvent(run.agentId, cycle.id, 'infrastructure.error', { stage: 'authored', message: 'Injected capture failure' });
    store.appendEvent(run.agentId, null, 'simulation.stage_failed', { runId: stage.runId, stageId: stage.stageId, stageIndex: stage.stageIndex, startEventId: start.id });
    assert.equal(analyzeSimulation(store, copy).cycleAttempts.at(-1)!.end?.type, 'infrastructure.error');
    assert.ok(!simulationCandidates(store, copy).some(item => /unfinished-(cycle|stage)-capture/.test(item.pattern)));
    assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
