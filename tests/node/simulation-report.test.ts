import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { saveSimulationReview, saveSimulationFinding, saveSimulationMetricReview, simulationResearch, simulationCitation } from '../../packages/sdk/src/simulation-research.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { simulationReport, type SimulationReport } from '../../packages/sdk/src/simulation-report.js';
import { PredictionSchema } from '../../packages/core/src/domain.js';

test('contextual report keeps newest external judgments, exact paired evidence, semantic unknowns and initial-versus-later changes across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-report-')); const path = join(directory, 'research.sqlite');
  let store = new SqliteStore(path); let app = new Application(store);
  try {
    const source = app.createAgent();
    const launch = async () => {
      const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
      for (let attempt = 0; attempt < 1000; attempt++) {
        const run = listSimulationRuns(app).find(item => item.id === started.id)!;
        if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error ?? ''); return run; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Report fixture did not settle');
    };
    const run = await launch(); const paired = await launch(); const bytes = JSON.stringify(run); const events = JSON.stringify(store.events(run.agentId));
    const read = () => api(app, 'GET', `/api/simulation-tests/${run.id}/report`) as Promise<SimulationReport>;
    const initial = await read();
    assert.equal(initial.hypothesis, run.specification.hypothesis); assert.equal(initial.evidenceBasis, 'fixture');
    assert.ok(initial.unknown.some(item => item.key === 'dimension:learning_transfer'));
    assert.ok(initial.changed.every(item => !item.key.startsWith('change:0:')));
    assert.ok(initial.sources.length); assert.ok(initial.sources.every(item => item.citation || item.unavailableReason));
    const input = { criterionId: 'criterion-1', reviewer: 'Explicit research harness', rationale: 'Authored verdict to test report attribution; no psychological validation.',
      outcome: 'observed', expectedVersion: 0, evidenceReferences: ['/stages/0/thoughts'] };
    const first = saveSimulationReview(store, run.id, input);
    let report = await read(); assert.equal(report.worked.find(item => item.key === 'criterion-1')!.reviewId, first.id);
    const revised = saveSimulationReview(store, run.id, { ...input, outcome: 'not_observed', expectedVersion: 1,
      rationale: 'Revised authored verdict must replace, not duplicate, the old report judgment.', evidenceReferences: [`/runs/${paired.id}/stages/0/thoughts`] });
    const metric = saveSimulationMetricReview(store, run.id, { metricId: 'learning_transfer', verdict: 'inconclusive', reviewer: 'Explicit research harness',
      operationalization: 'No independently labeled transfer outcome supplied.', rationale: 'Preserve uncertainty.', limitations: 'Mock fixture cannot validate a cognitive hypothesis.', expectedVersion: 0, evidenceReferences: ['/stages/0'] });
    const finding = saveSimulationFinding(store, run.id, { key: 'report-fixture-finding', title: 'Authored uncertainty', claim: 'Meaning remains unestablished.',
      alternatives: 'Capture may be incomplete.', followUp: 'Inspect the held-out probe.', reviewer: 'Explicit research harness', status: 'insufficient_evidence',
      expectedVersion: 0, evidenceReferences: ['/stages/2'] });
    report = await read();
    assert.ok(!report.worked.some(item => item.key === 'criterion-1'));
    assert.equal(report.surprising.find(item => item.key === 'criterion-1')!.reviewVersion, 2);
    assert.deepEqual(report.surprising.find(item => item.key === 'criterion-1')!.citations, revised.citations);
    assert.equal(report.sources.find(item => item.reference === revised.citations[0]!.reference)!.citation!.runId, paired.id);
    assert.equal(report.unknown.find(item => item.key === 'dimension:learning_transfer')!.reviewId, metric.id);
    assert.equal(report.unknown.find(item => item.key === 'finding:report-fixture-finding')!.reviewId, finding.id);
    assert.equal(report.inspectNext.find(item => item.key === 'finding:report-fixture-finding')!.followUp, finding.followUp);
    // Explicit synthetic snapshot establishes reporting semantics only; it does not validate prediction cognition.
    const copy = structuredClone(run); copy.measures[0] = { criterion: copy.specification.criteria[0]!, assessmentKind: 'semantic', outcome: 'observed', evidence: 'Authored model claim' };
    copy.stages[1]!.predictions.push(PredictionSchema.parse({ id: 'report-contradiction-fixture', agentId: run.agentId, version: 2, schemaVersion: 1, partId: null,
      createdCycle: copy.stages[0]!.cycleId, expectation: 'Authored expectation', confidence: 0.9,
      capsule: { interpretation: 'Explicit fixture', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'Later evidence', evaluateAfterCycle: null, status: 'resolved', memoryId: null,
      evaluation: { assessment: 'contradicted', interpretation: 'Authored subjective contradiction', causalAttribution: 'Unproven', evidence: ['Authored evidence'], evidenceWorldId: 'fixture-world' } }));
    const synthetic = simulationReport(copy, analyzeSimulation(store, copy), { reviews: [], metricReviews: [], findings: [] }, [], reference => simulationCitation(store, copy, reference));
    assert.ok(synthetic.unknown.some(item => item.key === 'criterion-1'));
    assert.ok(!synthetic.worked.some(item => item.key === 'criterion-1'));
    const contradiction = synthetic.surprising.find(item => item.key.startsWith('contradiction:'))!;
    assert.equal(contradiction.basis, 'subjective_assessment'); assert.ok(contradiction.alternatives?.includes('independent assessability'));
    copy.status = 'failed'; copy.error = 'Explicit authored infrastructure failure';
    const failed = simulationReport(copy, analyzeSimulation(store, copy), { reviews: [], metricReviews: [], findings: [] }, [], reference => simulationCitation(store, copy, reference));
    assert.ok(!failed.worked.some(item => item.key === 'operational-progress'));
    assert.ok(failed.unknown.some(item => item.key === 'infrastructure-failure'));
    assert.ok(failed.surprising.some(item => item.key === 'operational-progress'));
    assert.equal(JSON.stringify(listSimulationRuns(app).find(item => item.id === run.id)), bytes);
    assert.equal(JSON.stringify(store.events(run.agentId)), events); assert.equal(store.events(source.id).length, 0);
    assert.equal(simulationResearch(store, run.id).reviews.length, 2);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(await read(), report);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
