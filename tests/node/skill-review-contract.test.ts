import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SelectedSkillReview } from '../../packages/sdk/src/selected-skill-review.js';
import { verifyProcedureReviewReport } from '../../packages/core/src/selected-skill-review.js';
import { publicSkills } from '../../packages/core/src/skill-invocation.js';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { type ActionBid, type SelfContext } from '../../packages/core/src/domain.js';
import { OperationSchema, retainedProcedure } from '../../packages/core/src/operation.js';
import { compileExecutionContract, ExecutionContractSchema } from '../../packages/core/src/execution-contract.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { operationalProposalSchema } from '../../packages/providers/src/operational-proposal-schema.js';

const operation = () => ({ successCriteria: 'Review decision recorded', constraints: [], steps: [], verification: null,
  skillReview: { skillId: 'candidate', version: 1, decision: 'approval' as const, reason: 'Prescribed review reason' } });

test('opt-in ordinary Part and world-blind Self review records an exact approval then permits a fresh verified invocation', async () => {
  let selectedOperation: ReturnType<typeof OperationSchema.parse> = {
    successCriteria: 'A separate check returns 42', constraints: ['Keep exact arguments'],
    steps: [{ serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' }],
    verification: { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}', path: ['value'], expectedJson: '42' },
  };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input); if (input.task !== 'part_cognition') return result;
      const generated = PartGenerationSchema.parse(result);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Prescribed review and reuse fixture', operation: selectedOperation },
        argument: 'Deterministic plumbing fixture; not evidence of model learning', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(input: SelfContext) {
      assert.equal('world' in input, false);
      const bid = input.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed fixture selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    enableExecutive(app, agent.id);
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
    const source = await app.message(agent.id, 'Run the authored method.', 'user', 'origin');
    assert.equal(source.execution!.status, 'completed');
    let candidate = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: source.execution!.contractId!,
      name: 'Review fixture method', conditions: ['Exact authored fixture'], scope: 'thread' });
    candidate = app.executiveSkills.validate(agent.id, candidate.id, candidate.version, source.execution!.id, false);
    assert.equal(candidate.status, 'proposed');
    assert.deepEqual(publicSkills(store, agent.id, source.cycle.threadId!, 10)[0]!.reviewDecisions, []);
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: 2, skillReviewPolicy: 'self_selected' }, 1);
    const manifest = publicSkills(store, agent.id, source.cycle.threadId!, 10)[0]!;
    assert.deepEqual(manifest.reviewDecisions, ['rejection', 'approval']);
    const wire = operationalProposalSchema({ ...store.world(source.cycle.worldId), externalSkills: [manifest] });
    const wireProposal = { action: { kind: 'operate', text: 'Review current candidate', operation: {
      ...operation(), skillReview: { ...operation().skillReview, skillId: candidate.id, version: candidate.version },
    } }, argument: 'Explicit schema fixture', identityFit: [], executionOrder: [] };
    assert.equal(wire.safeParse(wireProposal).success, true);
    assert.equal(wire.safeParse({ ...wireProposal, action: { ...wireProposal.action, operation: {
      ...wireProposal.action.operation, skillReview: { ...wireProposal.action.operation.skillReview, version: candidate.version + 1 },
    } } }).success, false);
    const tracesBefore = store.eventsByType(agent.id, ['execution.tool_trace']).length;
    selectedOperation = { ...operation(), skillReview: { ...operation().skillReview, skillId: candidate.id, version: candidate.version } };
    const reviewed = await app.message(agent.id, 'Consider the validated candidate.', 'user', 'origin');
    assert.equal(reviewed.execution!.status, 'completed');
    assert.equal(reviewed.execution!.operational!.attempts, 0); assert.equal(reviewed.execution!.operational!.verified, true);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, tracesBefore);
    const approved = store.executiveSkills(agent.id)[0]!;
    assert.equal(approved.status, 'active'); assert.equal(approved.version, candidate.version + 1);
    assert.equal(approved.change.reviewContractId, reviewed.execution!.contractId);
    assert.deepEqual(approved.procedure, candidate.procedure); assert.deepEqual(approved.validations, candidate.validations);
    const receipts = store.eventsByType(agent.id, ['execution.procedure_review']); assert.equal(receipts.length, 1);
    const contractEvent = store.eventsByType(agent.id, ['execution.contract'], [reviewed.cycle.id])[0]!;
    assert.ok(contractEvent.type === 'execution.contract');
    const bidEvent = store.eventsByType(agent.id, ['part.bid_created'], [reviewed.cycle.id]).find(event =>
      event.type === 'part.bid_created' && event.payload.id === contractEvent.payload.commands[0]!.bidId)!;
    assert.ok(bidEvent.type === 'part.bid_created');
    const replay = await new SelectedSkillReview(store, app.agentSkillPackages).execute({ agentId: agent.id,
      cycleId: reviewed.cycle.id, contract: contractEvent.payload, bid: bidEvent.payload as ActionBid });
    assert.equal(replay.status, 'blocked'); assert.equal(store.eventsByType(agent.id, ['execution.procedure_review']).length, 1);
    await app.agentSkillPackages.flush(agent.id);
    const pack = await app.agentSkillPackages.resolveMethod(agent.id, approved.id, approved.version);
    assert.equal(pack.method.change.reviewContractId, reviewed.execution!.contractId);
    selectedOperation = { successCriteria: approved.procedure.successCriteria, constraints: approved.procedure.constraints,
      steps: [], verification: null, skillInvocation: { skillId: approved.id, version: approved.version } };
    const reused = await app.message(agent.id, 'Use the approved exact method.', 'user', 'origin');
    assert.equal(reused.execution!.status, 'completed'); assert.equal(reused.execution!.operational!.attempts, 2);
    assert.notEqual(reused.execution!.contractId, reviewed.execution!.contractId);
    verifyProcedureReviewReport(store, reviewed.execution!); // Historical receipt remains verifiable after later application.
    let second = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: source.execution!.contractId!,
      name: 'Second candidate', conditions: ['Exact fixture only'], scope: 'thread' });
    second = app.executiveSkills.validate(agent.id, second.id, second.version, source.execution!.id, false);
    selectedOperation = { ...operation(), skillReview: { ...operation().skillReview, skillId: second.id, version: second.version - 1 } };
    const stale = await app.message(agent.id, 'Review a stale reference.', 'user', 'origin');
    assert.equal(stale.execution!.status, 'blocked'); assert.match(stale.execution!.operational!.reason, /exact current/);
    store.saveMcpPermissions(agent.id, { revision: 2, tools: [] }, 1);
    selectedOperation = { ...operation(), skillReview: { ...operation().skillReview, skillId: second.id, version: second.version } };
    const revoked = await app.message(agent.id, 'Review after permissions changed.', 'user', 'origin');
    assert.equal(revoked.execution!.status, 'blocked'); assert.match(revoked.execution!.operational!.reason, /grants/);
    assert.equal(store.executiveSkills(agent.id).find(skill => skill.id === second.id)!.status, 'proposed');
    selectedOperation = { ...operation(), skillReview: { skillId: second.id, version: second.version, decision: 'rejection', reason: 'Current permission gap makes this unsuitable' } };
    const rejected = await app.message(agent.id, 'Consider rejecting the candidate.', 'user', 'origin');
    assert.equal(rejected.execution!.status, 'completed');
    assert.equal(store.executiveSkills(agent.id).find(skill => skill.id === second.id)!.status, 'rejected');
    assert.equal(store.eventsByType(agent.id, ['execution.procedure_review']).length, 2);
    const inspection = (await import('../../packages/sdk/src/skill-inspection.js')).inspectExecutiveSkill(store, agent.id, approved.id);
    const reviewEpisode = inspection.episodes.find(episode => episode.contractId === reviewed.execution!.contractId)!;
    assert.equal(reviewEpisode.relationship, 'selected_review'); assert.ok(reviewEpisode.bids.some(bid => bid.selected));
    assert.ok(reviewEpisode.thoughts.length); assert.ok(reviewEpisode.decisions.length);
    assert.throws(() => store.saveExecution({ ...stale.execution!, status: 'completed', operational: { ...stale.execution!.operational!, verified: true } }), /durable selected decision/);
  } finally { await app.close(); store.close(); }
});

test('procedure review contracts are exclusive, carry no tools and cannot be retained as reusable instructions', () => {
  const bid: ActionBid = { id: 'bid', partId: 'part', action: { kind: 'operate', text: 'Review a procedure', operation: operation() },
    argument: 'Prescribed review', identityFit: [], executionOrder: [] };
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [bid], predictions: [] });
  assert.deepEqual(contract.authority.capabilities, ['procedure_review']); assert.deepEqual(contract.authority.tools, []);
  assert.equal(contract.successCriteria, 'selected_procedure_reviewed');
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, authority: { ...contract.authority, capabilities: ['tools'] } }).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, authority: { ...contract.authority, tools: [{ serverId: 'local', toolName: 'echo' }] } }).success, false);
  assert.equal(OperationSchema.safeParse({ ...operation(), steps: [{ serverId: 'local', toolName: 'echo', argumentsJson: '{}' }] }).success, false);
  assert.equal(OperationSchema.safeParse({ ...operation(), skillInvocation: { skillId: 'other', version: 1 } }).success, false);
  assert.equal(retainedProcedure(operation()).skillReview, undefined);
  const variant = operationalProposalSchema().shape.action.options[1];
  assert.ok('operation' in variant.shape);
  assert.equal('skillReview' in variant.shape.operation.shape, false);
});

test('ordinary prescribed Self selection of unsupported review blocks without tools, approval or fabricated completion', async () => {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const result = await super.constructed(input); if (input.task !== 'part_cognition') return result;
      const generated = PartGenerationSchema.parse(result);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Prescribed procedure review', operation: operation() },
        argument: 'Explicit unsupported-host plumbing fixture', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(input: SelfContext) {
      assert.equal('world' in input, false); const bid = input.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed review selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const profile = defaultExecutiveProfile();
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode: 'background' }, 0);
    const selected = await app.message(agent.id, 'Review the prescribed candidate.', 'user', 'review');
    assert.equal(selected.execution!.status, 'blocked'); assert.equal(selected.execution!.operational!.attempts, 0);
    assert.match(selected.execution!.operational!.reason, /disabled/);
    assert.equal(store.executiveSkills(agent.id).length, 0); assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).length, 0);
    const event = store.eventsByType(agent.id, ['execution.contract'], [selected.cycle.id])[0]!;
    assert.ok(event.type === 'execution.contract');
    await assert.rejects(app.executiveConnections.executionGateway(event.payload), /no MCP gateway/);
    assert.throws(() => store.saveExecution({ ...selected.execution!, status: 'completed', operational: { ...selected.execution!.operational!, verified: true } }), /durable selected decision/);
    assert.equal(app.executiveWorkers.owns(agent.id, selected.execution!.id), false);
  } finally { await app.close(); store.close(); }
});
