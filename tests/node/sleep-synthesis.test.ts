import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { ConstructedInput, JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { captureSynthesisScopes, synthesizeScope } from '../../packages/core/src/sleep-synthesis.js';
import { api } from '../../packages/sdk/src/api.js';
import { prompts } from '../../packages/providers/src/prompts.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { simulationTests, startSimulationTest, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';

// Authored provider outputs establish persistence/access boundaries, not learned psychological meaning.
class Fixture extends MockReasoning {
  inputs: ConstructedInput[] = [];
  mode: 'synthesis' | 'invalid' | 'abstain' = 'synthesis';
  override async constructed(input: ConstructedInput): Promise<unknown> {
    this.inputs.push(input);
    if (input.task === 'part_cognition') {
      const output = await super.constructed(input) as Record<string, unknown>;
      return { ...output, memoryReflection: { content: 'I recall the supplied cold-car experience.', context: ['cold car'],
        interpretation: 'This is my interpretation.', affect: '', perceivedDetails: [] }, memoryGist: 'Cold-car experience' };
    }
    if (input.task === 'memory_synthesis') return { reason: 'Authored synthesis fixture; cause remains unverified.', synthesis: this.mode === 'abstain' ? null : {
      sourceMemoryIds: this.mode === 'invalid' ? ['invented', 'foreign'] : input.memories!.map(memory => memory.id),
      content: 'The door test did not help; heater existence does not prove this car’s cause.', gist: 'Qualified cold-car learning', context: ['cold car'],
      detailDecisions: input.memories!.map(memory => ({ memoryId: memory.id, retainedMeaning: 'Qualified cold-car relevance', omittedDetails: ['Peripheral detail from another perspective'], reason: 'Authored scope-relative omission fixture' })),
      replaceSourceMemoryIds: input.dispositions![0]!.id === 'cold' ? input.memories!.map(memory => memory.id) : [] } };
    return super.constructed(input);
  }
}
class Decisions extends MockDecisions {
  inputs: JudgmentInput[] = [];
  override async judge(input: JudgmentInput) { this.inputs.push(input); return input.task === 'disposition_activation' ? input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })) : super.judge(input); }
}
async function setup() {
  const store = new SqliteStore(':memory:'); const reasoning = new Fixture(); const decisions = new Decisions();
  const app = new Application(store, { reasoning, decisions, embeddings: new MockEmbeddings() }); const agent = app.createAgent('Synthesis fixture');
  for (const scope of ['cold', 'advice']) store.save('disposition', { id: scope, agentId: agent.id, version: 1, schemaVersion: 1,
    name: scope, concern: 'Notice relevant experiences', cues: ['cold car advice'], scope, prerequisites: [], threshold: 2,
    memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Boundary fixture', sourceIds: [] });
  await app.message(agent.id, 'Opening the doors did not help the car start.', 'observer', 'car');
  await app.message(agent.id, 'Bill suggested a cold battery; research confirmed battery heaters exist.', 'observer', 'car');
  return { store, reasoning, decisions, app, agent };
}

test('optional synthesis captures independent scopes, preserves shared source versions and limits replacement to one disposition', async () => {
  const { store, reasoning, decisions, app, agent } = await setup();
  try {
    const sources = store.list('memory', agent.id); const originals = JSON.stringify(sources);
    const historyCount = store.versions('memory', sources[0]!.id).length;
    const defaults = await app.consolidation.run(agent.id);
    assert.equal(defaults.options?.synthesizeMemories, false);
    assert.equal(reasoning.inputs.some(input => input.task === 'memory_synthesis'), false);
    const run = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true, replaceSourceMemories: true });
    assert.equal(run.status, 'completed'); assert.equal(run.synthesisReviews?.length, 2);
    assert.ok(run.synthesisReviews?.every(review => review.status === 'created'));
    const requests = reasoning.inputs.filter(input => input.task === 'memory_synthesis');
    assert.ok(requests.every(input => input.synthesisPolicy?.detailPolicy === 'preserve_details'));
    assert.equal(requests.length, 2); assert.ok(requests.every(input => input.memories!.every(memory => sources.some(source => source.id === memory.id)))); assert.ok(requests.every(input => !input.world && !input.workingParts && !input.identity));
    assert.ok(requests.every(input => input.memories!.every(memory => !memory.synthesis && !memory.selfAffectAtFormation)));
    assert.equal(JSON.stringify(store.list('memory', agent.id).filter(memory => sources.some(source => source.id === memory.id))), originals);
    assert.ok(run.synthesisReviews!.find(review => review.dispositionId === 'cold')!.replacedMemoryIds.length >= 2);
    assert.equal(run.synthesisReviews!.find(review => review.dispositionId === 'advice')!.replacedMemoryIds.length, 0);
    const cold = store.get('disposition', 'cold'); assert.ok(cold.suppressedMemoryIds?.length);
    assert.equal(store.get('disposition', 'advice').suppressedMemoryIds?.length, 0);
    const synthesis = store.get('memory', run.synthesisReviews![0]!.memoryId!);
    assert.equal(synthesis.partId, null); assert.ok(synthesis.synthesis?.sources.every(source => source.version === sources.find(memory => memory.id === source.memoryId)?.version));
    assert.throws(() => store.save('memory', { ...synthesis, version: synthesis.version + 1, synthesis: { ...synthesis.synthesis!, dispositionId: 'advice' } }, synthesis.version,
      { origin: 'researcher_edit', reason: 'Invalid lineage change fixture', sourceIds: [] }), /attribution and source versions are immutable/);
    assert.ok(synthesis.ancestorIds.length); assert.equal(store.versions('memory', sources[0]!.id).length, historyCount);
    assert.ok(JSON.stringify(previewPrompt(store, agent.id, 'memory_synthesis', prompts.memory_synthesis.text)).includes('memory_synthesis'));
    decisions.inputs.length = 0;
    await app.message(agent.id, 'What do we remember about this cold car?', 'observer', 'car');
    const recall = decisions.inputs.filter(input => input.task === 'memory_accessibility');
    const forCold = recall.find(input => (input.candidates[0]?.context as { disposition?: { id: string } })?.disposition?.id === 'cold')!;
    const forAdvice = recall.find(input => (input.candidates[0]?.context as { disposition?: { id: string } })?.disposition?.id === 'advice')!;
    assert.ok(cold.suppressedMemoryIds!.every(source => !forCold.candidates.some(candidate => candidate.id === source)));
    assert.ok(cold.suppressedMemoryIds!.every(source => forAdvice.candidates.some(candidate => candidate.id === source)));
    assert.ok(forCold.candidates.some(candidate => candidate.id === synthesis.id));
  } finally { await app.close(); store.close(); }
});

test('sleep synthesis preserves retained legacy memories whose originating cycles are unavailable', async () => {
  const { store, app, agent } = await setup();
  try {
    const source = store.list('memory', agent.id)[0]!;
    const retainedId = 'retained_legacy_memory';
    store.save('memory', { ...source, id: retainedId, version: 1, createdCycle: 'missing_legacy_cycle', predictionId: null }, 0,
      { origin: 'seed', reason: 'Legacy memory retained after cutover', sourceIds: [] });
    const disposition = store.get('disposition', 'cold');
    store.save('disposition', { ...disposition, version: disposition.version + 1, memoryIds: [...disposition.memoryIds, retainedId] }, disposition.version,
      { origin: 'researcher_edit', reason: 'Attach retained subjective memory', sourceIds: [] });
    await app.message(agent.id, 'The cold car still needs attention.', 'observer', 'car');
    const scopes = captureSynthesisScopes(store, agent.id, store.cycles(agent.id).map(cycle => cycle.id));
    assert.ok(scopes.find(scope => scope.disposition.id === 'cold')!.memories.some(memory => memory.id === retainedId));
    const run = await app.consolidation.run(agent.id, 1, 3, { synthesizeMemories: true });
    assert.equal(run.status, 'completed');
    assert.deepEqual(store.get('memory', retainedId).createdCycle, 'missing_legacy_cycle');
  } finally { await app.close(); store.close(); }
});

test('synthesis-only retains recall sources and repeating the same evidence does not duplicate memories', async () => {
  const { store, app, agent } = await setup();
  try {
    const first = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true });
    assert.ok(first.synthesisReviews!.every(review => review.replacedMemoryIds.length === 0));
    const again = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true });
    assert.ok(again.synthesisReviews!.every(review => review.status === 'duplicate'));
    // Captured exact original sources also demonstrate immutable review across overlapping scopes.
    const originalIds = new Set(first.synthesisReviews!.flatMap(review => review.sourceMemoryIds));
    const scopes = captureSynthesisScopes(store, agent.id, store.cycles(agent.id).map(cycle => cycle.id));
    const scope = scopes[0]!;
    const originalScope = { ...scope, memories: scope.memories.filter(memory => originalIds.has(memory.id)) };
    const review = await synthesizeScope(store, app.inspection, app.runtime.constructed, agent.id, first.id, originalScope, false);
    assert.equal(review.status, 'duplicate');
    assert.ok(store.get('disposition', 'cold').suppressedMemoryIds?.length === 0);
    const compact = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true, detailPolicy: 'compact_current_view', synthesisInstructions: 'Keep uncertainty; omit unrelated personal detail.' });
    assert.ok(compact.synthesisReviews!.every(review => review.status === 'created'));
    const compactMemory = store.get('memory', compact.synthesisReviews![0]!.memoryId!);
    assert.equal(compactMemory.synthesis!.policy!.detailPolicy, 'compact_current_view');
    assert.ok(compactMemory.synthesis!.detailDecisions!.every(decision => decision.omittedDetails.length && decision.reason));
    const replaced = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true, replaceSourceMemories: true });
    assert.ok(replaced.synthesisReviews!.every(review => review.status === 'duplicate'));
    assert.ok(replaced.synthesisReviews!.find(review => review.dispositionId === 'cold')!.replacedMemoryIds.length);
    const mapping = store.branchAgent(agent.id, 'synthesis_branch_fixture');
    const synthesis = store.get('memory', first.synthesisReviews![0]!.memoryId!);
    const branched = store.get('memory', mapping[synthesis.id]!);
    assert.equal(branched.agentId, 'synthesis_branch_fixture');
    assert.equal(branched.synthesis!.dispositionId, mapping[synthesis.synthesis!.dispositionId]);
    assert.ok(branched.synthesis!.sources.every(source => store.get('memory', source.memoryId).agentId === branched.agentId));
  } finally { await app.close(); store.close(); }
});

test('invalid source citations fail without synthesis writes and preserve failed-run evidence', async () => {
  const { store, reasoning, app, agent } = await setup();
  try {
    const before = store.list('memory', agent.id).length; reasoning.mode = 'invalid';
    await assert.rejects(app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true }), /unique supplied sources/);
    assert.equal(store.list('memory', agent.id).length, before);
    const failed = store.consolidations(agent.id).at(-1)!;
    assert.equal(failed.status, 'failed'); assert.equal(failed.synthesisReviews!.length, 2);
    assert.equal(failed.synthesisReviews![0]!.status, 'failed');
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/consolidate`, { replaceSourceMemories: true }), /requires memory synthesis/);
  } finally { await app.close(); store.close(); }
});

test('stale source versions reject synthesis and model abstention preserves psychology', async () => {
  const { store, reasoning, app, agent } = await setup();
  try {
    const scope = captureSynthesisScopes(store, agent.id, store.cycles(agent.id).map(cycle => cycle.id))[0]!;
    const memory = scope.memories[0]!;
    store.save('memory', { ...memory, version: memory.version + 1 }, memory.version, { origin: 'researcher_edit', reason: 'Concurrent version fixture', sourceIds: [] });
    await assert.rejects(synthesizeScope(store, app.inspection, app.runtime.constructed, agent.id, 'fixture-run', scope, false), /evidence changed/);
    reasoning.mode = 'abstain';
    await assert.rejects(app.runtime.constructed.infer('memory_reinterpretation', { agentId: agent.id, memories: [], synthesisPolicy: { detailPolicy: 'preserve_details', synthesisInstructions: '' } }), /reserved for offline memory synthesis/);
    const result = await app.consolidation.run(agent.id, 1, 2, { synthesizeMemories: true });
    assert.ok(result.synthesisReviews!.every(review => review.status === 'no_change'));
    assert.equal(store.list('memory', agent.id).some(memory => memory.synthesis), false);
  } finally { await app.close(); store.close(); }
});

test('cold-car hypothesis has paired ordinary-pipeline controls and optional synthesis modes', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Preserved source');
  try {
  for (const id of ['sleep-car-control', 'sleep-car-synthesis', 'sleep-car-replacement', 'sleep-car-belief-changes', 'sleep-car-compact']) {
    const definition = simulationTests.find(definition => definition.id === id)!;
    assert.ok(definition); assert.ok(definition.steps.some(step => step.sleep));
    assert.ok(definition.limitations.includes('Mock'));
    const run = startSimulationTest(app, id, 'fixture', source.id);
    let finished = store.experiments().find(record => record.id === run.id) as unknown as SimulationRun;
    for (let attempt = 0; finished.status === 'running' && attempt < 300; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      finished = store.experiments().find(record => record.id === run.id) as unknown as SimulationRun;
    }
    assert.equal(finished.status, 'completed', finished.error ?? 'Simulation did not finish');
    assert.equal(finished.evidenceBasis, 'fixture'); assert.notEqual(finished.agentId, source.id);
    assert.ok(finished.measures.every(measure => measure.outcome === 'inconclusive'));
    const sleep = store.consolidations(finished.agentId)[0]!;
    assert.equal(sleep.options?.synthesizeMemories, id !== 'sleep-car-control');
    assert.equal(sleep.options?.replaceSourceMemories, id === 'sleep-car-replacement');
    assert.equal(sleep.options?.detailPolicy, id === 'sleep-car-belief-changes' ? 'trace_belief_changes' : id === 'sleep-car-compact' ? 'compact_current_view' : 'preserve_details');
  }
  assert.equal(store.cycles(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});

test('scope review follows independent activation rather than requiring Part admission', async () => {
  const { store, app, agent } = await setup();
  try {
    const base = store.get('disposition', 'cold');
    const disposition = { ...base, version: 1, id: 'authored-deferred-scope', name: 'Deferred scope fixture', threshold: 2,
      memoryIds: store.list('memory', agent.id).slice(0, 2).map(memory => memory.id) };
    store.save('disposition', disposition, 0, { origin: 'seed', reason: 'Activation/admission boundary fixture', sourceIds: [] });
    const cycle = store.cycles(agent.id)[0]!;
    // Authored recorded judgment establishes plumbing only; no cognition or learning conclusion is prescribed.
    store.appendEvent(agent.id, cycle.id, 'construction.judgment', { input: { task: 'disposition_activation', agentId: agent.id,
      world: store.world(cycle.worldId), candidates: [{ id: disposition.id, question: 'Authored independent activation fixture',
        context: { disposition, activationPhase: 'final' } }] }, scores: [{ partId: disposition.id, score: 3 }] });
    assert.equal(store.list('part', agent.id).some(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === disposition.id)), false);
    assert.deepEqual(captureSynthesisScopes(store, agent.id, []), []);
    const scopes = captureSynthesisScopes(store, agent.id, store.cycles(agent.id).map(cycle => cycle.id));
    assert.ok(scopes.some(scope => scope.disposition.id === disposition.id && scope.memories.length === 2));
  } finally { await app.close(); store.close(); }
});
