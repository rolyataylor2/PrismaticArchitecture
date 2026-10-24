import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { FocusedBidContext, PartContext, ReasoningProvider } from '../../packages/core/src/contracts.js';
import type { AffectChoice, AffectSelectionContext } from '../../packages/core/src/affect-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import { affectCycles, priorAffect, currentAffect } from '../../packages/core/src/affect-history.js';
import { factualWorld } from '../../packages/core/src/experienced.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { prompts } from '../../packages/providers/src/prompts.js';
import type { Executor } from '../../packages/core/src/contracts.js';

// Deterministic plumbing fixtures; they do not validate a psychological hypothesis.
class Decisions extends MockDecisions {
  affectMode: AffectChoice['mode'] = 'select';
  inputs: AffectSelectionContext[] = [];
  override async chooseAffect(context: AffectSelectionContext): Promise<AffectChoice> {
    this.inputs.push(context);
    const mode = this.affectMode === 'select' && !context.proposals.length ? 'no_change' : this.affectMode;
    return { mode, selectedProposalIds: mode === 'select' ? [context.proposals[0]!.id] : [], reason: 'Explicit deterministic plumbing selection' };
  }
  override async choose(context: SelfContext) {
    const bid = context.contributions.find(contribution => contribution.bid)?.bid;
    return { choice: bid?.id ?? ((context.completedDeliberationRounds ?? 0) >= 2 ? 'NOTHING' : 'DELIBERATE'),
      selectedBidIds: bid ? [bid.id] : [], explanation: 'Plumbing fixture', identityConflict: '' };
  }
}
class Reasoning extends MockReasoning {
  offer = true; failRevision = false; revision: 'replace' | 'retain' | 'withdraw' = 'replace';
  snapshots: ConstructedInput[] = []; focused: FocusedBidContext[] = []; newOfferInAnswer = false;
  prediction = false;
  navigate = false; failCoverage = false;
  override async constructed(input: ConstructedInput) {
    if (input.task === 'cognition_coverage' && this.failCoverage) throw new Error('Controlled coverage failure');
    const result = await super.constructed(input);
    if (input.task !== 'part_cognition') return result;
    this.snapshots.push(input);
    const product = PartGenerationSchema.parse(result);
    product.cognition.affect = 'Naturally experienced sadness';
    product.cognition.proposal = { action: { kind: 'say', text: 'Original recommendation' }, argument: 'An original expressed concern', identityFit: [], executionOrder: [] };
    if (this.navigate && input.world?.experienced?.stanceHistory?.length) product.cognition.proposal = {
      type: 'navigate', action: null, stateId: input.world.experienced.stanceHistory[0]!.id,
      argument: 'Revisit an available expressed lens', identityFit: [], executionOrder: [] };
    if (!this.prediction) product.cognition.prediction = null;
    product.cognition.affectProposals = this.offer ? [{ orientation: 'Explore a boundary while preserving sadness',
      motivation: 'Protect something meaningful', reason: 'Consider a neglected boundary',
      expectedValue: 'Meaningful action without demanding more learning', supportingPredictionIds: [] }] : [];
    return product;
  }
  override async reviseFocusedBid(context: FocusedBidContext): ReturnType<NonNullable<ReasoningProvider['reviseFocusedBid']>> {
    this.focused.push(context);
    if (this.failRevision) throw new Error('Controlled revision failure');
    return { response: 'Fixture revision rejects the favored angry action and expresses care.', bid_disposition: this.revision,
      new_bid: this.revision === 'replace' ? { action: { kind: 'say', text: 'Focused recommendation' },
        argument: 'A newly considered value, not a claim of new facts', identityFit: [], executionOrder: [] } : null };
  }
  override async answer(context: PartContext & { currentBid?: import('../../packages/core/src/domain.js').Bid | null }, question: string) {
    const response = await super.answer(context, question);
    return this.newOfferInAnswer ? { ...response, affectProposals: [{ orientation: 'Consider a discriminating alternative',
      motivation: 'Understand competing concerns', reason: 'The inquiry revealed an alternative worth exploring', expectedValue: 'Test competing interpretations', supportingPredictionIds: [] }] } : response;
  }
}
function application(store: SqliteStore, decisions = new Decisions(), reasoning = new Reasoning()) {
  return { app: new Application(store, { decisions, reasoning, embeddings: new MockEmbeddings() }), decisions, reasoning };
}

test('ordinary runtime preserves baseline and original affect, revises against the same snapshot, then selects focused behavior', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    // This fixture explicitly tests cognition with external execution disconnected.
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: false, revision: profile.revision + 1 }, profile.revision);
    const result = await app.message(agent.id, 'Consider what matters.', 'host', 'runtime-affect');
    assert.equal(reasoning.focused.length, 1);
    assert.equal(reasoning.focused[0]!.world, reasoning.snapshots[0]!.world);
    assert.equal(reasoning.focused[0]!.expressed.affect, 'Naturally experienced sadness');
    assert.equal('world' in decisions.inputs[0]!, false);
    assert.equal('activation' in decisions.inputs[0]!, false);
    const events = store.events(agent.id);
    const baseline = events.find(event => event.type === 'self.affect_baseline')!;
    const final = events.findLast(event => event.type === 'self.arbitration_started')!;
    if (baseline.type !== 'self.affect_baseline' || final.type !== 'self.arbitration_started') throw new Error('Missing two-pass records');
    assert.equal(baseline.payload.context.contributions[0]!.bid!.action!.text, 'Original recommendation');
    assert.equal(baseline.payload.context.selectedFocus, undefined);
    assert.equal(final.payload.contributions[0]!.bid!.action!.text, 'Focused recommendation');
    assert.equal(final.payload.contributions[0]!.bid!.replacesBidId, baseline.payload.choice.choice);
    assert.equal(final.payload.contributions[0]!.affect, 'Naturally experienced sadness');
    assert.ok(final.payload.selectedFocus);
    assert.equal(events.filter(event => event.type === 'self.choice').length, 1, 'Baseline cannot become a behavioral selection');
    assert.equal(result.cycle.selectedBidId, final.payload.contributions[0]!.bid!.id);
    assert.equal(store.executions(agent.id).length, 0, 'Disconnected Executive stays disconnected');
    const record = affectCycles(store, agent.id)[0]!;
    assert.equal(record.focusAfter!.periodId, final.payload.selectedFocus!.periodId);
    const inquiryPreview = previewPrompt(store, agent.id, 'affect_selection', prompts.affect_selection.text);
    assert.equal(inquiryPreview.worldId, null); assert.equal(inquiryPreview.cycleId, result.cycle.id);
    const revisionPreview = previewPrompt(store, agent.id, 'focused_bid_revision', prompts.focused_bid_revision.text);
    assert.equal(revisionPreview.worldId, reasoning.focused[0]!.world.id);
  } finally { store.close(); }
});

test('focus survives SQLite restart and another thread; no-change expires it after the next completed same-thread cycle', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-affect-runtime-')); const path = join(directory, 'agents.sqlite');
  let store = new SqliteStore(path); let agentId = ''; let periodId = '';
  try {
    const first = application(store); const agent = first.app.createAgent(); agentId = agent.id;
    await first.app.message(agentId, 'Begin a focus.', 'host', 'focus-thread');
    periodId = affectCycles(store, agentId)[0]!.focusAfter!.periodId;
    store.close(); store = new SqliteStore(path);
    const next = application(store); next.reasoning.offer = false; next.decisions.affectMode = 'no_change';
    await next.app.message(agentId, 'An unrelated thread.', 'host', 'other-thread');
    assert.equal(next.decisions.inputs.length, 0);
    const continued = await next.app.message(agentId, 'A later encounter.', 'host', 'focus-thread');
    assert.equal(next.decisions.inputs[0]!.currentFocus!.periodId, periodId);
    assert.equal(next.reasoning.focused[0]!.world.experienced!.selectedFocus!.periodId, periodId);
    assert.equal(factualWorld(next.reasoning.focused[0]!.world).experienced, undefined);
    const expired = await next.app.message(agentId, 'Another encounter.', 'host', 'focus-thread');
    const records = affectCycles(store, agentId);
    assert.equal(records.find(record => record.cycleId === continued.cycle.id)!.sequence, 2);
    const ended = records.find(record => record.cycleId === expired.cycle.id)!;
    assert.equal(ended.sequence, 3); assert.equal(ended.focusAfter, null);
    assert.equal(ended.decisions[0]!.boundary, 'expired');
    assert.equal(next.reasoning.focused.length, 1);
    assert.equal(next.reasoning.snapshots.at(-1)!.world!.experienced!.selectedFocus, undefined);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('explicit renewal preserves period lineage and extends lifetime; failed cognition cannot renew or advance it', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    await app.message(agent.id, 'Begin a focus.', 'host', 'renew');
    const first = affectCycles(store, agent.id)[0]!.focusAfter!;
    reasoning.offer = false; decisions.affectMode = 'maintain'; reasoning.failRevision = true;
    await assert.rejects(app.message(agent.id, 'A failed renewal attempt.', 'host', 'renew'), /Controlled revision failure/);
    assert.equal(affectCycles(store, agent.id).length, 1);
    reasoning.failRevision = false;
    const renewed = await app.message(agent.id, 'Try a fresh encounter.', 'host', 'renew');
    const record = affectCycles(store, agent.id).at(-1)!;
    assert.equal(record.cycleId, renewed.cycle.id); assert.equal(record.sequence, 2);
    assert.equal(record.focusAfter!.periodId, first.periodId);
    assert.equal(record.focusAfter!.startedCycleId, first.startedCycleId);
    assert.equal(record.focusAfter!.expiresAfterSequence, 3);
    assert.equal(record.decisions[0]!.boundary, 'renewed');
  } finally { store.close(); }
});

test('affect inquiry updates explicit offers through ordinary answers under the shared round budget', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    reasoning.newOfferInAnswer = true;
    const originalChoose = decisions.chooseAffect.bind(decisions);
    decisions.chooseAffect = async input => { decisions.affectMode = input.canDeliberate && decisions.inputs.length === 0 ? 'deliberate' : 'select'; return originalChoose(input); };
    await app.message(agent.id, 'Consider an uncertain loss.', 'host', 'inquiry');
    assert.equal(decisions.inputs.length, 2);
    assert.equal(decisions.inputs[1]!.proposals[0]!.orientation, 'Consider a discriminating alternative');
    assert.notEqual(decisions.inputs[0]!.proposals[0]!.id, decisions.inputs[1]!.proposals[0]!.id);
    const events = store.events(agent.id);
    assert.equal(events.filter(event => event.type === 'self.deliberation_started').length, 1);
    assert.equal(events.filter(event => event.type === 'self.affect_inquiry_started').length, 1);
    const final = events.findLast(event => event.type === 'self.arbitration_started');
    if (final?.type !== 'self.arbitration_started') throw new Error('Missing behavioral selection');
    assert.equal(final.payload.completedDeliberationRounds, 1);
    assert.equal(final.payload.selectedFocus!.proposals[0]!.orientation, 'Consider a discriminating alternative');
  } finally { store.close(); }
});

test('closed ordinary inquiry budget excludes affect deliberation and cannot be bypassed by a provider', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, decisions } = application(store); const agent = app.createAgent();
    decisions.affectMode = 'deliberate';
    await assert.rejects(app.message(agent.id, 'Keep asking without selecting.', 'host', 'budget'), /ordinary deliberation budget/);
    assert.deepEqual(decisions.inputs.map(input => input.canDeliberate), [true, true, false]);
    assert.equal(affectCycles(store, agent.id).length, 0);
  } finally { store.close(); }
});

test('predictions before a new selection stay baseline; later same-thread origin predictions belong to the carried period', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent(); reasoning.prediction = true;
    const first = await app.message(agent.id, 'Begin an uncertain focus.', 'host', 'predictions');
    const record = affectCycles(store, agent.id)[0]!;
    assert.equal(record.baselinePredictionIds.length, 1); assert.equal(record.originated.length, 0);
    // Explicit researcher starting condition for an origin-bookkeeping test, not hypothesis validation.
    const old = store.list('prediction', agent.id)[0]!;
    store.save('prediction', { ...old, version: old.version + 1, status: 'abandoned' }, old.version,
      { origin: 'researcher_edit', reason: 'Explicit plumbing starting condition for a second origin cohort', sourceIds: [] });
    reasoning.offer = false; decisions.affectMode = 'no_change';
    const second = await app.message(agent.id, 'A new uncertainty follows.', 'host', 'predictions');
    const nextRecord = affectCycles(store, agent.id).at(-1)!;
    assert.equal(nextRecord.originated.length, 1);
    assert.equal(nextRecord.originated[0]!.periodId, record.focusAfter!.periodId);
    assert.equal(nextRecord.originated[0]!.stage, 'part_cognition');
    assert.notEqual(nextRecord.originated[0]!.predictionId, old.id);
    const state = priorAffect(store, { ...second.cycle, id: 'next', sequence: second.cycle.sequence + 1 });
    assert.equal(state.feedback!.originatedPredictions, 1); assert.equal(state.feedback!.baselinePredictions, 1);
    assert.equal(state.feedback!.unresolved, 1); assert.equal(state.feedback!.supportedFractionAmongDecisive, null);
    assert.equal(first.cycle.status, 'completed');
  } finally { store.close(); }
});

test('navigation ends voluntary focus and preserves source period and current-world history', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    // This fixture explicitly tests cognition with external execution disconnected.
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: false, revision: profile.revision + 1 }, profile.revision);
    await app.message(agent.id, 'Begin an exploratory focus.', 'host', 'navigation');
    const first = affectCycles(store, agent.id)[0]!;
    reasoning.offer = false; reasoning.navigate = true; reasoning.revision = 'retain'; decisions.affectMode = 'no_change';
    const navigated = await app.message(agent.id, 'Present experience remains relevant.', 'host', 'navigation');
    const record = affectCycles(store, agent.id).at(-1)!;
    assert.ok(record.navigationStateId); assert.equal(record.focusAfter, null);
    assert.equal(record.usedFocus!.periodId, first.focusAfter!.periodId);
    assert.equal(store.executions(agent.id).length, 0);
    assert.ok(store.worlds(agent.id).at(-1)!.facts.some(fact => fact.text === 'host says: Present experience remains relevant.'));
    reasoning.navigate = false;
    await app.message(agent.id, 'A fresh encounter after navigation.', 'host', 'navigation');
    assert.equal(reasoning.snapshots.at(-1)!.world!.experienced!.selectedFocus, undefined);
    assert.equal(affectCycles(store, agent.id).length, 2);
    assert.equal(record.cycleId, navigated.cycle.id);
  } finally { store.close(); }
});

test('enabled Executive enacts only the final focused bid, never the unmodulated baseline', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app } = application(store); const agent = app.createAgent();
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1 }, profile.revision);
    await app.message(agent.id, 'Consider a response.', 'host', 'external');
    const executions = store.executions(agent.id);
    assert.equal(executions.length, 1); assert.equal(executions[0]!.action.text, 'Focused recommendation');
    const baseline = store.eventsByType(agent.id, ['self.affect_baseline'])[0]!;
    if (baseline.type !== 'self.affect_baseline') throw new Error('No baseline');
    const handoff = store.eventsByType(agent.id, ['execution.handoff'])[0]!;
    if (handoff.type !== 'execution.handoff') throw new Error('Missing external handoff');
    assert.notEqual(handoff.payload.bid.id, baseline.payload.choice.choice);
    assert.equal(handoff.payload.bid.action.text, 'Focused recommendation');
  } finally { store.close(); }
});

test('failure after focused selection leaves decision audit but commits no focus renewal', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    await app.message(agent.id, 'Select an initial focus.', 'host', 'post-selection-failure');
    const initial = affectCycles(store, agent.id)[0]!.focusAfter!;
    reasoning.offer = false; reasoning.failCoverage = true; decisions.affectMode = 'maintain';
    await assert.rejects(app.message(agent.id, 'This cycle fails after selection.', 'host', 'post-selection-failure'), /Controlled coverage failure/);
    const failed = store.cycles(agent.id).at(-1)!;
    assert.equal(failed.status, 'failed');
    assert.equal(store.eventsByType(agent.id, ['self.affect_decision'], [failed.id]).length, 1);
    assert.equal(affectCycles(store, agent.id).length, 1);
    assert.equal(priorAffect(store, { ...failed, sequence: failed.sequence + 1 }).activeFocus!.expiresAfterSequence, initial.expiresAfterSequence);
  } finally { store.close(); }
});

test('multiple scoped Parts revise concurrently while retaining their independent original affect', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, reasoning, decisions } = application(store); const agent = app.createAgent();
    for (const name of ['Care for connection', 'Need for boundaries']) store.save('disposition', {
      id: name, agentId: agent.id, schemaVersion: 1, version: 1, name, concern: name, cues: ['relationship'],
      scope: name, prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'seed', reason: 'Explicit multi-scope plumbing conditions', sourceIds: [] });
    decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    let inFlight = 0; let peak = 0;
    const revise = reasoning.reviseFocusedBid.bind(reasoning);
    reasoning.reviseFocusedBid = async context => {
      peak = Math.max(peak, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await revise(context); inFlight--; return result;
    };
    await app.message(agent.id, 'A relationship concern needs attention.', 'host', 'parallel');
    assert.equal(peak, 2); assert.equal(reasoning.focused.length, 2);
    assert.equal(reasoning.focused[0]!.world, reasoning.focused[1]!.world);
    assert.notEqual(reasoning.focused[0]!.part.id, reasoning.focused[1]!.part.id);
    for (const input of reasoning.focused) assert.equal(input.expressed.affect, 'Naturally experienced sadness');
    assert.equal(store.eventsByType(agent.id, ['part.focused_bid_revision']).length, 2);
  } finally { store.close(); }
});

test('completed monitor cycles do not consume the next ordinary focus opportunity', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, decisions, reasoning } = application(store); const agent = app.createAgent();
    await app.message(agent.id, 'Begin a focus before monitoring', 'host', 'monitor-age');
    const original = affectCycles(store, agent.id)[0]!.focusAfter!;
    // Explicit host monitor records for lifetime plumbing, not a psychological fixture.
    for (let index = 0; index < 3; index++) {
      const monitor = store.startCycle(agent.id, 'monitor-age');
      store.saveCycle({ ...monitor, kind: 'attention_monitor', status: 'completed' });
    }
    reasoning.offer = false; decisions.affectMode = 'no_change';
    await app.message(agent.id, 'The next ordinary experience', 'host', 'monitor-age');
    const record = affectCycles(store, agent.id).at(-1)!;
    assert.equal(record.sequence, 2); assert.equal(record.usedFocus!.periodId, original.periodId);
    assert.equal(record.focusAfter!.expiresAfterSequence, 2);
    await app.message(agent.id, 'Another ordinary experience', 'host', 'monitor-age');
    assert.equal(affectCycles(store, agent.id).at(-1)!.focusAfter, null);
  } finally { store.close(); }
});

test('behavioral Self can select another perspective instead of the owner of its chosen affect', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const { app, decisions, reasoning } = application(store); const agent = app.createAgent();
    // This fixture explicitly tests cognition with external execution disconnected.
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: false, revision: profile.revision + 1 }, profile.revision);
    for (const name of ['Boundary concern', 'Care concern']) store.save('disposition', {
      id: `reject-focus-${name}`, agentId: agent.id, version: 1, schemaVersion: 1, name, concern: `Explicit authored ${name}`,
      cues: ['A relationship concern'], scope: name, prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'seed', reason: 'Explicit behavioral-authority plumbing starting conditions', sourceIds: [] });
    decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    const revise = reasoning.reviseFocusedBid.bind(reasoning);
    reasoning.reviseFocusedBid = async context => {
      const response = await revise(context);
      if (response.new_bid?.action) response.new_bid = { ...response.new_bid,
        action: { ...response.new_bid.action, text: `${response.new_bid.action.text} from ${context.part.name}` } };
      return response;
    };
    const choose = decisions.choose.bind(decisions);
    decisions.choose = async context => {
      if (!context.selectedFocus) return choose(context);
      const favoredOwner = context.selectedFocus.proposals[0]!.partId;
      const alternative = context.contributions.find(contribution => contribution.partId !== favoredOwner && contribution.bid)!.bid!;
      return { choice: alternative.id, selectedBidIds: [alternative.id], explanation: 'Explicit fixture rejects focus-owner behavior while retaining the lens', identityConflict: '' };
    };
    const result = await app.message(agent.id, 'Consider a relationship concern.', 'host', 'behavioral-authority');
    const record = affectCycles(store, agent.id)[0]!;
    const chosen = store.eventsByType(agent.id, ['part.focused_bid_revision']).find(event => event.type === 'part.focused_bid_revision'
      && event.payload.resultingBid?.id === result.cycle.selectedBidId)!;
    if (chosen.type !== 'part.focused_bid_revision') throw new Error('Missing selected alternative');
    assert.notEqual(chosen.payload.partId, record.usedFocus!.proposals[0]!.partId);
    assert.equal(record.focusAfter!.periodId, record.usedFocus!.periodId);
    assert.equal(reasoning.focused.length, 2); assert.equal(store.executions(agent.id).length, 0);
  } finally { store.close(); }
});

test('a later thought in one observation lineage uses the committed lens without another affect choice', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); let unblock!: () => void; let started!: () => void; let committed!: () => void;
  const slow = new Promise<void>(resolve => { unblock = resolve; });
  const thinking = new Promise<void>(resolve => { started = resolve; });
  const chosen = new Promise<void>(resolve => { committed = resolve; });
  class SlowPart extends Reasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && input.dispositions?.[0]?.id === 'slow') { started(); await slow; }
      return super.constructed(input);
    }
  }
  const decisions = new Decisions(); decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
  const app = new Application(store, { decisions, reasoning: new SlowPart(), embeddings: new MockEmbeddings() });
  let pending: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    for (const id of ['fast', 'slow']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1, name: id,
      concern: `Notice ${id}`, scope: id, cues: [id], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null,
      temporary: false, active: true }, 0, { origin: 'seed', reason: 'Explicit affect timing fixture', sourceIds: [] });
    app.inspection.subscribe(event => { if (event.type === 'self.affect_committed') committed(); });
    pending = app.message(agent.id, 'A relationship concern invites different perspectives.', 'observer', 'timing');
    await thinking; await chosen;
    assert.equal(decisions.inputs.length, 1);
    unblock(); const result = await pending;
    assert.equal(decisions.inputs.length, 1, 'Another completed thought is not a new affect boundary');
    const commits = store.eventsByType(agent.id, ['self.affect_committed']).flatMap(event => event.type === 'self.affect_committed' ? [event.payload] : []);
    assert.ok(commits.length >= 2);
    assert.ok(commits.every(commit => commit.rootWorldId === result.cycle.worldId && commit.record.sequence === 1));
    assert.equal(commits[0]!.record.focusAfter!.periodId, commits.at(-1)!.record.focusAfter!.periodId);
    assert.ok(store.eventsByType(agent.id, ['self.arbitration_started']).some(event => event.type === 'self.arbitration_started'
      && event.payload.selectedFocus?.periodId === commits[0]!.record.focusAfter!.periodId));
  } finally { unblock(); await pending?.catch(() => {}); await app.close(); store.close(); }
});

test('late adapter completion cannot roll back a newer committed focus renewal', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); let unblock!: () => void; let submitted!: () => void;
  const wait = new Promise<void>(resolve => { unblock = resolve; }); const entered = new Promise<void>(resolve => { submitted = resolve; });
  let calls = 0;
  const executor: Executor = { async execute(input) {
    if (++calls === 1) { submitted(); await wait; }
    return { id: `affect-adapter-${input.cycleId}`, agentId: input.agentId, cycleId: input.cycleId,
      action: input.bid.action, status: 'completed', facts: [] };
  } };
  const decisions = new Decisions(); const app = new Application(store, { decisions, reasoning: new Reasoning(), embeddings: new MockEmbeddings() }, executor);
  let first: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent(); const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1 }, profile.revision);
    first = app.message(agent.id, 'Choose a lens before the adapter settles.', 'observer', 'lens'); await entered;
    decisions.affectMode = 'maintain';
    const second = await app.message(agent.id, 'New experience while the adapter still waits.', 'observer', 'lens');
    const before = currentAffect(store, second.cycle, second.cycle.worldId);
    assert.equal(before.activeFocus!.expiresAfterSequence, 3);
    unblock(); await first;
    const after = currentAffect(store, second.cycle, second.cycle.worldId);
    assert.equal(after.activeFocus!.periodId, before.activeFocus!.periodId);
    assert.equal(after.activeFocus!.expiresAfterSequence, 3);
  } finally { unblock(); await first?.catch(() => {}); await app.close(); store.close(); }
});

test('focused revisions obey the configured thought concurrency bound', async () => {
  const store = new SqliteStore(':memory:'); const { app, reasoning, decisions } = application(store);
  try {
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { maxConcurrentThoughts: 1 });
    for (const name of ['Care for connection', 'Need for boundaries']) store.save('disposition', {
      id: name, agentId: agent.id, schemaVersion: 1, version: 1, name, concern: name, cues: ['relationship'], scope: name,
      prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'seed', reason: 'Explicit resource-admission regression fixture', sourceIds: [] });
    decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    let inFlight = 0; let peak = 0;
    const revise = reasoning.reviseFocusedBid.bind(reasoning);
    reasoning.reviseFocusedBid = async context => {
      const scope = context.part.instance!.dispositionBindings![0]!.dispositionId;
      assert.equal(app.runtime.constructed.isProcessing({ agentId: agent.id, threadId: 'bounded-focus', dispositionId: scope }), true);
      peak = Math.max(peak, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      try { return await revise(context); } finally { inFlight--; }
    };
    await app.message(agent.id, 'A relationship concern needs attention.', 'host', 'bounded-focus');
    assert.ok(reasoning.focused.length); assert.equal(peak, 1);
  } finally { await app.close(); store.close(); }
});
