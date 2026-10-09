import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promptResolver, resetPrompt } from '../../packages/sdk/src/prompt-settings.js';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { DeliberationSchema, DeliberationAnswerSchema, type SelfContext, type Proposal } from '../../packages/core/src/domain.js';
import type { ReasoningProvider } from '../../packages/core/src/contracts.js';
import { strictOutputSchema } from '../../packages/providers/src/openai.js';

class Active extends MockDecisions {
  override async score(input: Parameters<MockDecisions['score']>[0]) {
    return [...input.candidates.map(part => ({ partId: part.id, score: 4 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
  }
  override async shouldPredict() { return false; }
}
const action = (text: string): Proposal => ({ action: { kind: 'say', text }, argument: 'My advocacy.', identityFit: [], executionOrder: [] });

test('ordered inquiry and response wire schemas preserve dependencies and reject inconsistent products', () => {
  const wire = strictOutputSchema(z.toJSONSchema(DeliberationSchema)) as { properties: object };
  assert.deepEqual(Object.keys(wire.properties), ['why_deliberate', 'primary_c', 'secondary_c', 'missing_information', 'target_parts', 'question']);
  const answer = strictOutputSchema(z.toJSONSchema(DeliberationAnswerSchema)) as { properties: object };
  assert.deepEqual(Object.keys(answer.properties), ['response', 'bid_disposition', 'new_bid']);
  const plan = { why_deliberate: 'Need evidence.', primary_c: 'curiosity', secondary_c: null, missing_information: 'Specific observations.', target_parts: ['a'], question: 'What did you notice?' };
  assert.ok(DeliberationSchema.safeParse(plan).success);
  assert.equal(DeliberationSchema.safeParse({ ...plan, secondary_c: 'curiosity' }).success, false);
  assert.equal(DeliberationSchema.safeParse({ ...plan, target_parts: ['a', 'a'] }).success, false);
  for (const [bid_disposition, new_bid] of [['retain', action('new')], ['withdraw', action('new')], ['replace', null]]) {
    assert.equal(DeliberationAnswerSchema.safeParse({ response: 'My answer.', bid_disposition, new_bid }).success, false);
  }
});

test('one response pass retains, replaces or withdraws only participating bids and feeds the same Choice', async () => {
  for (const disposition of ['retain', 'replace', 'withdraw'] as const) {
    const store = new SqliteStore(':memory:'); const inputs: SelfContext[] = [];
    let cognitiveCalls = 0; let answerCalls = 0; let inquiryCalls = 0;
    class Decisions extends Active {
      override async choose(context: SelfContext) {
        inputs.push(context);
        return { choice: inputs.length === 1 ? 'DELIBERATE' : context.contributions.find(c => c.bid)!.bid!.id, explanation: 'Fixture choice.', identityConflict: '' };
      }
    }
    class Reasoning extends MockReasoning {
      override async cognize(context: Parameters<ReasoningProvider['cognize']>[0]) {
        cognitiveCalls++;
        return { ...await super.cognize(context), proposal: action(context.part.id) };
      }
      override async question(context: SelfContext) {
        inquiryCalls++;
        assert.equal('world' in context, false);
        return { ...await super.question(context), target_parts: [context.contributions[0]!.partId] };
      }
      override async answer(context: Parameters<ReasoningProvider['answer']>[0], _question: string): ReturnType<ReasoningProvider['answer']> {
        answerCalls++;
        assert.equal(context.currentBid!.id, inputs[0]!.contributions[0]!.bid!.id);
        assert.ok(Object.isFrozen(context.world));
        assert.ok(context.memories.every(memory => memory.partId === context.part.id));
        return { response: 'New evidence from my perspective.', bid_disposition: disposition, new_bid: disposition === 'replace' ? action('Changed advocacy') : null };
      }
    }
    try {
      const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
      const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
      const result = await app.message(agent.id, 'A factual context.');
      assert.ok(result.execution); assert.equal(inputs.length, 2); assert.equal(inquiryCalls, 1); assert.equal(answerCalls, 1);
      assert.equal(cognitiveCalls, inputs[0]!.contributions.length);
      const before = inputs[0]!.contributions[0]!.bid!; const after = inputs[1]!.contributions[0]!.bid;
      assert.deepEqual(inputs[1]!.contributions.slice(1), inputs[0]!.contributions.slice(1));
      assert.equal(inputs[1]!.deliberation[0]!.answer, 'New evidence from my perspective.');
      if (disposition === 'retain') assert.deepEqual(after, before);
      if (disposition === 'withdraw') assert.equal(after, null);
      if (disposition === 'replace') { assert.notEqual(after!.id, before.id); assert.equal(after!.replacesBidId, before.id); }
      const events = store.events(agent.id);
      assert.equal(events.filter(event => event.type === 'part.bid_created').length, cognitiveCalls + Number(disposition === 'replace'));
      assert.ok(events.some(event => event.type === 'self.deliberation_planned'));
    } finally { store.close(); }
  }
});

test('Part inquiry preserves its question, bypasses Self generation, and replacement inquiry loops to the same selector', async () => {
  const store = new SqliteStore(':memory:'); const inputs: SelfContext[] = []; let answerCalls = 0;
  class Decisions extends Active {
    override async choose(context: SelfContext) {
      inputs.push(context);
      return { choice: context.contributions[0]!.bid!.id, explanation: 'Select the first available bid.', identityConflict: '' };
    }
  }
  class Reasoning extends MockReasoning {
    override async cognize(context: Parameters<ReasoningProvider['cognize']>[0]) {
      return { ...await super.cognize(context), proposal: { type: 'deliberate' as const, action: null,
        target_parts: [context.part.id], question: 'My original inquiry?', argument: 'I need clarification.', identityFit: [], executionOrder: [] } };
    }
    override async question(): Promise<never> { throw new Error('Self must not recreate a Part inquiry'); }
    override async answer(context: Parameters<ReasoningProvider['answer']>[0], question: string): ReturnType<ReasoningProvider['answer']> {
      answerCalls++;
      assert.equal(question, answerCalls === 1 ? 'My original inquiry?' : 'My next inquiry?');
      assert.equal(context.deliberation!.length, answerCalls - 1);
      return { response: 'My answer.', bid_disposition: 'replace', new_bid: answerCalls === 1 ? {
        type: 'deliberate', action: null, target_parts: [context.part.id], question: 'My next inquiry?', argument: 'Still unclear.', identityFit: [], executionOrder: [],
      } : action('Ready to act') };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'An experience.');
    assert.equal(result.execution!.action.text, 'Ready to act'); assert.equal(inputs.length, 3); assert.equal(answerCalls, 2);
    assert.equal(store.events(agent.id).filter(event => event.type === 'execution.handoff').length, 1);
    assert.equal(store.events(agent.id).some(event => event.type === 'self.deliberation_planned'), false);
  } finally { store.close(); }
});

test('invalid inquiry targets fail before any response, without external action or forced selection', async () => {
  const store = new SqliteStore(':memory:'); let answered = false;
  class Decisions extends Active {
    override async choose() { return { choice: 'DELIBERATE', explanation: 'Need information.', identityConflict: '' }; }
  }
  class Reasoning extends MockReasoning {
    override async question(context: SelfContext) { return { ...await super.question(context), target_parts: [context.contributions[0]!.partId, 'missing'] }; }
    override async answer(): Promise<never> { answered = true; throw new Error('Unexpected answer'); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    await assert.rejects(app.message(agent.id, 'An experience.'), /unavailable/);
    assert.equal(answered, false); assert.equal(store.executions(agent.id).length, 0);
  } finally { store.close(); }
});


test('retained internal inquiry respects the round budget without an invented external winner', async () => {
  const store = new SqliteStore(':memory:'); let answered = 0;
  class Decisions extends Active {
    override async choose() { return { choice: 'DELIBERATE', explanation: 'Still uncertain.', identityConflict: '' }; }
  }
  class Reasoning extends MockReasoning {
    override async answer(context: Parameters<ReasoningProvider['answer']>[0], question: string) { answered++; return super.answer(context, question); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'An experience.');
    assert.equal(result.execution, null);
    const choices = store.events(agent.id).filter(event => event.type === 'self.arbitration_started');
    assert.equal(choices.length, 3); assert.ok(answered > 0);
    assert.ok(choices.every(event => event.type === 'self.arbitration_started' && JSON.stringify(event.payload.contributions) === JSON.stringify(choices[0]!.payload.contributions)));
  } finally { store.close(); }
});

test('legacy debate overrides remain readable under deliberation, with current precedence and working reset', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deliberation-compat-')); const path = join(directory, 'state.sqlite');
  const store = new SqliteStore(path);
  try {
    const app = new Application(store); const agent = app.createAgent();
    const db = new DatabaseSync(path);
    try { db.prepare('INSERT INTO prompt_overrides(scope,agent_id,task,body) VALUES(?,?,?,?)').run('agent', agent.id, 'debate', '{{ debate|json_encode }}'); }
    finally { db.close(); }
    const resolve = promptResolver(store);
    assert.equal(resolve(agent.id, 'deliberation'), '{{ debate|json_encode }}');
    const response = { partId: 'a', question: 'Why?', answer: 'My reason.' };
    assert.equal(renderTaskPrompt(agent.id, 'deliberation', { contributions: [], deliberation: [response] }, resolve), JSON.stringify([response]));
    store.savePromptOverride({ scope: 'agent', agentId: agent.id, task: 'deliberation', text: 'Current inquiry.' });
    assert.equal(resolve(agent.id, 'deliberation'), 'Current inquiry.');
    resetPrompt(store, agent.id, 'deliberation', 'agent');
    assert.equal(resolve(agent.id, 'deliberation'), undefined);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('optional post-deliberation activation uses responses, admits new Parts and preserves retained bids', async () => {
  for (const enabled of [false, true]) {
    const store = new SqliteStore(':memory:');
    const scores: Parameters<MockDecisions['score']>[0][] = [];
    const choices: SelfContext[] = [];
    const cognition: Parameters<ReasoningProvider['cognize']>[0][] = [];
    let initial = ''; let newlyActive = ''; let deactivated = '';
    class Decisions extends Active {
      override async score(input: Parameters<MockDecisions['score']>[0]) {
        scores.push(input);
        const later = input.world.thoughtHistory?.some(entry => entry.thought.includes('inquiry response sentinel'));
        return [...input.candidates.map(part => ({ partId: part.id,
          score: part.id === initial || (later ? part.id === newlyActive : part.id === deactivated) ? 4 : 0 })),
          ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
      }
      override async choose(context: SelfContext) {
        choices.push(context);
        return { choice: choices.length === 1 ? 'DELIBERATE' : context.contributions.find(c => c.partId === (enabled ? newlyActive : initial))!.bid!.id,
          explanation: 'Fixture choice.', identityConflict: '' };
      }
    }
    class Reasoning extends MockReasoning {
      override async cognize(context: Parameters<ReasoningProvider['cognize']>[0]) {
        cognition.push(context);
        return { ...await super.cognize(context), proposal: action(context.part.id) };
      }
      override async question(context: SelfContext) {
        return { ...await super.question(context), target_parts: [initial] };
      }
      override async answer(): ReturnType<ReasoningProvider['answer']> {
        return { response: 'inquiry response sentinel', bid_disposition: 'retain', new_bid: null };
      }
    }
    try {
      const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
      const agent = app.createAgent();
      const ids = store.list('part', agent.id).map(part => part.id);
      initial = ids[0]!; newlyActive = ids[1]!; deactivated = ids[2]!;
      assert.ok(initial && newlyActive && deactivated);
      app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false, reevaluateAfterDeliberation: enabled });
      const result = await app.message(agent.id, 'External conversation sentinel');
      assert.equal(result.cycle.status, 'completed');
      assert.equal(scores.length, enabled ? 2 : 1);
      assert.equal(choices[1]!.contributions.find(c => c.partId === initial)!.bid!.id, choices[0]!.contributions.find(c => c.partId === initial)!.bid!.id);
      assert.equal(choices[1]!.contributions.some(c => c.partId === newlyActive), enabled);
      assert.equal(choices[1]!.contributions.some(c => c.partId === deactivated), !enabled);
      assert.ok(choices.every(context => !('world' in context)));
      assert.ok(cognition.every(context => context.memories.every(memory => memory.partId === context.part.id)));
      if (enabled) {
        assert.notEqual(scores[0]!.world.id, scores[1]!.world.id);
        assert.deepEqual(scores[0]!.world.facts, scores[1]!.world.facts);
        assert.equal(scores[0]!.world.thoughtHistory?.some(entry => entry.thought.includes('inquiry response sentinel')), false);
        assert.equal(cognition.find(context => context.part.id === newlyActive)!.world, scores[1]!.world);
        assert.deepEqual(store.world(scores[0]!.world.id), scores[0]!.world);
        assert.deepEqual(store.world(scores[1]!.world.id), scores[1]!.world);
      }
      assert.equal(store.recentFacts(agent.id, null).filter(fact => fact.text === 'External conversation sentinel').length, 1);
      assert.equal(result.execution!.action.text, enabled ? newlyActive : initial);
    } finally { store.close(); }
  }
});
