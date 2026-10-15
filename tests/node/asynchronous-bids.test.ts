import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput, JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { PartGenerationSchema } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { Executor, ReasoningProvider } from '../../packages/core/src/contracts.js';

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
function seed(store: SqliteStore, agentId: string, id: string) {
  store.save('disposition', { id, agentId, version: 1, schemaVersion: 1, name: id, concern: `Notice ${id}`, scope: id,
    cues: [id], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
  { origin: 'researcher_edit', reason: 'Explicit asynchronous bid transport fixture', sourceIds: [] });
}
class Decisions extends MockDecisions {
  override async judge(input: JudgmentInput) { return input.task === 'disposition_activation'
    ? input.candidates.map(candidate => ({ partId: candidate.id, score: 3 })) : super.judge(input); }
  override async choose(context: SelfContext) {
    const bid = context.contributions.find(contribution => contribution.bid)?.bid;
    return bid ? { choice: bid.id, explanation: 'Fixture selects a currently offered proposal', identityConflict: '' }
      : super.choose(context);
  }
}

for (const support of [2, 3]) test(`declared external conditions require current factual support (score ${support})`, async () => {
  const store = new SqliteStore(':memory:'); const checked: JudgmentInput[] = [];
  class ConditionDecision extends Decisions {
    override async judge(input: JudgmentInput) {
      if (input.task === 'bid_applicability') { checked.push(input); return input.candidates.map(candidate => ({ partId: candidate.id, score: support })); }
      return super.judge(input);
    }
  }
  class Conditional extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      const product = PartGenerationSchema.parse(result);
      product.cognition.proposal = { action: { kind: 'say', text: 'The doorway is available.' }, argument: 'Explicit condition-admission fixture',
        validWhile: ['The door remains open'], identityFit: [], executionOrder: [] };
      return product;
    }
  }
  const app = new Application(store, { decisions: new ConditionDecision(), reasoning: new Conditional(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, revision: profile.revision + 1, enabled: true }, profile.revision);
    await app.message(agent.id, 'An external report says the door is open.', 'observer', 'door');
    assert.equal(checked.length, 1);
    assert.equal(checked[0]!.world.thoughtHistory, undefined);
    assert.equal(checked[0]!.world.experienced, undefined);
    assert.equal(checked[0]!.world.externalCapabilities, undefined);
    assert.ok(checked[0]!.candidates.every(candidate => !('disposition' in candidate.context) && !('memories' in candidate.context)));
    assert.equal(store.executions(agent.id).length, support > 2 ? 1 : 0);
    assert.equal(store.eventsByType(agent.id, ['execution.handoff']).length, support > 2 ? 1 : 0,
      'a rejected proposal must not be recorded as handed to the external adapter');
    const check = store.eventsByType(agent.id, ['execution.applicability_checked'])[0]!;
    assert.equal(check.type, 'execution.applicability_checked');
    if (check.type === 'execution.applicability_checked') assert.equal(check.payload.admitted, support > 2);
    assert.equal(store.eventsByType(agent.id, ['execution.bid_rejected']).length, support > 2 ? 0 : 1);
    const feedback = store.recentFacts(agent.id, null, 'door').filter(fact => fact.source === 'External execution admission');
    assert.equal(feedback.length, support > 2 ? 0 : 1);
    if (support <= 2) assert.match(feedback[0]!.text, /did not submit/);
    assert.equal(store.recentFacts(agent.id, null, 'other-thread').some(fact => fact.source === 'External execution admission'), false);
    const enabled = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...enabled, revision: enabled.revision + 1, enabled: false }, enabled.revision);
    assert.equal(store.recentFacts(agent.id, null, 'door').some(fact => fact.source === 'External execution admission'), false);
  } finally { await app.close(); store.close(); }
});

test('a late obsolete proposal is reviewed by its owner against later experience and withdrawn before Self', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const started = gate(); const finish = gate();
  let reviews = 0;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && input.dispositions?.[0]?.id === 'hunger') { started.release(); await finish.promise; }
      const result = await super.constructed(input);
      if (input.task === 'part_cognition' && input.dispositions?.[0]?.id === 'hunger') return { ...(result as object),
        cognition: { ...(result as { cognition: object }).cognition, proposal: { action: { kind: 'say', text: 'Find food' },
          argument: 'I was hungry when thinking began', validWhile: ['I have not eaten'], executionOrder: [], identityFit: [] } } };
      return result;
    }
    override async answer(context: Parameters<ReasoningProvider['answer']>[0], question: string) {
      if (question.startsWith('New experience') && context.currentBid?.action?.text === 'Find food') {
        reviews++; assert.ok(context.world.facts.some(fact => fact.text.includes('I have eaten')));
        return { response: 'I have eaten; the old food recommendation is obsolete.', bid_disposition: 'withdraw' as const, new_bid: null };
      }
      return super.answer(context, question);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  let initial: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'hunger'); seed(store, agent.id, 'conversation');
    initial = app.message(agent.id, 'I am hungry; a conversation is happening.', 'observer', 'meal');
    await started.promise;
    await app.message(agent.id, 'I have eaten. The conversation continues.', 'observer', 'meal');
    finish.release(); const first = await initial;
    assert.equal(first.cycle.status, 'completed'); assert.equal(reviews, 1);
    const oldBid = store.eventsByType(agent.id, ['part.bid_created']).find(event => event.type === 'part.bid_created' && event.payload.action?.text === 'Find food')!;
    assert.equal(oldBid.type, 'part.bid_created'); if (oldBid.type !== 'part.bid_created') throw new Error('No old bid');
    const lifecycle = store.eventsByType(agent.id, ['cognition.bid']).filter(event => event.type === 'cognition.bid' && event.payload.bidId === oldBid.payload.id);
    assert.ok(lifecycle.some(event => event.type === 'cognition.bid' && event.payload.status === 'needs_review'));
    assert.ok(lifecycle.some(event => event.type === 'cognition.bid' && event.payload.status === 'withdrawn'));
    assert.ok(!store.eventsByType(agent.id, ['self.choice']).some(event => event.type === 'self.choice' && event.payload.choice === oldBid.payload.id));
  } finally { finish.release(); await initial?.catch(() => {}); await app.close(); store.close(); }
});

test('new experience during external condition assessment prevents a stale handoff', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const checking = gate(); const finish = gate(); const observed = gate();
  class SlowConditions extends Decisions {
    override async judge(input: JudgmentInput) {
      if (input.task === 'bid_applicability') {
        checking.release(); await finish.promise;
        return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
      }
      return super.judge(input);
    }
  }
  class Conditional extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      const product = PartGenerationSchema.parse(result);
      product.cognition.proposal = { action: { kind: 'say', text: 'The doorway is available.' },
        argument: 'Condition-check race fixture', validWhile: ['The door remains open'], identityFit: [], executionOrder: [] };
      return product;
    }
  }
  const app = new Application(store, { decisions: new SlowConditions(), reasoning: new Conditional(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined; let second: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent(); const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, revision: profile.revision + 1, enabled: true }, profile.revision);
    app.inspection.subscribe(event => { if (event.type === 'worldstate.frozen' && event.payload.sequence === 2) observed.release(); });
    first = app.message(agent.id, 'The door is open.', 'observer', 'door'); await checking.promise;
    second = app.message(agent.id, 'The door has closed.', 'observer', 'door'); await observed.promise;
    finish.release(); const initial = await first; await second;
    assert.equal(store.executions(agent.id).filter(execution => execution.cycleId === initial.cycle.id).length, 0);
    assert.equal(store.eventsByType(agent.id, ['execution.handoff'], [initial.cycle.id]).length, 0);
    assert.ok(store.eventsByType(agent.id, ['execution.bid_rejected'], [initial.cycle.id]).length);
  } finally { finish.release(); await Promise.allSettled([first, second].filter(Boolean)); await app.close(); store.close(); }
});

test('new experience during Self prevents submission of the previously reviewed action', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const choosing = gate(); const finishChoice = gate(); const observed = gate();
  class SlowChoice extends Decisions {
    calls = 0;
    override async choose(context: SelfContext) { if (++this.calls === 1) { choosing.release(); await finishChoice.promise; } return super.choose(context); }
  }
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new SlowChoice(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined; let second: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'conversation');
    const profile = store.executiveProfile(agent.id); store.saveExecutiveProfile(agent.id, { ...profile, revision: profile.revision + 1, enabled: true }, profile.revision);
    app.inspection.subscribe(event => { if (event.type === 'worldstate.frozen' && event.payload.sequence === 2) observed.release(); });
    first = app.message(agent.id, 'The first conversation.', 'observer', 'thread'); await choosing.promise;
    second = app.message(agent.id, 'The situation changes before any speech.', 'observer', 'thread'); await observed.promise;
    finishChoice.release(); const a = await first; const b = await second;
    assert.equal(a.cycle.status, 'completed'); assert.equal(b.cycle.status, 'completed');
    assert.equal(store.executions(agent.id).filter(execution => execution.cycleId === a.cycle.id).length, 0);
    assert.equal(store.executions(agent.id).filter(execution => execution.cycleId === b.cycle.id).length, 1);
    assert.ok(store.eventsByType(agent.id, ['execution.bid_rejected'], [a.cycle.id]).length);
    assert.equal(store.eventsByType(agent.id, ['execution.handoff'], [a.cycle.id]).length, 0);
  } finally { finishChoice.release(); await Promise.allSettled([first, second].filter(Boolean)); await app.close(); store.close(); }
});

test('recovery preserves a pending bid but requires new owning-Part review before it can be selected', { timeout: 20000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'pending-bid-')); const path = join(root, 'agent.sqlite');
  let store = new SqliteStore(path); let reviews = 0;
  class WaitForMore extends Decisions {
    override async choose(context: SelfContext) { return { choice: (context.completedDeliberationRounds ?? 0) >= 2 ? 'NOTHING' : 'DELIBERATE',
      explanation: 'Explicit no-selection plumbing fixture', identityConflict: '' }; }
  }
  class NoNewActivation extends Decisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 0 })); }
  }
  class ReviewObserver extends MockReasoning {
    override async answer(context: Parameters<ReasoningProvider['answer']>[0], question: string) {
      if (question.startsWith('New experience') && context.currentBid) {
        reviews++; assert.equal('identity' in context, false);
        assert.ok(context.world.facts.some(fact => fact.text.includes('Later experience after restart')));
      }
      return super.answer(context, question);
    }
  }
  let app = new Application(store, { decisions: new WaitForMore(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'conversation');
    const first = await app.message(agent.id, 'A conversation leaves an unresolved recommendation.', 'observer', 'persistent');
    const pending = store.eventsByType(agent.id, ['cognition.bid']).findLast(event => event.type === 'cognition.bid' && event.payload.status === 'available')!;
    assert.equal(pending.type, 'cognition.bid'); if (pending.type !== 'cognition.bid') throw new Error('No pending bid');
    await app.close(); store.close(); store = new SqliteStore(path);
    app = new Application(store, { decisions: new NoNewActivation(), reasoning: new ReviewObserver(), embeddings: new MockEmbeddings() });
    assert.equal(store.executions(agent.id).length, 0);
    const second = await app.message(agent.id, 'Later experience after restart gives the recommendation a new context.', 'observer', 'persistent');
    assert.equal(second.cycle.status, 'completed'); assert.equal(reviews, 1);
    const versions = store.eventsByType(agent.id, ['cognition.bid']).flatMap(event => event.type === 'cognition.bid' && event.payload.bidId === pending.payload.bidId ? [event.payload] : []);
    assert.ok(versions.some(record => record.status === 'needs_review' && record.reason.includes('Recovered')));
    assert.equal(versions.at(-1)!.status, 'selected');
    assert.equal(versions.at(-1)!.sourceWorldId, first.cycle.worldId);
    assert.equal(versions.at(-1)!.reviewedWorldId, second.cycle.worldId);
    assert.equal(new Set(versions.map(record => record.revision)).size, versions.length);
  } finally { await app.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('Self receives mediated commitments and continues deciding while an external adapter is pending', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const submitted = gate(); const release = gate(); const selves: SelfContext[] = [];
  class Observer extends Decisions { override async choose(context: SelfContext) { selves.push(context); return super.choose(context); } }
  let calls = 0;
  const executor: Executor = { async execute(input) {
    if (++calls === 1) { submitted.release(); await release.promise; }
    assert.ok(input.contract);
    return { id: `external-${calls}-${input.cycleId}`, agentId: input.agentId, cycleId: input.cycleId,
      contractId: input.contract.id, action: input.bid.action, status: 'completed', facts: [] };
  } };
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new Observer(), embeddings: new MockEmbeddings() }, executor);
  let first: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'conversation');
    const profile = store.executiveProfile(agent.id); store.saveExecutiveProfile(agent.id, { ...profile, revision: profile.revision + 1, enabled: true }, profile.revision);
    first = app.message(agent.id, 'An ordinary conversation begins.', 'observer', 'shared'); await submitted.promise;
    const second = await app.message(agent.id, 'Someone continues speaking while the external adapter is waiting.', 'observer', 'shared');
    assert.equal(second.cycle.status, 'completed');
    assert.ok(selves[1]!.commitments?.length);
    assert.equal(selves[1]!.commitments![0]!.status, 'selected', 'Selection is not fabricated execution completion');
    assert.ok(!('world' in selves[1]!));
    assert.ok(!JSON.stringify(selves[1]!.commitments).includes('workingParts'));
    release.release(); assert.equal((await first).cycle.status, 'completed');
  } finally { release.release(); await first?.catch(() => {}); await app.close(); store.close(); }
});

test('identical action bids preserve two supporters but submit only the selected representative', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:');
  class SameProposal extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task === 'part_cognition') return { ...(result as object), cognition: { ...(result as { cognition: object }).cognition,
        proposal: { action: { kind: 'say', text: 'Hello there' }, argument: 'Explicit identical-action plumbing fixture', executionOrder: [], identityFit: [] } } };
      return result;
    }
  }
  const app = new Application(store, { reasoning: new SameProposal(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'connection'); seed(store, agent.id, 'courtesy');
    const profile = store.executiveProfile(agent.id); store.saveExecutiveProfile(agent.id, { ...profile, revision: profile.revision + 1, enabled: true }, profile.revision);
    await app.message(agent.id, 'Someone greets us.', 'observer', 'hello');
    assert.equal(store.executions(agent.id).length, 1);
    const bids = store.eventsByType(agent.id, ['cognition.bid']).filter(event => event.type === 'cognition.bid' && event.payload.status === 'selected');
    assert.equal(new Set(bids.map(event => event.type === 'cognition.bid' ? event.payload.partId : '')).size, 2);
    const commitments = store.eventsByType(agent.id, ['self.commitment']);
    assert.equal(commitments.filter(event => event.type === 'self.commitment').flatMap(event => event.type === 'self.commitment' ? event.payload.proposals : []).length, 1);
  } finally { await app.close(); store.close(); }
});

test('a pending owner review cannot hold up a current proposal from another scope', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const reviewing = gate(); const finish = gate(); const selectedCurrent = gate();
  class ReviewDecisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id,
      score: candidate.id === (input.world.sequence === 1 ? 'earlier' : 'current') ? 4 : 0 })); }
    override async choose(context: SelfContext) {
      const current = context.contributions.find(contribution => contribution.name === 'current' && contribution.bid)?.bid;
      return current ? { choice: current.id, explanation: 'Explicit current-proposal transport selection', identityConflict: '' }
        : { choice: (context.completedDeliberationRounds ?? 0) >= 2 ? 'NOTHING' : 'DELIBERATE', explanation: 'Retain earlier pending proposal in plumbing fixture', identityConflict: '' };
    }
  }
  class ReviewReasoning extends MockReasoning {
    override async answer(...args: Parameters<MockReasoning['answer']>) {
      if (args[1].startsWith('New experience') && args[0].part.name === 'earlier') { reviewing.release(); await finish.promise; }
      return super.answer(...args);
    }
  }
  const app = new Application(store, { decisions: new ReviewDecisions(), reasoning: new ReviewReasoning(), embeddings: new MockEmbeddings() });
  let second: ReturnType<Application['message']> | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const agent = app.createAgent(); seed(store, agent.id, 'earlier'); seed(store, agent.id, 'current');
    await app.message(agent.id, 'An earlier uncertain proposal is discussed.', 'observer', 'reviews');
    assert.ok(store.eventsByType(agent.id, ['cognition.bid']).some(event => event.type === 'cognition.bid' && event.payload.status === 'available'));
    app.inspection.subscribe(event => { if (event.type === 'self.commitment' && event.cycleId && store.cycle(event.cycleId).sequence === 2) selectedCurrent.release(); });
    second = app.message(agent.id, 'Another scope has a currently relevant proposal.', 'observer', 'reviews');
    await reviewing.promise;
    const available = await Promise.race([selectedCurrent.promise.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
    assert.equal(available, true, 'Independent current proposal should not wait for a slow earlier owner review');
    finish.release(); await second;
  } finally { if (timer) clearTimeout(timer); finish.release(); await second?.catch(() => {}); await app.close(); store.close(); }
});
