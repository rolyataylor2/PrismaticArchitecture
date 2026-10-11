import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationCandidates, simulationCitation } from '../../packages/sdk/src/simulation-research.js';
import { MemorySchema } from '../../packages/core/src/domain.js';

test('development candidates distinguish missing captured contribution and later recall from imported state, repetition and censored usefulness', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run); const audit = JSON.stringify(store.events(run.agentId));
    // Authored frozen copies test research rules, never forced psychology in the Agent pipeline.
    const copy = structuredClone(run); const first = copy.stages[0]!; const last = copy.stages.at(-1)!;
    const part = structuredClone(first.parts[0]!); part.id = 'candidate-part';
    part.instance = { createdCycle: first.cycleId!, threadId: copy.id, interpretation: 'An authored perspective', evidenceMemoryIds: [], counterevidenceMemoryIds: [], retirement: null };
    const episode = (id: string, createdCycle: string) => MemorySchema.parse({ id, agentId: copy.agentId, version: 1, schemaVersion: 1, partId: part.id,
      createdCycle, content: 'I kept this concern.', gist: 'A remembered concern', context: [], ancestorIds: [], predictionId: null });
    for (const stage of copy.stages) { stage.parts = [structuredClone(part)]; stage.thoughts = []; stage.memories = [episode('new-episode', first.cycleId!), episode('imported-episode', 'before-run')]; stage.recalls = []; }
    last.memories.push(episode('final-episode', last.cycleId!));
    let candidates = simulationCandidates(store, copy);
    const formation = candidates.find(item => item.pattern === 'formation-without-captured-contribution')!;
    assert.match(formation.claim, /1 distinct Part/); assert.equal(formation.evidenceReferences.length, 1);
    assert.match(formation.alternatives, /does not establish unnecessary/);
    const memory = candidates.find(item => item.pattern === 'new-memory-without-later-recall')!;
    assert.match(memory.claim, /2 distinct new episode/); assert.match(memory.claim, /1 originated in the final stage/);
    assert.ok(!memory.evidenceReferences.some(reference => reference.endsWith('/memories/1')));
    assert.match(memory.alternatives, /do not establish failed retention/);
    for (const item of [formation, memory]) for (const reference of item.evidenceReferences) assert.ok(simulationCitation(store, copy, reference).hash);
    // Ordinary same-stage recall cannot prove later retention.
    first.recalls = [{ partId: part.id, dispositionIds: [], memoryIds: ['new-episode'] }];
    assert.match(simulationCandidates(store, copy).find(item => item.pattern === memory.pattern)!.claim, /2 distinct/);
    last.recalls = [{ partId: part.id, dispositionIds: [], memoryIds: ['new-episode'] }];
    last.thoughts = [{ partId: part.id, name: part.name, dispositionIds: [], interpretation: 'I am here.', thought: 'I am here.', proposal: null }];
    candidates = simulationCandidates(store, copy);
    assert.ok(!candidates.some(item => item.pattern === formation.pattern));
    assert.match(candidates.find(item => item.pattern === memory.pattern)!.claim, /1 distinct new episode/);
    first.memories = first.memories.filter(item => item.id !== 'new-episode');
    last.recalls = [];
    assert.match(simulationCandidates(store, copy).find(item => item.pattern === memory.pattern)!.claim, /1 distinct new episode/);
    for (const stage of copy.stages) stage.parts[0]!.instance!.createdCycle = 'before-run';
    assert.ok(!simulationCandidates(store, copy).some(item => item.pattern === formation.pattern));
    assert.equal(JSON.stringify(run), bytes); assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
