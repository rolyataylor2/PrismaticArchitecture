import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { JevHttpTransport } from '../../packages/providers/src/jev-http.js';
import type { ActivationInput, PartContext } from '../../packages/core/src/contracts.js';
import { effectivePrimitive, primitiveSensitivities, type PrimitiveContext, type PrimitiveSettings } from '../../packages/core/src/primitives.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { ConsolidationContext } from '../../packages/core/src/consolidation-domain.js';

test('one Jev Score request appraises all primitives alongside Parts, independent thresholds surface both, and Self stays world-blind', async () => {
  const store = new SqliteStore(':memory:');
  const requests: { state: string; questions: Record<string, { type: string; instructions: string; criteria: string[] }> }[] = [];
  const partInputs: PartContext[] = []; const primitiveInputs: PrimitiveContext[] = []; const selfInputs: SelfContext[] = [];
  const transport = new JevHttpTransport('test-only', undefined, async (_url, init) => {
    const request = JSON.parse(String(init!.body)) as typeof requests[number]; requests.push(request);
    return Response.json({ answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
      const score = key === 'primitive_2' || key === 'primitive_4' ? 4 : key === 'primitive_8' ? 2 : key.startsWith('primitive_') ? 1 : 3;
      return [key, { type: 'score', score, confidence: 1, legend: Object.fromEntries(question.criteria.map((label, index) => [index, label])),
        probabilities: Object.fromEntries(question.criteria.map((_label, index) => [index, index === score ? 1 : 0])) }];
    })) });
  });
  class Decisions extends JevDecisions {
    override async shouldPredict() { return false; }
    override async choose(context: SelfContext) { selfInputs.push(context); return { choice: context.contributions[0]!.bid!.id, explanation: 'Use available bid', identityConflict: '' }; }
  }
  class Reasoning extends MockReasoning {
    override async cognize(context: PartContext) { partInputs.push(context); return super.cognize(context); }
    override async primitive(context: PrimitiveContext) { primitiveInputs.push(context); return super.primitive(context); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(transport), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    await api(app, 'POST', `/api/agents/${agent.id}/identity/traits`, { expectedVersion: store.get('identity', agent.id).version, question: 'What is my novelty sensitivity?', answer: 'I am highly sensitive to novelty.', keywords: ['novelty_sensitivity'], role: 'self_definition' });
    await api(app, 'POST', `/api/agents/${agent.id}/identity/traits`, { expectedVersion: store.get('identity', agent.id).version, question: 'My negative reactivity background?', answer: 'BIOGRAPHY_SENTINEL', keywords: ['negative_reactivity'], role: 'autobiographical' });
    const configuration = store.primitiveSettings(agent.id);
    store.savePrimitiveSettings(agent.id, { ...structuredClone(configuration), revision: 1,
      items: configuration.items.map(item => item.id === 'primitive_8' ? { ...item, activationThreshold: 3 } : item) }, 0);
    const first = await app.message(agent.id, 'Jenna suddenly screams and throws something.');
    assert.equal(requests.length, 1);
    assert.equal(Object.keys(requests[0]!.questions).length, store.list('part', agent.id).length + 13);
    assert.ok(Object.values(requests[0]!.questions).every(question => question.type === 'score' && question.criteria.length === 5));
    assert.match(requests[0]!.state, /highly sensitive to novelty/); assert.doesNotMatch(requests[0]!.state, /BIOGRAPHY_SENTINEL/);
    assert.match(requests[0]!.questions.primitive_2!.instructions, /Do not use learned Part beliefs/);
    const partQuestion = Object.entries(requests[0]!.questions).find(([key]) => !key.startsWith('primitive_'))![1];
    assert.match(partQuestion.instructions, /Identity alignment/); assert.match(partQuestion.instructions, /Do not discount young Parts/);
    assert.equal(primitiveInputs.length, 2); assert.equal(partInputs.length, store.list('part', agent.id).length);
    for (const input of [...partInputs, ...primitiveInputs]) assert.equal(input.world, partInputs[0]!.world);
    for (const input of primitiveInputs) assert.deepEqual(Object.keys(input).sort(), ['primitive', 'world']);
    const context = selfInputs[0]!;
    assert.deepEqual(Object.keys(context).sort(), ['completedDeliberationRounds', 'contributionHistory', 'contributions', 'deliberation', 'identity', 'inquiries']);
    assert.ok(context.contributions.some(contribution => contribution.sourceKind === 'primitive'));
    assert.ok(context.contributions.some(contribution => contribution.sourceKind !== 'primitive'));
    assert.equal(context.contributions.filter(contribution => contribution.sourceKind === 'primitive').length, 2);
    assert.ok(context.contributions.filter(contribution => contribution.sourceKind === 'primitive').every(contribution => contribution.prediction === null));
    const scored = store.events(agent.id).find(event => event.type === 'activation.scored');
    assert.ok(scored?.type === 'activation.scored');
    assert.equal(scored.payload.primitives!.length, 13);
    assert.equal(scored.payload.primitives!.find(score => score.primitiveId === 'primitive_8')!.active, false);
    assert.equal(scored.payload.primitives!.filter(score => score.score === 4).length, 2);
    assert.equal(store.list('prediction', agent.id).length, 0); assert.equal(store.list('memory', agent.id).length, 0);
    await app.message(agent.id, 'A later abrupt event.', 'User', 'other-thread');
    const secondThread = store.events(agent.id).filter(event => event.type === 'activation.scored').at(-1)!;
    assert.ok(secondThread.type === 'activation.scored'); assert.ok(secondThread.payload.primitives!.every(score => score.previous === 0));
    await app.message(agent.id, 'Another abrupt event.');
    const last = store.events(agent.id).filter(event => event.type === 'activation.scored').at(-1)!;
    assert.ok(last.type === 'activation.scored'); assert.equal(last.payload.primitives!.find(score => score.primitiveId === 'primitive_2')!.previous, 4);
    assert.equal(first.cycle.status, 'completed');
  } finally { store.close(); }
});

test('all appraisals can remain implicit, including on an Agent with no active Parts', async () => {
  const store = new SqliteStore(':memory:'); let calls = 0;
  class Decisions extends MockDecisions {
    override async score(input: ActivationInput) { calls++; assert.equal(input.candidates.length, 0); assert.equal(input.primitives!.length, 13); return input.primitives!.map(primitive => ({ partId: primitive.id, score: 1 })); }
  }
  class Reasoning extends MockReasoning { override async primitive(): Promise<never> { throw new Error('Implicit appraisals must not speak'); } }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() }); const agent = app.createAgent();
    for (const part of store.list('part', agent.id)) app.runtime.mutations.patch(part.id, part.version, { lifecycle: 'archived' }, { origin: 'researcher_edit', reason: 'Empty active population', sourceIds: [] });
    const result = await app.message(agent.id, 'Quiet context.');
    assert.equal(calls, 1); assert.equal(result.execution, null); assert.equal(result.cycle.status, 'completed');
    assert.equal(store.events(agent.id).some(event => event.type === 'primitive.thought'), false);
  } finally { store.close(); }
});

test('missing, duplicated or foreign primitive activation scores fail instead of silently dropping appraisals', async () => {
  for (const variant of ['missing', 'duplicate', 'foreign']) {
    const store = new SqliteStore(':memory:');
    class Decisions extends MockDecisions {
      override async score(input: ActivationInput) {
        const scores = [...input.candidates, ...input.primitives!].map(candidate => ({ partId: candidate.id, score: 3 }));
        if (variant === 'missing') scores.pop(); else scores[scores.length - 1] = { partId: variant === 'duplicate' ? scores[0]!.partId : 'foreign_primitive', score: 3 };
        return scores;
      }
    }
    try {
      const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() }); const agent = app.createAgent();
      await assert.rejects(app.message(agent.id, 'Some stimulation.'), /every Part and primitive/);
      assert.equal(store.events(agent.id).some(event => event.type === 'primitive.thought'), false);
      assert.equal(store.cycles(agent.id)[0]!.status, 'failed');
    } finally { store.close(); }
  }
});

test('old primitive configuration projects activation defaults without rewriting saved definitions', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent(); const settings = store.primitiveSettings(agent.id);
    const legacy = { ...settings, revision: 1, items: settings.items.map(({ activationPrompt: _prompt, activationThreshold: _threshold, family: _family, ...item }) => ({ ...item, thoughtPrompt: 'Preserve my old customized thought prompt.' })) };
    store.savePrimitiveSettings(agent.id, legacy, 0);
    const projected = await api(app, 'GET', `/api/agents/${agent.id}/primitives`) as PrimitiveSettings;
    assert.equal(projected.items[0]!.activationThreshold, 2); assert.ok(projected.items[0]!.activationPrompt);
    assert.equal(projected.items[0]!.thoughtPrompt, 'Preserve my old customized thought prompt.');
    assert.deepEqual(store.primitiveSettings(agent.id), legacy);
    assert.equal(effectivePrimitive(projected.items[5]!).family, 'action_tendency');
    assert.equal(primitiveSensitivities(store.get('identity', agent.id)).length, 0);
  } finally { store.close(); }
});

test('concurrent primitive disagreement reaches owning-Part consolidation as subjective traces without primitive lifecycle', async () => {
  const store = new SqliteStore(':memory:'); const contexts: ConsolidationContext[] = [];
  class Decisions extends MockDecisions {
    override async score(input: ActivationInput) { return [...input.candidates.map(part => ({ partId: part.id, score: 3 })), ...input.primitives!.map(primitive => ({ partId: primitive.id, score: primitive.id === 'primitive_4' ? 4 : 0 }))]; }
    override async shouldPredict() { return false; }
  }
  class Reasoning extends MockReasoning {
    override async consolidate(context: ConsolidationContext) { contexts.push(context); return { proposals: [{ kind: 'no_change' as const, reason: 'Reaction alone does not justify rewriting my learned model.' }] }; }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() }); const agent = app.createAgent();
    store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false }); const before = store.list('part', agent.id);
    await app.message(agent.id, 'Jenna suddenly throws something.'); await app.consolidation.run(agent.id);
    assert.ok(contexts.length); assert.ok(contexts.every(context => context.primitiveAppraisals!.length === 13));
    assert.ok(contexts.every(context => context.primitiveAppraisals!.some(trace => trace.name === 'Aversive' && trace.thought && trace.score === 4)));
    assert.deepEqual(store.list('part', agent.id), before); assert.equal(store.list('memory', agent.id).length, 0);
    assert.ok(contexts.every(context => !context.part.id.startsWith('primitive_')));
  } finally { store.close(); }
});

test('shared activation and world-blind Self factory templates render mixed contributors and legacy contexts', async () => {
  const { renderTaskPrompt } = await import('../../packages/providers/src/prompts.js');
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const result = await app.message(agent.id, 'A new person suddenly smiles and screams.');
    const world = store.world(result.cycle.worldId);
    const legacy = renderTaskPrompt(agent.id, 'activation', { world, candidates: [] });
    assert.match(legacy, /No primitive definitions supplied/);
    const self = store.events(agent.id).find(event => event.type === 'self.arbitration_started');
    assert.ok(self?.type === 'self.arbitration_started');
    const rendered = renderTaskPrompt(agent.id, 'arbitration', { ...self.payload, choices: [...self.payload.contributions.flatMap(contribution => contribution.bid ? [contribution.bid.id] : []), 'DELIBERATE'] });
    assert.match(rendered, /primitive/i); assert.match(rendered, /part/i); assert.doesNotMatch(rendered, /World snapshot/);
    assert.doesNotMatch(rendered, /Previously selected ongoing intention/);
    const review = renderTaskPrompt(agent.id, 'arbitration', { ...self.payload, choices: ['CONTINUE_EXECUTION'],
      ongoingActivity: { executionId: 'fixture-activity', goal: 'Preserve the selected activity', successCriteria: 'Independent check', constraints: ['Read only'] } });
    assert.match(review, /Previously selected ongoing intention/); assert.match(review, /CONTINUE_EXECUTION exclusively/);
    assert.doesNotMatch(review, /World snapshot/);
  } finally { store.close(); }
});
