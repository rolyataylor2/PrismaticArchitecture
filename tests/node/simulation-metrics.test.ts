import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { ConflictError } from '../../packages/core/src/contracts.js';
import { PredictionSchema, MemorySchema } from '../../packages/core/src/domain.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationMetrics } from '../../packages/sdk/src/simulation-metrics.js';
import { saveSimulationMetricReview, simulationResearch } from '../../packages/sdk/src/simulation-research.js';
import { aggregateSimulations } from '../../packages/sdk/src/simulation-comparison.js';
async function finished(app: Application, id: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const run = listSimulationRuns(app).find(item => item.id === id)!;
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error ?? ''); return run; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Metrics fixture did not settle');
}
test('metric denominators preserve censoring, subjective usefulness and version deduplication without quality or calibration scores', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const run = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const bytes = JSON.stringify(run); const copy = structuredClone(run); const origin = copy.stages[0]!.cycleId!;
    const make = (id: string, cycle = origin) => PredictionSchema.parse({ id, agentId: run.agentId, version: 1, schemaVersion: 1, partId: null,
      createdCycle: cycle, expectation: 'Explicit denominator fixture', confidence: 0.9,
      capsule: { interpretation: 'Explicit fixture', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'Later fixture evidence', evaluateAfterCycle: null, status: 'open', evaluation: null, memoryId: null });
    const a = make('confirmed-fixture'); const b = make('ambiguous-fixture'); const inherited = make('inherited-fixture', 'outside-run');
    const evaluation = { assessment: 'confirmed' as const, interpretation: 'Explicit subjective confirmation', causalAttribution: 'Not causal proof', evidence: ['Explicit fixture evidence'], evidenceWorldId: 'fixture-world' };
    copy.stages.forEach((stage, index) => { stage.predictions = [index ? { ...a, version: 2, status: 'resolved', evaluation } : a,
      index >= 2 ? { ...b, version: 2, status: 'resolved', evaluation: { ...evaluation, assessment: 'ambiguous' } } : b, inherited]; stage.predictionChecks = []; });
    copy.stages.at(-1)!.predictions.push(make('censored-fixture', copy.stages.at(-1)!.cycleId!));
    copy.stages[1]!.predictionChecks = [{ predictionId: a.id, outcome: 'correct' }]; copy.stages[2]!.predictionChecks = [{ predictionId: b.id, outcome: 'incomplete' }];
    const memory = MemorySchema.parse({ id: 'memory-fixture', agentId: run.agentId, version: 1, schemaVersion: 1, partId: null,
      createdCycle: origin, content: 'Explicit subjective episode', gist: 'Fixture episode', context: [], ancestorIds: [], predictionId: a.id });
    copy.stages.forEach((stage, index) => { stage.memories = [{ ...memory, version: index >= 2 ? 2 : 1 }]; stage.recalls = index === 1 || index === 2 ? [{ partId: null, dispositionIds: [], memoryIds: [memory.id] }] : []; });
    const metrics = simulationMetrics(copy, store.events(run.agentId));
    assert.equal(metrics.dimensions.length, 10); assert.equal(metrics.predictions.total, 4); assert.equal(metrics.predictions.checked, 2);
    assert.equal(metrics.predictions.inherited, 1); assert.equal(metrics.predictions.withoutLaterCycle, 1);
    assert.deepEqual(metrics.predictions.closureDelayStages, { n: 2, min: 1, max: 2, mean: 1.5 });
    assert.equal(metrics.predictions.administrativeStatus.resolved, 2); assert.equal(metrics.predictions.expectationAssessment.confirmed, 1);
    assert.equal(metrics.predictions.expectationAssessment.ambiguous, 1); assert.equal(metrics.predictions.calibration.value, null);
    assert.equal(metrics.memory.total, 1); assert.equal(metrics.memory.revised, 1); assert.equal(metrics.memory.recallGroups, 2);
    assert.equal(metrics.memory.retainedInFinalSnapshot, 1); assert.ok(metrics.resources.every(item => item.cost === null));
    copy.stages[1]!.memories.push({ ...memory, id: 'second-memory-fixture' });
    copy.stages[1]!.recalls[0]!.memoryIds.push('second-memory-fixture');
    const multiMemory = simulationMetrics(copy, []);
    assert.equal(multiMemory.memory.recallGroups, 2);
    assert.equal(multiMemory.memory.memoryRecallOccurrences, 3);
    assert.ok(metrics.limitations.some(item => item.includes('not evidence of effectiveness')));
    assert.equal(JSON.stringify(run), bytes); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
test('dimension reviews preserve operationalization, frozen attribution/history and method-specific repeated trial variation across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-metric-')); const path = join(directory, 'research.sqlite');
  let store = new SqliteStore(path); let app = new Application(store);
  try {
    const source = app.createAgent(); const left = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const right = await finished(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const runBytes = JSON.stringify(left); const events = JSON.stringify(store.events(left.agentId));
    const unassigned = store.events(left.agentId).find(event => event.type === 'provider.operation' && event.cycleId === null)!; assert.ok(unassigned);
    const input = { metricId: 'retrieval_appropriateness', verdict: 'inconclusive', reviewer: 'Explicit researcher fixture',
      operationalization: 'Count recorded recall groups; quality remains ungraded.', rationale: 'Descriptive fixture measurement only.', limitations: 'Mock behavior and no independent benefit labels.',
      value: 2, unit: 'recall groups', evidenceReferences: [`/events/${unassigned.id}`], expectedVersion: 0 };
    const first = saveSimulationMetricReview(store, left.id, input);
    assert.equal(first.citations[0]!.attribution, 'recorded_stage'); assert.deepEqual(first.citations[0]!.value, unassigned);
    saveSimulationMetricReview(store, right.id, { ...input, value: 4, evidenceReferences: ['/stages/0/thoughts'] });
    const all = () => store.experiments().filter(item => item.kind === 'simulation_metric_review') as typeof first[];
    let group = aggregateSimulations([left, right], all())[0]!.dimensionReviews.find(item => item.metricId === input.metricId)!;
    assert.equal(group.reviewed, 2); assert.equal(group.methodGroups.length, 1); assert.equal(group.methodGroups[0]!.mean, 3);
    assert.equal(group.methodGroups[0]!.sampleStandardDeviation, Math.sqrt(2));
    const revision = await api(app, 'POST', `/api/simulation-tests/${left.id}/research/metric-reviews`, { ...input, expectedVersion: 1,
      operationalization: 'Different explicit measurement definition.', value: 9, evidenceReferences: [`/runs/${right.id}/stages/0/thoughts`] }) as typeof first;
    assert.equal(revision.previousId, first.id); assert.equal(revision.version, 2); assert.equal(revision.citations[0]!.runId, right.id);
    assert.throws(() => saveSimulationMetricReview(store, left.id, input), ConflictError);
    assert.throws(() => saveSimulationMetricReview(store, left.id, { ...input, expectedVersion: 2, value: 1, unit: null }), /together/);
    assert.throws(() => saveSimulationMetricReview(store, left.id, { ...input, expectedVersion: 2, verdict: 'supported', evidenceReferences: [] }), /citations/);
    assert.throws(() => saveSimulationMetricReview(store, left.id, { ...input, metricId: 'global_intelligence' }));
    group = aggregateSimulations([left, right], all())[0]!.dimensionReviews.find(item => item.metricId === input.metricId)!;
    assert.equal(group.methodGroups.length, 2); assert.ok(group.methodGroups.every(item => item.n === 1));
    const apiGroups = await api(app, 'POST', '/api/simulation-tests/aggregate', { runIds: [left.id, right.id] }) as ReturnType<typeof aggregateSimulations>;
    assert.deepEqual(apiGroups[0]!.dimensionReviews.find(item => item.metricId === input.metricId), group);
    assert.equal(JSON.stringify(listSimulationRuns(app).find(run => run.id === left.id)), runBytes); assert.equal(JSON.stringify(store.events(left.agentId)), events);
    const saved = simulationResearch(store, left.id).metricReviews; await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(simulationResearch(store, left.id).metricReviews, saved); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
