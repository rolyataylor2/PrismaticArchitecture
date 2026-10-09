import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { Operation } from '../../packages/core/src/operation.js';
import type { Execution, SelfContext } from '../../packages/core/src/domain.js';
import { id } from '../../packages/core/src/domain.js';
import { factualWorld } from '../../packages/core/src/experienced.js';
import { currentExecutionRequests } from '../../packages/core/src/guidance-continuation.js';

const goal = 'Return and independently check the fixture value';
const constraint = 'Use only the selected fixture value';
const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
const empty = (): Operation => ({ successCriteria: 'The separate check returns 42', constraints: [constraint], steps: [], verification: null });
const steps = (): Operation => ({ ...empty(), steps: [echo], verification: { ...echo, path: ['value'], expectedJson: '42' } });
function fixture(path = ':memory:') {
  const draft = { text: goal, operation: empty() };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.proposal = { action: { kind: 'operate', text: draft.text, operation: structuredClone(draft.operation) },
        argument: 'Deliberately prescribed selected instruction for plumbing; not model teaching evidence', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false); const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  const providers = { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() };
  const store = new SqliteStore(path); const app = new Application(store, providers); const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
  return { store, app, agent, draft, providers };
}
async function settled(app: Application, execution: Execution): Promise<Execution> {
  if (execution.status === 'running') await app.executiveWorkers.wait(execution.agentId, execution.id);
  return app.store.executions(execution.agentId).find(item => item.id === execution.id)!;
}

test('ordinary Self-selected supplemental instructions resume native/background work with real MCP, preserved parent lineage and no replay', async () => {
  for (const executionMode of ['synchronous', 'background'] as const) {
    const { store, app, agent, draft } = fixture();
    try {
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), revision: 1, executionMode }, 0);
      const first = await app.message(agent.id, 'Consider the fixture goal.', 'user', 'origin');
      const parent = await settled(app, first.execution!); assert.equal(parent.status, 'needs_guidance');
      const originalWorld = structuredClone(store.world(first.cycle.worldId));
      const originalContract = store.eventsByType(agent.id, ['execution.contract'], [first.cycle.id])[0]!;
      assert.throws(() => app.reportExecution({ ...parent, status: 'continued', continuedByContractId: 'invented_contract' }), /recorded Self-selected/);
      draft.operation = { ...steps(), guidanceResponse: { requestId: parent.guidance!.id, newInformation: 'I now supply the exact echo strategy and separate check.' } };
      const next = await app.message(agent.id, 'Use the supplied fixture instruction.', 'user', 'origin');
      const requestContext = store.world(next.cycle.worldId).externalExecutionRequests!;
      assert.equal(requestContext.length, 1);
      assert.equal(requestContext[0]!.selectedGoal, parent.action.text);
      assert.deepEqual(requestContext[0]!.selectedConstraints, [constraint]);
      assert.equal(factualWorld(store.world(next.cycle.worldId)).externalExecutionRequests, undefined);
      const successor = await settled(app, next.execution!); assert.equal(successor.status, 'completed'); assert.equal(successor.operational?.verified, true);
      const closed = store.executions(agent.id).find(item => item.id === parent.id)!;
      assert.equal(closed.status, 'continued'); assert.equal(closed.continuedByContractId, successor.contractId);
      assert.deepEqual(closed.action, parent.action); assert.deepEqual(closed.guidance, parent.guidance);
      assert.deepEqual(store.world(first.cycle.worldId), originalWorld);
      assert.deepEqual(store.eventsByType(agent.id, ['execution.contract'], [first.cycle.id])[0], originalContract);
      const accepted = store.eventsByType(agent.id, ['execution.guidance_instruction']); assert.equal(accepted.length, 1);
      if (accepted[0]!.type === 'execution.guidance_instruction') {
        assert.equal(accepted[0]!.payload.continuation.parentExecutionId, parent.id);
        assert.equal(accepted[0]!.payload.continuation.requestsUsed, 1);
        assert.equal(accepted[0]!.payload.continuation.maxRequests, 2);
      }
      const skill = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: successor.contractId!, name: 'Exact resumed fixture',
        conditions: ['The same exact fixture inputs and criterion'], scope: 'thread' });
      assert.equal(skill.procedure.guidanceResponse, undefined, 'One-time consumption is not reusable procedural authority');
      assert.equal(app.executiveSkills.validate(agent.id, skill.id, 1, successor.id).validations[0]!.result, 'passed');
      const replay = await app.message(agent.id, 'Deliberate attempted replay fixture.', 'user', 'origin');
      assert.equal(store.world(replay.cycle.worldId).externalExecutionRequests, undefined, 'Closed request contexts do not accumulate');
      assert.equal(replay.execution!.status, 'blocked'); assert.equal(replay.execution!.operational!.attempts, 0);
      assert.ok(replay.execution!.operational!.reason.includes('not open'));
      assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).filter(item => item.type === 'execution.tool_trace' && item.payload.phase === 'submitted').length, 2);
    } finally { await app.close(); store.close(); }
  }
});

test('foreign, changed-goal and constraint-removing guidance responses have zero tool authority and leave the request open', async () => {
  const { store, app, agent, draft } = fixture();
  try {
    const first = await app.message(agent.id, 'Consider the fixture.', 'user', 'origin'); const parent = first.execution!;
    draft.operation = { ...steps(), guidanceResponse: { requestId: parent.guidance!.id, newInformation: 'Explicit fixture response.' } };
    const otherAgent = app.createAgent();
    const responses = [
      await app.message(otherAgent.id, 'Foreign Agent response fixture.', 'user', 'origin'),
      await app.message(agent.id, 'Foreign thread response fixture.', 'user', 'other'),
    ];
    assert.equal(store.world(responses[0]!.cycle.worldId).externalExecutionRequests, undefined);
    assert.equal(store.world(responses[1]!.cycle.worldId).externalExecutionRequests, undefined);
    assert.deepEqual(currentExecutionRequests(store, agent.id, 'origin', 0), []);
    assert.equal(currentExecutionRequests(store, agent.id, 'origin', 1).length, 1);
    draft.text = 'A changed goal'; responses.push(await app.message(agent.id, 'Changed goal fixture.', 'user', 'origin'));
    draft.text = goal; draft.operation.constraints = []; responses.push(await app.message(agent.id, 'Removed constraint fixture.', 'user', 'origin'));
    for (const result of responses) {
      assert.equal(result.execution!.status, 'blocked'); assert.equal(result.execution!.operational!.attempts, 0);
      const event = store.eventsByType(result.cycle.agentId, ['execution.contract'], [result.cycle.id])[0]!;
      assert.equal(event.type, 'execution.contract');
      if (event.type === 'execution.contract') {
        assert.ok(event.payload.guidanceRejection); assert.deepEqual(event.payload.authority.tools, []);
        await assert.rejects(app.executiveConnections.executionGateway(event.payload), /Rejected guidance/);
        assert.throws(() => app.executiveSkills.proposeSkill(result.cycle.agentId, { sourceContractId: event.payload.id,
          name: 'Rejected teaching fixture', conditions: ['Unsupported source instruction'], scope: 'agent' }), /rejected guidance instruction/);
      }
    }
    assert.equal(store.executions(agent.id).find(item => item.id === parent.id)!.status, 'needs_guidance');
    assert.equal(store.eventsByType(agent.id, ['execution.guidance_instruction']).length, 0);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
  } finally { await app.close(); store.close(); }
});

test('guidance usage survives restart and profile increases; identical assertions cannot consume a request or trigger unbounded escalation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'guidance-chain-')); const path = join(directory, 'state.sqlite');
  const first = fixture(path); let store = first.store; let app = first.app;
  try {
    const root = (await app.message(first.agent.id, 'Consider the unresolved fixture.', 'user', 'origin')).execution!;
    first.draft.operation = { ...empty(), guidanceResponse: { requestId: root.guidance!.id, newInformation: 'First explicitly stated instruction.' } };
    const second = (await app.message(first.agent.id, 'An incomplete instruction fixture.', 'user', 'origin')).execution!;
    assert.equal(second.status, 'needs_guidance');
    first.draft.operation.guidanceResponse!.requestId = second.guidance!.id;
    const repeated = await app.message(first.agent.id, 'Repeat the identical instruction fixture.', 'user', 'origin');
    assert.equal(repeated.execution!.status, 'blocked'); assert.ok(repeated.execution!.operational!.reason.includes('new recorded'));
    assert.equal(store.executions(first.agent.id).find(item => item.id === second.id)!.status, 'needs_guidance');
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store, first.providers);
    store.saveExecutiveProfile(first.agent.id, { ...store.executiveProfile(first.agent.id), revision: 1,
      limits: { ...store.executiveProfile(first.agent.id).limits, maxGuidanceRequests: 20 } }, 0);
    first.draft.operation.guidanceResponse!.newInformation = 'Second explicitly stated instruction after restart.';
    const exhausted = await app.message(first.agent.id, 'Continue within the original chain budget.', 'user', 'origin');
    assert.equal(exhausted.execution!.status, 'blocked'); assert.equal(exhausted.execution!.guidance, undefined);
    assert.ok(exhausted.execution!.operational!.reason.includes('budget is exhausted'));
    const event = store.eventsByType(first.agent.id, ['execution.contract'], [exhausted.cycle.id])[0]!;
    if (event.type === 'execution.contract') {
      assert.equal(event.payload.limits.maxGuidanceRequests, 0); assert.equal(event.payload.continuation?.maxRequests, 2);
      assert.equal(event.payload.continuation?.requestsUsed, 2);
    }
    assert.equal(store.eventsByType(first.agent.id, ['execution.guidance']).length, 2);
    assert.equal(store.eventsByType(first.agent.id, ['execution.guidance_instruction']).length, 2);
    assert.equal(store.eventsByType(first.agent.id, ['execution.tool_trace']).length, 0);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('replacement executors cannot call tools or claim completion for rejected supplemental instructions', async () => {
  const initial = fixture(); const { store, agent, draft, providers } = initial; let app = initial.app;
  let attempted = false;
  try {
    const root = (await app.message(agent.id, 'Consider the incomplete fixture.', 'user', 'origin')).execution!;
    await app.close();
    app = new Application(store, providers, { execute: async input => {
      attempted = true; assert.ok(input.contract?.guidanceRejection);
      await assert.rejects(app.executiveConnections.executionGateway(input.contract), /Rejected guidance/);
      return { id: id('fabricated'), agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action,
        status: 'completed', facts: [], operational: { attempts: 0, verified: true, reason: 'Deliberately false adapter claim', traceRefs: [] } };
    } });
    draft.operation = { ...steps(), guidanceResponse: { requestId: root.guidance!.id, newInformation: 'Cross-thread adapter bypass fixture.' } };
    await assert.rejects(app.message(agent.id, 'Invalid cross-thread instruction.', 'user', 'other'), /Rejected guidance contracts/);
    assert.equal(attempted, true);
    assert.equal(store.executions(agent.id).length, 1);
    assert.equal(store.executions(agent.id)[0]!.status, 'needs_guidance');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
  } finally { await app.close(); store.close(); }
});
