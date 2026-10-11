import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationLineage } from '../../packages/sdk/src/simulation-lineage.js';
import { MemorySchema, PredictionSchema } from '../../packages/core/src/domain.js';
import type { ActionBid } from '../../packages/core/src/domain.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';

test('explicit lineage never joins identical prose, unrelated IDs or selection without captured authority', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const id = startSimulationTest(app, 'conversation-starters', 'fixture', source.id).id;
    for (let attempt = 0; attempt < 1000 && listSimulationRuns(app).find(item => item.id === id)!.status === 'running'; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    const run = listSimulationRuns(app).find(item => item.id === id)!; assert.equal(run.status, 'completed');
    const cycle = run.stages[0]!.cycleId!; const part = run.stages[0]!.parts[0]!;
    const bid: ActionBid = { id: 'explicit-bid-fixture', partId: part.id, action: { kind: 'say', text: 'Same authored plumbing text' }, argument: 'Explicit fixture', identityFit: [], executionOrder: [] };
    const other = { ...bid, id: 'unrelated-bid-fixture' };
    const add = <K extends keyof import('../../packages/core/src/contracts.js').EventPayloads>(type: K, payload: import('../../packages/core/src/contracts.js').EventPayloads[K]) => store.appendEvent(run.agentId, cycle, type, payload);
    const before = JSON.stringify(run); const sourceBefore = JSON.stringify(store.events(source.id));
    add('part.bid_created', bid); add('part.bid_created', other);
    add('self.arbitration_started', { identity: run.startingConfiguration!.identity, contributions: [{ partId: part.id, name: part.name, thought: 'Explicit expressed thought', interpretation: 'Explicit subjective meaning', evidenceSummary: [], prediction: null, bid }], deliberation: [] });
    add('self.choice', { choice: bid.id, explanation: 'Explicit plumbing selection', identityConflict: '', scores: [{ partId: bid.id, score: 3, selectedBefore: [] }] });
    const unrelated = compileExecutionContract({ agentId: run.agentId, cycleId: cycle, threadId: run.id, bids: [other], predictions: [], profile: store.executiveProfile(run.agentId) });
    add('execution.contract', unrelated);
    add('execution.status', { id: 'unrelated-execution-fixture', agentId: run.agentId, cycleId: cycle, contractId: unrelated.id, action: other.action, status: 'completed', facts: [] });
    const events = store.events(run.agentId); let report = simulationLineage(run, events);
    const selected = report.bids.find(item => item.bid.id === bid.id)!;
    assert.equal(selected.contracts.length, 0); assert.equal(selected.executions.length, 0);
    assert.equal(selected.status, 'choice recorded; no captured contract'); assert.equal(selected.decisions.length, 1);
    assert.ok(selected.gaps.some(gap => gap.includes('contract authority')));
    const different = report.bids.find(item => item.bid.id === other.id)!;
    assert.equal(different.decisions.length, 0); assert.equal(different.contracts.length, 1); assert.equal(different.finalExecutions.length, 1);
    const contract = compileExecutionContract({ agentId: run.agentId, cycleId: cycle, threadId: run.id, bids: [bid], predictions: [], profile: store.executiveProfile(run.agentId) });
    add('execution.contract', contract);
    add('execution.tool_trace', { traceId: 'explicit-trace', contractId: contract.id, serverId: 'explicit-fixture', toolName: 'read', phase: 'submitted' });
    add('execution.tool_trace', { traceId: 'explicit-trace', contractId: contract.id, serverId: 'explicit-fixture', toolName: 'read', phase: 'finished', outcome: { status: 'succeeded' } });
    add('execution.status', { id: 'explicit-execution', agentId: run.agentId, cycleId: cycle, contractId: contract.id, action: bid.action, status: 'completed', facts: [], operational: { attempts: 1, verified: false, reason: 'Returned tool is not whole-goal verification', traceRefs: ['explicit-trace'] } });
    report = simulationLineage(run, store.events(run.agentId)); const enacted = report.bids.find(item => item.bid.id === bid.id)!;
    assert.equal(enacted.tools.length, 2); assert.equal(enacted.finalExecutions.length, 1);
    assert.equal(enacted.status, 'completed execution recorded');
    assert.equal(enacted.tools[0]!.traceId, enacted.tools[1]!.traceId);
    assert.equal(JSON.stringify(run), before); assert.equal(JSON.stringify(store.events(source.id)), sourceBefore);
    assert.ok(report.limitations.some(item => item.includes('not psychological causation')));
    const thought = store.events(run.agentId).find(event => event.type === 'part.thought' && event.payload.partId === part.id)!;
    assert.ok(thought);
    const prediction = PredictionSchema.parse({ id: 'explicit-prediction', agentId: run.agentId, version: 2, schemaVersion: 1,
      partId: part.id, createdCycle: cycle, expectation: 'Explicit lineage plumbing expectation', confidence: 0.9,
      capsule: { interpretation: 'Explicit subjective context', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'Later fixture evidence', evaluateAfterCycle: null, status: 'resolved', evaluation: null, memoryId: 'explicit-memory',
      cognitionOrigin: { thoughtEventId: thought.id, partVersion: part.version, dispositions: [] } });
    const memory = MemorySchema.parse({ id: 'explicit-memory', agentId: run.agentId, version: 1, schemaVersion: 1, partId: part.id,
      createdCycle: cycle, content: 'Explicit subjective remembered interpretation', gist: 'Explicit fixture', context: [], ancestorIds: [], predictionId: prediction.id });
    const cloned = structuredClone(run); cloned.stages[0]!.predictions.push(prediction); cloned.stages[0]!.memories.push(memory);
    const memoryEvent = add('memory.episodic_created', memory);
    const check = add('prediction.outcome_checked', { partId: part.id, predictionId: prediction.id, outcome: 'incomplete', provider: 'Explicit fixture' });
    add('prediction.outcome_checked', { partId: part.id, predictionId: 'unrelated-prediction', outcome: 'correct', provider: 'Explicit fixture' });
    const predictionTrail = simulationLineage(cloned, store.events(run.agentId)).predictions.find(item => item.prediction.id === prediction.id)!;
    assert.equal(predictionTrail.origin!.id, thought.id); assert.equal(predictionTrail.checks.length, 1); assert.equal(predictionTrail.checks[0]!.id, check.id);
    assert.deepEqual(predictionTrail.memory, memory); assert.equal(predictionTrail.memoryEvents[0]!.id, memoryEvent.id);
    assert.equal(JSON.stringify(run), before);

  } finally { await app.close(); store.close(); }
});
