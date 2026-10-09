import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application as HistoricalApplication } from './persistent-fixture.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { freeze, type SelfContext, type WorldState } from '../../packages/core/src/domain.js';
import type { ConstructedInput, JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { PartGenerationSchema } from '../../packages/core/src/constructed-domain.js';
import type { PartContext } from '../../packages/core/src/contracts.js';
import { api, snapshot } from '../../packages/sdk/src/api.js';
import { prompts } from '../../packages/providers/src/prompts.js';
import { searchMemories } from '../../packages/sdk/src/memory-search.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';

const providers = (reasoning = new MockReasoning(), decisions = new MockDecisions()) => ({ reasoning, decisions, embeddings: new MockEmbeddings() });

test('expressed memory bridges and prediction attention reach later thread cycles without same-cycle descent', async () => {
  const store = new SqliteStore(':memory:'); const requests: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      if (input.dispositions?.[0]?.id === 'social') {
        product.cognition.thought = 'I recall a BBQ where guests brought food; perhaps this gathering is similar.';
        if (product.cognition.prediction) product.cognition.prediction.attention = [{ target: 'outdoor gathering', cues: ['Look for grilling or food contributions; this is an expectation, not an observed fact'] }];
      }
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async checkPrediction(): Promise<'incomplete'> { return 'incomplete'; }
    override async judge(input: JudgmentInput) {
      return input.candidates.map(candidate => ({ partId: candidate.id, score: input.task === 'memory_accessibility' || candidate.id === 'social'
        || candidate.id.startsWith('attention_') || input.world.thoughtHistory?.some(thought => thought.thought.includes('BBQ')) ? 4 : 0 }));
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    for (const id of ['social', 'BBQ']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1,
      name: id, concern: 'Attend to social food gatherings', cues: [id], scope: 'social gathering', prerequisites: [], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Later-cycle bridge fixture', sourceIds: [] });
    await app.message(agent.id, 'I am uncertain about a personal invitation.', 'host', 'a');
    assert.deepEqual(requests.map(input => input.dispositions?.[0]?.id), ['social']);
    requests.length = 0;
    await app.message(agent.id, 'There is more to learn about the gathering.', 'host', 'b');
    assert.deepEqual(requests.map(input => input.dispositions?.[0]?.id), ['social'], 'Another thread cannot receive the bridge or attention');
    requests.length = 0;
    await app.message(agent.id, 'We are still discussing the invitation.', 'host', 'a');
    assert.ok(requests.some(input => input.dispositions?.[0]?.id === 'BBQ'));
    assert.ok(requests.some(input => input.dispositions?.[0]?.temporary && input.dispositions[0].scope === 'outdoor gathering'));
    assert.ok(requests.every(input => input.world!.thoughtHistory!.some(thought => thought.thought.includes('BBQ'))));
    assert.ok(store.list('prediction', agent.id).some(prediction => prediction.status === 'open'));
    assert.equal(store.list('disposition', agent.id).length, 2, 'Prediction attention does not become a durable learned sensitivity');
  } finally { store.close(); }
});

test('procedural recall transfers across objects while changing subscopes preserve the situational Part', async () => {
  const store = new SqliteStore(':memory:'); const requests: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') requests.push(input); return super.constructed(input); }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      const current = input.world.facts.filter(fact => fact.originCycleId === input.world.cycleId).map(fact => fact.text).join(' ');
      return input.candidates.map(candidate => ({ partId: candidate.id, score: input.task === 'memory_accessibility' ? 4
        : candidate.id === 'method' ? 4 : current.includes(candidate.id) ? 4 : 0 }));
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    await app.message(agent.id, 'When painting a wall I learned to clean the brush before changing colors.', 'observer', 'past');
    const episode = store.list('memory', agent.id)[0]!;
    for (const [id, prerequisites] of [['method', []], ['prepare', ['method']], ['finish', ['method']]] as const) {
      store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1, name: id,
        concern: 'Attend to painting a surface', cues: ['paint', 'surface', id], scope: 'painting activity', prerequisites: [...prerequisites], threshold: 2,
        memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Procedural fixture', sourceIds: [] });
    }
    await api(app, 'PATCH', '/api/dispositions/method', { expectedVersion: 1, patch: { scope: 'paint + surface + intention' } });
    await app.message(agent.id, 'prepare to paint the fence', 'observer', 'work');
    const parent = store.list('part', agent.id).find(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'method'))!;
    const recalled = requests.at(-1)!;
    assert.ok(recalled.memories!.some(memory => memory.id === episode.id && memory.content.includes('wall')));
    await app.message(agent.id, 'prepare the fence by cleaning the brush', 'observer', 'work');
    const child = store.list('part', agent.id).find(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'prepare'))!;
    assert.ok(child);
    await app.message(agent.id, 'finish painting the fence; preparation is complete', 'observer', 'work');
    assert.equal(store.get('part', parent.id).instance!.retirement, null);
    assert.equal(store.get('part', parent.id).stickiness.concern, parent.stickiness.concern);
    assert.ok(store.get('part', child.id).instance!.retirement);
    assert.ok(store.list('part', agent.id).some(part => !part.instance?.retirement && part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'finish')));
    assert.equal(store.versions('disposition', 'method')[0]!.state.scope, 'painting activity');
  } finally { store.close(); }
});

test('failed prediction episodes support higher-order formation and conservative versioned refinement', async () => {
  const store = new SqliteStore(':memory:'); const learning: ConstructedInput[] = [];
  class Decisions extends MockDecisions {
    override async checkPrediction(): Promise<'incorrect'> { return 'incorrect'; }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task !== 'disposition_learning') return super.constructed(input);
      learning.push(input);
      const prediction = input.predictions![0]!;
      assert.equal(prediction.evaluation!.assessment, 'contradicted');
      const existing = input.dispositions![0]!;
      const memoryIds = input.memories!.map(memory => memory.id);
      return { operations: [{ operation: 'SPECIALIZE', sourceDispositionIds: [existing.id], memoryIds,
        judgments: memoryIds.map(memoryId => ({ memoryId, dispositionId: existing.id, usefulness: 'appropriate',
          experiencedContext: 'Negotiation', reason: 'Relevant recalled disagreement' })),
        discriminatingFeatures: ['Acknowledged prior contribution'], alternativeExplanations: ['Scheduling concern remains'],
        evidencePreserved: 'All earlier episodes remain', continuityReason: 'Versioned conditional relevance', reason: 'Qualify scope',
        draft: { name: existing.name, concern: existing.concern, scope: existing.scope, prerequisites: [], confidence: 'Provisional',
          retrievalIntent: 'Recall reciprocity disputes', contextCues: [], internalStateCues: [],
          activationCues: [...existing.cues, 'Acknowledged help with remaining disagreement'].map(text => ({ text, memoryIds })) } }], reason: 'Refine without duplicating' };
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about a personal scheduling question.', 'Paul', 'negotiation');
    await app.message(agent.id, 'My concern is fairness: I covered your shift last week.', 'Paul', 'negotiation');
    const prediction = store.list('prediction', agent.id).find(prediction => prediction.status === 'resolved')!;
    assert.ok(prediction.memoryId);
    assert.equal(store.list('disposition', agent.id).length, 0, 'Prediction error cannot directly form durable structure online');
    store.save('disposition', { id: 'reciprocity-reconciliation-fixture', agentId: agent.id, version: 1, schemaVersion: 1,
      name: 'Reciprocity in negotiation', concern: 'Attend to fairness in disagreements', scope: 'disagreement + prior contribution',
      cues: ['Prior help in a disagreement'], prerequisites: [], threshold: 2, memoryIds: [prediction.memoryId!],
      sourcePredictionId: prediction.id, temporary: false, active: true }, 0,
      { origin: 'researcher_edit', reason: 'Explicit starting structure for reconciliation boundary regression; not observed formation', sourceIds: [prediction.id, prediction.memoryId!] });
    await app.consolidation.run(agent.id);
    const disposition = store.list('disposition', agent.id)[0]!;
    assert.equal(disposition.sourcePredictionId, prediction.id);
    assert.ok(disposition.memoryIds.includes(prediction.memoryId!));
    assert.equal(disposition.version, 2);
    await app.consolidation.run(agent.id);
    assert.equal(store.list('disposition', agent.id).length, 1);
    assert.equal(store.get('disposition', disposition.id).version, 3);
    assert.equal(store.versions('disposition', disposition.id)[0]!.state.cues.length, 1);
    assert.equal(store.get('disposition', disposition.id).cues.length, 3);
    assert.ok(learning.every(input => input.learningTraces!.length === 2 && input.world === undefined));
  } finally { store.close(); }
});

test('situational scopes overlap and sleep selects chronological psychological trajectories without private snapshots', async () => {
  const store = new SqliteStore(':memory:');
  const inputs: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      inputs.push(input);
      if (input.task === 'disposition_learning') return { operations: [{ operation: 'NO_CHANGE', reason: 'Preserve uncertain structure' }], reason: 'Preserve uncertain structure' };
      return super.constructed(input);
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning())); const agent = app.createAgent();
    for (const [id, scope] of [['painting', 'paint + surface + intention'], ['deadline', 'task + approaching rain']] as const) {
      store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1, name: id,
        concern: 'Attend to the ongoing situation', cues: [scope], scope, prerequisites: [], threshold: 0,
        memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
      { origin: 'seed', reason: 'General attention fixture', sourceIds: [] });
    }
    await app.message(agent.id, 'Paint the fence before rain; paint and a brush are ready.', 'observer', 'work');
    const initial = inputs.filter(input => input.task === 'part_cognition');
    assert.equal(initial.length, 2);
    assert.equal(initial[0]!.world, initial[1]!.world, 'Overlapping situations receive the same observations');
    const parts = store.list('part', agent.id).filter(part => part.instance?.threadId === 'work');
    await app.message(agent.id, 'The fence is partly painted; the brush needs cleaning.', 'observer', 'work');
    assert.deepEqual(store.list('part', agent.id).filter(part => part.instance?.threadId === 'work').map(part => part.id), parts.map(part => part.id));
    await app.message(agent.id, 'An unrelated painting discussion.', 'observer', 'other');
    await app.consolidation.run(agent.id, 1, 2);
    const learning = inputs.findLast(input => input.task === 'disposition_learning')!;
    assert.equal(learning.world, undefined); assert.equal(learning.workingParts, undefined);
    assert.deepEqual(learning.learningTraces!.map(trace => [trace.sequence, trace.threadId]), [[1, 'work'], [2, 'work']]);
    assert.ok(learning.learningTraces!.every(trace => trace.activations.filter(activation => activation.active).length === 2));
    assert.ok(learning.learningTraces!.every(trace => trace.thoughts.length === 2));
    assert.ok(learning.learningTraces!.every(trace => trace.thoughts.every(thought => thought.dispositionIds.length === 1)));
    assert.ok(!JSON.stringify(learning.learningTraces).includes('partSnapshot'));
    assert.ok(!JSON.stringify(learning.learningTraces).includes('world_fixture'));
    assert.equal(store.list('disposition', agent.id).length, 2, 'Coactivation never forces formation');
    await assert.rejects(app.runtime.constructed.infer('part_cognition', { agentId: agent.id, learningTraces: learning.learningTraces! }), /offline-only/);
  } finally { store.close(); }
});
const fact = (text: string) => ({ source: 'observer', kind: 'observes' as const, text, timestamp: null, referenceId: null });
function savedWorld(store: SqliteStore, agentId: string, text: string): WorldState {
  const cycle = store.startCycle(agentId);
  const world = freeze({ id: cycle.worldId, agentId, cycleId: cycle.id, sequence: cycle.sequence, capturedAt: cycle.startedAt,
    facts: [{ ...fact(text), originCycleId: cycle.id }], thoughtHistory: [] });
  store.saveWorld(world); store.saveCycle({ ...cycle, status: 'completed' });
  return world;
}

test('scope continuity survives restart and a retired instance cannot rejoin cognition', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-assembled-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    let app = new Application(store); const agent = app.createAgent('Assembled');
    await app.message(agent.id, 'Hello.', 'friend', 'a');
    const original = store.list('part', agent.id)[0]!;
    assert.equal(original.name, 'self'); assert.equal(original.instance!.retirement, null);
    store.close(); store = new SqliteStore(path); app = new Application(store);
    await app.message(agent.id, 'Hello again.', 'friend', 'a');
    assert.equal(store.list('part', agent.id).length, 1);
    assert.ok(store.get('part', original.id).version > original.version);
    store.save('disposition', { id: 'dog', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Dog', concern: 'Dogs matter', cues: ['dog'], scope: 'dog', prerequisites: [], threshold: 0, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Scope fixture', sourceIds: [] });
    await app.message(agent.id, 'A dog appears.', 'friend', 'a');
    const retired = store.get('part', original.id);
    assert.ok(retired.instance!.retirement);
    assert.throws(() => app.runtime.mutations.patch(retired.id, retired.version, { lifecycle: 'active' }, { origin: 'researcher_edit', reason: 'Revive', sourceIds: [] }), /Retired/);
    const rendered = previewPrompt(store, agent.id, 'part_cognition', prompts.part_cognition.text);
    assert.ok(rendered.text.includes('Ordered Part formation'));
    assert.equal(snapshot(app, agent.id).parts.length, 2);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});


test('thread scopes stay separate and retired predictions resolve without reactivating their owner', async () => {
  const store = new SqliteStore(':memory:');
  // Isolate fallback continuity/retired evaluation from anticipatory activation (tested separately).
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.task === 'disposition_activation'
      ? input.candidates.map(candidate => ({ partId: candidate.id, score: 0 })) : super.judge(input); }
  }
  try {
    const app = new Application(store, providers(new MockReasoning(), new Decisions())); const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about a personal question.', 'Bill', 'a');
    const part = store.list('part', agent.id)[0]!; const prediction = store.list('prediction', agent.id)[0]!;
    assert.equal(prediction.status, 'open');
    await app.message(agent.id, 'I am uncertain about a personal question.', 'Bill', 'a');
    assert.equal(store.list('part', agent.id).length, 1);
    await app.message(agent.id, 'Thank you for sharing. I respect you.', 'Bill', 'b');
    assert.equal(store.get('prediction', prediction.id).status, 'open');
    const current = store.get('part', part.id);
    app.runtime.mutations.patch(current.id, current.version, { lifecycle: 'archived', instance: { ...current.instance!, retirement: { cycleId: current.instance!.createdCycle, reason: 'Fixture retirement' } } }, { origin: 'researcher_edit', reason: 'Retire without deleting prediction', sourceIds: [] });
    await app.message(agent.id, 'Thank you for sharing. I respect you.', 'Bill', 'a');
    assert.equal(store.get('prediction', prediction.id).status, 'resolved');
    assert.ok(store.get('prediction', prediction.id).memoryId);
    assert.ok(store.get('part', part.id).instance!.retirement);
    assert.equal(store.list('part', agent.id).filter(candidate => candidate.name === 'self').length, 3);
  } finally { store.close(); }
});


test('overlapping chronological subjective memories inform independent scopes without reaching Self', async () => {
  const store = new SqliteStore(':memory:'); const requests: ConstructedInput[] = []; const selves: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') requests.push(input); return super.constructed(input); }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
    override async choose(context: SelfContext) { selves.push(context); return super.choose(context); }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    await app.message(agent.id, 'Bill helped me.', 'Bill');
    await app.message(agent.id, 'Bill abandoned me.', 'Bill');
    for (const name of ['Connection', 'Caution']) store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1, name, concern: name, cues: ['Bill'], scope: 'Bill', prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Independent scopes', sourceIds: [] });
    requests.length = 0;
    await app.message(agent.id, 'Bill asks for help.', 'Bill');
    assert.equal(requests.length, 2);
    assert.equal(requests[0]!.world, requests[1]!.world);
    assert.deepEqual(requests[0]!.memories!.map(memory => memory.id), requests[1]!.memories!.map(memory => memory.id));
    assert.ok(requests.every(request => !('identity' in request) && !('steering' in request) && !('primitives' in request)));
    assert.ok(selves.every(context => !('world' in context) && !('memories' in context) && !('steering' in context)));
  } finally { store.close(); }
});


test('WorldState goes directly to disposition scoring without perception; legacy dependencies are soft associations without eligibility gates', async () => {
  const store = new SqliteStore(':memory:');
  const judgments: JudgmentInput[] = [];
  const requests: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      assert.notEqual(input.task, 'perception');
      assert.ok(!('perception' in input));
      requests.push(input);
      return super.constructed(input);
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      judgments.push(input);
      assert.ok(!('perception' in input));
      assert.ok(Object.isFrozen(input.world));
      return input.candidates.map(candidate => ({ partId: candidate.id,
        score: input.world.facts.at(-1)!.text.includes('No dog') ? 0 : 4 }));
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions()));
    const agent = app.createAgent();
    for (const [dispositionId, prerequisites] of [['root', []], ['child', ['root']]] as const) store.save('disposition', {
      id: dispositionId, agentId: agent.id, version: 1, schemaVersion: 1, name: dispositionId,
      concern: 'Notice animal cues', cues: ['dog', 'growling'], scope: 'dog', prerequisites: [...prerequisites],
      threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'researcher_edit', reason: 'Inspect disposition gating', sourceIds: [] });
    const world = savedWorld(store, agent.id, 'A growling dog is visible.');
    const first = await app.runtime.constructed.prepare(world);
    assert.equal(judgments[0]!.task, 'disposition_activation');
    assert.equal(judgments[0]!.world, world);
    assert.deepEqual(judgments[0]!.candidates.map(candidate => candidate.id), ['root', 'child']);
    assert.equal(requests[0]!.task, 'part_cognition');
    assert.equal(first.parts.length, 2);
    judgments.length = 0;
    const next = await app.runtime.constructed.prepare(savedWorld(store, agent.id, 'The dog is still visible.'));
    assert.deepEqual(judgments[0]!.candidates.map(candidate => candidate.id), ['root', 'child']);
    assert.equal(next.dispositions.length, 2);
    judgments.length = 0;
    const absent = await app.runtime.constructed.prepare(savedWorld(store, agent.id, 'No dog is present; the object is a toy.'));
    assert.equal(absent.dispositionBindings.length, 0);
  } finally { store.close(); }
});

test('consolidation still rejects untested prediction evidence', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'disposition_learning') return { operations: [{ operation: 'ADD_DEPENDENCY', sourceDispositionIds: ['invented-disposition'], dependencyId: 'invented-parent', memoryIds: ['invented-memory'], judgments: [{ memoryId: 'invented-memory', dispositionId: 'invented-disposition', usefulness: 'unknown', experiencedContext: 'Imagined only', reason: 'Untested' }], discriminatingFeatures: [], alternativeExplanations: [], evidencePreserved: 'None', continuityReason: 'Unsupported', reason: 'Invalid evidence' }], reason: 'Invalid evidence' };
      return super.constructed(input);
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning())); const agent = app.createAgent();
    await assert.rejects(app.runtime.constructed.learn(agent.id, [], []), /unique selected memories/);
    assert.equal(store.list('disposition', agent.id).length, 0);
  } finally { store.close(); }
});


test('authorized legacy reset preserves Identity, settings and subjective memory versions; new instances remain protected', async () => {
  const store = new SqliteStore(':memory:');
  try {
    let app: Application = new HistoricalApplication(store, providers()); const agent = app.createAgent('Legacy cutover', 'persistent');
    await app.message(agent.id, 'I am uncertain about a personal question.', 'Bill', 'old');
    await app.message(agent.id, 'Thank you for sharing. I respect you.', 'Bill', 'old');
    const identity = store.get('identity', agent.id);
    const memories = store.list('memory', agent.id); assert.ok(memories.length);
    const settings = app.agentActivationSettings(agent.id);
    store.discardLegacyState(agent.id);
    app = new Application(store, providers());
    assert.deepEqual(store.get('identity', agent.id), identity);
    assert.deepEqual(app.agentActivationSettings(agent.id), settings);
    assert.equal(store.get('agent', agent.id).architecture, 'constructed');
    for (const memory of memories) {
      const current = store.get('memory', memory.id);
      assert.equal(current.content, memory.content); assert.deepEqual(current.referencingPartIds, []);
      assert.ok(store.versions('memory', memory.id).some(version => version.state.version === memory.version));
      store.save('memory', { ...current, version: current.version + 1 }, current.version,
        { origin: 'researcher_edit', reason: 'Preserve opaque formation provenance', sourceIds: [] });
    }
    const found = await searchMemories(app, agent.id, { query: memories[0]!.gist, mode: 'jev' });
    assert.ok(found.some(result => result.memory.id === memories[0]!.id));
    for (const kind of ['part', 'prediction'] as const) assert.equal(store.list(kind, agent.id).length, 0);
    assert.equal(store.cycles(agent.id).length, 0); assert.equal(store.events(agent.id).length, 0);
    await app.message(agent.id, 'Hello, a calm ordinary conversation.', 'friend', 'new');
    assert.ok(store.list('part', agent.id)[0]!.instance);
    assert.throws(() => store.discardLegacyState(agent.id), /Constructed history must be retained/);
  } finally { store.close(); }
});


test('legacy consolidation profile and obsolete retrieval switches cannot select the former online loop', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(),
      embeddings: { label: 'No online vector filtering', embed: async () => { throw new Error('Online embeddings must not run'); } } });
    const agent = app.createAgent('Offline profile compatibility', 'persistent');
    const legacyIds = new Set(store.list('part', agent.id).map(part => part.id));
    assert.ok(legacyIds.size);
    const source = store.get('part', [...legacyIds][0]!);
    const legacyWorld = savedWorld(store, agent.id, 'An old personal forecast.');
    const forecast = app.runtime.predictions.form(source.id, legacyWorld, { expectation: 'A legacy expectation', confidence: 0.5,
      capsule: { interpretation: 'Historical meaning', details: [], entities: [], activation: 2, spike: 0, sourceIds: [legacyWorld.id] },
      horizon: 'Later', evaluateAfterCycle: null });
    app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: true, memorySearchEnabled: true });
    const result = await app.message(agent.id, 'Hello, a calm ordinary conversation.', 'friend', 'a');
    assert.equal(result.cycle.status, 'completed');
    assert.equal(store.get('prediction', forecast.id).status, 'open', 'Legacy forecasts cannot invoke old online learning');
    assert.equal(store.get('part', source.id).beliefConfidence, source.beliefConfidence);
    const thoughts = store.eventsByType(agent.id, ['part.thought']);
    assert.ok(thoughts.length);
    assert.ok(thoughts.every(event => event.type === 'part.thought' && event.payload.partSnapshot.instance && !legacyIds.has(event.payload.partId)));
    assert.ok(store.eventsByType(agent.id, ['construction.inference_started']).length);
    const oldVersions = store.versions('part', [...legacyIds][0]!).length;
    await app.consolidation.run(agent.id);
    assert.equal(store.versions('part', [...legacyIds][0]!).length, oldVersions);
    app.changeConsolidationProfile(agent.id, 'constructed');
    assert.ok((await app.consolidation.run(agent.id)).constructedLearning);
    await assert.rejects(() => api(app, 'PATCH', `/api/agents/${agent.id}/architecture`, { architecture: 'persistent' }), /Unknown/);
  } finally { store.close(); }
});


test('production uses one independent cognition call per active Part and never separate prediction inference', async () => {
  const store = new SqliteStore(':memory:');
  let calls = 0;
  class Reasoning extends MockReasoning {
    override async cognize(context: PartContext) { calls++; return super.cognize(context); }
    override async predict(): ReturnType<MockReasoning['predict']> { throw new Error('Separate prediction generation must not run'); }
  }
  class Decisions extends MockDecisions {
    override async shouldPredict(): Promise<boolean> { throw new Error('Prediction gate must not run'); }
    override async judge(input: JudgmentInput) { return input.task === 'disposition_activation'
      ? input.candidates.map(candidate => ({ partId: candidate.id, score: 0 })) : super.judge(input); }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about a personal question.', 'Bill', 'a');
    assert.equal(calls, 1);
    assert.equal(store.list('prediction', agent.id).length, 1);
    await app.message(agent.id, 'I am still uncertain about a personal question.', 'Bill', 'a');
    assert.equal(calls, 2);
    assert.equal(store.list('prediction', agent.id).filter(prediction => prediction.status === 'open').length, 1);
    assert.equal(store.eventsByType(agent.id, ['prediction.formation_checked']).length, 0);
  } finally { store.close(); }
});


test('legacy dog dependencies allow broad and specific directly relevant voices from the first cycle', async () => {
  const store = new SqliteStore(':memory:'); const contexts: PartContext[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition') assert.equal(input.dispositions?.length, 1);
      return super.constructed(input);
    }
    override async cognize(context: PartContext) {
      contexts.push(context);
      return { ...(await super.cognize(context)), prediction: null, proposal: null };
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      assert.equal(input.candidates.length, 0, 'Disposition Parts must not be sent for activation scoring');
      assert.equal(input.partActivationContext?.length, 0);
      return [...input.candidates.map(part => ({ partId: part.id, score: 0 })),
        ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    for (const [name, prerequisites] of [['Dog', []], ['Dog Aggression', ['Dog']], ['Dog Attack Risk', ['Dog Aggression']]] as const) {
      store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1,
        name, concern: 'Understand the dog', cues: ['dog'], scope: 'dog', prerequisites: [...prerequisites],
        threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
      }, 0, { origin: 'researcher_edit', reason: 'Progressive attention fixture', sourceIds: [] });
    }
    await app.message(agent.id, 'A dog approaches.', 'observer', 'park');
    assert.deepEqual(contexts.map(context => context.part.name), ['Dog', 'Dog Aggression', 'Dog Attack Risk']);
    await app.message(agent.id, 'The dog barks.', 'observer', 'park');
    assert.deepEqual(contexts.slice(3).map(context => context.part.name), ['Dog', 'Dog Aggression', 'Dog Attack Risk']);
    await app.message(agent.id, 'The dog growls.', 'observer', 'park');
    assert.deepEqual(contexts.slice(6).map(context => context.part.name), ['Dog', 'Dog Aggression', 'Dog Attack Risk']);
    assert.equal(store.list('part', agent.id).length, 3);
    assert.equal(store.list('part', agent.id).filter(part => part.name === 'Dog').length, 1, 'Broad working instance continues');
    assert.equal(contexts[3]!.world, contexts[4]!.world);
    assert.equal(contexts[4]!.world, contexts[5]!.world);
    assert.ok(contexts.every(context => context.dispositions?.length === 1));
    assert.ok(contexts.every(context => context.activation.active && context.activation.reasons.includes('disposition_participation')));
    assert.equal(store.eventsByType(agent.id, ['activation.spike']).length, 0);
  } finally { store.close(); }
});


test('consolidation versions a durable sensitivity from sufficient nonprediction experience', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'disposition_learning') {
        const existing = input.dispositions![0]!;
        const memoryIds = input.memories!.map(memory => memory.id);
        return { operations: [{ operation: 'SPECIALIZE', sourceDispositionIds: [existing.id], memoryIds,
          judgments: memoryIds.map(memoryId => ({ memoryId, dispositionId: existing.id, usefulness: 'appropriate',
            experiencedContext: 'Friendly dog', reason: 'A lived pleasant encounter' })),
          discriminatingFeatures: ['Friendly play'], alternativeExplanations: [], evidencePreserved: 'Prior dog experiences',
          continuityReason: 'Narrower relevance preserves older scope history', reason: 'Qualify friendly play',
          draft: { name: existing.name, concern: existing.concern, scope: 'friendly dog play', prerequisites: [],
            activationCues: [{ text: 'friendly dog', memoryIds }], contextCues: [], internalStateCues: [],
            retrievalIntent: 'Recall friendly play', confidence: 'Provisional' } }], reason: 'Learn from repeated pleasant episodes' };
      }
      return super.constructed(input);
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning())); const agent = app.createAgent();
    await app.message(agent.id, 'A friendly dog played with me.', 'observer');
    const memory = store.list('memory', agent.id)[0]!;
    store.save('disposition', { id: 'dog', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Dog',
      concern: 'Enjoy dogs', cues: ['dog'], scope: 'dog', prerequisites: [], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'researcher_edit', reason: 'Starting sensitivity', sourceIds: [] });
    await assert.rejects(app.runtime.constructed.learn(agent.id, [memory], []), /repeated experience/);
    await app.message(agent.id, 'A friendly dog played with me again.', 'observer');
    await app.runtime.constructed.learn(agent.id, store.list('memory', agent.id), []);
    assert.equal(store.get('disposition', 'dog').scope, 'friendly dog play');
    assert.equal(store.get('disposition', 'dog').version, 2);
    assert.equal(store.versions('disposition', 'dog')[0]!.state.threshold, 2);
  } finally { store.close(); }
});

test('scoped Parts use ordered formation, reflection, gist and cognition in one generation', async () => {
  const store = new SqliteStore(':memory:');
  const fixture = new MockReasoning();
  const requests: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition') requests.push(input);
      return fixture.constructed(input);
    }
    override async cognize(): Promise<never> { throw new Error('Initial cognition must come from the combined generation'); }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    }
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      assert.equal(input.candidates.length, 0);
      assert.equal(input.directParticipants?.length, 2);
      return (input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }));
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions()));
    const agent = app.createAgent('Combined');
    for (const name of ['Need For Safety', 'Need For Connection']) store.save('disposition', {
      id: name, agentId: agent.id, version: 1, schemaVersion: 1, name, concern: name,
      cues: ['dog'], scope: 'dog', prerequisites: [], threshold: 2, memoryIds: [],
      sourcePredictionId: null, temporary: false, active: true,
    }, 0, { origin: 'seed', reason: 'Independent concerns', sourceIds: [] });
    await app.message(agent.id, 'A dog approaches.', 'observer', 'park');
    assert.equal(requests.length, 2);
    assert.equal(store.eventsByType(agent.id, ['part.reasoning_started']).length, 0, 'No separate initial cognition request is recorded');
    assert.ok(requests.every(request => request.dispositions?.length === 1));
    assert.equal(requests[0]!.world, requests[1]!.world);
    const generated = store.eventsByType(agent.id, ['construction.generated']);
    assert.equal(generated.length, 2);
    for (const event of generated) if (event.type === 'construction.generated') {
      assert.deepEqual(Object.keys(event.payload.result), ['formation', 'memoryReflection', 'memoryGist', 'cognition']);
    }
    const thoughts = store.eventsByType(agent.id, ['part.thought']);
    assert.equal(thoughts.length, 2);
    assert.ok(thoughts.every(event => event.type === 'part.thought' && event.payload.output.thought));
    const self = store.eventsByType(agent.id, ['self.arbitration_started']).at(-1)!;
    assert.equal(self.type, 'self.arbitration_started');
    assert.ok(!('world' in self.payload) && !('memories' in self.payload));
  } finally { store.close(); }
});

test('invalid memory evidence fails before any Part or memory is committed', async () => {
  const store = new SqliteStore(':memory:'); const fixture = new MockReasoning();
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await fixture.constructed(input);
      if (input.task === 'part_cognition') (result as { formation: { evidenceMemoryIds: string[] } }).formation.evidenceMemoryIds.push('unavailable_memory');
      return result;
    }
  }
  try {
    const app = new Application(store, providers(new Reasoning())); const agent = app.createAgent();
    await assert.rejects(() => app.message(agent.id, 'An ordinary scene.'), /unavailable memory/);
    assert.equal(store.list('part', agent.id).length, 0); assert.equal(store.list('memory', agent.id).length, 0);
  } finally { store.close(); }
});


test('parallel Part generations overlap; code controls continuity and no extra encoding or primitive inference runs', { timeout: 5000 }, async () => {
  const store = new SqliteStore(':memory:'); const fixture = new MockReasoning();
  let entered = 0; let complete = 0; let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'experiential_formation' || input.task === 'cognition_coverage') return fixture.constructed(input);
      assert.equal(input.task, 'part_cognition', 'No separate online memory or working-state inference');
      entered++; if (entered === 2) release();
      await barrier;
      const result = await fixture.constructed(input); complete++; return result;
    }
    override async primitive(): Promise<never> { throw new Error('Primitive cognition must not run'); }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
    override async score(): Promise<never> { throw new Error('Part/primitive activation must not run'); }
  }
  try {
    const app = new Application(store, providers(new Reasoning(), new Decisions())); const agent = app.createAgent();
    for (const name of ['Safety', 'Curiosity']) store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1, name, concern: name, cues: ['dog'], scope: 'dog', prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Parallel scopes', sourceIds: [] });
    await app.message(agent.id, 'A dog approaches.', 'observer', 'a');
    assert.equal(entered, 2); assert.equal(complete, 2);
    const ids = store.list('part', agent.id).map(part => part.id);
    await app.message(agent.id, 'The dog sits.', 'observer', 'a');
    assert.deepEqual(store.list('part', agent.id).map(part => part.id), ids);
    assert.equal(entered, 4); assert.equal(store.list('memory', agent.id).length, 4);
    assert.equal(store.eventsByType(agent.id, ['primitive.thought']).length, 0);
    assert.ok(store.primitiveSettings(agent.id).items.length, 'Primitive menu configuration is retained');
  } finally { store.close(); }
});



test('removed prompt overrides cannot break current settings or restore unused tasks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-removed-prompts-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    let app = new Application(store); const agent = app.createAgent(); store.close();
    const db = new DatabaseSync(path);
    for (const task of ['perception', 'perspective_construction', 'perspective_evidence', 'working_state', 'experience_encoding'])
      db.prepare('INSERT INTO prompt_overrides(scope,agent_id,task,body) VALUES(?,?,?,?)').run('agent', agent.id, task, 'Obsolete custom template.');
    db.close(); store = new SqliteStore(path); app = new Application(store);
    const settings = app.promptSettings(agent.id);
    assert.ok(settings.some(prompt => prompt.task === 'part_cognition'));
    assert.ok(!settings.some(prompt => ['perception', 'working_state', 'experience_encoding', 'activation', 'cognition', 'prediction_gate', 'prediction'].includes(prompt.task)));
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/prompts/cognition`, { scope: 'agent', text: 'Restore obsolete task' }), /not used by the application/);
    await app.message(agent.id, 'Hello.');
    assert.equal(store.list('part', agent.id)[0]!.name, 'self');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('context-limited judgments split candidate batches without changing the immutable snapshot', async () => {
  const { ContextLimitError, InfrastructureError } = await import('../../packages/core/src/contracts.js');
  for (const failure of ['split', 'single', 'unrelated'] as const) {
    const store = new SqliteStore(':memory:'); const attempts: JudgmentInput[] = []; const successful: string[] = [];
    class Decisions extends MockDecisions {
      override async judge(input: JudgmentInput) {
        attempts.push(input);
        if (failure === 'unrelated') throw new InfrastructureError('provider', 'Jev HTTP 401');
        if (failure === 'single' || input.candidates.length > 2) throw new ContextLimitError('Jev');
        successful.push(...input.candidates.map(candidate => candidate.id));
        return input.candidates.map(candidate => ({ partId: candidate.id, score: 0 }));
      }
    }
    try {
      const app = new Application(store, providers(new MockReasoning(), new Decisions())); const agent = app.createAgent();
      for (let index = 0; index < 5; index++) store.save('disposition', { id: `candidate_${index}`, agentId: agent.id, version: 1, schemaVersion: 1,
        name: `Candidate ${index}`, concern: 'Notice context', cues: ['ordinary scene'], scope: 'scene', prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
        { origin: 'researcher_edit', reason: 'Exercise request packing only', sourceIds: [] });
      const world = savedWorld(store, agent.id, 'An ordinary scene.');
      if (failure === 'split') { await app.runtime.constructed.prepare(world); assert.deepEqual(successful.sort(), ['candidate_0', 'candidate_1', 'candidate_2', 'candidate_3', 'candidate_4']); }
      else { await assert.rejects(app.runtime.constructed.prepare(world), failure === 'single' ? ContextLimitError : /Jev HTTP 401/); assert.equal(successful.length, 0); }
      assert.ok(attempts.every(input => input.world === world && Object.isFrozen(input.world)));
      if (failure === 'unrelated') assert.equal(attempts.length, 1);
      if (failure === 'single') assert.equal(attempts.at(-1)!.candidates.length, 1);
    } finally { store.close(); }
  }
});
