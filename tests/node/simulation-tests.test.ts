import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { simulationTests, startSimulationTest, listSimulationRuns, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

async function finished(app: Application, runId: string): Promise<SimulationRun> {
  for (let i = 0; i < 1000; i++) {
    const run = listSimulationRuns(app).find(run => run.id === runId)!;
    if (run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Simulation did not finish');
}

test('every sourced simulation runs ordinary cognition on an isolated Agent and preserves honest fixture outcomes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-simulation-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const source = app.createAgent('Source Agent');
    await app.message(source.id, 'An ordinary source conversation.', 'friend', 'source');
    const baseline = await api(app, 'GET', `/api/agents/${source.id}`);
    const ids: string[] = [];
    for (const definition of simulationTests) {
      assert.ok(definition.hypothesis && definition.source && definition.criteria.length && definition.limitations);
      assert.ok(definition.steps.some(step => step.phase === 'probe'));
      const started = await api(app, 'POST', '/api/simulation-tests', { testId: definition.id, sourceAgentId: source.id, mode: 'fixture' }) as SimulationRun;
      const run = await finished(app, started.id); ids.push(run.id);
      assert.equal(run.status, 'completed', run.error ?? definition.id);
      assert.equal(run.evidenceBasis, 'fixture'); assert.notEqual(run.agentId, source.id);
      assert.equal(run.stages.length, definition.steps.length); assert.equal(run.totalSteps, run.stages.length);
      assert.ok(run.measures.length); assert.ok(run.finishedAt); assert.ok(run.prompts.some(prompt => prompt.task === 'part_cognition'));
      const judgments = store.eventsByType(run.agentId, ['construction.judgment']);
      assert.ok(judgments.length || !definition.seeds.length);
      assert.ok(run.stages.some(stage => stage.memories.length > 0));
      if (definition.executiveSandbox && (!definition.procedureLearning || definition.id.startsWith('executive-remainder-'))) {
        if (definition.id.startsWith('executive-remainder-')) {
          assert.equal(run.measures[0]!.outcome, 'inconclusive', 'Mock abstention does not supply a selected original procedure');
          assert.equal(run.stages.some(stage => stage.remainderClaims?.length), false);
          assert.equal(store.executiveProfile(run.agentId).attention.awaitCheckpointReview, Boolean(definition.executiveSandbox.awaitCheckpointReview));
        } else {
          assert.equal(run.measures[0]!.outcome, 'not_observed');
          assert.equal(run.stages.filter(stage => stage.checkpointNote).length, 3);
        }
        assert.ok(run.executiveEvidence);
        assert.equal(store.mcpRegistry().servers.some(server => server.id === `sim_${run.id}`), false);
        assert.deepEqual(store.mcpPermissions(run.agentId).tools, []);
      }
      if (definition.skillReviewPolicy) {
        assert.equal(store.executiveProfile(run.agentId).skillReviewPolicy, definition.skillReviewPolicy);
        assert.ok(run.stages.every(stage => Array.isArray(stage.procedureReviews) && Array.isArray(stage.procedureSkills)));
        assert.equal(run.measures[0]!.outcome, 'inconclusive', 'Mock abstention does not invent independently validated candidates');
      }
      if (definition.id === 'prediction-contradiction') {
        assert.equal(run.stages[0]!.predictions.length, 0, 'Bundled mock does not invent the prescribed specific prediction');
        assert.equal(run.measures[1]!.outcome, 'inconclusive', 'Missing prediction must not masquerade as successful contradiction');
      }
    }
    assert.deepEqual(await api(app, 'GET', `/api/agents/${source.id}`), baseline, 'Source psychology/configuration stays unchanged');
    assert.equal(new Set(listSimulationRuns(app).map(run => run.agentId)).size, simulationTests.length);
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(listSimulationRuns(new Application(store)).map(run => run.id).sort(), ids.sort());
    assert.ok(listSimulationRuns(new Application(store)).every(run => run.status === 'completed'));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('paired checkpoint apparatus records real operations and review provenance using explicitly prescribed plumbing providers', async () => {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const parsed = PartGenerationSchema.parse(output);
      parsed.cognition.thought = 'Explicitly prescribed plumbing thought; not a learning observation.';
      if (input.world!.selectedActivity) parsed.cognition.proposal = null;
      else {
        const tool = input.world!.externalCapabilities?.tools.find(tool => tool.toolName === 'read_tick');
        const request = input.world!.facts.some(fact => fact.text.startsWith('Please perform a read-only apparatus sequence'));
        if (tool && request) {
          const read = { serverId: tool.serverId, toolName: 'read_tick', argumentsJson: '{}' };
          parsed.cognition.proposal = { action: { kind: 'operate', text: 'Prescribed read-only fixture', operation: {
            successCriteria: 'An independent observation returns tick zero', constraints: ['Read only'], steps: [read,
              { serverId: tool.serverId, toolName: 'hold', argumentsJson: '{"durationMs":2000}' }, read],
            verification: { ...read, path: ['tick'], expectedJson: '0' },
          } }, argument: 'Prescribed fixture strategy', identityFit: [], executionOrder: [] };
        }
      }
      return parsed;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      return input.task === 'disposition_activation' ? input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })) : super.judge(input);
    }
    override async choose(input: SelfContext) {
      const bid = input.contributions.find(contribution => contribution.bid)?.bid;
      return bid ? { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed fixture selection', identityConflict: '' } : super.choose(input);
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent();
    for (const testId of ['executive-attention-monitor-control', 'executive-attention-review']) {
      const run = await finished(app, startSimulationTest(app, testId, 'configured', source.id).id);
      assert.equal(run.status, 'completed', run.error ?? undefined);
      assert.equal(run.evidenceBasis, 'fixture');
      assert.equal(run.measures[0]!.outcome, 'observed');
      const checkpoints = run.stages.filter(stage => stage.attention?.length);
      assert.equal(checkpoints.length, 3);
      assert.ok(checkpoints.every(stage => stage.cycleId && stage.attention!.every(record => record.competence.confidence === null)));
      assert.equal(checkpoints.some(stage => stage.thoughts.length > 0), testId === 'executive-attention-review');
      assert.ok(checkpoints.every(stage => !(stage.interventions?.length)));
      assert.match(run.executiveEvidence!.cleanup, /Researcher cleanup/);
      assert.equal(run.executiveEvidence!.executions.find(execution => execution.action.kind === 'operate')!.status, 'unverified');
      const lineage = analyzeSimulation(store, run).lineage;
      const trail = lineage.bids.find(item => item.contracts.some(entry => entry.contract.commands.some(command => command.action.kind === 'operate')))!;
      assert.ok(trail, 'selected apparatus has an exact bid-to-contract trail');
      assert.ok(trail.decisions.some(item => item.selected));
      assert.ok(trail.expressions.length > 0);
      assert.equal(trail.tools.filter(item => item.phase === 'submitted').length, 2);
      assert.ok(trail.finalExecutions.some(item => item.execution.status === 'unverified'));
      assert.notEqual(trail.status, 'verified operation recorded');
      assert.equal(store.mcpRegistry().servers.length, 0);
      assert.equal(store.eventsByType(run.agentId, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
    }
    assert.equal(store.cycles(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});

test('configured tests copy routing configuration and report live progress and infrastructure failure separately from hypothesis outcomes', async () => {
  const store = new SqliteStore(':memory:');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  class Reasoning extends MockReasoning {
    override async constructed(_input: ConstructedInput): Promise<never> { await gate; throw new Error('Simulated provider outage'); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const source = app.createAgent();
    app.editPrompt(source.id, 'part_cognition', 'agent', 'Source prompt {{ world|json_encode }}');
    app.updateAgentActivationSettings(source.id, { memoryRelevanceThreshold: 0.75 });
    const started = startSimulationTest(app, 'general-attention', 'configured', source.id);
    const running = listSimulationRuns(app)[0]!;
    assert.equal(running.status, 'running'); assert.equal(running.currentStep, 'Unrelated control');
    assert.equal(running.stages.length, 0);
    assert.equal(app.promptSettings(started.agentId).find(prompt => prompt.task === 'part_cognition')!.effective, 'Source prompt {{ world|json_encode }}');
    assert.equal(app.agentActivationSettings(started.agentId).memoryRelevanceThreshold, 0.75);
    release(); const failed = await finished(app, started.id);
    assert.equal(failed.status, 'failed'); assert.match(failed.error!, /Simulated provider outage/);
    assert.deepEqual(failed.measures, [], 'An outage does not reject the hypothesis');
    assert.ok(failed.finishedAt); assert.equal(store.cycles(source.id).length, 0);
    await assert.rejects(api(app, 'POST', '/api/simulation-tests', { testId: 'unknown', sourceAgentId: source.id, mode: 'fixture' }), /Unknown simulation/);
    await assert.rejects(api(app, 'POST', '/api/simulation-tests', { testId: 'general-attention', sourceAgentId: source.id, mode: 'force-success' }));
  } finally { release(); store.close(); }
});
