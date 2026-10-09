import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { developmentDemo } from '../../packages/sdk/src/demo.js';
import { id, type Execution } from '../../packages/core/src/domain.js';
import type { Executor } from '../../packages/core/src/contracts.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { defaultRuntimeOptions } from '../../packages/core/src/runtime.js';

test('external operation can stay running across cycles and report later factual outcome', async () => {
  const store = new SqliteStore(':memory:');
  const executor: Executor = { async execute({ agentId, cycleId, bid }) { return { id: id('execution'), agentId, cycleId, action: bid.action, status: 'running', facts: [] }; } };
  try {
    const app = new Application(store, undefined, executor); const agent = app.createAgent();
    const first = await app.message(agent.id, 'A personal uncertain question about vulnerability.');
    assert.equal(first.execution?.status, 'running');
    const second = await app.message(agent.id, 'A second personal uncertain question.');
    assert.ok(store.world(second.cycle.worldId).facts.some(f => f.text.includes('is still in progress')));
    for (let i = 0; i < 9; i++) await app.message(agent.id, 'Another personal uncertain question about vulnerability.');
    const completed: Execution = { ...first.execution!, status: 'completed', facts: [{ source: 'external operation', kind: 'does', text: 'The operation returned its result.', timestamp: new Date().toISOString(), referenceId: first.execution!.id }] };
    app.reportExecution(completed);
    const third = await app.message(agent.id, 'Please continue this personal conversation.');
    assert.ok(store.world(third.cycle.worldId).facts.some(f => f.text === 'The operation returned its result.'));
    assert.throws(() => app.reportExecution(completed), /terminal/);
    assert.equal(store.world(first.cycle.worldId).facts.some(f => f.text.includes('returned its result')), false);
  } finally { store.close(); }
});
test('expressed thoughts consider additional Parts only on the next immutable cycle', async () => {
  const store = new SqliteStore(':memory:'); const scoredWorlds: unknown[] = [];
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      scoredWorlds.push(input.world);
      return [...input.candidates.map(part => ({ partId: part.id, score: 4 })), ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: 0 }))];
    }
  }
  class Embeddings extends MockEmbeddings {
    override async embed(text: string) { return text.includes('next_cycle_topic') ? [0, 1] : [1, 0]; }
  }
  class Reasoning extends MockReasoning {
    override async cognize(context: Parameters<MockReasoning['cognize']>[0]) {
      return { ...await super.cognize(context), thought: 'I am concerned about next_cycle_topic.' };
    }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new Embeddings() }, undefined,
      { ...defaultRuntimeOptions, activation: { ...defaultRuntimeOptions.activation, vectorThreshold: 0.8 } });
    const agent = app.createAgent(); const [source, target, ...others] = store.list('part', agent.id);
    for (const part of others) app.runtime.mutations.patch(part.id, part.version, { lifecycle: 'archived' }, { origin: 'researcher_edit', reason: 'Activation test population', sourceIds: [] });
    app.runtime.mutations.patch(source!.id, source!.version, { triggers: ['source_signal'], stickiness: { retained: true, unresolved: true, concern: 'ongoing' } }, { origin: 'researcher_edit', reason: 'Activation test source', sourceIds: [] });
    app.runtime.mutations.patch(target!.id, target!.version, { triggers: ['next_cycle_topic'] }, { origin: 'researcher_edit', reason: 'Activation test target', sourceIds: [] });
    const first = await app.message(agent.id, 'First factual event.');
    const firstWorld = store.world(first.cycle.worldId);
    const before = structuredClone(firstWorld);
    const firstEvents = store.events(agent.id).filter(event => event.cycleId === first.cycle.id);
    assert.equal(firstEvents.filter(event => event.type === 'activation.scored').length, 1);
    assert.equal(firstEvents.filter(event => event.type === 'part.thought').length, 1);
    assert.deepEqual(firstWorld.thoughtHistory, []);
    const second = await app.message(agent.id, 'Second factual event.');
    const secondEvents = store.events(agent.id).filter(event => event.cycleId === second.cycle.id);
    const scoring = secondEvents.find(event => event.type === 'activation.scored');
    assert.ok(scoring?.type === 'activation.scored');
    assert.ok(scoring.payload.results.some(result => result.partId === target!.id && result.active && result.reasons.includes('vector')));
    assert.equal(secondEvents.filter(event => event.type === 'activation.scored').length, 1);
    assert.equal(scoredWorlds.length, 2); assert.notEqual(scoredWorlds[0], scoredWorlds[1]);
    assert.deepEqual(store.world(first.cycle.worldId), before);
    assert.ok(store.world(second.cycle.worldId).thoughtHistory!.some(thought => thought.partId === source!.id && thought.thought.includes('next_cycle_topic')));
  } finally { store.close(); }
});
test('scripted development demo spans environment outcomes, changed cognition and sleep', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const demo = await developmentDemo(store);
    assert.equal(demo.cycles.length, 5);
    assert.ok(demo.memories.length);
    assert.ok(demo.predictions.length);
    assert.equal(demo.sleep.status, 'completed');
    assert.ok(demo.sleep.constructedLearning);
    const thoughts = store.events(demo.agent.id).filter(event => event.type === 'part.thought');
    assert.ok(thoughts.length);
    assert.ok(thoughts.every(event => event.type === 'part.thought' && event.payload.partSnapshot.instance));
    for (const part of demo.beforeSleep) assert.ok(demo.afterSleep.some(current => current.id === part.id));
  } finally { store.close(); }
});


test('unverified reports retain lineage and cannot restart submissions through application or storage', async () => {
  const store = new SqliteStore(':memory:');
  const executor: Executor = { async execute({ agentId, cycleId, bid }) {
    return { id: id('execution'), agentId, cycleId, action: bid.action, status: 'running', facts: [] };
  } };
  try {
    const app = new Application(store, undefined, executor); const agent = app.createAgent();
    const first = await app.message(agent.id, 'A personal uncertain question about vulnerability.');
    assert.ok(first.execution);
    const unresolved: Execution = { ...first.execution, status: 'unverified',
      operational: { attempts: 1, verified: false, reason: 'Submitted response lost', traceRefs: ['trace_original'] } };
    app.reportExecution(unresolved);
    assert.throws(() => app.reportExecution({ ...unresolved, status: 'running' }), /restart/);
    assert.throws(() => store.saveExecution({ ...unresolved, status: 'pending' }), /restart/);
    assert.throws(() => store.saveExecution({ ...unresolved, contractId: 'replacement' }), /contract reference/);
    assert.throws(() => app.reportExecution({ ...unresolved, operational: { ...unresolved.operational!, attempts: 0 } }), /discard/);
    assert.throws(() => store.saveExecution({ ...unresolved, operational: { ...unresolved.operational!, traceRefs: [] } }), /lineage/);
    assert.equal(store.executions(agent.id).find(item => item.id === unresolved.id)!.status, 'unverified');
    const resolved = app.reportExecution({ ...unresolved, status: 'completed', operational: {
      ...unresolved.operational!, verified: true, reason: 'Later external evidence resolved the outcome', traceRefs: ['trace_original', 'trace_resolution'] } });
    assert.equal(resolved.status, 'completed');
    assert.throws(() => store.saveExecution({ ...resolved, status: 'running' }), /terminal/);
  } finally { store.close(); }
});
