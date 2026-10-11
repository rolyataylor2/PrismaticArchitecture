import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { simulationCitation } from '../../packages/sdk/src/simulation-research.js';
import { observeProvider, researchStageContext } from '../../packages/sdk/src/provider-observation.js';

test('ordinary stage boundaries and world-blind calls retain explicit audit attribution across restart without provider-context leakage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-stage-')); const path = join(directory, 'research.sqlite');
  let store = new SqliteStore(path); let app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'observatory-learning-trained', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed', run.error ?? ''); const analysis = analyzeSimulation(store, run);
    assert.equal(analysis.stageAttempts.length, run.stages.length); assert.ok(analysis.stageAttempts.every(item => item.end?.type === 'simulation.stage_completed'));
    assert.ok(run.stages.some(stage => !stage.cycleId));
    for (const [index, stage] of analysis.stages.entries()) {
      assert.ok(stage.trace.some(event => event.type === 'simulation.stage_started'));
      assert.ok(stage.trace.some(event => event.type === 'simulation.stage_completed'));
      for (const operation of analysis.providerOperations.filter(item => item.researchScope?.stageIndex === index)) {
        assert.equal(operation.researchScope!.stageId, run.stages[index]!.id);
        assert.equal(operation.researchScope!.runId, run.id); assert.ok(stage.trace.some(event => event.id === operation.eventId));
        assert.ok(!JSON.stringify(operation.input.arguments).includes(operation.researchScope!.stageId));
        assert.ok(!JSON.stringify(operation.input.arguments).includes(operation.researchScope!.startEventId));
      }
    }
    const offlineIndex = run.stages.findIndex(stage => !stage.cycleId);
    const offline = analysis.stages[offlineIndex]!.trace.filter(event => event.type.startsWith('consolidation.') || event.type === 'construction.inference_started');
    assert.ok(offline.some(event => event.type === 'consolidation.started'));
    assert.ok(offline.some(event => event.type === 'consolidation.completed'));
    for (const event of offline) { assert.equal(event.cycleId, null); assert.equal(event.researchScope!.stageId, run.stages[offlineIndex]!.id); assert.equal(simulationCitation(store, run, `/events/${event.id}`).attribution, 'recorded_stage'); }
    const blind = analysis.providerOperations.find(item => item.method === 'choose' && item.cycleId === null)!; assert.ok(blind);
    assert.equal(blind.input.worldId, null); assert.equal(simulationCitation(store, run, `/events/${blind.eventId}`).attribution, 'recorded_stage');
    const events = JSON.stringify(store.events(run.agentId)); analyzeSimulation(store, run); assert.equal(JSON.stringify(store.events(run.agentId)), events);
    assert.equal(store.events(source.id).length, 0);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(analyzeSimulation(store, listSimulationRuns(app).find(item => item.id === run.id)!), analysis);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('concurrent audit scopes and late descendants preserve invoking identity while unrelated and foreign-agent calls remain unscoped', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const other = app.createAgent();
    const provider = observeProvider(store, { label: 'Scope transport fixture', async request(input: { agentId: string; delay: number }) {
      assert.deepEqual(Object.keys(input).sort(), ['agentId', 'delay']); await new Promise(resolve => setTimeout(resolve, input.delay)); return input.delay;
    } }, 'reasoning');
    const scope = (stage: number) => ({ agentId: agent.id, runId: 'authored-scope-run', stageId: `authored-stage-${stage}`, stageIndex: stage, startEventId: `authored-start-${stage}` });
    await Promise.all([researchStageContext.run(scope(0), () => provider.request({ agentId: agent.id, delay: 10 })), researchStageContext.run(scope(1), () => provider.request({ agentId: agent.id, delay: 0 }))]);
    let descendant!: Promise<number>; researchStageContext.run(scope(2), () => { descendant = new Promise(resolve => setTimeout(() => resolve(provider.request({ agentId: agent.id, delay: 2 })), 10)); }); await descendant;
    await provider.request({ agentId: agent.id, delay: 3 }); await researchStageContext.run(scope(4), () => provider.request({ agentId: other.id, delay: 4 }));
    const operations = store.events(agent.id).flatMap(event => event.type === 'provider.operation' && event.payload.phase === 'returned' ? [event.payload] : []);
    assert.equal(operations.find(item => item.output!.value === 10)!.researchScope!.stageIndex, 0);
    assert.equal(operations.find(item => item.output!.value === 0)!.researchScope!.stageIndex, 1);
    assert.equal(operations.find(item => item.output!.value === 2)!.researchScope!.stageIndex, 2);
    assert.equal(operations.find(item => item.output!.value === 3)!.researchScope, undefined);
    assert.ok(store.events(other.id).every(event => event.type !== 'provider.operation' || event.payload.researchScope === undefined));
  } finally { await app.close(); store.close(); }
});

test('an explicitly failed scenario stage retains its start/failure identity without inventing a completed snapshot', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent();
    app.message = async () => { throw new Error('Authored scenario delivery failure'); };
    const started = startSimulationTest(app, 'conversation-starters', 'configured', source.id, { enabled: false });
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'failed'); assert.equal(run.stages.length, 0);
    const attempts = analyzeSimulation(store, run).stageAttempts; assert.equal(attempts.length, 1); assert.equal(attempts[0]!.end!.type, 'simulation.stage_failed');
    assert.equal(simulationCitation(store, run, `/events/${attempts[0]!.startEventId}`).attribution, 'recorded_stage');
    assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
