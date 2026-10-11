import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api, snapshot } from '../../packages/sdk/src/api.js';
import { startSimulationTest, listSimulationRuns, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { startSimulationAssessment } from '../../packages/sdk/src/simulation-evaluator.js';
import { predictionAlignmentCriteria } from '../../packages/sdk/src/simulation-alignment.js';
import { simulationResearch } from '../../packages/sdk/src/simulation-research.js';
import { PredictionSchema, MemorySchema, id } from '../../packages/core/src/domain.js';

async function settled(app: Application, runId: string, assessment = false) {
  for (let i = 0; i < 1000; i++) {
    const run = listSimulationRuns(app).find(item => item.id === runId)!;
    if (assessment ? run.assessments?.at(-1)?.status !== 'running' : run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Alignment fixture did not settle');
}
test('authored alignment evidence validates both citation sides and missing prerequisites, creates separate provisional findings, and preserves cognition', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const original = await settled(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    const before = snapshot(app, original.agentId); const sourceBefore = snapshot(app, source.id); const originalBytes = JSON.stringify(original);
    // Synthetic saved researcher packet tests validation/reporting only. Ordinary cognition did not produce these authored meanings.
    const copy: SimulationRun = structuredClone(original); copy.id = id('alignment_fixture'); copy.assessments = [];
    const prediction = PredictionSchema.parse({ id: 'alignment-prediction-fixture', agentId: original.agentId, version: 1, schemaVersion: 1, partId: null,
      createdCycle: copy.stages[0]!.cycleId, expectation: 'The visitor will appreciate tomato advice.', confidence: 0.8,
      capsule: { interpretation: 'Authored tomato question', details: ['yellow leaves'], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'The next reply', evaluateAfterCycle: null, status: 'open', evaluation: null, memoryId: null });
    const resolved = { ...prediction, version: 2, status: 'resolved' as const, memoryId: 'alignment-memory-fixture',
      evaluation: { assessment: 'confirmed' as const, interpretation: 'An archived Hello sign appeared.', causalAttribution: 'Unestablished', evidence: ['Archived sign'], evidenceWorldId: 'authored-world' } };
    const memory = MemorySchema.parse({ id: resolved.memoryId, agentId: original.agentId, version: 1, schemaVersion: 1, partId: null,
      createdCycle: copy.stages[1]!.cycleId, predictionId: prediction.id, content: 'I expected an archived Hello sign.', gist: 'Authored memory mismatch', context: [], ancestorIds: [] });
    copy.stages.forEach((stage, index) => { stage.predictions = [index ? resolved : prediction]; stage.memories = index ? [memory] : []; });
    store.saveExperiment(copy);
    const revisedPacket = structuredClone(copy);
    revisedPacket.stages[1]!.predictions = [{ ...prediction, version: 2, expectation: 'An explicit revised expectation about a sign' }];
    assert.deepEqual(predictionAlignmentCriteria(revisedPacket)[0]!.requiredEvidenceGroups![0], ['/stages/1/predictions/0']);
    const criteria = predictionAlignmentCriteria(copy); assert.equal(criteria.length, 2); assert.ok(criteria.every(item => item.blockedReason === null));
    let mode: 'mismatch' | 'missing_side' | 'invalid_reference' | 'inconclusive' | 'aligned' = 'mismatch'; let calls = 0; let evaluationRunId = copy.id;
    app.simulationEvaluatorProvider = () => ({ label: 'explicit-alignment-transport-fixture', author: async schema => {
      calls++; const run = listSimulationRuns(app).find(item => item.id === evaluationRunId)!; const assessment = run.assessments!.at(-1)!;
      assert.ok(assessment.prompt.rendered.includes('Prediction-alignment criteria'));
      return schema.parse({ measures: assessment.rubric.criteria.map(criterion => ({ criterionId: criterion.criterionId,
        outcome: !criterion.requiredEvidenceGroups || mode === 'inconclusive' ? 'inconclusive' : mode === 'aligned' ? 'not_observed' : 'observed',
        evidenceReferences: mode === 'invalid_reference' ? ['/stages/999/predictions/0'] : criterion.requiredEvidenceGroups?.slice(0, mode === 'missing_side' ? 1 : undefined).flatMap(group => group.slice(0, 1)) ?? [],
        explanation: 'Authored model verdict for contract plumbing only.', counterevidence: 'A legitimate revision might explain a change.', limitations: 'This fixture does not validate semantic alignment or psychology.' })) });
    } });
    startSimulationAssessment(app, copy.id); let assessed = await settled(app, copy.id, true);
    assert.equal(assessed.assessments!.at(-1)!.status, 'completed', assessed.assessments!.at(-1)!.error ?? '');
    let findings = simulationResearch(store, copy.id).findings.filter(item => item.origin === 'model_assessment');
    assert.equal(findings.length, 2); assert.ok(findings.every(item => item.status === 'unreviewed' && item.citations.length >= 3));
    assert.ok(findings.every(item => item.citations.slice(1).every(citation => /\/assessments\/\d+\/evidence\/stages\//.test(citation.reference))));
    assert.ok(findings.every(item => item.alternatives.includes('external machine interpretation')));
    const oldFindings = JSON.stringify(findings);
    mode = 'missing_side'; startSimulationAssessment(app, copy.id); assessed = await settled(app, copy.id, true);
    assert.equal(assessed.assessments!.at(-1)!.status, 'failed'); assert.match(assessed.assessments!.at(-1)!.error!, /both preserved sides/);
    mode = 'invalid_reference'; startSimulationAssessment(app, copy.id); assessed = await settled(app, copy.id, true);
    assert.match(assessed.assessments!.at(-1)!.error!, /invalid evidence reference/);
    mode = 'aligned'; startSimulationAssessment(app, copy.id); assessed = await settled(app, copy.id, true);
    assert.equal(assessed.assessments!.at(-1)!.status, 'completed');
    findings = simulationResearch(store, copy.id).findings.filter(item => item.origin === 'model_assessment'); assert.equal(JSON.stringify(findings), oldFindings);
    // Missing pre-evaluation capture blocks both judgments; absent linked memory independently blocks fidelity.
    const absentOrigin = structuredClone(copy); absentOrigin.id = id('alignment_missing'); absentOrigin.stages[0]!.predictions = []; store.saveExperiment(absentOrigin);
    assert.ok(predictionAlignmentCriteria(absentOrigin).every(item => item.blockedReason?.includes('pre-evaluation')));
    evaluationRunId = absentOrigin.id; startSimulationAssessment(app, absentOrigin.id); const blocked = await settled(app, absentOrigin.id, true);
    assert.match(blocked.assessments!.at(-1)!.error!, /missing required prerequisite/);
    const absentMemory = structuredClone(copy); absentMemory.stages.forEach(stage => { stage.memories = []; });
    assert.match(predictionAlignmentCriteria(absentMemory)[1]!.blockedReason!, /linked subjective memory/);
    mode = 'inconclusive'; startSimulationAssessment(app, absentOrigin.id); assert.equal((await settled(app, absentOrigin.id, true)).assessments!.at(-1)!.status, 'completed');
    assert.equal(calls, 6); assert.deepEqual(snapshot(app, original.agentId), before); assert.deepEqual(snapshot(app, source.id), sourceBefore);
    assert.equal(JSON.stringify(listSimulationRuns(app).find(item => item.id === original.id)), originalBytes);
    const catalog = await api(app, 'GET', '/api/simulation-tests') as { runs: (SimulationRun & { assessmentAvailable: boolean })[] };
    assert.equal(catalog.runs.find(item => item.id === copy.id)!.assessmentAvailable, true);
  } finally { await app.close(); store.close(); }
});
