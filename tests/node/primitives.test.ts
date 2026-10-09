import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from './persistent-fixture.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { defaultPrimitives, effectivePrimitive } from '../../packages/core/src/primitives.js';
import type { PrimitiveContext, PrimitiveSettings } from '../../packages/core/src/primitives.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

class QuietDecisions extends MockDecisions {
  override async score(input: Parameters<MockDecisions['score']>[0]) { return [...input.candidates.map(part => ({ partId: part.id, score: 0 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 3 }))]; }
}
test('surfaced primitive appraisals use bids and existing Self deliberation without Part learning or context leaks', async () => {
  const store = new SqliteStore(':memory:');
  const primitiveInputs: PrimitiveContext[] = []; const selfInputs: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async primitive(context: PrimitiveContext) { primitiveInputs.push(context); return super.primitive(context); }
    override async primitiveAnswer(context: Parameters<MockReasoning['primitiveAnswer']>[0], question: string) { primitiveInputs.push({ world: context.world, primitive: context.primitive, question }); return super.primitiveAnswer(context, question); }
    override async cognize(): Promise<never> { throw new Error('No Part should cognize'); }
    override async predict(): Promise<never> { throw new Error('Primitive cannot predict'); }
  }
  class Decisions extends QuietDecisions {
    override async choose(context: SelfContext) {
      selfInputs.push(context);
      if (!context.deliberation.length) return { choice: 'DELIBERATE', explanation: 'Ask a primitive.', identityConflict: '' };
      return { choice: context.contributions[0]!.bid!.id, explanation: 'Select its basic bid.', identityConflict: '' };
    }
    override async shouldPredict(): Promise<never> { throw new Error('Primitive cannot enter prediction gate'); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); const before = store.list('part', agent.id);
    const result = await app.message(agent.id, 'A person enters and smiles.');
    assert.equal(result.cycle.status, 'completed'); assert.ok(result.execution);
    assert.equal(primitiveInputs.filter(input => !input.question).length, 13);
    assert.ok(primitiveInputs.some(input => input.question));
    for (const input of primitiveInputs) {
      assert.equal(input.world, primitiveInputs[0]!.world);
      assert.ok(Object.isFrozen(input.world));
      assert.deepEqual(Object.keys(input).sort(), input.question ? ['primitive', 'question', 'world'] : ['primitive', 'world']);
      assert.equal('memories' in input, false); assert.equal('prediction' in input, false);
    }
    for (const input of selfInputs) {
      assert.deepEqual(Object.keys(input).sort(), ['completedDeliberationRounds', 'contributionHistory', 'contributions', 'deliberation', 'identity', 'inquiries']);
      assert.ok(input.contributions.every(contribution => contribution.sourceKind === 'primitive' && contribution.prediction === null));
      assert.equal('world' in input, false);
    }
    assert.deepEqual(store.list('part', agent.id), before);
    assert.equal(store.list('memory', agent.id).length, 0); assert.equal(store.list('prediction', agent.id).length, 0);
    assert.ok(store.events(agent.id).some(event => event.type === 'primitive.deliberation_response'));
  } finally { store.close(); }
});
test('low primitive scores stay implicit while Parts activate; activation failure stays failure', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async primitive(): Promise<never> { throw new Error('Unexpected fallback'); }
    override async answer(context: Parameters<MockReasoning['answer']>[0], question: string) { return { ...await super.answer(context, question), bid_disposition: 'withdraw' as const, new_bid: null }; }
    override async cognize(context: Parameters<MockReasoning['cognize']>[0]) { return { ...await super.cognize(context), proposal: null }; }
  }
  class Decisions extends MockDecisions {
    fail = false;
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      if (this.fail) throw new Error('Transport failed');
      return [...input.candidates.map(part => ({ partId: part.id, score: 4 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0.5 }))];
    }
    override async shouldPredict() { return false; }
  }
  try {
    const decisions = new Decisions();
    const app = new Application(store, { reasoning: new Reasoning(), decisions, embeddings: new MockEmbeddings() });
    const agent = app.createAgent(); store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
    const result = await app.message(agent.id, 'Something happens.'); assert.equal(result.execution, null);
    assert.equal(store.events(agent.id).some(event => event.type === 'primitive.thought'), false);
    decisions.fail = true; await assert.rejects(app.message(agent.id, 'Another thing happens.'), /Transport failed/);
    assert.equal(store.events(agent.id).some(event => event.type === 'primitive.thought'), false);
  } finally { store.close(); }
});
test('primitive API creates, edits, resets and persists configuration with stale-write protection', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'primitives-')), 'agent.sqlite');
  let store = new SqliteStore(path);
  let app = new Application(store); const agent = app.createAgent();
  const route = `/api/agents/${agent.id}/primitives`;
  try {
    let settings = await api(app, 'GET', route) as PrimitiveSettings;
    assert.equal(settings.items.length, 13);
    const original = settings.items[0]!;
    const { id: originalId, ...originalDraft } = original;
    settings = await api(app, 'PATCH', `${route}/${originalId}`, { expectedRevision: 0, ...originalDraft, name: 'Edited' }) as PrimitiveSettings;
    assert.equal(settings.items[0]!.name, 'Edited');
    await assert.rejects(api(app, 'POST', `${route}/reset-all`, { expectedRevision: 0 }), /changed/);
    store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.equal(store.primitiveSettings(agent.id).items[0]!.name, 'Edited');
    settings = await api(app, 'POST', `${route}/${original.id}/reset`, { expectedRevision: 1 }) as PrimitiveSettings;
    assert.deepEqual(settings.items[0], original);
    const custom = { name: 'Gentle contact', aspects: ['Simple contact'], thoughtPrompt: 'Think simply.', bidPrompt: 'Ask simply.' };
    settings = await api(app, 'POST', route, { expectedRevision: 2, ...custom }) as PrimitiveSettings;
    const created = settings.items.at(-1)!;
    const { id, ...draft } = created;
    settings = await api(app, 'PATCH', `${route}/${id}`, { expectedRevision: 3, ...draft, name: 'Changed' }) as PrimitiveSettings;
    settings = await api(app, 'POST', `${route}/${id}/reset`, { expectedRevision: 4 }) as PrimitiveSettings;
    assert.deepEqual(settings.items.at(-1), created);
    settings = await api(app, 'POST', `${route}/reset-all`, { expectedRevision: 5 }) as PrimitiveSettings;
    assert.equal(settings.items.length, 13);
    assert.deepEqual(settings.items[0], original);
  } finally { store.close(); }
});

test('new default tendencies surface independently and provide uncertainty speech before world-blind selection', async () => {
  const defaults = defaultPrimitives();
  assert.equal(defaults.filter(item => item.family === 'appraisal').length, 7);
  assert.equal(defaults.filter(item => item.family === 'action_tendency').length, 6);
  assert.deepEqual(defaults.slice(10).map(item => item.name), ['Addressed to me', 'Signal uncertainty', 'Seek information']);
  for (const item of defaults.slice(10)) {
    const { family: _family, ...legacy } = item;
    assert.equal(effectivePrimitive(legacy).family, item.family);
  }
  const store = new SqliteStore(':memory:');
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      return [...input.candidates.map(part => ({ partId: part.id, score: 0 })),
        ...input.primitives!.map(primitive => ({ partId: primitive.id, score: primitive.name === 'Signal uncertainty' ? 4 : 1 }))];
    }
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false);
      assert.equal(context.contributions.length, 1);
      assert.equal(context.contributions[0]!.name, 'Signal uncertainty');
      return { choice: context.contributions[0]!.bid!.id, explanation: 'Select supplied uncertainty speech.', identityConflict: '' };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const result = await app.message(agent.id, 'Do you like cats?');
    assert.equal(result.execution!.action.kind, 'say');
    assert.equal(result.execution!.action.text, 'I do not know yet.');
    assert.equal(store.list('prediction', agent.id).length, 0);
    const information = await new MockReasoning().primitive({ world: store.events(agent.id).find(event => event.type === 'worldstate.frozen')!.payload as PrimitiveContext['world'], primitive: defaults.find(item => item.id === 'primitive_14')! });
    assert.equal(information.proposal!.action!.kind, 'ask');
  } finally { store.close(); }
});

test('disabled primitive bids stay absent in cognition and inquiry even if a provider proposes them', async () => {
  const store = new SqliteStore(':memory:');
  const selfInputs: SelfContext[] = [];
  class Decisions extends QuietDecisions {
    override async choose(context: SelfContext) {
      selfInputs.push(context);
      return { choice: context.deliberation.length ? context.contributions.find(c => c.bid)!.bid!.id : 'DELIBERATE', explanation: 'Inspect contributions.', identityConflict: '' };
    }
  }
  class Reasoning extends MockReasoning {
    override async primitive(context: PrimitiveContext) { return super.primitive({ ...context, primitive: { ...context.primitive, bidsEnabled: true } }); }
    override async question(context: SelfContext) { return { ...await super.question(context), target_parts: ['primitive_11'] }; }
    override async primitiveAnswer(context: Parameters<MockReasoning['primitiveAnswer']>[0], _question: string) {
      const proposal = (await this.primitive(context)).proposal!;
      return { response: 'I register the greeting.', bid_disposition: 'replace' as const, new_bid: proposal };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const settings = store.primitiveSettings(agent.id);
    store.savePrimitiveSettings(agent.id, { ...settings, revision: 1, items: settings.items.map(item => item.id === 'primitive_11' ? { ...item, bidsEnabled: false } : item) }, 0);
    const result = await app.message(agent.id, 'Hello.');
    assert.ok(result.execution);
    for (const input of selfInputs) assert.equal(input.contributions.find(c => c.partId === 'primitive_11')!.bid, null);
    const events = store.events(agent.id);
    const thought = events.find(e => e.type === 'primitive.thought' && e.payload.primitive.id === 'primitive_11');
    assert.ok(thought?.type === 'primitive.thought'); assert.equal(thought.payload.output.proposal, null);
    assert.ok(events.some(e => e.type === 'primitive.deliberation_response' && e.payload.primitiveId === 'primitive_11'));
    assert.equal(events.some(e => e.type === 'primitive.bid_created' && e.payload.partId === 'primitive_11'), false);
  } finally { store.close(); }
});

for (const primitivesFirst of [false, true]) {
  test(`cognition awaits ${primitivesFirst ? 'primitives' : 'Parts'} first while preserving shared snapshot`, async () => {
    const store = new SqliteStore(':memory:');
    const calls: string[] = [];
    const worlds: PrimitiveContext['world'][] = [];
    class Decisions extends MockDecisions {
      override async score(input: Parameters<MockDecisions['score']>[0]) {
        return [...input.candidates.map(part => ({ partId: part.id, score: 4 })),
          ...input.primitives!.map(primitive => ({ partId: primitive.id, score: 4 }))];
      }
      override async shouldPredict() { return false; }
      override async choose(context: SelfContext) {
        return { choice: context.contributions.find(item => item.bid && item.bid.type !== 'deliberate')!.bid!.id, explanation: 'Select an external bid.', identityConflict: '' };
      }
    }
    class Reasoning extends MockReasoning {
      override async cognize(context: Parameters<MockReasoning['cognize']>[0]) {
        calls.push('part.start'); worlds.push(context.world);
        await new Promise(resolve => setTimeout(resolve, 5));
        calls.push('part.end');
        return super.cognize(context);
      }
      override async primitive(context: PrimitiveContext) {
        calls.push('primitive.start'); worlds.push(context.world);
        await new Promise(resolve => setTimeout(resolve, 5));
        calls.push('primitive.end');
        return super.primitive(context);
      }
    }
    try {
      const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
      const agent = app.createAgent();
      store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false, primitivesFirst });
      const result = await app.message(agent.id, 'Someone greets me.');
      assert.equal(result.cycle.status, 'completed');
      const first = primitivesFirst ? 'primitive' : 'part';
      const second = primitivesFirst ? 'part' : 'primitive';
      assert.ok(calls.includes(`${first}.start`) && calls.includes(`${second}.start`));
      assert.ok(calls.lastIndexOf(`${first}.end`) < calls.indexOf(`${second}.start`));
      assert.ok(worlds.every(world => world === worlds[0] && Object.isFrozen(world)));
      assert.equal(worlds[0]!.thoughtHistory?.length ?? 0, 0);
      const events = store.events(agent.id);
      assert.ok(events.findIndex(event => event.type === `${first}.thought`) < events.findIndex(event => event.type === `${second}.thought`));
    } finally { store.close(); }
  });
}
