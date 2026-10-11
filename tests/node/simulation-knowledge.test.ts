import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationKnowledge } from '../../packages/sdk/src/simulation-knowledge.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
import { FactSchema, MemorySchema, ProspectiveEntrySchema } from '../../packages/core/src/domain.js';

test('frozen knowledge sources distinguish authored delivery, utterance/observation/action, biased interpretation, recall and imagined alternatives without inventing truth or memory access', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run); const audit = JSON.stringify(store.events(run.agentId));
    const copy = structuredClone(run); const stage = copy.stages[0]!; const owner = stage.parts[0]!;
    // Authored snapshots test source fidelity only; no expected psychological conclusion is forced in the Agent pipeline.
    stage.text = 'Researcher-authored scene with testimony';
    stage.observations = [FactSchema.parse({ source: 'Rowan', kind: 'says', text: 'Jules says the box contains a red token.', referenceId: 'testimony-origin' }),
      FactSchema.parse({ source: 'Sensor', kind: 'observes', text: 'The inspected box contains a blue token.', referenceId: 'direct-observation' }),
      FactSchema.parse({ source: 'External executor', kind: 'does', text: 'The box was opened.', referenceId: 'operation-origin' })];
    stage.thoughts = [{ partId: owner.id, name: owner.name, dispositionIds: [], thought: 'I cannot trust this sign.', interpretation: 'The sign proves a curse.', proposal: null }];
    stage.memories = [MemorySchema.parse({ id: 'knowledge-memory', agentId: run.agentId, version: 2, schemaVersion: 1, partId: owner.id,
      createdCycle: 'prior-experience', content: 'He abandoned me.', gist: 'An abandoned concern', context: [], ancestorIds: ['opaque-ancestor'], predictionId: null })];
    stage.recalls = [{ partId: owner.id, dispositionIds: [], memoryIds: ['knowledge-memory', 'missing-memory'] }];
    stage.experienced = { prospective: [ProspectiveEntrySchema.parse({ predictionId: 'imagined-prediction', version: 1, partId: owner.id, createdCycle: 'prior-cycle', kind: 'state_hypothesis',
      expectation: 'Something terrible will happen.', confidence: 1, horizon: 'Later', conditions: [], conditionedAction: null,
      capsule: { interpretation: 'An attributed certainty', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] } })],
      rememberedInterpretations: [{ cycleId: 'prior-cycle', partId: owner.id, interpretation: 'I used to see this as a threat.', evidenceSummary: [] }],
      posture: [{ partId: owner.id, name: owner.name, interpretation: 'We will stay curious.', affect: '', thought: 'Look carefully.' }] };
    const projected = simulationKnowledge(copy)[0]!; const categories = projected.entries.map(item => item.kind);
    for (const category of ['scenario_input', 'reported_utterance', 'external_observation', 'external_action', 'part_interpretation', 'subjective_memory', 'remembered_interpretation', 'imagined_future', 'self_posture']) assert.ok(categories.includes(category as typeof categories[number]));
    assert.equal(projected.entries.find(item => item.kind === 'reported_utterance')!.source, 'Rowan');
    assert.ok(projected.entries.find(item => item.kind === 'reported_utterance')!.limitation.includes('not independent verification'));
    assert.equal(projected.entries.find(item => item.kind === 'part_interpretation')!.text, 'The sign proves a curse.');
    assert.equal(projected.entries.find(item => item.kind === 'subjective_memory')!.text, 'He abandoned me.');
    assert.ok(projected.entries.find(item => item.kind === 'subjective_memory')!.provenanceIds.includes('opaque-ancestor'));
    assert.ok(projected.entries.some(item => item.text === 'No frozen content for recalled memory missing-memory'));
    assert.ok(projected.entries.find(item => item.kind === 'imagined_future')!.limitation.includes('not an event that occurred'));
    assert.deepEqual(analyzeSimulation(store, copy).knowledge, simulationKnowledge(copy));
    delete stage.observations; delete stage.experienced;
    const historical = simulationKnowledge(copy)[0]!; assert.equal(historical.gaps.length, 3); assert.ok(!historical.entries.some(item => item.kind === 'imagined_future'));
    assert.equal(JSON.stringify(run), bytes); assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
