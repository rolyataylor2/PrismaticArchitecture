import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { partProposalSchema } from '../../packages/providers/src/deliberation-schema.js';
import { strictOutputSchema } from '../../packages/providers/src/openai.js';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

test('Part inquiry wire schemas restrict first-pass and replacement targets to public available IDs', () => {
  const schemas = partProposalSchema({ part: { id: 'owner' }, availableContributors: [{ partId: 'owner' }, { partId: 'actual_boundary_id' }] });
  const proposal = { type: 'deliberate', action: null, target_parts: ['actual_boundary_id'], question: 'What concerns you?', argument: 'I need clarification.', identityFit: [], executionOrder: [] };
  const cognition = { interpretation: 'I am unsure.', thought: 'I want clarification.', evidenceSummary: [], proposal };
  assert.ok(schemas.cognition.safeParse(cognition).success);
  for (const target_parts of [['boundary'], ['missing'], ['owner', 'owner']]) {
    assert.equal(schemas.cognition.safeParse({ ...cognition, proposal: { ...proposal, target_parts } }).success, false);
    assert.equal(schemas.answer.safeParse({ response: 'I want clarification.', bid_disposition: 'replace', new_bid: { ...proposal, target_parts } }).success, false);
  }
  for (const schema of [schemas.cognition, schemas.answer]) {
    const wire = JSON.stringify(strictOutputSchema(z.toJSONSchema(schema)));
    assert.ok(wire.includes('actual_boundary_id')); assert.ok(wire.includes('enum'));
  }
  assert.equal(partProposalSchema({ part: { id: 'owner' } }).cognition.safeParse(cognition).success, false);
});

test('Parts can address another active contributor using the directory, without private state sharing', async () => {
  const store = new SqliteStore(':memory:'); let answered = false;
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) { return [...input.candidates.map(p => ({ partId: p.id, score: 4 })), ...(input.primitives ?? []).map(p => ({ partId: p.id, score: 0 }))]; }
    override async choose(context: SelfContext) { return { choice: context.completedDeliberationRounds === 0 ? context.contributions[0]!.bid!.id : context.contributions.find(c => c.bid?.type !== 'deliberate' && c.bid)!.bid!.id, explanation: 'Fixture choice', identityConflict: '' }; }
  }
  class Reasoning extends MockReasoning {
    override async cognize(context: Parameters<MockReasoning['cognize']>[0]) {
      const result = await super.cognize(context);
      for (const entry of context.availableContributors!) assert.deepEqual(Object.keys(entry).sort(), ['name', 'partId']);
      if (context.part.id === context.availableContributors![0]!.partId) result.proposal = { type: 'deliberate', action: null, target_parts: [context.availableContributors![1]!.partId], question: 'Clarify your concern.', argument: 'I need your perspective.', identityFit: [], executionOrder: [] };
      else result.proposal = { action: { kind: 'say', text: 'I can respond.' }, argument: 'I want to answer.', identityFit: [], executionOrder: [] };
      return result;
    }
    override async answer(context: Parameters<MockReasoning['answer']>[0]) {
      answered = true; assert.ok(context.availableContributors!.some(c => c.partId === context.part.id));
      return { response: 'Here is my concern.', bid_disposition: 'retain' as const, new_bid: null };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'I feel uncertain.'); assert.ok(result.execution); assert.equal(answered, true);
  } finally { store.close(); }
});
