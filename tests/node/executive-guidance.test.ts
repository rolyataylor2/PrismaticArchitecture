import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { ExecutionSchema, type SelfContext, type WorldState } from '../../packages/core/src/domain.js';

test('native guidance survives restart and reaches only later ordinary original-thread Parts, without Self access or automatic resume', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-guidance-')); const path = join(directory, 'state.sqlite');
  let missing = true; const inputs: WorldState[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      assert.ok(input.world);
      inputs.push(structuredClone(input.world));
      if (!missing) return result;
      const generated = PartGenerationSchema.parse(result);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'An explicitly incomplete fixture strategy', operation: {
        successCriteria: 'No criterion has been selected', constraints: [], steps: [], verification: null,
      } }, argument: 'Prescribed plumbing fixture; not model-generated teaching', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false);
      assert.equal('executions' in context, false);
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Plumbing fixture choice', identityConflict: '' };
    }
  }
  const providers = { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() };
  let store = new SqliteStore(path); let app = new Application(store, providers);
  try {
    const agent = app.createAgent();
    enableExecutive(app, agent.id);
    const first = await app.message(agent.id, 'Consider the incomplete strategy.', 'user', 'origin');
    const execution = first.execution!; assert.equal(execution.status, 'needs_guidance');
    const guidance = execution.guidance!;
    assert.equal(guidance.contractId, execution.contractId); assert.equal(guidance.executionId, execution.id);
    assert.equal(store.eventsByType(agent.id, ['execution.guidance']).length, 1);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
    const original = structuredClone(store.world(first.cycle.worldId));
    assert.equal(JSON.stringify(original).includes(guidance.id), false);
    assert.equal(JSON.stringify(inputs[0]).includes(guidance.id), false);
    assert.throws(() => app.reportExecution({ ...execution, guidance: { ...guidance, problem: 'Changed request' } }), /change or discard/);
    assert.throws(() => app.reportExecution({ ...execution, status: 'running' }), /paused|cannot resume/);
    const contract = store.eventsByType(agent.id, ['execution.contract'], [first.cycle.id])[0]!;
    assert.equal(contract.type, 'execution.contract');
    if (contract.type === 'execution.contract') await assert.rejects(app.executiveConnections.executionGateway(contract.payload), /Self-selected/);
    assert.equal(ExecutionSchema.safeParse({ ...execution, operational: { ...execution.operational!, attempts: 1 } }).success, false);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    assert.deepEqual(store.executions(agent.id)[0], execution);
    assert.equal(store.eventsByType(agent.id, ['execution.guidance']).length, 1, 'Restart does not emit or replay a request');
    missing = false;
    const other = await app.message(agent.id, 'An unrelated encounter.', 'user', 'other');
    assert.equal(JSON.stringify(store.world(other.cycle.worldId)).includes(guidance.id), false);
    const later = await app.message(agent.id, 'Consider what information is missing.', 'user', 'origin');
    const laterWorld = store.world(later.cycle.worldId);
    assert.ok(laterWorld.facts.some(fact => fact.referenceId === guidance.id && fact.text.includes('Requested instruction:')));
    assert.equal(laterWorld.facts.some(fact => fact.text.includes('structuredContent')), false);
    assert.ok(inputs.some(world => world.cycleId === later.cycle.id && world.facts.some(fact => fact.referenceId === guidance.id)));
    assert.deepEqual(store.world(first.cycle.worldId), original);
    assert.equal(store.executions(agent.id).find(item => item.id === execution.id)!.status, 'needs_guidance');
    assert.equal(store.executiveSkills(agent.id).length, 0, 'A guidance request does not teach a procedure');
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1,
      limits: { ...profile.limits, maxGuidanceRequests: 0 } }, profile.revision);
    missing = true;
    const exhausted = await app.message(agent.id, 'The request budget is disabled.', 'user', 'origin');
    assert.equal(exhausted.execution!.status, 'blocked');
    assert.equal(exhausted.execution!.guidance, undefined);
    const forgedId = 'forged_guidance_execution';
    assert.throws(() => store.saveExecution({ ...exhausted.execution!, id: forgedId, status: 'needs_guidance',
      guidance: { ...guidance, id: 'forged_request', executionId: forgedId, contractId: exhausted.execution!.contractId! } }), /handoff budget/);
    assert.throws(() => store.saveExecution({ ...execution, id: forgedId,
      guidance: { ...guidance, id: 'duplicate_request', executionId: forgedId } }), /duplicate/);
    // Adversarial audit fixture: a recorded submission must defeat a false zero-attempt report.
    store.appendEvent(agent.id, first.cycle.id, 'execution.tool_trace', { contractId: execution.contractId!,
      traceId: 'submission_fixture', serverId: 'fixture', toolName: 'fixture', phase: 'submitted' });
    assert.throws(() => store.saveExecution(execution), /conceal recorded tool submissions/);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
