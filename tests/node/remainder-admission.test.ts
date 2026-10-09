import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { ActionSchema, type ActionBid, type SelfContext } from '../../packages/core/src/domain.js';
import { compileExecutionContract, ExecutionContractSchema } from '../../packages/core/src/execution-contract.js';
import { retainedProcedure } from '../../packages/core/src/operation.js';
import { operationalProposalSchema } from '../../packages/providers/src/operational-proposal-schema.js';

const operation = () => ({ successCriteria: 'Fixture verified', constraints: ['Preserve originals'],
  remainderCorrection: { executionId: 'missing', checkpointTraceId: 'old' },
  steps: [{ serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' }], verification: null });

test('remainder proposal contracts reject standalone authority and strip one-time references from retained methods', () => {
  const bid: ActionBid = { id: 'bid', partId: 'part', action: { kind: 'operate', text: 'Fixture task', operation: operation() }, argument: 'Prescribed fixture', identityFit: [], executionOrder: [] };
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [bid], predictions: [] });
  assert.ok(contract.remainderRejection); assert.deepEqual(contract.authority.tools, []);
  const { remainderRejection: _rejection, ...unaccepted } = contract;
  assert.equal(ExecutionContractSchema.safeParse(unaccepted).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, authority: { ...contract.authority, tools: [{ serverId: 'local', toolName: 'echo' }] } }).success, false);
  assert.equal('remainderCorrection' in retainedProcedure(operation()), false);
  assert.equal(ActionSchema.safeParse({ ...bid.action, operation: { ...operation(), intervention: { executionId: 'missing', directive: 'pause' } } }).success, false);
  assert.equal(ActionSchema.safeParse({ ...bid.action, operation: { ...operation(), guidanceResponse: { requestId: 'request', newInformation: 'Instruction' } } }).success, false);
  assert.equal(operationalProposalSchema().safeParse({ action: bid.action, argument: 'Fixture', identityFit: [], executionOrder: [] }).success, false,
    'Unavailable correction handoff is not advertised as an executable model choice');
});

test('ordinary selected invalid correction is recorded blocked with no submissions or fabricated completion', async () => {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Fixture task', operation: operation() },
        argument: 'Prescribed correction plumbing; not configured-model learning', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false);
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    const result = await app.message(agent.id, 'Inspect the correction fixture.', 'user', 'origin');
    assert.equal(result.cycle.status, 'completed'); assert.equal(result.execution?.status, 'blocked');
    assert.equal(result.execution?.operational?.attempts, 0); assert.deepEqual(result.execution?.operational?.traceRefs, []);
    const recorded = store.eventsByType(agent.id, ['execution.contract'], [result.cycle.id])[0]!;
    assert.ok(recorded.type === 'execution.contract');
    assert.match(recorded.payload.remainderRejection!, /live locally owned/);
    assert.deepEqual(recorded.payload.authority.tools, []);
    assert.equal(recorded.payload.commands[0]!.action.kind === 'operate' && recorded.payload.commands[0]!.action.operation.remainderCorrection?.checkpointTraceId, 'old');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
    await assert.rejects(app.executiveConnections.executionGateway(recorded.payload), /Rejected remainder/);
    assert.throws(() => store.saveExecution({ ...result.execution!, status: 'completed', operational: { attempts: 0, verified: true, reason: 'Forged', traceRefs: [] } }), /cannot report execution or completion/);
    assert.equal(store.executiveSkills(agent.id).length, 0);
  } finally { await app.close(); store.close(); }
});
