import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import { scoreSelf } from '../../packages/core/src/self-scoring.js';
import { selfChoices } from '../../packages/core/src/context.js';
import { inspectExecutiveSkill } from '../../packages/sdk/src/skill-inspection.js';

async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Expected review fixture event did not arrive'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
async function fixture(mode: 'thoughts' | 'continue' | 'pause' | 'invalid_continue', awaitCheckpointReview = false, activationScore = 4) {
  const store = new SqliteStore(':memory:'); const inputs: ConstructedInput[] = []; const selves: SelfContext[] = [];
  const judgments: JudgmentInput[] = []; let forcedTarget: string | undefined;
  let assessmentGate: { entered: () => void; done: Promise<void> } | undefined;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      inputs.push(input); const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
      const parsed = PartGenerationSchema.parse(output); const activity = input.world!.selectedActivity;
      parsed.cognition.thought = activity ? 'Prescribed concern can be noticed without assuming it should interrupt.' : 'Prescribed initial transport strategy.';
      parsed.cognition.interpretation = 'Prescribed interpretation for plumbing only'; parsed.cognition.evidenceSummary = ['Prescribed expressed context'];
      if (activity && mode === 'thoughts') parsed.cognition.proposal = null;
      else if (activity || forcedTarget) parsed.cognition.proposal = { action: { kind: 'operate', text: 'Pause the selected activity', operation: {
        successCriteria: 'Local work has stopped', constraints: [], steps: [], verification: null,
        intervention: { executionId: forcedTarget ?? activity!.executionId, directive: 'pause' },
      } }, argument: 'Prescribed corrective bid, not a model-generated learning observation', identityFit: [], executionOrder: [] };
      else {
        const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
        parsed.cognition.proposal = { action: { kind: 'operate', text: 'Run the bounded transport fixture', operation: {
          successCriteria: 'Separate read returns 42', constraints: ['Preserve original inputs'], steps: [echo,
            { serverId: 'local', toolName: 'hold', argumentsJson: '{"durationMs":2000}' }, echo],
          verification: { ...echo, path: ['value'], expectedJson: '42' },
        } }, argument: 'Prescribed execution strategy', identityFit: [], executionOrder: [] };
      }
      return parsed;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      judgments.push(input);
      if (input.task === 'disposition_activation' && assessmentGate) {
        const gate = assessmentGate; assessmentGate = undefined; gate.entered(); await gate.done;
      }
      return input.task === 'disposition_activation' ? input.candidates.map(candidate => ({ partId: candidate.id, score: activationScore })) : super.judge(input);
    }
    override async choose(input: SelfContext) {
      selves.push(input); assert.equal('world' in input, false); assert.equal('competence' in input, false);
      assert.equal(JSON.stringify(input).includes('unexpressed-world-sentinel'), false);
      const bid = input.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
      if (input.ongoingActivity) {
        assert.deepEqual(Object.keys(input.ongoingActivity).sort(), ['constraints', 'executionId', 'goal', 'successCriteria']);
        if (mode === 'continue' || mode === 'invalid_continue') return { choice: 'CONTINUE_EXECUTION',
          selectedBidIds: mode === 'continue' ? [] : [bid.id], explanation: 'Prescribed continuation', identityConflict: '' };
        await until(() => store.eventsByType(input.identity.agentId, ['execution.tool_trace']).some(event =>
          event.type === 'execution.tool_trace' && event.payload.phase === 'submitted' && event.payload.toolName === 'hold'));
      }
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed selection', identityConflict: '' };
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent();
  await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Fixture concern', concern: 'Notice fixture results', cues: ['transport fixture'],
    scope: 'fixture', threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false });
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 5000 }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }, { serverId: 'local', toolName: 'hold' }] }, 0);
  const profile = defaultExecutiveProfile();
  store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode: 'background', limits: { ...profile.limits, maxSteps: 4 },
    attention: { ...profile.attention, enabled: true, reviewInterested: true, awaitCheckpointReview } }, 0);
  return { app, store, agent, inputs, judgments, selves, forceTarget: (id: string) => { forcedTarget = id; },
    holdAssessment: () => {
      let entered!: () => void; let release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const done = new Promise<void>(resolve => { release = resolve; });
      assessmentGate = { entered, done }; return { started, release };
    } };
}

test('explicit consultation reports activity ending during assessment without stale ongoing review', async () => {
  const { app, store, agent, holdAssessment } = await fixture('continue', false, 0);
  let release: (() => void) | undefined;
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: profile.revision + 1,
      attention: { ...profile.attention, enabled: false } }, profile.revision);
    const first = await app.message(agent.id, 'Start the prescribed external procedure.', 'user', 'origin');
    const held = holdAssessment(); release = held.release;
    const pending = app.consultExecution(agent.id, first.execution!.id,
      [{ source: 'External executor', kind: 'observes', text: 'Requested while running', timestamp: null, referenceId: null }], 'Check before continuing');
    await held.started;
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    assert.equal(store.executions(agent.id)[0]!.status, 'completed');
    held.release();
    const result = await pending;
    assert.equal(result?.consultation, 'activity_ended');
    assert.equal(result?.cycle.status, 'completed');
    assert.equal(result?.cycle.kind, 'attention_monitor');
    assert.equal(store.eventsByType(agent.id, ['execution.review_started']).length, 0);
    assert.equal(store.executions(agent.id).length, 1, 'No stale review dispatches another execution');
    const skill = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: first.execution!.contractId!, name: 'Ended consultation source', conditions: ['Exact fixture'], scope: 'thread' });
    const reviews = inspectExecutiveSkill(store, agent.id, skill.id).episodes[0]!.reviews!;
    assert.equal(reviews.length, 1);
    assert.deepEqual(reviews[0]!.consultations, [{ reason: 'Check before continuing', outcome: 'activity_ended' }]);
    assert.equal(reviews[0]!.thoughts.length, 0);
    const development = app.agentSkillPackages.build(agent.id, skill.id).files['references/DEVELOPMENT.md']!;
    assert.match(development, /Consultation reason: Check before continuing/);
    assert.match(development, /Consultation outcome: activity ended/);
  } finally { release?.(); await app.close(); store.close(); }
});

test('explicit host consultation uses ordinary cognition with automatic monitoring disabled and low activation', async () => {
  const { app, store, agent, inputs, selves } = await fixture('continue', false, 0);
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: profile.revision + 1,
      attention: { ...profile.attention, enabled: false, reviewInterested: false } }, profile.revision);
    const first = await app.message(agent.id, 'Start the prescribed external procedure.', 'user', 'origin');
    const original = structuredClone(store.world(first.cycle.worldId));
    const reason = 'unexpressed-consultation-sentinel: external method needs another perspective';
    const result = await api(app, 'POST', `/api/agents/${agent.id}/executions/${first.execution!.id}/consult`, {
      reason, facts: [{ source: 'External executor', kind: 'observes', text: 'unexpressed-world-sentinel: check is requested without asserting an outcome', timestamp: null, referenceId: null }],
    }) as Awaited<ReturnType<Application['consultExecution']>>;
    assert.equal(result?.consultation, 'reviewed');
    assert.equal(result?.attention.state, 'background', 'A request never fabricates activation');
    assert.equal(result?.cycle.kind, 'attention_review');
    const requests = store.eventsByType(agent.id, ['execution.consultation_requested']);
    assert.equal(requests.length, 1); assert.ok(requests[0]!.type === 'execution.consultation_requested'); assert.equal(requests[0]!.payload.reason, reason);
    const world = store.world(result!.cycle.worldId);
    assert.ok(world.facts.some(fact => fact.text === reason));
    const parts = inputs.filter(input => input.task === 'part_cognition' && input.world?.cycleId === result!.cycle.id);
    assert.equal(parts.length, 1, 'Ordinary fallback Part handles zero activated dispositions');
    assert.deepEqual(parts[0]!.world, world);
    assert.equal(JSON.stringify(selves.at(-1)).includes('unexpressed-consultation-sentinel'), false);
    assert.equal(store.executions(agent.id).length, 1, 'Continuation creates no additional contract');
    assert.deepEqual(store.world(first.cycle.worldId), original);
    const other = app.createAgent();
    enableExecutive(app, other.id);
    await assert.rejects(app.consultExecution(other.id, first.execution!.id,
      [{ source: 'External executor', kind: 'observes', text: 'Foreign request', timestamp: null, referenceId: null }], 'Request cognition'), /attributed operational/);
    await app.executiveWorkers.wait(agent.id, first.execution!.id);
    // Inspection-only fixture: append an attributed expressed answer, without
    // claiming a model deliberated or that this answer caused the outcome.
    const thought = store.eventsByType(agent.id, ['part.thought'], [result!.cycle.id]).find(event => event.type === 'part.thought');
    assert.ok(thought?.type === 'part.thought');
    const answer = app.inspection.emit(agent.id, result!.cycle.id, 'part.deliberation_response', {
      partId: thought.payload.partId, response: 'Prescribed inspection answer: explain the constraint before changing the method.',
      bid_disposition: 'retain', new_bid: null,
    });
    const skill = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: first.execution!.contractId!, name: 'Explicit consultation source', conditions: ['Exact fixture'], scope: 'thread' });
    const reviews = inspectExecutiveSkill(store, agent.id, skill.id).episodes[0]!.reviews!;
    assert.equal(reviews.length, 1, 'Request and review-start events represent one consultation');
    assert.deepEqual(reviews[0]!.consultations, [{ reason, outcome: 'reviewed' }]);
    assert.equal(reviews[0]!.outcomes[0]!.outcome, 'continued');
    assert.deepEqual(reviews[0]!.thoughts.at(-1), { name: thought.payload.partSnapshot.name, partId: thought.payload.partId,
      kind: 'answer', at: answer.at, text: 'Prescribed inspection answer: explain the constraint before changing the method.', interpretation: null });
    const development = app.agentSkillPackages.build(agent.id, skill.id).files['references/DEVELOPMENT.md']!;
    assert.ok(development.includes(`Consultation reason: ${reason}`));
    assert.ok(development.includes('(deliberation answer): Prescribed inspection answer: explain the constraint before changing the method.'));
    assert.ok(development.includes(`Expressed at: ${answer.at}`));
    await assert.rejects(app.consultExecution(agent.id, first.execution!.id,
      [{ source: 'External executor', kind: 'observes', text: 'Ended request', timestamp: null, referenceId: null }], 'Request cognition'), /currently running/);
    assert.equal(store.eventsByType(agent.id, ['execution.consultation_requested']).length, 1);
  } finally { await app.close(); store.close(); }
});

for (const mode of ['thoughts', 'continue'] as const) test(`interested checkpoint ${mode} uses ordinary cognition and leaves execution uninterrupted`, async () => {
  const { app, store, agent, inputs, judgments, selves } = await fixture(mode, true);
  try {
    const first = await app.message(agent.id, 'Run transport fixture. unexpressed-world-sentinel', 'user', 'origin');
    const before = structuredClone(store.world(first.cycle.worldId));
    await until(() => store.eventsByType(agent.id, ['execution.review_completed']).length > 0);
    const event = store.eventsByType(agent.id, ['execution.review_completed'])[0]!; assert.ok(event.type === 'execution.review_completed');
    assert.equal(event.payload.outcome, mode === 'thoughts' ? 'thoughts_only' : 'continued');
    assert.equal(store.cycle(event.cycleId!).kind, 'attention_review');
    assert.equal(store.executions(agent.id).length, 1, 'No new external contract from thought-only or continuation');
    assert.equal(store.executions(agent.id)[0]!.status, 'running');
    const review = inputs.filter(input => input.world?.cycleId === event.cycleId && input.task === 'part_cognition'); assert.equal(review.length, 1);
    assert.ok(review[0]!.world!.selectedActivity); assert.equal(review[0]!.world!.selectedActivity!.executionId, first.execution!.id);
    assert.ok(review[0]!.world!.facts.some(fact => fact.text.includes('recorded successful call prefix contains 1 calls: 1. local / echo')));
    assert.equal(judgments.filter(input => input.world.cycleId === event.cycleId && input.task === 'disposition_activation').length, 1);
    assert.deepEqual(review[0]!.world, store.world(store.cycle(event.cycleId!).worldId));
    if (mode === 'thoughts') assert.equal(selves.length, 1, 'No mandatory Self deliberation when no bid exists');
    else {
      assert.equal(selves.filter(context => context.ongoingActivity).length, 1, 'Continuation is eligible in round zero');
      assert.equal(selves.at(-1)!.completedDeliberationRounds, 0);
      assert.ok(selfChoices(selves.at(-1)!).includes('CONTINUE_EXECUTION'));
    }
    await app.executiveWorkers.wait(agent.id, first.execution!.id); await app.waitForInference(agent.id);
    assert.equal(store.executions(agent.id)[0]!.status, 'completed');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 4);
    assert.equal(store.eventsByType(agent.id, ['execution.intervention']).length, 0);
    assert.equal(store.eventsByType(agent.id, ['execution.checkpoint_boundary']).length, 3);
    assert.deepEqual(store.world(first.cycle.worldId), before);
    const skill = app.executiveSkills.proposeSkill(agent.id, { sourceContractId: first.execution!.contractId!, name: 'Reviewed fixture procedure', conditions: ['Exact fixture'], scope: 'thread' });
    const inspection = inspectExecutiveSkill(store, agent.id, skill.id);
    const reviews = inspection.episodes[0]!.reviews!;
    assert.ok(reviews.some(review => review.cycleId === event.cycleId && review.thoughts.some(thought => thought.text.includes('Prescribed concern'))));
    assert.equal(reviews.some(review => review.decisions.some(decision => decision.choice === 'CONTINUE_EXECUTION')), mode === 'continue');
    assert.ok(reviews.every(review => !JSON.stringify(review).includes('private_memory')));
  } finally { await app.close(); store.close(); }
});

test('Self-selected pause stops a real in-flight worker once and preserves ambiguous parent evidence', async () => {
  const { app, store, agent } = await fixture('pause');
  try {
    const first = await app.message(agent.id, 'Run transport fixture. unexpressed-world-sentinel', 'user', 'origin');
    const before = structuredClone(store.world(first.cycle.worldId));
    await until(() => store.eventsByType(agent.id, ['execution.review_completed']).length > 0); await app.waitForInference(agent.id);
    const parent = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    assert.equal(parent.status, 'unverified'); assert.equal(parent.contractId, first.execution!.contractId);
    const child = store.executions(agent.id).find(item => item.id !== parent.id)!;
    assert.equal(child.status, 'completed'); assert.equal(child.operational?.attempts, 0); assert.equal(child.operational?.verified, true);
    assert.ok(child.operational?.reason.includes('confirms no success of the original goal'));
    const event = store.eventsByType(agent.id, ['execution.contract'], [child.cycleId])[0]!; assert.ok(event.type === 'execution.contract');
    assert.deepEqual(event.payload.authority.capabilities, ['execution_control']); assert.deepEqual(event.payload.authority.tools, []);
    await assert.rejects(app.executiveConnections.executionGateway(event.payload), /no MCP gateway/);
    const beforeReceipts = store.eventsByType(agent.id, ['execution.intervention']); assert.equal(beforeReceipts.length, 2);
    const command = event.payload.commands[0]!;
    const replay = await app.executiveControl.pause({ agentId: agent.id, cycleId: child.cycleId, contract: event.payload,
      bid: { id: command.bidId, partId: command.partId, action: command.action, argument: command.argument, identityFit: [], executionOrder: command.executionOrder } });
    assert.equal(replay.status, 'blocked'); assert.deepEqual(store.eventsByType(agent.id, ['execution.intervention']), beforeReceipts);
    assert.throws(() => store.saveExecution({ ...child, id: 'fabricated-pause-completion' }), /host confirmation/);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
    assert.ok(store.eventsByType(agent.id, ['execution.attention']).some(event => event.type === 'execution.attention' && event.payload.state === 'intervention'));
    assert.deepEqual(store.world(first.cycle.worldId), before);
    assert.throws(() => app.executiveSkills.proposeSkill(agent.id, { name: 'Forbidden pause method', conditions: ['Fixture'], scope: 'agent', sourceContractId: event.payload.id }),
      /Skill source must contain one explicit selected operational strategy/);
  } finally { await app.close(); store.close(); }
});

test('continuation cannot secretly select an external bid', async () => {
  const { app, store, agent } = await fixture('invalid_continue');
  try {
    const first = await app.message(agent.id, 'Run transport fixture. unexpressed-world-sentinel', 'user', 'origin');
    await until(() => store.eventsByType(agent.id, ['infrastructure.error']).some(event => event.type === 'infrastructure.error' && event.payload.message.includes('exclusively retain')));
    assert.equal(store.eventsByType(agent.id, ['execution.intervention']).length, 0);
    await app.executiveWorkers.wait(agent.id, first.execution!.id); await app.waitForInference(agent.id);
    assert.equal(store.executions(agent.id)[0]!.status, 'completed');
  } finally { await app.close(); store.close(); }
});

test('bounded Self continuation is exclusive and available only with mediated selected intention', async () => {
  const { app, store, agent, selves } = await fixture('continue');
  try {
    const first = await app.message(agent.id, 'Run fixture.', 'user', 'origin');
    await until(() => selves.some(context => context.ongoingActivity));
    const context = selves.find(context => context.ongoingActivity)!;
    const choice = await scoreSelf(context, async options => options.map(partId => ({ partId, score: partId === 'CONTINUE_EXECUTION' ? 4 : 3 })));
    assert.equal(choice.choice, 'CONTINUE_EXECUTION'); assert.deepEqual(choice.selectedBidIds, []);
    const unsupported = await scoreSelf(context, async options => options.map(partId => ({ partId, score: partId === 'DELIBERATE' ? 0 : 2 })));
    assert.equal(unsupported.choice, 'CONTINUE_EXECUTION'); assert.deepEqual(unsupported.selectedBidIds, []);
    const { ongoingActivity: _activity, ...withoutActivity } = context;
    assert.equal(selfChoices(withoutActivity).includes('CONTINUE_EXECUTION'), false);
    await app.executiveWorkers.wait(agent.id, first.execution!.id); await app.waitForInference(agent.id);
  } finally { await app.close(); store.close(); }
});

test('selected control rejects other threads and Agents without stopping the live source', async () => {
  const { app, store, agent, forceTarget } = await fixture('continue');
  try {
    const first = await app.message(agent.id, 'Run fixture.', 'user', 'origin');
    await until(() => store.eventsByType(agent.id, ['execution.review_completed']).length > 0);
    forceTarget(first.execution!.id);
    assert.equal(store.executions(agent.id)[0]!.status, 'running');
    const otherThread = await app.message(agent.id, 'Consider explicit fixture control.', 'user', 'other');
    assert.equal(otherThread.execution!.status, 'blocked');
    assert.match(otherThread.execution!.operational!.reason, /earlier selected activity in this thread/);
    const foreign = app.createAgent();
    enableExecutive(app, foreign.id);
    const otherAgent = await app.message(foreign.id, 'Consider explicit fixture control.', 'user', 'origin');
    assert.equal(otherAgent.execution!.status, 'blocked'); assert.match(otherAgent.execution!.operational!.reason, /owned by this Agent/);
    assert.equal(store.eventsByType(agent.id, ['execution.intervention']).length, 0);
    assert.equal(store.eventsByType(foreign.id, ['execution.intervention']).length, 0);
    await app.executiveWorkers.wait(agent.id, first.execution!.id); await app.waitForInference(agent.id);
    assert.equal(store.executions(agent.id).find(item => item.id === first.execution!.id)!.status, 'completed');
  } finally { await app.close(); store.close(); }
});
