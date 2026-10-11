import { startSimulationAssessment } from '../../packages/sdk/src/simulation-evaluator.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { affectSimulations } from '../../packages/sdk/src/affect-simulations.js';
import { startSimulationTest, listSimulationRuns, measureSimulation, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { snapshot } from '../../packages/sdk/src/api.js';
import { simulationRubric } from '../../packages/sdk/src/simulation-rubrics.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';

async function finished(app: Application, id: string): Promise<SimulationRun> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const run = listSimulationRuns(app).find(item => item.id === id)!;
    if (run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Specific affect simulation did not reach a terminal state');
}

test('sourced affect scenarios run unchanged ordinary pipeline, preserve isolated evidence and report mock abstention honestly', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Preserved source');
  try {
    const before = snapshot(app, source.id); assert.equal(affectSimulations.length, 8);
    for (const definition of affectSimulations) {
      assert.ok(definition.source.includes('6acaa14a')); assert.ok(definition.steps.some(step => step.phase === 'control'));
      assert.ok(definition.steps.some(step => step.phase === 'probe')); assert.ok(definition.limitations.includes('never prescribed'));
      const run = await finished(app, startSimulationTest(app, definition.id, 'fixture', source.id).id);
      assert.equal(run.status, 'completed', run.error ?? ''); assert.equal(run.evidenceBasis, 'fixture');
      assert.notEqual(run.agentId, source.id); assert.equal(run.stages.length, definition.steps.length);
      assert.equal(run.measures[0]!.outcome, 'inconclusive', 'Mocks do not manufacture affect offers to validate the hypothesis');
      assert.ok(run.measures.slice(1).every(measure => measure.outcome === 'inconclusive' && measure.assessmentKind === 'semantic'));
      assert.ok(run.stages.every(stage => Array.isArray(stage.affectChoices) && Array.isArray(stage.affectInputs) && Array.isArray(stage.affectTrace)));
      for (const stage of run.stages.filter(stage => stage.cycleId)) {
        const events = store.eventsByType(run.agentId, ['self.affect_choice', 'part.focused_bid_revision'], [stage.cycleId!]);
        assert.equal(stage.affectChoices!.length, events.filter(event => event.type === 'self.affect_choice').length);
        assert.equal(stage.focusedRevisions!.length, events.filter(event => event.type === 'part.focused_bid_revision').length);
      }
      const rubric = simulationRubric(definition); assert.ok(rubric.criteria.every(criterion => criterion.guidance.includes('causality')));
      assert.ok(run.prompts.some(prompt => prompt.task === 'affect_selection'));
      assert.equal(store.executiveProfile(run.agentId).enabled, false);
    }
    assert.deepEqual(snapshot(app, source.id), before);
    assert.equal(new Set(listSimulationRuns(app).map(run => run.agentId)).size, affectSimulations.length);
  } finally { store.close(); }
});

test('missing affect forecasts remain inconclusive and configured infrastructure failure is separate', async () => {
  const store = new SqliteStore(':memory:');
  class Unavailable extends MockReasoning { override async constructed(): Promise<never> { throw new Error('Explicit affect simulation provider failure'); } }
  const app = new Application(store, { reasoning: new Unavailable(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent(); const definition = affectSimulations.find(item => item.id === 'affect-disconfirmation')!;
    const run = await finished(app, startSimulationTest(app, definition.id, 'configured', source.id).id);
    assert.equal(run.status, 'failed'); assert.match(run.error!, /Explicit affect simulation provider failure/);
    assert.equal(run.evidenceBasis, 'fixture'); assert.equal(run.measures.length, 0);
    assert.ok(run.finishedAt); assert.equal(run.stages.length, 0);
    assert.equal(measureSimulation(definition, [])[0]!.outcome, 'inconclusive');
  } finally { store.close(); }
});

test('research evaluator cannot manufacture a decisive affect verdict without a committed period', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent();
    const run = await finished(app, startSimulationTest(app, 'affect-meaningful-retention', 'fixture', source.id).id);
    app.simulationEvaluatorProvider = () => ({ label: 'test/explicit-invalid-affect-evaluator',
      author: async schema => schema.parse({ measures: [2, 3].map(index => ({ criterionId: `criterion-${index}`, outcome: 'observed',
        evidenceReferences: ['/stages/0/thoughts'], explanation: 'Explicit invalid transport fixture verdict', counterevidence: 'No focus exists', limitations: 'No psychological validation' })) }) });
    startSimulationAssessment(app, run.id);
    const deadline = Date.now() + 10000;
    let assessment = listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!;
    while (assessment.status === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
      assessment = listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!;
    }
    assert.equal(assessment.status, 'failed'); assert.match(assessment.error!, /missing required prerequisite/);
    assert.ok(assessment.rubric.criteria.every(criterion => criterion.blockedReason?.includes('No committed selected affect period')));
    assert.equal(assessment.measures.length, 0); assert.equal(listSimulationRuns(app).find(item => item.id === run.id)!.status, 'completed');
  } finally { store.close(); }
});
