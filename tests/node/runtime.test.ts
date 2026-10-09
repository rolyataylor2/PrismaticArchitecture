import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { defaultRuntimeOptions } from '../../packages/core/src/runtime.js';
import type { DecisionProvider, PartContext } from '../../packages/core/src/contracts.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

test('complete cycle: identical immutable WorldState, private Part inputs, world-blind arbitration and deliberation', async () => {
  const store = new SqliteStore(':memory:');
  const contexts: PartContext[] = []; const selves: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async cognize(context: PartContext) { contexts.push(context); return super.cognize(context); }
    override async question(context: SelfContext) { selves.push(context); return super.question(context); }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) { selves.push(context); return super.choose(context); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const result = await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question. Secret sentinel 78538.');
    assert.equal(result.cycle.status, 'completed'); assert.ok(result.execution);
    assert.ok(contexts.length >= 2); assert.ok(selves.length >= 3);
    for (const context of contexts) {
      assert.equal(context.world, contexts[0]!.world);
      assert.throws(() => { context.world.facts[0]!.text = 'tampered'; }, TypeError);
      assert.ok(context.memories.every(m => m.partId === context.part.id));
    }
    for (const self of selves) {
      assert.deepEqual(Object.keys(self).sort(), ['completedDeliberationRounds', 'contributionHistory', 'contributions', 'deliberation', 'identity', 'inquiries']);
      assert.equal(JSON.stringify(self).includes('78538'), false);
      assert.equal('store' in self, false);
    }
    const inspection = app.inspectCycle(result.cycle.id);
    assert.ok(inspection.world.facts[0]!.text.includes('78538'));
    assert.ok(inspection.events.some(e => e.type === 'self.deliberation_started'));
    assert.ok(inspection.events.some(e => e.type === 'part.prediction_created'));
    const scored = inspection.events.find(e => e.type === 'activation.scored');
    assert.ok(scored?.type === 'activation.scored');
    assert.ok(scored.payload.results.reduce((n, p) => n + p.score, 0) > 4);
    await app.message(agent.id, 'Thank you for sharing. I respect you and I am glad you told me.');
    assert.ok(store.list('memory', agent.id).length > 0);
    assert.ok(store.list('prediction', agent.id).some(p => p.status === 'resolved' && p.evaluation?.assessment === 'contradicted'));
    assert.ok(store.list('part', agent.id).some(p => p.version > 1));
    assert.ok(store.world(store.cycles(agent.id)[1]!.worldId).facts.some(f => f.kind === 'says'));
  } finally { store.close(); }
});
test('sticky retention is candidate eligibility, independent scoring and policy remain separate', async () => {
  const store = new SqliteStore(':memory:');
  let candidates: string[] = [];
  const decisions: DecisionProvider = {
    label: 'test bounded judgments',
    async shouldPredict() { return false; },
    async checkPrediction() { return 'incomplete'; },
    async score(input) { candidates = input.candidates.map(p => p.id); return [...input.candidates.map(p => ({ partId: p.id, score: 0.2 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))]; },
    async choose() { return { choice: 'DELIBERATE', explanation: 'No proposal is available.', identityConflict: '' }; },
  };
  try {
    const app = new Application(store, { decisions, reasoning: new MockReasoning(), embeddings: new MockEmbeddings() }, undefined,
      { ...defaultRuntimeOptions, activation: { ...defaultRuntimeOptions.activation, vectorThreshold: 1 }, maxDeliberationRounds: 0 });
    const agent = app.createAgent(); const part = store.list('part', agent.id)[0]!;
    app.runtime.mutations.patch(part.id, 1, { stickiness: { retained: true, unresolved: true, concern: 'Unfinished concern' } },
      { origin: 'researcher_edit', reason: 'Stickiness experiment', sourceIds: [] });
    const result = await app.message(agent.id, 'Unrelated weather observation.');
    assert.deepEqual(candidates, [part.id]);
    assert.equal(result.execution, null);
    const event = store.events(agent.id).find(e => e.type === 'activation.scored');
    assert.ok(event?.type === 'activation.scored');
    assert.equal(event.payload.results[0]!.active, false);
    assert.deepEqual(event.payload.results[0]!.reasons, ['sticky_unresolved']);
  } finally { store.close(); }
});
test('invented Self actions and provider failures are infrastructure errors with persisted failed cycles', async () => {
  const store = new SqliteStore(':memory:');
  class Invalid extends MockDecisions {
    override async choose() { return { choice: 'invented_action', explanation: 'Invalid provider choice', identityConflict: '' }; }
  }
  try {
    const app = new Application(store, { decisions: new Invalid(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'personal uncertain question'), /not proposed/);
    assert.equal(store.cycles(agent.id)[0]!.status, 'failed');
    assert.equal(store.executions(agent.id).length, 0);
    assert.ok(store.events(agent.id).some(e => e.type === 'infrastructure.error'));
  } finally { store.close(); }
});
test('concurrent same-Agent inputs are serialized without interleaving or duplicate sequence', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const first = app.message(agent.id, 'personal uncertain question');
    const second = app.message(agent.id, 'overlapping input');
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.cycle.status, 'completed'); assert.equal(b.cycle.status, 'completed');
    assert.deepEqual(store.cycles(agent.id).map(cycle => cycle.sequence), [1, 2]);
    const events = store.events(agent.id);
    const firstEnd = events.find(event => event.cycleId === a.cycle.id && event.type === 'cycle.completed')!;
    const secondStart = events.find(event => event.cycleId === b.cycle.id && event.type === 'cycle.started')!;
    assert.ok(firstEnd.sequence < secondStart.sequence);
    assert.equal(store.world(a.cycle.worldId).facts.some(fact => fact.text === 'overlapping input'), false);
    assert.ok(store.world(b.cycle.worldId).facts.some(fact => fact.text === 'overlapping input'));
  } finally { store.close(); }
});

test('cognition rejects memory, mutation and cues without committing psychology or executing', async () => {
  const store = new SqliteStore(':memory:'); let extra: Record<string, unknown> = {};
  class Reasoning extends MockReasoning {
    override async cognize(context: PartContext) { return { ...await super.cognize(context), ...extra }; }
  }
  try {
    const app = new Application(store, { decisions: new MockDecisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); const original = store.list('part', agent.id);
    for (const field of ['memory', 'mutation', 'cues']) {
      extra = { [field]: field === 'memory' ? { content: 'Must not persist', gist: 'Rejected', context: [] }
        : field === 'mutation' ? { beliefs: ['Must not persist'] } : [{ targetPartId: original[1]!.id, concept: 'Must not propagate' }] };
      await assert.rejects(app.message(agent.id, 'personal uncertain vulnerability'), /Unrecognized key/);
      assert.deepEqual(store.list('part', agent.id), original);
      assert.deepEqual(store.list('memory', agent.id), []);
      assert.deepEqual(store.executions(agent.id), []);
    }
  } finally { store.close(); }
});

test('prediction evaluation persists its result and memory when its optional relationship mutation is rejected', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const { cycle } = await app.message(agent.id, 'personal uncertain vulnerability');
    const world = store.world(cycle.worldId);
    const prediction = store.list('prediction', agent.id).find(p => p.status === 'open')!;
    assert.ok(prediction);
    const before = store.get('part', prediction.partId!);
    const next = app.runtime.predictions.apply(prediction, world, {
      operation: 'resolve', revision: null,
      evaluation: { assessment: 'ambiguous', interpretation: 'I am unsure.', causalAttribution: 'Not enough evidence.', evidence: [], evidenceWorldId: world.id },
      memory: { gist: 'I remember uncertainty.', content: 'I could not determine what happened.', context: [] },
      mutation: { associations: [{ targetPartId: 'user', meaning: 'Seeking connection' }] }, reason: 'I evaluated the evidence.',
    });
    assert.equal(next.status, 'resolved');
    assert.ok(next.memoryId);
    assert.equal(store.get('memory', next.memoryId!).partId, prediction.partId);
    assert.deepEqual(store.get('part', prediction.partId!), before);
    assert.ok(store.events(agent.id).some(e => e.type === 'part.mutation_rejected' && e.payload.change.origin === 'prediction_evaluation'));
    assert.ok(store.events(agent.id).some(e => e.type === 'prediction.evaluation' && e.payload.prediction.id === prediction.id));
  } finally { store.close(); }
});

test('disabling vector filtering skips all embedding calls and independently scores every active Part', async () => {
  const store = new SqliteStore(':memory:');
  let embeddingCalls = 0; let candidates: string[] = [];
  class Embeddings extends MockEmbeddings {
    override async embed(text: string) { embeddingCalls++; return super.embed(text); }
  }
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      candidates = input.candidates.map(p => p.id);
      return [...input.candidates.map((p, index) => ({ partId: p.id, score: index === 0 ? 4 : 0 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new Embeddings() }, undefined,
      { ...defaultRuntimeOptions, activation: { ...defaultRuntimeOptions.activation, vectorThreshold: 1 } });
    const agent = app.createAgent(); const parts = store.list('part', agent.id);
    app.runtime.mutations.patch(parts[parts.length - 1]!.id, 1, { lifecycle: 'dormant' },
      { origin: 'researcher_edit', reason: 'Exclude dormant Parts', sourceIds: [] });
    app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'Unrelated weather observation.');
    assert.equal(result.cycle.status, 'completed');
    assert.equal(embeddingCalls, 0);
    assert.deepEqual(candidates, parts.slice(0, -1).map(p => p.id));
    const event = store.events(agent.id).find(e => e.type === 'activation.scored');
    assert.ok(event?.type === 'activation.scored');
    assert.equal(event.payload.results.filter(r => r.active).length, 1);
    assert.ok(event.payload.results.every(r => r.reasons.includes('vector_disabled')));
    app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: true });
    await app.message(agent.id, 'Another unrelated weather observation.');
    assert.ok(embeddingCalls > 0);
    assert.ok(candidates.length < parts.length - 1);
  } finally { store.close(); }
});


test('prediction learning appends psychology and rejects renaming and mission rewrites', () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const before = store.list('part', agent.id)[0]!;
    const change = { origin: 'prediction_evaluation' as const, reason: 'Subtle learning', sourceIds: [] };
    const next = app.runtime.mutations.patch(before.id, before.version, {
      beliefs: ['I trust this anecdote even if it is false.'],
      strategies: ['I can try a small variation to serve my mission.'],
      cognitiveCharacteristics: ['I feel only a tiny bit less certain.'],
    }, change);
    assert.deepEqual(next.beliefs, [...before.beliefs, 'I trust this anecdote even if it is false.']);
    assert.deepEqual(next.strategies, [...before.strategies, 'I can try a small variation to serve my mission.']);
    assert.deepEqual(next.cognitiveCharacteristics, [...before.cognitiveCharacteristics, 'I feel only a tiny bit less certain.']);
    assert.equal(next.name, before.name); assert.equal(next.mission, before.mission);
    for (const patch of [{ name: 'Changed Name' }, { mission: 'A new mission' }, { emotionalCharge: 'Overwhelmed' }]) {
      assert.throws(() => app.runtime.mutations.patch(next.id, next.version, patch, change), /Prediction learning may only append/);
    }
    const duplicate = app.runtime.mutations.patch(next.id, next.version, { beliefs: next.beliefs }, change);
    assert.equal(duplicate.version, next.version);
    assert.deepEqual(store.versions('part', before.id)[0]!.state.beliefs, before.beliefs);
  } finally { store.close(); }
});
