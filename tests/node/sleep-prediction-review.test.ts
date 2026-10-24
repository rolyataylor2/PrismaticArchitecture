import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { PredictionSchema, type Memory } from '../../packages/core/src/domain.js';
import { validateSleepPredictionEvidence, selectSleepPredictionReviews } from '../../packages/core/src/sleep-prediction-review.js';
import { SleepPredictionEvidenceSchema, SleepPredictionPolicySchema, type SleepPredictionEvidence } from '../../packages/core/src/sleep-prediction-domain.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { prompts } from '../../packages/providers/src/prompts.js';

class Fixture extends MockReasoning {
  inputs: ConstructedInput[] = [];
  relationship: SleepPredictionEvidence['relationship'] = 'retrospectively_supported';
  failReview = false;
  override async constructed(input: ConstructedInput): Promise<unknown> {
    this.inputs.push(input);
    if (input.task === 'sleep_prediction_review' && this.failReview) throw new Error('Explicit sleep review provider outage');
    if (input.task === 'part_cognition') return { ...await super.constructed(input) as object,
      memoryReflection: { content: 'I was told that recalling a location had helped earlier.', context: ['Attributed report, not my recovered observation.'],
        interpretation: 'I might try recalling useful locations.', affect: '', perceivedDetails: [] }, memoryGist: 'I heard about useful location recall.' };
    if (input.task === 'sleep_prediction_review') return { relationship: this.relationship,
      evidence: [{ memoryId: input.memories![0]!.id, memoryVersion: input.memories![0]!.version,
        occurrence: ['validated', 'invalidated'].includes(this.relationship) ? 'after_prediction' : 'before_prediction',
        basis: ['validated', 'invalidated'].includes(this.relationship) ? 'experienced' : 'reported', explanation: 'Explicit deterministic evidence fixture, not an inferred cognitive benefit.' }],
      interpretation: 'I have historical support, not a successful forecast.', causalAttribution: 'The reported comparison is uncertain.', limitations: 'I have not tested the strategy prospectively.' };
    return super.constructed(input);
  }
}

test('sleep reviews historical subjective evidence, persists citations, skips unchanged evidence and feeds ordinary learning', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-sleep-evidence-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path); const reasoning = new Fixture();
  const app = new Application(store, { reasoning, decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent('Sleep evidence fixture');
    await app.message(agent.id, 'Yesterday remembering where a resource was saved time.', 'observer', 'resources');
    const cycle = store.cycles(agent.id)[0]!;
    const prediction = PredictionSchema.parse({ id: 'recall-test', agentId: agent.id, version: 1, schemaVersion: 1, partId: null,
      createdCycle: cycle.id, status: 'open', evaluation: null, memoryId: null, expectation: 'Recalling previous locations may reduce searching.', confidence: 0.4,
      capsule: { interpretation: 'I might reduce wasted effort.', details: ['I received advice.'], entities: [], activation: 0, spike: 0, sourceIds: [] },
      horizon: 'When recall is tested', evaluateAfterCycle: null,
      gapOrigin: { threadId: 'resources', gap: 'Untested strategy', consequentialValue: 'Potentially less effort', existingStructureInsufficient: 'No tested recall sensitivity',
        futureInference: { prediction: 'Test recall benefit', retrieval: 'Prior locations', causal: 'Separate recall from luck', action: 'Compare search effort', compression: 'No special object ontology' } } });
    store.save('prediction', prediction, 0, { origin: 'seed', reason: 'Deterministic chronology fixture, not discovered strategy', sourceIds: [] });
    const originalWorld = store.world;
    store.world = () => { throw new Error('Sleep must not replay raw WorldState'); };
    const first = await app.consolidation.run(agent.id);
    store.world = originalWorld;
    assert.equal(first.predictionReviews?.[0]?.result?.relationship, 'retrospectively_supported');
    assert.equal(store.get('prediction', prediction.id).status, 'open');
    assert.equal(store.list('disposition', agent.id).length, 0, 'Historical support cannot create durable structure by itself');
    const reviewInput = reasoning.inputs.find(input => input.task === 'sleep_prediction_review')!;
    assert.ok(reviewInput.memories?.length);
    assert.equal(reviewInput.world, undefined); assert.equal(reviewInput.identity, undefined); assert.equal(reviewInput.workingParts, undefined);
    assert.equal(reviewInput.predictionReviewContext?.predictionSequence, cycle.sequence);
    assert.equal(reviewInput.predictionReviewContext?.memories[0]?.memoryVersion, 1);
    const { task: _task, ...reviewContext } = reviewInput;
    await assert.rejects(app.runtime.constructed.infer('sleep_prediction_review', { ...reviewContext, world: store.world(cycle.worldId) }), /cannot receive WorldState/);
    await assert.rejects(app.runtime.constructed.infer('sleep_prediction_review', { ...reviewContext, identity: store.get('identity', agent.id) }), /never raw worlds or private state/);
    const preview = previewPrompt(store, agent.id, 'sleep_prediction_review', prompts.sleep_prediction_review.text);
    assert.ok(preview.text.includes('recording order is not necessarily event occurrence'));
    assert.equal(reasoning.inputs.find(input => input.task === 'disposition_learning')?.predictionReviews?.[0]?.result?.relationship, 'retrospectively_supported');
    const second = await app.consolidation.run(agent.id);
    assert.equal(second.predictionReviews?.[0]?.status, 'unchanged');
    assert.equal(reasoning.inputs.filter(input => input.task === 'sleep_prediction_review').length, 1);
    await app.message(agent.id, 'An unrelated conversation supplies no resource evidence.', 'observer', 'other');
    const bounded = selectSleepPredictionReviews(store, agent.id, [cycle.id], SleepPredictionPolicySchema.parse({ maxPredictionMemories: 1 }));
    assert.ok(bounded.every(review => review.sourceMemories.length <= 1));
    assert.ok(bounded.every(review => review.sourceMemories.every(source => store.cycle(store.get('memory', source.memoryId).createdCycle).threadId === 'resources')));
    store.save('prediction', { ...prediction, version: 2, expectation: 'Revised recall strategy requires another review.' }, 1,
      { origin: 'seed', reason: 'Explicit changed-version review fixture', sourceIds: [cycle.worldId] });
    const deferred = await app.consolidation.run(agent.id, 1, 1, { maxPredictionReviews: 0, maxPredictionMemories: 1 });
    assert.equal(deferred.predictionReviews![0]!.status, 'deferred');
    assert.equal(reasoning.inputs.filter(input => input.task === 'sleep_prediction_review').length, 1);
    assert.equal(store.consolidations(agent.id)[0]?.predictionReviews?.[0]?.sourceMemories[0]?.version, 1);
    await app.message(agent.id, 'An ordinary later observation supplies another experience.', 'observer', 'resources');
    for (const relationship of ['validated', 'invalidated', 'obsolete'] as const) {
      reasoning.relationship = relationship;
      const subject = { ...prediction, id: `closure-${relationship}` };
      const relevance = { name: 'Recall Test', target: 'resource need', cues: ['resource'], retrievalIntent: 'Previous locations', relevantMemoryIds: [],
        supportEvidence: ['Recall helps'], contradictEvidence: ['Recall adds cost'], trackedDistinction: 'Recall before searching', futureValue: 'Less wasted effort' };
      store.save('prediction', { ...subject, scaffolds: [relevance] }, 0, { origin: 'seed', reason: 'Authored closure fixture', sourceIds: [cycle.worldId] });
      store.save('disposition', { id: `scope-${relationship}`, agentId: agent.id, version: 1, schemaVersion: 1,
        name: 'Recall Test', concern: subject.expectation, cues: ['resource'], scope: 'resource need', prerequisites: [], threshold: 2,
        memoryIds: [], sourcePredictionId: subject.id, temporary: true, active: true,
        scaffold: { createdCycle: cycle.id, threadId: 'resources', hypothesisVersion: 1, relevance, endedCycle: null, endReason: null } },
      0, { origin: 'seed', reason: 'Temporary lifecycle fixture', sourceIds: [subject.id] });
      await app.message(agent.id, `Later test experience for ${relationship}.`, 'observer', 'resources');
      const closed = await app.consolidation.run(agent.id);
      assert.equal(closed.status, 'completed');
      assert.equal(store.get('prediction', subject.id).status, relationship === 'obsolete' ? 'invalidated' : 'resolved');
      assert.equal(store.get('disposition', `scope-${relationship}`).active, false);
      assert.equal(store.versions('prediction', subject.id).length, 2);
      assert.equal(store.versions('disposition', `scope-${relationship}`).length, 2);
    }
    store.save('prediction', { ...prediction, id: 'failure-review' }, 0, { origin: 'seed', reason: 'Provider failure fixture', sourceIds: [cycle.worldId] });
    reasoning.failReview = true;
    await assert.rejects(app.consolidation.run(agent.id), /Explicit sleep review provider outage/);
    assert.equal(store.consolidations(agent.id).at(-1)?.status, 'failed');
    assert.equal(store.consolidations(agent.id).at(-1)?.predictionReviews?.[0]?.status, 'failed');
    assert.equal(store.consolidations(agent.id).at(-1)?.predictionReviews?.[0]?.result, null);
    assert.equal(store.get('prediction', 'failure-review').status, 'open');
    const savedReviews = JSON.stringify(store.consolidations(agent.id));
    await app.close(); store.close(); store = new SqliteStore(path);
    assert.equal(JSON.stringify(store.consolidations(agent.id)), savedReviews, 'Review citations, fingerprints and results survive restart');
    assert.equal(store.get('prediction', 'closure-validated').status, 'resolved');
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('sleep rejects invented citations and historical or counterfactual evidence relabeled as prospective success', () => {
  const memory = { id: 'm', version: 1, createdCycle: 'earlier' } as Memory;
  const prediction = { createdCycle: 'later' } as ReturnType<typeof PredictionSchema.parse>;
  const historical = SleepPredictionEvidenceSchema.parse({ relationship: 'validated', evidence: [{ memoryId: 'm', memoryVersion: 1,
    occurrence: 'before_prediction', basis: 'experienced', explanation: 'Earlier experience' }], interpretation: 'I think it helped.', causalAttribution: 'Unclear.', limitations: 'Historical only.' });
  const sequences = new Map([['earlier', 1], ['later', 2]]);
  assert.throws(() => validateSleepPredictionEvidence(historical, [memory], prediction, sequences), /experienced later test/);
  assert.throws(() => validateSleepPredictionEvidence({ ...historical, relationship: 'retrospectively_supported', evidence: [{ ...historical.evidence[0]!, memoryVersion: 2 }] }, [memory], prediction, sequences), /supplied memory versions/);
  assert.throws(() => validateSleepPredictionEvidence({ ...historical, evidence: [{ ...historical.evidence[0]!, occurrence: 'after_prediction', basis: 'counterfactual' }] }, [memory], prediction, sequences), /experienced later test/);
  validateSleepPredictionEvidence({ ...historical, relationship: 'retrospectively_supported' }, [memory], prediction, sequences);
});
