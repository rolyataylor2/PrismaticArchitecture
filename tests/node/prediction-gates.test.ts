import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { InfrastructureError, type DecisionProvider, type ReasoningProvider } from '../../packages/core/src/contracts.js';
import { promptCatalog } from '../../packages/providers/src/prompts.js';
import { promptInspection } from '../../packages/providers/src/prompt-inspection.js';
import type { PredictionOutcome } from '../../packages/core/src/domain.js';

for (const outcome of ['correct', 'incorrect', 'incomplete', 'irrelevant'] as const) {
  test(`prediction outcome ${outcome} controls reflection and preserves history`, async () => {
    const store = new SqliteStore(':memory:');
    let generated = 0; let reflected = 0; let permitted = true;
    const cognitionWorlds = new Map<string, unknown>();
    class Decisions extends MockDecisions {
      override async shouldPredict(context: Parameters<DecisionProvider['shouldPredict']>[0]) {
        assert.equal(context.prediction, null);
        assert.equal(context.world, cognitionWorlds.get(context.part.id));
        assert.equal('prediction' in context.cognition, false);
        return permitted && super.shouldPredict(context);
      }
      override async checkPrediction(): Promise<PredictionOutcome> { return outcome; }
    }
    class Reasoning extends MockReasoning {
      override async cognize(context: Parameters<ReasoningProvider['cognize']>[0]) {
        cognitionWorlds.set(context.part.id, context.world); return super.cognize(context);
      }
      override async predict(context: Parameters<ReasoningProvider['predict']>[0]) {
        generated++; assert.equal(context.world, cognitionWorlds.get(context.part.id));
        assert.ok(Object.isFrozen(context.world));
        assert.ok(context.memories.every(memory => memory.partId === context.part.id));
        return super.predict(context);
      }
      override async evaluate(context: Parameters<ReasoningProvider['evaluate']>[0]) {
        reflected++; assert.equal(context.outcome, outcome); return super.evaluate(context);
      }
    }
    try {
      const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
      const agent = app.createAgent();
      await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
      assert.equal(generated, 1);
      const prediction = store.list('prediction', agent.id)[0]!;
      assert.equal(prediction.confidence, 1);
      permitted = false;
      await app.message(agent.id, outcome === 'correct' ? 'I reject you, go away.' : 'Thank you; I respect you and am glad you told me.');
      assert.equal(generated, 1);
      assert.equal(reflected, ['correct', 'incorrect'].includes(outcome) ? 1 : 0);
      const current = store.get('prediction', prediction.id);
      assert.equal(store.get('part', prediction.partId!).beliefConfidence, outcome === 'incorrect' ? 11950 / 12000 : 1);
      assert.equal(current.confidence, 1);
      assert.equal(current.status, outcome === 'incomplete' ? 'open' : outcome === 'irrelevant' ? 'invalidated' : 'resolved');
      assert.equal(store.versions('prediction', prediction.id).length, outcome === 'incomplete' ? 1 : 2);
      assert.equal(store.versions('prediction', prediction.id)[0]!.state.expectation, prediction.expectation);
      if (outcome === 'incomplete' || outcome === 'irrelevant') assert.equal(current.memoryId, null);
      assert.ok(store.events(agent.id).some(event => event.type === 'prediction.outcome_checked' && event.payload.outcome === outcome));
    } finally { store.close(); }
  });
}

test('a no gate skips generation and outcome-provider failure preserves an open prediction', async () => {
  const store = new SqliteStore(':memory:'); let allowed = false; let generated = 0;
  class Decisions extends MockDecisions {
    override async shouldPredict(context: Parameters<DecisionProvider['shouldPredict']>[0]) { return allowed && super.shouldPredict(context); }
    override async checkPrediction(): Promise<PredictionOutcome> { throw new InfrastructureError('provider', 'Outcome service unavailable'); }
  }
  class Reasoning extends MockReasoning {
    override async predict(context: Parameters<ReasoningProvider['predict']>[0]) { generated++; return super.predict(context); }
    override async evaluate(): ReturnType<ReasoningProvider['evaluate']> { throw new Error('Reflection must not run'); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
    assert.equal(generated, 0); assert.equal(store.list('prediction', agent.id).length, 0);
    allowed = true;
    await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
    assert.equal(generated, 1);
    const result = await app.message(agent.id, 'Thank you; I respect you.');
    assert.equal(result.cycle.status, 'completed');
    assert.equal(store.list('prediction', agent.id)[0]!.status, 'open');
    assert.equal(store.get('part', store.list('prediction', agent.id)[0]!.partId!).beliefConfidence, 1);
    assert.ok(store.events(agent.id).some(event => event.type === 'infrastructure.error' && event.payload.stage === 'prediction_evaluation'));
  } finally { store.close(); }
});

test('Jev gates map bounded choices to boolean and outcome without cognitive authority', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
    const event = store.events(agent.id).find(event => event.type === 'part.thought');
    assert.ok(event?.type === 'part.thought');
    const context = { part: event.payload.partSnapshot, world: store.world(event.cycleId ? store.cycle(event.cycleId).worldId : ''),
      activation: { partId: event.payload.partId, score: 3, previous: 0, delta: 3, similarity: 1, active: true, reasons: [] }, memories: [], prediction: null, cognition: event.payload.output };
    let choice = 'yes'; let calls = 0;
    const provider = new JevDecisions({ async scores() { throw new Error('Unexpected activation'); }, async choice(request) {
      calls++; assert.ok(request.choices.includes(choice)); return { choice, explanation: 'Bounded fixture result', identityConflict: '' };
    } });
    assert.equal(await provider.shouldPredict(context), true);
    choice = 'no'; assert.equal(await provider.shouldPredict(context), false);
    const prediction = store.list('prediction', agent.id)[0]!;
    assert.equal(await provider.shouldPredict({ ...context, prediction }), false); assert.equal(calls, 2);
    for (const outcome of ['correct', 'incorrect', 'incomplete', 'irrelevant']) {
      choice = outcome; assert.equal(await provider.checkPrediction({ ...context, prediction, laterEvidence: [] }), outcome);
    }
  } finally { store.close(); }
});

test('prompt catalog groups processes and exposes separate schemas', () => {
  for (const row of promptCatalog) {
    assert.ok(['Cog', 'Mem', 'Slp', 'RFN', 'Identity', 'Exec', 'Researcher'].includes(row.category));
    assert.ok(row.title.startsWith(`${row.category} · `));
    assert.ok(promptInspection[row.task]);
  }
  const schema = promptInspection.cognition!.outputSchema as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(schema.properties).sort(), ['affect', 'beliefs', 'evidenceSummary', 'interpretation', 'localGoal', 'prediction', 'proposal', 'thought']);
  const draft = promptInspection.prediction!.outputSchema as { properties: Record<string, unknown> };
  assert.ok('expectation' in draft.properties); assert.equal('thought' in draft.properties, false);
});

test('outcome evidence excludes facts recorded before prediction formation', async () => {
  const store = new SqliteStore(':memory:'); let checked = false;
  class Decisions extends MockDecisions {
    override async checkPrediction(context: Parameters<DecisionProvider['checkPrediction']>[0]) {
      checked = true;
      assert.ok(context.world.facts.some(fact => fact.text.includes('Thank you')));
      assert.ok(context.laterEvidence.every(fact => !fact.text.includes('Thank you')));
      return super.checkPrediction(context);
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'Thank you. I am afraid of vulnerability and uncertain about a personal question.');
    await app.message(agent.id, 'We have not heard an answer yet.');
    assert.equal(checked, true);
    assert.equal(store.list('prediction', agent.id)[0]!.status, 'open');
    assert.equal(store.get('part', store.list('prediction', agent.id)[0]!.partId!).beliefConfidence, 1);
  } finally { store.close(); }
});
