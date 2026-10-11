import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { listSimulationRuns, startSimulationTest, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { simulationResearch, simulationCandidates, saveSimulationReview, saveSimulationFinding, saveSimulationCandidates } from '../../packages/sdk/src/simulation-research.js';
import { compareSimulations, compareSimulationStages, aggregateSimulations } from '../../packages/sdk/src/simulation-comparison.js';
import { startSimulationAssessment } from '../../packages/sdk/src/simulation-evaluator.js';
import { ConflictError } from '../../packages/core/src/contracts.js';

async function finished(app: Application, runId: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const run = listSimulationRuns(app).find(item => item.id === runId)!;
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error ?? ''); return run; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Research fixture did not complete');
}
test('human reviews and findings preserve citation bytes, history, run state and optimistic isolation across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-research-')); const path = join(directory, 'research.sqlite');
  let store = new SqliteStore(path); const app = new Application(store);
  try {
    const source = app.createAgent('Untouched source'); const sourceState = await api(app, 'GET', `/api/agents/${source.id}`);
    const run = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const other = await finished(app, startSimulationTest(app, 'conversation-fallback-control', 'fixture', source.id).id);
    assert.equal(run.researchAnalysisError, undefined, 'automatic candidate analysis completes independently');
    const runBytes = JSON.stringify(store.experiments().find(item => item.id === run.id)); const events = store.events(run.agentId).length;
    const input = { criterionId: 'criterion-1', outcome: 'inconclusive', reviewer: 'Researcher fixture', rationale: 'Harness evidence only.', evidenceReferences: ['/stages/0/thoughts'], expectedVersion: 0 };
    const first = saveSimulationReview(store, run.id, input);
    const second = await api(app, 'POST', `/api/simulation-tests/${run.id}/research/reviews`, { ...input, outcome: 'observed', rationale: 'Recorded fixture contributions exist; this does not validate cognition.', expectedVersion: 1 }) as typeof first;
    assert.equal(second.version, 2); assert.equal(second.previousId, first.id); assert.deepEqual(second.citations[0]!.value, run.stages[0]!.thoughts);
    assert.match(second.citations[0]!.hash, /^[a-f0-9]{64}$/);
    assert.throws(() => saveSimulationReview(store, run.id, input), ConflictError);
    assert.throws(() => saveSimulationReview(store, run.id, { ...input, criterionId: 'criterion-999' }), /criterion/);
    assert.throws(() => saveSimulationReview(store, run.id, { ...input, outcome: 'observed', evidenceReferences: [], expectedVersion: 2 }), /citations/);
    assert.throws(() => saveSimulationReview(store, run.id, { ...input, evidenceReferences: ['/stages/999/thoughts'], expectedVersion: 2 }), /does not exist/);
    assert.throws(() => saveSimulationReview(store, run.id, { ...input, evidenceReferences: ['/agentId'], expectedVersion: 2 }), /outside/);
    const foreignEvent = store.events(other.agentId)[0]!;
    assert.throws(() => saveSimulationReview(store, run.id, { ...input, evidenceReferences: [`/events/${foreignEvent.id}`], expectedVersion: 2 }), /unavailable/);
    const ownEvent = store.events(run.agentId).find(event => event.cycleId === run.stages[0]!.cycleId)!;
    const third = saveSimulationReview(store, run.id, { ...input, evidenceReferences: [`/events/${ownEvent.id}`], expectedVersion: 2 });
    assert.equal(third.version, 3); assert.deepEqual(third.citations[0]!.value, ownEvent);
    const paired = saveSimulationReview(store, run.id, { ...input, evidenceReferences: [`/runs/${other.id}/stages/0/thoughts`], expectedVersion: 3 });
    assert.deepEqual(paired.citations[0]!.value, other.stages[0]!.thoughts, 'explicit paired-run references preserve their exact provenance');
    assert.equal(paired.citations[0]!.runId, other.id); assert.equal(paired.citations[0]!.evidenceBasis, 'fixture');
    const finding = { key: 'explicit-fixture', title: 'Harness contribution', claim: 'The stage contains an expressed thought.',
      alternatives: 'Mock generation does not establish situated reasoning.', followUp: 'Repeat with configured models and ordinary controls.', reviewer: 'Human fixture', status: 'unreviewed', evidenceReferences: ['/stages/0/thoughts'], expectedVersion: 0 };
    const f1 = saveSimulationFinding(store, run.id, finding);
    const f2 = saveSimulationFinding(store, run.id, { ...finding, expectedVersion: 1, status: 'insufficient_evidence' });
    assert.equal(f2.previousId, f1.id); assert.equal(f2.version, 2);
    assert.throws(() => saveSimulationFinding(store, run.id, finding), ConflictError);
    const oldCandidates = simulationResearch(store, run.id).findings.length; saveSimulationCandidates(store, run.id);
    assert.equal(simulationResearch(store, run.id).findings.length, oldCandidates, 'automatic candidates do not overwrite/repeat saved history');
    assert.equal(simulationResearch(store, other.id).reviews.length, 0);
    assert.equal(JSON.stringify(store.experiments().find(item => item.id === run.id)), runBytes);
    assert.equal(store.events(run.agentId).length, events);
    assert.deepEqual(await api(app, 'GET', `/api/agents/${source.id}`), sourceState);
    const records = simulationResearch(store, run.id); await app.close(); store.close(); store = new SqliteStore(path);
    assert.deepEqual(simulationResearch(store, run.id), records);
    assert.equal(JSON.stringify(store.experiments().find(item => item.id === run.id)), runBytes);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('comparisons align stages and explicit semantic roles without UUID matching, expose ambiguity/confounds and trial variation', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const left = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const right = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const comparison = compareSimulations(left, right);
    assert.ok(comparison.stages.every(stage => stage.matched));
    const match = comparison.stages[0]!.activation.find(item => item.match === 'exact semantic role')!;
    assert.ok(match); assert.notEqual(match.leftIds[0], match.rightIds[0]); assert.ok(match.left && match.right);
    assert.deepEqual(comparison.configurationDifferences, []); assert.ok(comparison.limitations.some(item => item.includes('Fixture')));
    const altered: SimulationRun = structuredClone(right); altered.providers.reasoning = 'Different model'; altered.stages[0]!.name = 'Different stage';
    altered.stages[1]!.dispositions.push({ ...altered.stages[1]!.dispositions[0]!, id: 'duplicate-role' });
    const mismatch = compareSimulations(left, altered);
    assert.ok(mismatch.configurationDifferences.includes('providers'));
    assert.equal(mismatch.stages.filter(stage => !stage.matched).length, 2);
    assert.ok(mismatch.stages.find(stage => stage.name === left.stages[1]!.name)!.activation.some(item => item.match === 'ambiguous' && item.left === null && item.right === null));
    const aggregate = aggregateSimulations([left, right]); assert.equal(aggregate.length, 1); assert.equal(aggregate[0]!.trials, 2);
    assert.equal(aggregate[0]!.activeScopeEvaluations.n, 2); assert.equal(aggregate[0]!.activeScopeEvaluations.sampleStandardDeviation, 0);
    assert.equal(aggregateSimulations([left])[0]!.activeScopeEvaluations.sampleStandardDeviation, null);
    assert.equal(aggregateSimulations([left, altered]).length, 2);
    const changedSettings = structuredClone(right); changedSettings.startingConfiguration!.activationSettings.vectorSearchEnabled = !changedSettings.startingConfiguration!.activationSettings.vectorSearchEnabled;
    assert.ok(compareSimulations(left, changedSettings).configurationDifferences.includes('activationSettingsHash'));
    const oldLeft = structuredClone(left); const oldRight = structuredClone(right); delete oldLeft.startingConfiguration; delete oldRight.startingConfiguration;
    assert.equal(aggregateSimulations([oldLeft, oldRight]).length, 2, 'unknown historical settings cannot establish repeated controlled configurations');
    assert.ok(compareSimulations(oldLeft, oldRight).limitations.some(item => item.includes('missing')));
    const beforeAfter = compareSimulationStages(left, left, 0, 2);
    assert.equal(beforeAfter.stages[0]!.leftIndex, 0); assert.equal(beforeAfter.stages[0]!.rightIndex, 2);
    assert.equal(beforeAfter.stages[0]!.left!.thoughts, left.stages[0]!.thoughts);
    assert.ok(beforeAfter.limitations.some(item => item.includes('carryover')));
    assert.throws(() => compareSimulationStages(left, left, 999, 1), /Unknown/);
    const failed = { ...left, id: 'failed-descriptive-trial', status: 'failed' as const };
    assert.equal(aggregateSimulations([left, failed])[0]!.activeScopeEvaluations.n, 1);
    assert.equal(aggregateSimulations([left, failed])[0]!.failed, 1);
    assert.deepEqual(await api(app, 'POST', '/api/simulation-tests/compare', { leftRunId: left.id, rightRunId: right.id }), comparison);
    await assert.rejects(() => api(app, 'POST', '/api/simulation-tests/compare', { leftRunId: 'foreign', rightRunId: right.id }));
    assert.equal((await api(app, 'POST', '/api/simulation-tests/aggregate', { runIds: [left.id, left.id] }) as typeof aggregate)[0]!.trials, 1);
    const snapshots = structuredClone(left); snapshots.stages[1]!.phase = 'control';
    assert.ok(simulationCandidates(store, snapshots).some(item => item.pattern === 'control-carryover'));
  } finally { await app.close(); store.close(); }
});

test('sourced learning experiments use ordinary cognition and reject decisive assessment without paired evidence', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent('Source preserved');
    const run = await finished(app, startSimulationTest(app, 'observatory-learning-trained', 'fixture', source.id).id);
    assert.equal(run.stages.length, 9); assert.equal(run.evidenceBasis, 'fixture');
    assert.ok(run.measures.every(item => item.outcome === 'inconclusive' && item.assessmentKind === 'semantic'));
    assert.ok(run.startingConfiguration); assert.equal(store.cycles(source.id).length, 0);
    app.simulationEvaluatorProvider = () => ({ label: 'explicit comparative-verdict fixture', author: async schema => schema.parse({ measures: run.specification.criteria.map((_, index) => ({
      criterionId: `criterion-${index + 1}`, outcome: index === 2 ? 'observed' : 'inconclusive', evidenceReferences: ['/stages/0/thoughts'],
      explanation: 'An intentionally invalid decisive paired-comparison fixture.', counterevidence: 'The paired control is absent.', limitations: 'This provider only tests rejection plumbing.',
    })) }) });
    startSimulationAssessment(app, run.id);
    for (let i = 0; i < 1000 && listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!.status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const assessed = listSimulationRuns(app).find(item => item.id === run.id)!;
    assert.equal(assessed.status, 'completed'); assert.equal(assessed.assessments![0]!.status, 'failed');
    assert.match(assessed.assessments![0]!.rubric.criteria[2]!.blockedReason!, /paired/);
    assert.match(assessed.assessments![0]!.rubric.criteria[0]!.blockedReason!, /baseline forecast/);
    assert.match(assessed.assessments![0]!.error!, /missing required prerequisite/);
    assert.deepEqual(assessed.measures, run.measures);
  } finally { await app.close(); store.close(); }
});
