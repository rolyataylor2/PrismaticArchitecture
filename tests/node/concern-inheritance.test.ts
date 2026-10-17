import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createComponent } from '../../packages/sdk/src/component-authoring.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { predictionTrajectories } from '../../packages/core/src/prediction-lineage.js';
import { simulationTests, startSimulationTest } from '../../packages/sdk/src/simulation-tests.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';

// Prescribed thought/learning fixtures establish lineage plumbing, never motivational discovery.
test('offline concern inheritance requires recorded origin and later cognition and stays out of online audit context', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-concern-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  let formed = false;
  let sourceEnabled = true;
  let originatingDispositionId: string | null = null;
  let resolve = false;
  let learning: 'none' | 'forged' | 'duplicate' | 'origin_only' | 'valid' = 'none';
  const calls: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      calls.push(input);
      if (input.task === 'cognition_coverage') return { operation: 'SUFFICIENT', reason: 'No gap in this plumbing fixture' };
      if (input.task === 'disposition_learning' && learning !== 'none') {
        assert.equal(input.world, undefined);
        assert.equal(input.workingParts, undefined);
        const scaffold = input.dispositions!.find(disposition => disposition.scaffold)!;
        const trajectory = input.predictionTrajectories!.find(trajectory => trajectory.predictionId === scaffold.sourcePredictionId)!;
        const origin = trajectory.thoughts.find(thought => thought.association === 'origin')!;
        const later = trajectory.thoughts.find(thought => thought.sequence > origin.sequence)!;
        const uses = input.observations!.coactivations.filter(record => record.dispositionIds.includes(scaffold.id));
        const memoryIds = [...new Set(uses.flatMap(record => record.experiencedMemoryIds?.[scaffold.id] ?? []))];
        assert.ok(uses.length >= 2);
        const thoughts = learning === 'forged' ? [origin.eventId, 'unrecorded'] : learning === 'duplicate'
          ? [origin.eventId, origin.eventId] : learning === 'origin_only' ? [later.eventId, trajectory.thoughts.find(thought => thought.association === 'scaffold')!.eventId]
            : [origin.eventId, later.eventId];
        return { operations: [{ operation: 'INSTITUTIONALIZE', sourceDispositionIds: [scaffold.id], memoryIds,
          judgments: memoryIds.map(memoryId => ({ memoryId, dispositionId: scaffold.id, usefulness: 'appropriate',
            experiencedContext: 'Computer performance', reason: 'Fixture recorded performance relevance' })),
          discriminatingFeatures: ['Background load'], alternativeExplanations: ['Other resources'],
          evidencePreserved: 'Keep source thoughts and memories', continuityReason: 'Reusable performance relevance', reason: 'Explicit plumbing fixture',
          draft: { name: 'Need For Responsive Tools', concern: 'Notice performance bottlenecks', scope: 'computer performance',
            activationCues: [{ text: 'computer delay', memoryIds }], contextCues: [], internalStateCues: [],
            retrievalIntent: 'Recall performance evidence', prerequisites: [], confidence: 'Tentative' },
          inheritedConcern: { concern: 'I want tools to respond promptly', meaning: 'Waiting interrupts our work',
            thoughtEventIds: thoughts, continuityReason: 'The expressed desire persisted through investigation',
            distinctnessReason: 'A performance-specific concern can help alongside broader efficiency' } }], reason: 'Fixture institutionalization' };
      }
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      assert.equal(input.predictionTrajectories, undefined);
      assert.ok(input.dispositions?.every(disposition => !disposition.development?.concernInheritance));
      const product = PartGenerationSchema.parse(result);
      product.cognition.prediction = null;
      product.cognition.thought = formed ? 'I still want responsive tools; I am considering what the performance evidence means.' : 'I want the computer to run faster.';
      if (!formed) {
        formed = true;
        product.cognition.prediction = { expectation: 'The computer will remain slow during indexing', confidence: 0.6,
          capsule: { interpretation: 'Delay interrupts work', details: ['Indexing is running'], entities: [], activation: 0, spike: 0, sourceIds: [] },
          horizon: 'After another performance observation', evaluateAfterCycle: null,
          scaffolds: [{ name: 'Performance Evidence', target: 'computer performance', cues: ['computer delay'],
            retrievalIntent: 'Recall performance comparisons', relevantMemoryIds: [], supportEvidence: ['Slow while indexing'],
            contradictEvidence: ['Fast while indexing'], trackedDistinction: 'Indexing versus other load', futureValue: 'Useful diagnosis' }] };
      }
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: Parameters<MockDecisions['judge']>[0]) { return input.candidates.map(candidate => ({ partId: candidate.id, score: candidate.id === originatingDispositionId && !sourceEnabled ? 0 : 4 })); }
    override async checkPrediction(): Promise<'incomplete' | 'correct'> { return resolve ? 'correct' : 'incomplete'; }
  }
  try {
    const providers = { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() };
    let app = new Application(store, providers);
    const agent = app.createAgent();
    const efficiency = createComponent(app, agent.id, 'disposition', { name: 'Efficiency', concern: 'I want responsive tools',
      cues: ['computer performance'], scope: 'computer performance', prerequisites: [], longTermInterest: 0, shortTermInterest: 0, memoryIds: [], sourcePredictionId: null, temporary: false });
    originatingDispositionId = efficiency.id;
    await app.message(agent.id, 'The computer is slow during indexing.', 'observer', 'performance');
    const prediction = store.list('prediction', agent.id)[0]!;
    assert.ok(prediction.cognitionOrigin);
    const origin = store.eventsByType(agent.id, ['part.thought']).find(event => event.id === prediction.cognitionOrigin!.thoughtEventId)!;
    assert.equal(origin.type, 'part.thought');
    if (origin.type === 'part.thought') assert.equal(origin.payload.output.thought, 'I want the computer to run faster.');
    assert.deepEqual(prediction.cognitionOrigin!.dispositions, [{ dispositionId: efficiency.id, version: efficiency.version }]);
    const scaffold = store.list('disposition', agent.id).find(disposition => disposition.scaffold)!;
    assert.equal(scaffold.development?.learnedConcern, undefined);
    await app.message(agent.id, 'The computer is still slow during indexing.', 'observer', 'performance');
    await app.message(agent.id, 'Another document is slow during indexing.', 'observer', 'performance');
    sourceEnabled = false;
    await app.message(agent.id, 'Only performance comparison evidence is available.', 'observer', 'performance');
    sourceEnabled = true;
    await app.message(agent.id, 'Work is again interrupted by computer delay.', 'observer', 'performance');
    resolve = true;
    await app.message(agent.id, 'Measurements confirm the computer remained slow during indexing.', 'observer', 'performance');
    assert.equal(store.get('prediction', prediction.id).status, 'resolved');
    assert.equal(store.get('disposition', scaffold.id).active, false);
    const trajectory = predictionTrajectories(store, agent.id, [store.get('prediction', prediction.id)], store.list('disposition', agent.id))[0]!;
    assert.equal(trajectory.thoughts[0]!.association, 'origin');
    assert.ok(trajectory.thoughts.some(thought => thought.association === 'holding_prediction'));
    assert.ok(trajectory.thoughts.some(thought => thought.association === 'scaffold'));
    assert.ok(trajectory.thoughts.some(thought => thought.association === 'originating_disposition' && thought.partId !== prediction.partId));
    await app.message(agent.id, 'A later unrelated observation.', 'observer', 'other-thread');
    assert.deepEqual(predictionTrajectories(store, agent.id, [store.get('prediction', prediction.id)], store.list('disposition', agent.id))[0], trajectory);
    for (const mode of ['forged', 'duplicate', 'origin_only'] as const) {
      learning = mode;
      await app.runtime.constructed.learn(agent.id, store.list('memory', agent.id), store.list('prediction', agent.id));
      const rejected = store.eventsByType(agent.id, ['disposition.reconciliation_rejected']).at(-1)!;
      assert.equal(rejected.type, 'disposition.reconciliation_rejected');
      if (rejected.type === 'disposition.reconciliation_rejected') assert.match(rejected.payload.reason, /recorded source-investigation|unique thought|originating and later/);
      assert.equal(store.list('disposition', agent.id).filter(disposition => !disposition.temporary).length, 1);
    }
    learning = 'valid';
    await app.runtime.constructed.learn(agent.id, store.list('memory', agent.id), store.list('prediction', agent.id));
    const descendant = store.list('disposition', agent.id).find(disposition => disposition.development?.learnedConcern)!;
    assert.equal(descendant.temporary, false);
    assert.equal(descendant.development!.learnedConcern!.concern, 'I want tools to respond promptly');
    assert.ok(descendant.development!.concernInheritance!.thoughts.some(thought => thought.eventId === origin.id));
    assert.ok(descendant.development!.lineage.some(link => link.dispositionId === scaffold.id));
    assert.equal(store.get('disposition', efficiency.id).concern, 'I want responsive tools');
    assert.match(previewPrompt(store, agent.id, 'disposition_learning', (await import('../../packages/providers/src/prompts.js')).prompts.disposition_learning.text).text, /I want the computer to run faster/);
    learning = 'none';
    store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    assert.deepEqual(store.get('disposition', descendant.id), descendant);
    calls.length = 0;
    await app.message(agent.id, 'Another computer is slow.', 'observer', 'performance');
    const formation = calls.find(input => input.task === 'part_cognition' && input.dispositions?.some(disposition => disposition.id === descendant.id))!;
    assert.deepEqual(formation.dispositions![0]!.development!.learnedConcern, descendant.development!.learnedConcern);
    assert.equal(formation.dispositions![0]!.development!.concernInheritance, undefined);
    assert.equal(store.get('disposition', scaffold.id).development?.learnedConcern, undefined);
    const missingEnd = { ...prediction, id: 'prediction_missing_terminal_fixture', status: 'expired' as const };
    store.save('prediction', missingEnd, 0, { origin: 'researcher_edit', reason: 'Explicit missing-terminal provenance fixture', sourceIds: [] });
    const conservative = predictionTrajectories(store, agent.id, [missingEnd], store.list('disposition', agent.id))[0]!;
    assert.ok(conservative.thoughts.every(thought => thought.cycleId === prediction.createdCycle));
    // Synthetic repeated products test bounds only, not additional lived usefulness.
    const held = store.eventsByType(agent.id, ['part.thought']).find(event => event.type === 'part.thought' && event.payload.predictionSnapshot?.id === prediction.id)!;
    if (held.type === 'part.thought') {
      for (let index = 0; index < 45; index++) store.appendEvent(agent.id, held.cycleId, 'part.thought', {
        ...held.payload, output: { ...held.payload.output, thought: `Synthetic bound fixture ${index}` } });
      const bounded = predictionTrajectories(store, agent.id, [store.get('prediction', prediction.id)], store.list('disposition', agent.id))[0]!;
      assert.equal(bounded.thoughts.length, 40);
      assert.equal(bounded.thoughts[0]!.eventId, origin.id);
      assert.ok(bounded.omittedThoughtCount >= 5);
      assert.ok(bounded.thoughts.every(thought => !('partSnapshot' in thought) && !('world' in thought) && !('memories' in thought)));
    }
    await assert.rejects(app.runtime.constructed.infer('part_cognition', { agentId: agent.id, predictionTrajectories: [trajectory] }), /offline only/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('paired concern-inheritance Simulation Tests run without prescribing psychological conclusions', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store);
    const source = app.createAgent();
    for (const condition of ['desire', 'inquiry']) {
      const definition = simulationTests.find(definition => definition.id === `concern-inheritance-${condition}`)!;
      assert.ok(definition.steps.some(step => step.sleep));
      const run = startSimulationTest(app, definition.id, 'fixture', source.id);
      let finished = store.experiments().find(record => record.id === run.id) as unknown as import('../../packages/sdk/src/simulation-tests.js').SimulationRun;
      for (let attempt = 0; finished.status === 'running' && attempt < 300; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        finished = store.experiments().find(record => record.id === run.id) as unknown as import('../../packages/sdk/src/simulation-tests.js').SimulationRun;
      }
      assert.equal(finished.status, 'completed', finished.error ?? 'Simulation did not finish');
      assert.equal(finished.evidenceBasis, 'fixture');
      assert.notEqual(finished.agentId, source.id);
      assert.equal(finished.stages.length, definition.steps.length);
      assert.ok(finished.measures.some(measure => measure.assessmentKind === 'semantic' && measure.outcome === 'inconclusive'));
      assert.ok(store.get('agent', source.id));
    }
  } finally { store.close(); }
});
