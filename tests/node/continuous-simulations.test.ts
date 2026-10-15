import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { snapshot } from '../../packages/sdk/src/api.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('continuous-attention experiments preserve concurrent cycle evidence, explicit time policy and unmodified source Agents', { timeout: 30000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Preserved source');
  try {
    const before = snapshot(app, source.id);
    for (const definition of simulationTests.filter(definition => definition.id.startsWith('continuous-attention-'))) {
      assert.equal(definition.timePolicy, 'wall_clock_observation_offsets');
      assert.ok(definition.source.includes('0165'));
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!; }
      assert.equal(run.status, 'completed', run.error ?? '');
      assert.equal(run.evidenceBasis, 'fixture');
      assert.notEqual(run.agentId, source.id);
      const stage = run.stages.find(stage => stage.concurrentCycleIds?.length)!;
      assert.equal(stage.concurrentCycleIds!.length, 2);
      assert.equal(stage.concurrencyTrace!.filter(event => event.type === 'worldstate.frozen').length, 2);
      assert.ok(stage.concurrencyTrace!.every(event => store.events(run.agentId).some(saved => saved.id === event.eventId)));
      assert.equal(run.measures.at(-1)!.outcome, 'inconclusive');
      assert.equal(run.measures.at(-1)!.assessmentKind, 'semantic');
      assert.equal(run.startingConfiguration!.activationSettings.includeProcessingDispositions, definition.activationSettings!.includeProcessingDispositions);
    }
    assert.deepEqual(snapshot(app, source.id), before);
  } finally { await app.close(); store.close(); }
});

test('sourced continuous-cognition scenarios run ordinary isolated pipelines and leave semantic hypotheses ungraded by fixtures', { timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Preserved comparison source');
  try {
    const before = snapshot(app, source.id);
    const definitions = simulationTests.filter(definition => /^continuous-(stale|commitment|unselected|resource|budget)-/.test(definition.id));
    assert.equal(definitions.length, 9);
    for (const definition of definitions) {
      assert.ok(definition.source.includes('0165')); assert.ok(definition.hypothesis); assert.ok(definition.timePolicy);
      assert.equal(definition.activationSettings!.activationPassLimit, 1);
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!; }
      assert.equal(run.status, 'completed', `${definition.id}: ${run.error ?? ''}`);
      assert.equal(run.stages.length, definition.steps.length); assert.equal(run.evidenceBasis, 'fixture');
      assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive' && measure.assessmentKind === 'semantic'));
      assert.ok(run.stages.every(stage => stage.cycleId && store.cycle(stage.cycleId).threadId === run.id));
      assert.equal(run.startingConfiguration!.activationSettings.maxConcurrentThoughts, definition.activationSettings!.maxConcurrentThoughts);
    }
    assert.deepEqual(snapshot(app, source.id), before);
  } finally { await app.close(); store.close(); }
});

test('one-pass, bounded and unrestricted attention probes preserve actual deadlines, drain and source cycles', { timeout: 30000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent();
  try {
    for (const definition of simulationTests.filter(definition => definition.id.startsWith('continuous-recursion-'))) {
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!; }
      assert.equal(run.status, 'completed', run.error ?? '');
      const stage = run.stages[0]!; const window = stage.attentionWindow!;
      assert.equal(window.allowanceMs, 300); assert.ok(window.elapsedToPauseMs! >= 290);
      assert.ok(window.startedAt! <= window.pausedAt! && window.pausedAt! <= window.drainedAt);
      assert.equal(window.passLimit, definition.activationSettings!.activationPassLimit);
      assert.ok(window.passesAtPause! >= 1);
      assert.deepEqual(stage.concurrentCycleIds, window.cycleIds);
      assert.ok(window.cycleIds.every(cycleId => store.cycle(cycleId).status === 'completed'));
      assert.equal(app.runtime.streamStatus(run.agentId, run.id)!.status, 'paused');
      assert.ok(stage.concurrencyTrace!.some(event => event.type === 'cognition.stream'));
      assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive'));
    }
  } finally { await app.close(); store.close(); }
});

test('analytics retains lifecycle origins from a secondary observation in one concurrent stage', async () => {
  const { MockDecisions, MockReasoning, MockEmbeddings } = await import('../../packages/providers/src/mock.js');
  const { analyzeSimulation } = await import('../../packages/sdk/src/simulation-analysis.js');
  const definition = { id: 'secondary-source-plumbing', title: 'Secondary source attribution plumbing', source: 'ADR 0165 engineering regression',
    hypothesis: 'Engineering attribution check only', criteria: ['Both recorded origins remain visible'], limitations: 'Deterministic plumbing; no psychological hypothesis validation',
    seeds: ['First scope', 'Second scope'].map(name => ({ name, concern: name, cues: ['observation'], scope: name })),
    steps: [{ name: 'Concurrent source observations', phase: 'probe' as const, text: 'First observation.', concurrentObservations: [{ text: 'Second observation.', afterMs: 25 }] }] };
  simulationTests.push(definition);
  class Decisions extends MockDecisions {
    override async judge(input: Parameters<InstanceType<typeof MockDecisions>['judge']>[0]) {
      if (input.task !== 'disposition_activation') return super.judge(input);
      return input.candidates.map(candidate => ({ partId: candidate.id, score: (candidate.context as { disposition: { name: string } }).disposition.name === (input.world.sequence === 1 ? 'First scope' : 'Second scope') ? 4 : 0 }));
    }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, definition.id, 'configured', source.id, { enabled: false });
    let run = listSimulationRuns(app).find(run => run.id === started.id)!;
    while (run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!; }
    assert.equal(run.status, 'completed', run.error ?? '');
    const stage = run.stages[0]!; const secondary = stage.concurrentCycleIds!.find(cycleId => cycleId !== stage.cycleId)!;
    const part = stage.parts.find(part => part.instance?.createdCycle === secondary)!; assert.ok(part);
    const report = analyzeSimulation(store, run);
    assert.ok(report.stages[0]!.lifecycle.formed.includes(part.id));
    assert.equal(report.parts.find(item => item.part.id === part.id)!.originStage, 0);
    assert.ok(report.stages[0]!.trace.some(event => event.cycleId === secondary && event.type === 'worldstate.frozen'));
  } finally { await app.close(); store.close(); simulationTests.splice(simulationTests.indexOf(definition), 1); }
});
