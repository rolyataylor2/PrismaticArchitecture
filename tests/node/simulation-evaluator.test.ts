import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api, snapshot } from '../../packages/sdk/src/api.js';
import { startSimulationTest, listSimulationRuns, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { startSimulationAssessment } from '../../packages/sdk/src/simulation-evaluator.js';
import { SimulationEvaluationSchema } from '../../packages/providers/src/simulation-evaluation.js';
import { simulationRubric } from '../../packages/sdk/src/simulation-rubrics.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { z } from 'zod';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { evaluationPacket, packetIncludesReference } from '../../packages/sdk/src/evaluation-packet.js';
import { dreamState } from '../../packages/sdk/src/dream-state.js';

async function done(app: Application, id: string, assessment = false): Promise<SimulationRun> {
  for (let i = 0; i < 1000; i++) {
    const run = listSimulationRuns(app).find(run => run.id === id)!;
    if (assessment ? run.assessments?.at(-1)?.status !== 'running' : run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Run timed out');
}
const verdict = (criterionId: string, outcome = 'observed', evidenceReferences = ['/stages/0/thoughts']) => ({ criterionId, outcome,
  evidenceReferences, explanation: 'Recorded evidence supports the criterion.', counterevidence: 'In-thread carryover remains an alternative.', limitations: 'Fixture transport test only.' });

class EvaluatorApp extends Application {
  calls = 0;
  output: unknown = { measures: [1, 2, 3].map(index => verdict(`criterion-${index}`)) };
  override simulationEvaluatorProvider(_agentId: string, _model?: string) {
    return { label: 'test/evaluator-model', author: async <T>(schema: z.ZodType<T>, prompt: string): Promise<T> => {
      this.calls++; assert.ok(prompt.includes('Frozen evidence')); return schema.parse(this.output);
    } };
  }
}

test('saved semantic runs get separate cited versioned assessments, preserve psychology and evidence, and expose rubric/prompt preview', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    assert.equal(app.calls, 0, 'Fixture execution never calls a paid evaluator');
    const original = structuredClone(run); const before = snapshot(app, run.agentId); const sourceBefore = snapshot(app, source.id);
    const started = await api(app, 'POST', `/api/simulation-tests/${run.id}/assess`, { model: 'gpt-4.1-mini' }) as SimulationRun;
    assert.equal(started.assessments![0]!.status, 'running');
    const assessed = await done(app, run.id, true); const review = assessed.assessments![0]!;
    assert.equal(review.status, 'completed', review.error ?? ''); assert.equal(review.model, 'test/evaluator-model');
    assert.equal(review.evidenceBasis, 'fixture'); assert.equal(review.measures.length, 3);
    assert.ok(review.evidenceHash); assert.ok(review.rubric.criteria[0]!.guidance.includes('quoted Hello'));
    assert.deepEqual(assessed.stages, original.stages); assert.deepEqual(assessed.measures, original.measures);
    assert.deepEqual(snapshot(app, run.agentId), before); assert.deepEqual(snapshot(app, source.id), sourceBefore);
    const template = app.promptSettings(source.id).find(prompt => prompt.task === 'simulation_evaluation')!.effective;
    assert.match(previewPrompt(store, source.id, 'simulation_evaluation', template).note, /Recorded researcher/);
    const catalog = await api(app, 'GET', '/api/simulation-tests') as { tests: { rubric: unknown }[] };
    assert.ok(catalog.tests.every(definition => definition.rubric));
    startSimulationAssessment(app, run.id); const second = await done(app, run.id, true);
    assert.equal(second.assessments!.length, 2); assert.deepEqual(second.assessments![0], review);
    assert.equal(second.assessments![1]!.version, 2);
  } finally { store.close(); }
});

test('invalid evaluator output and provider failure stay separate from completed execution and operational measures', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    for (const output of [
      { measures: [verdict('criterion-1')] },
      { measures: [verdict('criterion-1'), verdict('criterion-1'), verdict('criterion-3')] },
      { measures: [verdict('criterion-1', 'observed', ['/stages/500/thoughts']), verdict('criterion-2'), verdict('criterion-3')] },
      { measures: [verdict('criterion-1', 'not_observed', []), verdict('criterion-2'), verdict('criterion-3')] },
    ]) {
      app.output = output; startSimulationAssessment(app, run.id); const assessed = await done(app, run.id, true);
      assert.equal(assessed.status, 'completed'); assert.equal(assessed.assessments!.at(-1)!.status, 'failed');
      assert.deepEqual(assessed.measures, run.measures); assert.deepEqual(assessed.stages, run.stages);
    }
    const unavailable = new Application(store);
    unavailable.simulationEvaluatorProvider = () => { throw new Error('Evaluator unavailable'); };
    startSimulationAssessment(unavailable, run.id); const failed = await done(unavailable, run.id, true);
    assert.match(failed.assessments!.at(-1)!.error!, /Evaluator unavailable/); assert.equal(failed.status, 'completed');
    await assert.rejects(api(app, 'POST', `/api/simulation-tests/${run.id}/assess`, { model: 'unknown' }));
    assert.throws(() => startSimulationAssessment(app, 'missing'), /Unknown simulation/);
    const operational = await done(app, startSimulationTest(app, 'general-attention', 'fixture', source.id).id);
    assert.throws(() => startSimulationAssessment(app, operational.id), /no semantic criteria/);
  } finally { store.close(); }
});

test('legacy reports can be assessed without replacing frozen criteria or prerequisite verdicts', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = structuredClone(await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id));
    for (const measure of run.measures) delete measure.assessmentKind;
    run.measures[1]!.evidence = 'No specific red-token expectation to contradict';
    run.measures[1]!.assessmentKind = 'prerequisite';
    store.saveExperiment(run);
    app.output = { measures: [verdict('criterion-1'), verdict('criterion-3', 'inconclusive', [])] };
    startSimulationAssessment(app, run.id); const assessed = await done(app, run.id, true);
    assert.equal(assessed.assessments![0]!.status, 'completed');
    assert.deepEqual(assessed.assessments![0]!.rubric.criteria.map(criterion => criterion.criterionId), ['criterion-1', 'criterion-3']);
    assert.equal(simulationRubric(run.specification).criteria.length, 3);
    assert.deepEqual(assessed.measures, run.measures);
  } finally { store.close(); }
});

test('evaluator schema is strict and requires alternatives and limitations', () => {
  assert.equal(SimulationEvaluationSchema.safeParse({ measures: [{ ...verdict('criterion-1'), unexpected: true }] }).success, false);
});

test('compact packets deduplicate exact versions, exclude unused inherited biography and reject unsupplied citations', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = structuredClone(await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id));
    const before = dreamState(store, run.agentId);
    const unused = { ...run.stages[0]!.memories[0]!, id: 'unused-biography', createdCycle: 'before-dream', content: 'Unused inherited history '.repeat(40000) };
    before.memories.push(unused);
    run.dream = { hostPid: process.pid, keepChanges: false, sourceBefore: before, before, after: before, identifierMap: {} };
    for (const stage of run.stages) stage.memories.push(unused);
    store.saveExperiment(run);
    const packet = evaluationPacket(run, { dream: run.dream, testId: run.testId, evidenceBasis: run.evidenceBasis, providers: run.providers, stages: run.stages, supplementalEvidence: [] });
    assert.ok(JSON.stringify(packet).length < 750000);
    assert.ok(!JSON.stringify(packet).includes('Unused inherited history'));
    assert.ok(packet.objects.some(object => object.sourceReferences.length > 1), 'Repeated identical versions are retained once with every source path');
    assert.equal(new Set(packet.objects.map(object => `${object.kind}:${object.hash}`)).size, packet.objects.length);
    const omittedReference = `/stages/0/memories/${run.stages[0]!.memories.length - 1}`;
    assert.equal(packetIncludesReference(packet, omittedReference), false);
    app.output = { measures: [verdict('criterion-1', 'observed', [omittedReference]), verdict('criterion-2'), verdict('criterion-3')] };
    startSimulationAssessment(app, run.id); const rejected = await done(app, run.id, true);
    assert.match(rejected.assessments!.at(-1)!.error!, /invalid evidence reference/);
    app.output = { measures: [1, 2, 3].map(index => verdict(`criterion-${index}`)) };
    startSimulationAssessment(app, run.id); const accepted = await done(app, run.id, true);
    assert.equal(accepted.assessments!.at(-1)!.status, 'completed');
    assert.ok(accepted.assessments!.at(-1)!.packetHash);
    assert.deepEqual(accepted.stages, run.stages);
  } finally { store.close(); }
});

test('oversized criterion packets remain explicitly inconclusive without sending or truncating them', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = structuredClone(await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id));
    run.stages[0]!.thoughts[0]!.thought = 'Recorded product '.repeat(60000);
    store.saveExperiment(run); startSimulationAssessment(app, run.id);
    const assessed = await done(app, run.id, true); const assessment = assessed.assessments!.at(-1)!;
    assert.equal(assessment.status, 'completed', assessment.error ?? '');
    assert.equal(app.calls, 0);
    assert.equal(assessment.batches!.length, 3);
    assert.ok(assessment.batches!.every(batch => batch.status === 'blocked'));
    assert.ok(assessment.measures.every(measure => measure.outcome === 'inconclusive' && /request bound/.test(measure.explanation)));
    assert.equal(assessment.evidence.stages[0]!.thoughts[0]!.thought, run.stages[0]!.thoughts[0]!.thought);
  } finally { store.close(); }
});

test('assessment reserves one running version and rejects concurrent reevaluation', async () => {
  const store = new SqliteStore(':memory:');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = await done(app, startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id);
    app.simulationEvaluatorProvider = () => ({ label: 'test/paused', author: async <T>(schema: z.ZodType<T>) => {
      await gate; return schema.parse(app.output);
    } });
    startSimulationAssessment(app, run.id);
    assert.throws(() => startSimulationAssessment(app, run.id), /already running/);
    release(); assert.equal((await done(app, run.id, true)).assessments!.at(-1)!.status, 'completed');
  } finally { release(); store.close(); }
});


test('configured real-labelled reasoning automatically assesses semantic criteria and can disable assessment', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const reasoning = new MockReasoning();
    // Transport plumbing only; recorded provenance remains mixed and is never presented as model validation.
    Object.defineProperty(reasoning, 'label', { value: 'test/transport-stub' });
    const app = new EvaluatorApp(store, { reasoning, decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const source = app.createAgent();
    const run = await done(app, startSimulationTest(app, 'conversation-starters', 'configured', source.id, { model: 'gpt-4.1-mini' }).id);
    const assessed = await done(app, run.id, true);
    assert.equal(assessed.assessments!.at(-1)!.status, 'completed'); assert.equal(app.calls, 1);
    assert.equal(assessed.evidenceBasis, 'mixed');
    const disabled = await done(app, startSimulationTest(app, 'conversation-starters', 'configured', source.id, { enabled: false }).id);
    assert.deepEqual(disabled.assessments, []); assert.equal(app.calls, 1);
  } finally { store.close(); }
});


test('a model cannot turn a missing prediction prerequisite into an observed semantic learning verdict', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new EvaluatorApp(store); const source = app.createAgent();
    const run = await done(app, startSimulationTest(app, 'prediction-contradiction', 'fixture', source.id).id);
    assert.equal(run.measures[1]!.outcome, 'inconclusive');
    app.output = { measures: [verdict('criterion-3')] };
    startSimulationAssessment(app, run.id); const invalid = await done(app, run.id, true);
    assert.equal(invalid.assessments!.at(-1)!.status, 'failed');
    assert.match(invalid.assessments!.at(-1)!.error!, /missing required prerequisite/);
    app.output = { measures: [verdict('criterion-3', 'inconclusive', ['/stages/0/predictions'])] };
    startSimulationAssessment(app, run.id); const valid = await done(app, run.id, true);
    assert.equal(valid.assessments!.at(-1)!.status, 'completed');
    assert.deepEqual(valid.measures, run.measures);
  } finally { store.close(); }
});
