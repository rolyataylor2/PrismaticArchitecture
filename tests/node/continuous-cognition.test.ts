import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput, JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { dispositionActivationHistory, currentDispositionActivation } from '../../packages/sdk/src/disposition-activation-history.js';
import { api } from '../../packages/sdk/src/api.js';

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

for (const includeProcessing of [false, true]) test(`ordinary intake continues while a scope thinks (rescore busy: ${includeProcessing})`, { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:');
  const birdStarted = gate(); const releaseBird = gate(); const conversationThought = gate();
  const judged: JudgmentInput[] = [];
  let birdCalls = 0;
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      judged.push(input);
      if (input.task === 'disposition_activation') return input.candidates.map(candidate => ({ partId: candidate.id, score: 3 }));
      return super.judge(input);
    }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && input.dispositions?.[0]?.id === 'bird') {
        birdCalls++; birdStarted.release(); await releaseBird.promise;
      }
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    app.updateAgentActivationSettings(agent.id, { includeProcessingDispositions: includeProcessing });
    for (const id of ['bird', 'conversation']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1,
      name: id, concern: `Notice ${id}`, scope: id, cues: [id], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true },
    0, { origin: 'researcher_edit', reason: 'Explicit concurrency plumbing conditions', sourceIds: [] });
    app.inspection.subscribe(event => {
      if (event.type === 'part.thought' && event.payload.partSnapshot?.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'conversation')) conversationThought.release();
    });
    first = app.message(agent.id, 'A bird chirps during a conversation.', 'observer', 'shared');
    await birdStarted.promise;
    await conversationThought.promise;
    assert.equal(store.eventsByType(agent.id, ['part.thought']).filter(event => event.type === 'part.thought' && event.payload.partSnapshot?.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'bird')).length, 0);
    const second = await app.message(agent.id, 'The conversation continues.', 'observer', 'shared');
    assert.equal(second.cycle.status, 'completed');
    const secondWorld = store.world(second.cycle.worldId);
    const secondJudgments = judged.filter(input => input.world.id === secondWorld.id && input.task === 'disposition_activation');
    assert.ok(secondJudgments.length);
    assert.equal(secondJudgments.some(input => input.candidates.some(candidate => candidate.id === 'bird')), includeProcessing);
    assert.equal(birdCalls, 1, 'Rescoring must not interrupt or duplicate the running thought');
    const excluded = dispositionActivationHistory(store, 'bird').find(sample => sample.cycleId === second.cycle.id);
    assert.equal(excluded?.score, includeProcessing ? 3 : null);
    if (!includeProcessing) assert.match(excluded!.reasons.join(' '), /currently processing/);
    if (includeProcessing) assert.ok(store.eventsByType(agent.id, ['construction.admission'], [second.cycle.id]).some(event => event.type === 'construction.admission' && event.payload.scopes.some(scope => scope.dispositionId === 'bird' && scope.status === 'busy')), 'Rescored relevance must not be reported as thought admission');
    assert.ok(store.eventsByType(agent.id, ['self.choice']).some(event => event.cycleId === second.cycle.id));
    releaseBird.release();
    assert.equal((await first).cycle.status, 'completed');
    assert.equal(store.list('part', agent.id).filter(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'bird')).length, 1);
  } finally { releaseBird.release(); await first?.catch(() => {}); await app.close(); store.close(); }
});

test('one-pass pause and explicit resume use the same asynchronous runtime and preserve observation lineage', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:');
  const app = new Application(store);
  try {
    const agent = app.createAgent();
    const settings = app.agentActivationSettings(agent.id);
    assert.equal(settings.activationPassLimit, 1);
    assert.equal(settings.includeProcessingDispositions, false);
    await api(app, 'PATCH', `/api/agents/${agent.id}/activation-settings`, { includeProcessingDispositions: true, maxConcurrentThoughts: 2 });
    await api(app, 'PATCH', `/api/agents/${agent.id}/activation-settings`, { memoryRecallLimit: 3 });
    assert.equal(app.agentActivationSettings(agent.id).includeProcessingDispositions, true);
    assert.equal(app.agentActivationSettings(agent.id).maxConcurrentThoughts, 2);
    const first = await app.message(agent.id, 'A bird chirps.', 'observer', 'stream');
    await app.waitForInference(agent.id);
    assert.equal(store.cycles(agent.id).length, 1);
    const paused = app.runtime.streamStatus(agent.id, 'stream');
    assert.equal(paused?.status, 'paused');
    assert.equal(paused?.rootWorldId, first.cycle.worldId);
    await api(app, 'POST', `/api/agents/${agent.id}/cognition-control`, { threadId: 'stream', directive: 'resume' });
    await app.waitForInference(agent.id);
    assert.equal(store.cycles(agent.id).length, 2);
    assert.equal(app.runtime.streamStatus(agent.id, 'stream')?.passCount, 2);
    assert.equal(app.runtime.streamStatus(agent.id, 'stream')?.status, 'paused');
    const later = store.world(store.cycles(agent.id)[1]!.worldId);
    assert.ok(later.thoughtHistory?.length);
    assert.equal(later.facts.filter(fact => fact.text.includes('A bird chirps')).length, 1);
    assert.ok(later.facts.every(fact => fact.originCycleId === first.cycle.id));
    app.updateAgentActivationSettings(agent.id, { activationPassLimit: 2 });
    await app.message(agent.id, 'Someone begins a conversation.', 'observer', 'stream');
    await app.waitForInference(agent.id);
    const status = app.runtime.streamStatus(agent.id, 'stream');
    assert.equal(status?.passCount, 2);
    assert.equal(status?.status, 'paused');
    assert.equal(store.cycles(agent.id).length, 4);
  } finally { await app.close(); store.close(); }
});

test('one-pass allowance also prevents additional activation for Self recruitment while ordinary inquiry remains available', async () => {
  const store = new SqliteStore(':memory:');
  class Inquiry extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id,
      score: candidate.id === 'present' || (candidate.context as { inquiry?: string }).inquiry ? 4 : 0 })); }
    override async choose() { return { choice: 'DELIBERATE', explanation: 'Bounded inquiry fixture', identityConflict: '' }; }
  }
  const app = new Application(store, { decisions: new Inquiry(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    for (const id of ['present', 'missing']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1,
      name: id, concern: `Notice ${id}`, scope: id, cues: [id], prerequisites: [], threshold: 2, memoryIds: [],
      sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'researcher_edit', reason: 'Explicit recruitment budget fixture', sourceIds: [] });
    await app.message(agent.id, 'An ordinary uncertain conversation.', 'observer', 'bounded');
    const activation = store.eventsByType(agent.id, ['construction.judgment']).filter(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation');
    assert.equal(activation.length, 1);
    assert.ok(activation.every(event => event.type === 'construction.judgment' && event.payload.input.candidates.every(candidate => !(candidate.context as { inquiry?: string }).inquiry)));
    assert.ok(store.eventsByType(agent.id, ['self.question']).length);
    assert.equal(app.runtime.streamStatus(agent.id, 'bounded')?.passCount, 1);
    assert.equal(app.runtime.streamStatus(agent.id, 'bounded')?.status, 'paused');
  } finally { await app.close(); store.close(); }
});

for (const changeOwner of [false, true]) test(`Self inquiry occupies its disposition scope and rejects stale responses (owner changed: ${changeOwner})`, { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const answering = gate(); const finish = gate(); const assessed = gate();
  let generations = 0; let answers = 0;
  class Decisions extends MockDecisions {
    choices = 0;
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 3 })); }
    override async choose(context: Parameters<MockDecisions['choose']>[0]) { return ++this.choices === 1
      ? { choice: 'DELIBERATE', explanation: 'Explicit inquiry transport fixture', identityConflict: '' } : super.choose(context); }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') generations++; return super.constructed(input); }
    override async answer(...args: Parameters<MockReasoning['answer']>) {
      if (!args[1].startsWith('New experience')) { answers++; answering.release(); await finish.promise; }
      return super.answer(...args);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined; let second: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    store.save('disposition', { id: 'conversation', agentId: agent.id, version: 1, schemaVersion: 1, name: 'conversation', concern: 'Notice conversation',
      scope: 'conversation', cues: ['conversation'], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
    { origin: 'researcher_edit', reason: 'Explicit scope admission fixture', sourceIds: [] });
    app.inspection.subscribe(event => { if (event.type === 'construction.admission' && event.cycleId && store.cycle(event.cycleId).sequence === 2) assessed.release(); });
    first = app.message(agent.id, 'A conversation begins.', 'observer', 'inquiry'); await answering.promise;
    assert.equal(app.runtime.constructed.isProcessing({ agentId: agent.id, threadId: 'inquiry', dispositionId: 'conversation' }), true);
    if (changeOwner) {
      const owner = store.list('part', agent.id).find(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'conversation'))!;
      app.runtime.mutations.patch(owner.id, owner.version, { beliefs: ['Explicit concurrent researcher revision'] },
        { origin: 'researcher_edit', reason: 'Version-race regression fixture', sourceIds: [] });
    }
    second = app.message(agent.id, 'The conversation changes during inquiry.', 'observer', 'inquiry'); await assessed.promise;
    assert.equal(generations, 1, 'A busy inquiry must not admit duplicate generation');
    assert.equal(dispositionActivationHistory(store, 'conversation').at(-1)!.score, null, 'Busy inquiry is an unmeasured exclusion');
    finish.release(); const original = await first; await second;
    assert.equal(answers, 1);
    const responses = store.eventsByType(agent.id, ['part.deliberation_response'], [original.cycle.id]);
    assert.equal(responses.length, changeOwner ? 0 : 1);
    assert.equal(store.eventsByType(agent.id, ['cognition.inquiry_deferred'], [original.cycle.id]).length, changeOwner ? 1 : 0);
  } finally { finish.release(); await Promise.allSettled([first, second].filter(Boolean)); await app.close(); store.close(); }
});

test('runtime shutdown drains direct admitted thoughts, rejects new intake and closes scope admission', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const started = gate(); const finish = gate();
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') { started.release(); await finish.promise; } return super.constructed(input); }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  let pending: ReturnType<Application['runtime']['run']> | undefined; let closing: Promise<void> | undefined;
  try {
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { activationPassLimit: null });
    pending = app.runtime.run(agent.id, [{ source: 'Observer', kind: 'observes', text: 'A bird chirps.', timestamp: null, referenceId: null }], 'shutdown');
    await started.promise; closing = app.runtime.close();
    await assert.rejects(app.runtime.run(agent.id, [{ source: 'Observer', kind: 'observes', text: 'New input.', timestamp: null, referenceId: null }]), /closing/);
    assert.equal(store.cycles(agent.id).length, 1); assert.equal(store.cycles(agent.id)[0]!.status, 'running');
    finish.release(); const completed = await pending; await closing;
    assert.equal(completed.cycle.status, 'completed'); assert.equal(store.cycles(agent.id).length, 1);
    assert.equal(store.eventsByType(agent.id, ['part.thought']).length, 1);
    const rejected = await app.runtime.constructed.scheduleJob({ agentId: agent.id, threadId: 'shutdown', dispositionId: '__identity_fallback__',
      worldId: completed.cycle.worldId!, run: async () => assert.fail('Closed scope queue accepted new inference') });
    assert.equal(rejected.status, 'closed');
  } finally { finish.release(); await pending?.catch(() => {}); await closing; await app.close(); store.close(); }
});

test('Application shutdown preserves a message accepted before it enters runtime intake', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const accepted = app.message(agent.id, 'An accepted observation.', 'observer', 'shutdown');
    const closing = app.close(); const result = await accepted; await closing;
    assert.equal(result.cycle.status, 'completed'); assert.equal(store.cycles(agent.id).length, 1);
    await assert.rejects(app.message(agent.id, 'An input after shutdown.'), /closing/);
  } finally { await app.close(); store.close(); }
});


test('late activation assessment completion cannot replace a newer measured activation', async () => {
  const store = new SqliteStore(':memory:'); const started = gate(); const finish = gate();
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      if (input.task !== 'disposition_activation') return super.judge(input);
      if (input.world.sequence === 1) { started.release(); await finish.promise; }
      return input.candidates.map(candidate => ({ partId: candidate.id, score: input.world.sequence === 1 ? 0 : 1 }));
    }
  }
  const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    store.save('disposition', { id: 'measured', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Measured concern', concern: 'Notice relevant changes',
      scope: 'fixture', cues: ['fixture'], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
    { origin: 'researcher_edit', reason: 'Independent assessment-order regression', sourceIds: [] });
    first = app.message(agent.id, 'An earlier observation.', 'observer', 'measurements'); await started.promise;
    const newer = await app.message(agent.id, 'A newer observation.', 'observer', 'measurements');
    finish.release(); await first;
    const samples = dispositionActivationHistory(store, 'measured');
    assert.deepEqual(samples.map(sample => sample.score), [0, 1]);
    const current = currentDispositionActivation(samples);
    assert.equal(current.latestMeasurement!.cycleId, newer.cycle.id); assert.equal(current.latestMeasurement!.score, 1);
    const recorded = store.eventsByType(agent.id, ['construction.judgment']).filter(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation');
    assert.equal(recorded.at(-1)!.cycleId, store.cycles(agent.id)[0]!.id, 'Older assessment really completed last');
  } finally { finish.release(); await first?.catch(() => {}); await app.close(); store.close(); }
});

test('waiting for one Agent inference does not wait for another Agent running thought', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const started = gate(); const finish = gate(); let blockedAgent = '';
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition' && input.agentId === blockedAgent) { started.release(); await finish.promise; } return super.constructed(input); }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  let blocked: ReturnType<Application['message']> | undefined;
  try {
    const ready = app.createAgent(); const other = app.createAgent(); blockedAgent = other.id;
    await app.message(ready.id, 'An ordinary observation.');
    blocked = app.message(other.id, 'A slow ordinary observation.'); await started.promise;
    const result = await Promise.race([app.waitForInference(ready.id).then(() => 'ready'), new Promise<string>(resolve => setTimeout(() => resolve('blocked'), 100))]);
    assert.equal(result, 'ready'); assert.equal(store.cycles(other.id)[0]!.status, 'running');
    finish.release(); await blocked;
  } finally { finish.release(); await blocked?.catch(() => {}); await app.close(); store.close(); }
});

test('available bids reach serialized Self while prediction reflection remains in flight', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const reflecting = gate(); const finish = gate(); const selected = gate();
  class Decisions extends MockDecisions {
    override async checkPrediction(): Promise<'correct'> { return 'correct'; }
    override async choose(context: Parameters<MockDecisions['choose']>[0]) {
      const bid = context.contributions.find(contribution => contribution.bid)?.bid;
      return bid ? { choice: bid.id, explanation: 'Explicit available-bid transport fixture', identityConflict: '' } : super.choose(context);
    }
  }
  class Reasoning extends MockReasoning {
    override async evaluate(...args: Parameters<MockReasoning['evaluate']>) { reflecting.release(); await finish.promise; return super.evaluate(...args); }
  }
  const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
  let second: ReturnType<Application['message']> | undefined; let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about a personal question.', 'observer', 'learning');
    assert.ok(store.list('prediction', agent.id).some(prediction => prediction.status === 'open'));
    app.inspection.subscribe(event => { if (event.type === 'self.commitment' && event.cycleId && store.cycle(event.cycleId).sequence === 2) selected.release(); });
    second = app.message(agent.id, 'A reassuring answer is reported.', 'observer', 'learning');
    await reflecting.promise;
    const chose = await Promise.race([selected.promise.then(() => true), new Promise<boolean>(resolve => { deadline = setTimeout(() => resolve(false), 2000); })]);
    assert.equal(chose, true, 'Slow owning prediction reflection must not hold up an available Self choice');
    assert.equal(store.cycles(agent.id)[1]!.status, 'running', 'Source still drains admitted learning after choice');
    finish.release(); await second;
    assert.ok(store.list('prediction', agent.id).some(prediction => prediction.status === 'resolved'));
  } finally { if (deadline) clearTimeout(deadline); finish.release(); await second?.catch(() => {}); await app.close(); store.close(); }
});

test('late prediction formation cannot receive credit from observations already admitted during its thought', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const started = gate(); const finish = gate(); const checked: Parameters<MockDecisions['checkPrediction']>[0][] = [];
  class Decisions extends MockDecisions {
    override async checkPrediction(context: Parameters<MockDecisions['checkPrediction']>[0]): Promise<'incomplete'> { checked.push(context); return 'incomplete'; }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition' && input.world?.sequence === 1) { started.release(); await finish.promise; } return super.constructed(input); }
  }
  const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
  let first: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    first = app.message(agent.id, 'I am uncertain about a personal question.', 'observer', 'frontier'); await started.promise;
    const alreadyObserved = await app.message(agent.id, 'The result has already been reported.', 'observer', 'frontier');
    finish.release(); const source = await first;
    const prediction = store.list('prediction', agent.id)[0]!; assert.ok(prediction);
    assert.equal(prediction.createdCycle, source.cycle.id); assert.equal(prediction.committedAfterSequence, alreadyObserved.cycle.sequence);
    assert.equal(checked.length, 0);
    const later = await app.message(agent.id, 'A clock ticks after that report.', 'observer', 'frontier');
    assert.equal(checked.length, 1);
    assert.ok(checked[0]!.laterEvidence.every(fact => fact.originCycleId === later.cycle.id));
    assert.deepEqual(checked[0]!.world.facts, checked[0]!.laterEvidence);
    assert.ok(store.world(later.cycle.worldId!).facts.some(fact => fact.originCycleId === alreadyObserved.cycle.id), 'Ordinary experience retains its full chronology');
  } finally { finish.release(); await first?.catch(() => {}); await app.close(); store.close(); }
});

test('unselected prediction outcome still receives ordinary reflection and subjective memory', async () => {
  // Deterministic branch coverage, not validation of a psychological learning hypothesis.
  const store = new SqliteStore(':memory:');
  class Decisions extends MockDecisions {
    override async choose(context: Parameters<MockDecisions['choose']>[0]) { return { choice: (context.completedDeliberationRounds ?? 0) >= 2 ? 'NOTHING' : 'DELIBERATE', explanation: 'Explicit no-selection plumbing fixture', identityConflict: '' }; }
    override async checkPrediction(): Promise<'incorrect'> { return 'incorrect'; }
  }
  const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const source = await app.message(agent.id, 'I am uncertain about a personal question.', 'observer', 'unselected');
    const prediction = store.list('prediction', agent.id)[0]!; assert.ok(prediction);
    assert.equal(source.cycle.selectedBidIds?.length ?? 0, 0);
    await app.message(agent.id, 'An independently reported contrary result arrives.', 'observer', 'unselected');
    const resolved = store.get('prediction', prediction.id);
    assert.equal(resolved.status, 'resolved'); assert.ok(resolved.memoryId);
    assert.equal(store.get('memory', resolved.memoryId!).predictionId, prediction.id);
    assert.equal(resolved.cognitionOrigin!.thoughtEventId, prediction.cognitionOrigin!.thoughtEventId);
  } finally { await app.close(); store.close(); }
});

test('later evidence reaches prediction judgment when all disposition generation is busy', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const thinking = gate(); const release = gate(); const checked = gate(); let generations = 0;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && ++generations === 2) { thinking.release(); await release.promise; }
      return super.constructed(input);
    }
  }
  class Decisions extends MockDecisions {
    override async checkPrediction() { checked.release(); return 'incomplete' as const; }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  let pending: ReturnType<Application['message']> | undefined;
  try {
    const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about a personal question.', 'observer', 'busy-learning');
    const prediction = store.list('prediction', agent.id)[0]!; assert.ok(prediction);
    pending = app.message(agent.id, 'A second observation begins thought.', 'observer', 'busy-learning');
    await thinking.promise;
    const evidence = await app.message(agent.id, 'A later independent report arrives while that scope is busy.', 'observer', 'busy-learning');
    await checked.promise;
    assert.equal(generations, 2, 'The third observation cannot duplicate the busy scope');
    assert.ok(store.eventsByType(agent.id, ['prediction.outcome_checked'], [evidence.cycle.id]).some(event => event.type === 'prediction.outcome_checked' && event.payload.predictionId === prediction.id));
    assert.equal(store.eventsByType(agent.id, ['part.thought'], [evidence.cycle.id]).length, 0);
    release.release(); await pending;
  } finally { release.release(); await pending?.catch(() => {}); await app.close(); store.close(); }
});

test('overlapping activation assessments recheck busy admission and preserve one scope owner', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:'); const bothScoring = gate(); const releaseScores = gate(); const thinking = gate(); const releaseThought = gate();
  let scores = 0; const owners: (string | null)[] = [];
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      if (input.task === 'disposition_activation') { if (++scores === 2) bothScoring.release(); await releaseScores.promise; return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
      return super.judge(input);
    }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition') {
        owners.push(input.workingParts?.[0]?.id ?? null);
        if (owners.length === 1) { thinking.release(); await releaseThought.promise; }
      }
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const tasks: ReturnType<Application['message']>[] = [];
  try {
    const agent = app.createAgent();
    store.save('disposition', { id: 'scope', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Concerned curiosity', concern: 'Understand changes', scope: 'changes', cues: ['change'], prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Admission race fixture', sourceIds: [] });
    tasks.push(app.message(agent.id, 'An initial change.', 'observer', 'race'), app.message(agent.id, 'Another change arrives.', 'observer', 'race'));
    await bothScoring.promise; releaseScores.release(); await thinking.promise; releaseThought.release(); await Promise.all(tasks);
    assert.equal(owners.length, 1, 'The second assessment cannot admit another generation once the first job starts'); assert.equal(owners[0], null);
    const instances = store.list('part', agent.id).filter(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'scope'));
    assert.equal(instances.length, 1);
    assert.ok(store.eventsByType(agent.id, ['construction.admission']).some(event => event.type === 'construction.admission' && event.payload.scopes.some(scope => scope.dispositionId === 'scope' && scope.status === 'busy')));
    assert.equal(instances[0]!.instance!.retirement, null);
  } finally { releaseScores.release(); releaseThought.release(); await Promise.allSettled(tasks); await app.close(); store.close(); }
});

// Deterministic race fixture: validates version ownership, not a psychological hypothesis.
test('coverage discards a stale gap adjustment when outcome evaluation commits during inference', { timeout: 20000 }, async () => {
  const store = new SqliteStore(':memory:');
  const coverageStarted = gate(); const evaluationCommitted = gate();
  class Decisions extends MockDecisions {
    override async checkHypothesis(): Promise<'irrelevant'> { await coverageStarted.promise; return 'irrelevant'; }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'cognition_coverage') {
        const prediction = input.predictions?.find(prediction => prediction.gapOrigin && prediction.status === 'open');
        if (prediction) {
          coverageStarted.release(); await evaluationCommitted.promise;
          return { operation: 'SUFFICIENT', reason: 'Explicit concurrent-update plumbing fixture',
            adjustments: [{ predictionId: prediction.id, operation: 'abandon', revision: null, reason: 'Stale coverage proposal' }] };
        }
      }
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'A first signal.', 'observer', 'race'); await app.runtime.idle(agent.id);
    const hypothesis = app.runtime.predictions.formGap(store.world(first.cycle.worldId), {
      expectation: 'A later signal may clarify the source.', confidence: 0.5, horizon: 'After another observation', evaluateAfterCycle: first.cycle.sequence + 1,
      capsule: { interpretation: 'The source is unclear', details: ['First signal'], entities: ['source'], activation: 0, spike: 0, sourceIds: [first.cycle.worldId] },
    }, { threadId: 'race', gap: 'Unknown signal source', consequentialValue: 'Clarify source', futureInference: {
      prediction: 'Clarify expectation', retrieval: 'Recall evidence', causal: 'Distinguish sources', action: 'Seek evidence', compression: 'Preserve distinction' }, existingStructureInsufficient: 'Explicit fixture gap' });
    app.inspection.subscribe(event => { if (event.type === 'prediction.evaluation' && event.payload.prediction.id === hypothesis.id) evaluationCommitted.release(); });
    const second = await app.message(agent.id, 'A later signal.', 'observer', 'race'); await app.runtime.idle(agent.id);
    assert.equal(second.cycle.status, 'completed');
    assert.equal(store.get('prediction', hypothesis.id).status, 'invalidated');
    assert.equal(store.get('prediction', hypothesis.id).version, 2);
    const discarded = store.eventsByType(agent.id, ['prediction.update_discarded'], [second.cycle.id]);
    assert.ok(discarded.some(event => event.type === 'prediction.update_discarded' && event.payload.predictionId === hypothesis.id && event.payload.expectedVersion === 1 && event.payload.currentVersion === 2));
    assert.equal(store.eventsByType(agent.id, ['infrastructure.error'], [second.cycle.id]).length, 0);
  } finally { coverageStarted.release(); evaluationCommitted.release(); await app.close(); store.close(); }
});
