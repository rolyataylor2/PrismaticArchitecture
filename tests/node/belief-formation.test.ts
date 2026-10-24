import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { constructedOutputSchema } from '../../packages/providers/src/constructed-schema.js';
import { beliefFormationSimulations } from '../../packages/sdk/src/belief-formation-simulations.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

// Deterministic boundary fixtures; prescribed content is not psychological validation.
for (const stage of ['formation', 'cognition'] as const) test(`unrecalled beliefs in ${stage} fail before Part or memory commit, including a bypassing provider`, async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const raw = await super.constructed(input);
      if (input.task !== 'part_cognition') return raw;
      assert.equal(input.memories!.length, 0);
      const output = PartGenerationSchema.parse(raw);
      assert.ok(constructedOutputSchema(input).safeParse(output).success);
      output[stage].beliefs = ['The closed object is unavailable.'];
      assert.equal(constructedOutputSchema(input).safeParse(output).success, false, 'The wire schema must reject the same ungrounded output');
      return output;
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'A closed cabinet is visible.'), /Belief inference requires a currently recalled past memory/);
    assert.equal(store.list('part', agent.id).length, 0);assert.equal(store.list('memory', agent.id).length, 0);
  } finally { await app.close();store.close(); }
});

test('scope continuity excludes previous beliefs from generation while preserving their actual stored version', async () => {
  const store = new SqliteStore(':memory:');const inputs: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') inputs.push(input);return super.constructed(input); }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();await app.message(agent.id, 'An apple piece rests on a plate.', 'observer', 'continuity');
    const prior = store.list('part', agent.id)[0]!;
    const seeded = { ...prior, version: prior.version + 1, beliefs: ['The apple remains on the plate.'] };
    store.save('part', seeded, prior.version, { origin: 'researcher_edit', reason: 'Explicit stale-belief starting condition for an access-boundary fixture', sourceIds: [] });
    await app.message(agent.id, 'The entire plate is visibly empty.', 'observer', 'continuity');
    assert.equal(inputs.length, 2);assert.equal(inputs[1]!.workingParts![0]!.id, prior.id);
    assert.equal(inputs[1]!.workingParts![0]!.version, seeded.version);
    assert.deepEqual(inputs[1]!.workingParts![0]!.beliefs, []);
    assert.deepEqual(store.versions('part', prior.id).find(version => version.state.version === seeded.version)!.state.beliefs, seeded.beliefs);
    assert.deepEqual(store.get('part', prior.id).beliefs, []);
  } finally { await app.close();store.close(); }
});

test('actually recalled memory permits a newly generated gap inference without requiring any belief', async () => {
  const store = new SqliteStore(':memory:');let recalled: string[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const raw = await super.constructed(input);
      if (input.task !== 'part_cognition' || !input.memories?.length) return raw;
      recalled = input.memories.map(memory => memory.id);
      const output = PartGenerationSchema.parse(raw);
      output.formation.beliefs = ['The unseen item may still be where I remember it.'];output.cognition.beliefs = [...output.formation.beliefs];
      assert.ok(constructedOutputSchema(input).safeParse(output).success);
      return output;
    }
  }
  const decisions = new MockDecisions();decisions.judge = async input => input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
  const app = new Application(store, { reasoning: new Reasoning(), decisions, embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();await app.message(agent.id, 'I see an item on a plate.', 'observer', 'inference');
    assert.deepEqual(store.list('part', agent.id)[0]!.beliefs, []);
    await app.message(agent.id, 'The plate is now behind an opaque screen; its contents are not visible.', 'observer', 'inference');
    assert.ok(recalled.length);assert.deepEqual(store.list('part', agent.id)[0]!.beliefs, ['The unseen item may still be where I remember it.']);
  } finally { await app.close();store.close(); }
});

test('paired belief-formation vignettes run ordinary fresh-Agent cognition and retain inconclusive fixture measures', { timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'), app = new Application(store);
  try {
    const source = app.createAgent('Preserved source'), before = store.events(source.id);
    for (const definition of beliefFormationSimulations) {
      assert.ok(simulationTests.includes(definition));assert.equal(definition.seeds.length, 0);
      const start = startSimulationTest(app, definition.id, 'fixture', source.id);let run = listSimulationRuns(app).find(item => item.id === start.id)!;
      const deadline = Date.now() + 25000;
      while (run.status === 'running' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 10));run = listSimulationRuns(app).find(item => item.id === start.id)!; }
      assert.equal(run.status, 'completed', run.error ?? definition.id);assert.equal(run.stages.length, 3);
      assert.notEqual(run.agentId, source.id);assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive'));
      assert.equal(store.eventsByType(run.agentId, ['execution.intent_dispatch']).length, 0);
    }
    assert.deepEqual(store.events(source.id), before);
  } finally { await app.close();store.close(); }
});
