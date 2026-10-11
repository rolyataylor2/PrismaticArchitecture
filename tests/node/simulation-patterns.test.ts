import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { aggregateSimulations } from '../../packages/sdk/src/simulation-comparison.js';
import { simulationCandidates, type SimulationCandidate } from '../../packages/sdk/src/simulation-research.js';
import { api } from '../../packages/sdk/src/api.js';

test('configuration patterns count affected trials with explicit analyzed/failed/live/missing cohorts and preserved configuration confounds', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run); const audit = JSON.stringify(store.events(run.agentId));
    const clean = { ...structuredClone(run), id: 'clean' }; const missing = { ...structuredClone(run), id: 'missing' };
    const failed = { ...structuredClone(run), id: 'failed', status: 'failed' as const };
    const live = { ...structuredClone(run), id: 'live', status: 'running' as const };
    const changed = { ...structuredClone(run), id: 'changed' }; changed.providers.reasoning = 'Explicit different model';
    const candidate: SimulationCandidate = { key: 'authored-pattern', pattern: 'test-pattern', title: 'Authored transport candidate', claim: 'Fixture claim', alternatives: 'Not cognition', followUp: 'Inspect controls', evidenceReferences: ['/stages/0/thoughts'] };
    const groups = aggregateSimulations([run, clean, missing, failed, live, changed], [], [
      { runId: run.id, candidates: [candidate, { ...candidate, key: 'duplicate-pattern' }] }, { runId: clean.id, candidates: [] },
      { runId: failed.id, candidates: [candidate] }, { runId: live.id, candidates: [candidate] }, { runId: changed.id, candidates: [] }]);
    assert.equal(groups.length, 2); const original = groups.find(item => item.runIds.includes(run.id))!;
    assert.equal(original.candidatePatterns.analyzed, 3); assert.equal(original.candidatePatterns.missingAnalysis, 1); assert.equal(original.candidatePatterns.runningExcluded, 1);
    const pattern = original.candidatePatterns.patterns[0]!;
    assert.equal(pattern.completed.n, 2); assert.equal(pattern.completed.affected, 1); assert.equal(pattern.completed.rate, 0.5);
    assert.equal(pattern.completed.candidates.length, 2); assert.deepEqual(pattern.completed.runIds, [run.id]);
    assert.equal(pattern.failed.n, 1); assert.equal(pattern.failed.rate, 1);
    const zero = groups.find(item => item.runIds.includes(changed.id))!.candidatePatterns.patterns[0]!;
    assert.equal(zero.completed.n, 1); assert.equal(zero.completed.rate, 0); assert.equal(zero.failed.rate, null);
    assert.equal(aggregateSimulations([run])[0]!.candidatePatterns.missingAnalysis, 1, 'absent analysis is never zero observations');
    const historical = structuredClone(clean); delete historical.startingConfiguration;
    assert.equal(aggregateSimulations([historical, { ...historical, id: 'historical-other' }]).length, 2);
    const response = await api(app, 'POST', '/api/simulation-tests/aggregate', { runIds: [run.id, run.id] }) as ReturnType<typeof aggregateSimulations>;
    assert.deepEqual(response, aggregateSimulations([run], [], [{ runId: run.id, candidates: simulationCandidates(store, run) }]));
    assert.equal(JSON.stringify(run), bytes); assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
