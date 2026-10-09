import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { compileExecutionContract } from '../../packages/core/src/execution-contract.js';
import { RemainderAuthoritySchema } from '../../packages/core/src/remainder-authority.js';
import { prepareRemainderInstruction } from '../../packages/core/src/remainder-instruction.js';
import { recordRemainderReady, verifyRemainderHandoff } from '../../packages/core/src/remainder-handoff.js';
import { consumeSelectedRemainder } from '../../packages/core/src/remainder-consumption.js';
import type { ActionBid } from '../../packages/core/src/domain.js';

test('prescribed remainder claim and ready handoff preserve lineage, reject replay and survive reload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'remainder-claim-'));
  const database = join(root, 'agent.sqlite');
  const store = new SqliteStore(database);
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const origin = store.startCycle(agent.id, 'origin');
    const step = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
    const initial: ActionBid = { id: 'initial', partId: 'part', action: { kind: 'operate', text: 'Fixture goal', operation: {
      successCriteria: 'Fixture check returns 42', constraints: ['Preserve original'], steps: [step, step],
      verification: { ...step, path: ['value'], expectedJson: '42' } } }, argument: 'Prescribed fixture', identityFit: [], executionOrder: [] };
    store.saveCycle({ ...origin, status: 'completed', selectedBidIds: ['initial'] });
    const parent = compileExecutionContract({ agentId: agent.id, cycleId: origin.id, threadId: 'origin', bids: [initial], predictions: [] });
    store.appendEvent(agent.id, origin.id, 'execution.contract', parent);
    store.saveExecution({ id: 'execution', agentId: agent.id, cycleId: origin.id, action: initial.action, contractId: parent.id, status: 'running', facts: [],
      operational: { attempts: 0, verified: false, reason: 'Prescribed suspended worker', traceRefs: [] } });
    store.appendEvent(agent.id, origin.id, 'execution.tool_trace', { contractId: parent.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'submitted', arguments: { value: 42 } });
    store.appendEvent(agent.id, origin.id, 'execution.tool_trace', { contractId: parent.id, traceId: 'trace', serverId: 'local', toolName: 'echo', phase: 'finished', outcome: { status: 'succeeded' } });
    store.appendEvent(agent.id, origin.id, 'execution.checkpoint_boundary', { contractId: parent.id, executionId: 'execution', completedSteps: 1, traceRefs: ['trace'] });
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath, args: [], envSecretRefs: {}, timeoutMs: 1000 }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
    const review = store.startCycle(agent.id, 'origin');
    const correction: ActionBid = { ...structuredClone(initial), id: 'correction' };
    assert.ok(correction.action.kind === 'operate');
    correction.action.operation.steps = [step];
    correction.action.operation.remainderCorrection = { executionId: 'execution', checkpointTraceId: 'trace' };
    store.saveCycle({ ...review, selectedBidIds: ['correction'] });
    store.appendEvent(agent.id, review.id, 'part.bid_created', correction);
    const worker = { owns: () => true, atCheckpoint: () => true };
    const prepared = prepareRemainderInstruction(store, { agentId: agent.id, threadId: 'origin', cycleId: review.id,
      bid: correction, executionId: 'execution', checkpointTraceId: 'trace' }, worker);
    const authority = RemainderAuthoritySchema.parse({ parentExecutionId: prepared.parentExecutionId, parentContractId: prepared.parentContractId,
      checkpointTraceId: prepared.checkpointTraceId, completedSteps: prepared.completedSteps, completedTraceRefs: prepared.completedTraceRefs,
      deadlineAt: prepared.deadlineAt, limits: prepared.limits });
    const contract = compileExecutionContract({ agentId: agent.id, cycleId: review.id, threadId: 'origin', bids: [correction], predictions: [], remainder: authority });
    assert.equal(contract.remainderRejection, undefined);
    store.appendEvent(agent.id, review.id, 'execution.contract', contract);
    await assert.rejects(app.executiveConnections.executionGateway(contract), /ready successor/);
    assert.throws(() => store.saveExecution({ id: 'fabricated', agentId: agent.id, cycleId: review.id, action: correction.action, contractId: contract.id, status: 'completed', facts: [], operational: { attempts: 0, verified: true, reason: 'Forged', traceRefs: [] } }), /ready successor/);
    const input = { contract, bid: correction };
    const originalGateway = await app.executiveConnections.executionGateway(parent);
    assert.throws(() => consumeSelectedRemainder(store, app.inspection, input, { ...worker, atCheckpoint: () => false }), /live suspended/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 0);
    store.saveMcpPermissions(agent.id, { revision: 2, tools: [] }, 1);
    assert.throws(() => consumeSelectedRemainder(store, app.inspection, input, worker), /current permission/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 0);
    store.saveMcpPermissions(agent.id, { revision: 3, tools: [{ serverId: 'local', toolName: 'echo' }] }, 2);
    const forged = compileExecutionContract({ agentId: agent.id, cycleId: review.id, threadId: 'origin', bids: [correction], predictions: [],
      remainder: { ...authority, parentContractId: 'unrelated' } });
    store.appendEvent(agent.id, review.id, 'execution.contract', forged);
    assert.throws(() => consumeSelectedRemainder(store, app.inspection, { contract: forged, bid: correction }, worker), /changed since preparation/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 0);
    assert.throws(() => app.inspection.atomic(() => { consumeSelectedRemainder(store, app.inspection, input, worker); throw new Error('Outer rollback'); }), /Outer rollback/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 0);
    consumeSelectedRemainder(store, app.inspection, input, worker);
    const claim = store.eventsByType(agent.id, ['execution.remainder_claim']);
    assert.equal(claim.length, 1); assert.ok(claim[0]!.type === 'execution.remainder_claim');
    assert.deepEqual(claim[0]!.payload.authority, authority);
    assert.throws(() => consumeSelectedRemainder(store, app.inspection, input, worker), /already consumed/);
    const blockedOriginal = await originalGateway.call(step, { value: 42 });
    assert.equal(blockedOriginal.status, 'blocked', 'A previously issued original gateway loses authority after consumption');
    await assert.rejects(app.executiveConnections.executionGateway(parent), /Self-selected/);
    await assert.rejects(app.executiveConnections.executionGateway(contract), /ready successor/);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 2, 'Claiming cannot dispatch a new tool');
    assert.equal(store.executions(agent.id)[0]!.status, 'running', 'Claiming alone cannot fabricate cessation or completion');
    assert.throws(() => recordRemainderReady(store, app.inspection, contract, () => true), /worker has not stopped/);
    assert.throws(() => recordRemainderReady(store, app.inspection, contract, () => false), /preserved stopped parent/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 0);
    const beforeStop = store.executions(agent.id)[0]!;
    assert.throws(() => app.inspection.atomic(() => {
      store.saveExecution({ ...beforeStop, status: 'blocked', operational: { attempts: 2, verified: false, reason: 'Unaccounted fixture effect', traceRefs: ['trace', 'extra'] } });
      recordRemainderReady(store, app.inspection, contract, () => false);
    }), /preserved stopped parent/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 0);
    store.saveExecution({ ...beforeStop, status: 'blocked', operational: { attempts: 1, verified: false, reason: 'Prescribed worker stopped at its exact settled prefix', traceRefs: ['trace'] } });
    const priorProfile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...priorProfile, revision: 1, limits: { ...priorProfile.limits, maxSteps: 1 } }, 0);
    assert.throws(() => recordRemainderReady(store, app.inspection, contract, () => false), /current framework limits/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 0);
    store.saveExecutiveProfile(agent.id, { ...priorProfile, revision: 2 }, 1);
    recordRemainderReady(store, app.inspection, contract, () => false);
    verifyRemainderHandoff(store, contract);
    const continued = store.executions(agent.id)[0]!;
    assert.equal(continued.status, 'continued'); assert.equal(continued.continuedByContractId, contract.id);
    assert.deepEqual(continued.action, initial.action); assert.deepEqual(continued.operational?.traceRefs, ['trace']);
    assert.equal(continued.operational?.verified, false);
    assert.throws(() => recordRemainderReady(store, app.inspection, contract, () => false), /already recorded/);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 1);
    assert.ok(await app.executiveConnections.executionGateway(contract));
    assert.throws(() => store.saveExecution({ id: 'unverified-fabrication', agentId: agent.id, cycleId: review.id, action: correction.action, contractId: contract.id, status: 'completed', facts: [], operational: { attempts: 0, verified: true, reason: 'Forged completion after readiness', traceRefs: [] } }), /independent final verification/);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 2, 'Readiness does not dispatch a successor');
    const reopened = new SqliteStore(database);
    const fresh = new Application(reopened, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    try {
      assert.deepEqual(reopened.eventsByType(agent.id, ['execution.remainder_claim']), claim);
      verifyRemainderHandoff(reopened, contract);
      assert.equal(reopened.eventsByType(agent.id, ['execution.remainder_ready']).length, 1);
      assert.equal(fresh.executiveWorkers.owns(agent.id, 'execution'), false, 'Loading a claimed execution cannot recreate a worker');
      assert.throws(() => consumeSelectedRemainder(reopened, fresh.inspection, input, fresh.executiveWorkers), /already consumed/);
      assert.equal(reopened.eventsByType(agent.id, ['execution.tool_trace']).length, 2);
    } finally { await fresh.close(); reopened.close(); }

  } finally { await app.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
