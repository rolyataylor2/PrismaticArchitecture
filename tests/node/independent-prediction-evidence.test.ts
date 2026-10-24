import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { evidenceCatalog, captureMemoryEvidence, memoryEvidenceLineage } from '../../packages/core/src/evidence-provenance.js';
import { searchSleepPredictionEvidence, selectSleepPredictionReviews } from '../../packages/core/src/sleep-prediction-review.js';
import { SleepPredictionPolicySchema } from '../../packages/core/src/sleep-prediction-domain.js';
import { ReconciliationOperationSchema } from '../../packages/core/src/disposition-reconciliation.js';
import { commitReconciliation } from '../../packages/core/src/reconciliation-commit.js';
import { consumedExperienceIds } from '../../packages/core/src/reconciliation-evidence.js';
import { Inspection } from '../../packages/core/src/inspection.js';
import { ordinaryMemory, type Memory, type Prediction } from '../../packages/core/src/domain.js';

// Prescribed products verify contracts only; registered experiments use unforced cognition.
class Reasoning extends MockReasoning {
  reply?: (input: ConstructedInput) => unknown;
  override async constructed(input: ConstructedInput): Promise<unknown> {
    if (input.task === 'part_cognition') {
      const product = PartGenerationSchema.parse(await super.constructed(input));
      const source = evidenceCatalog(input.world!).find(source => source.cycleId === input.world!.cycleId)!;
      return { ...product, memoryReflection: { content: `I encountered this record: ${source.text}`, context: [source.text],
        interpretation: 'I retain the supplied record without asserting a hidden cause.', affect: '', perceivedDetails: [source.text],
        evidenceCitations: [{ sourceId: source.sourceId, quote: source.text }] }, memoryGist: source.text,
        cognition: { ...product.cognition, prediction: null } };
    }
    if (input.task === 'sleep_prediction_review' && this.reply) return this.reply(input);
    return super.constructed(input);
  }
}
class Decisions extends MockDecisions {
  searches: JudgmentInput[] = [];
  override async judge(input: JudgmentInput) {
    if (input.task === 'disposition_activation') return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    if (input.candidates.some(candidate => 'sleepEvidenceQuery' in candidate.context)) {
      this.searches.push(input);
      return input.candidates.map(candidate => {
        const context = candidate.context as { memory: Memory; sleepEvidenceQuery: { mode: string } };
        const tag = context.sleepEvidenceQuery.mode === 'support' ? 'support' : context.sleepEvidenceQuery.mode === 'contradict' ? 'contrary' : 'unknown';
        return { partId: candidate.id, score: context.memory.gist.includes(tag) ? 4 : 0 };
      });
    }
    return super.judge(input);
  }
}
function setup() {
  const store = new SqliteStore(':memory:'); const reasoning = new Reasoning(); const decisions = new Decisions();
  const app = new Application(store, { reasoning, decisions, embeddings: new MockEmbeddings() });
  const agent = app.createAgent('Independent evidence fixture'); return { store, reasoning, decisions, app, agent };
}
function form(app: Application, agentId: string, worldId: string, kind: 'state_hypothesis' | 'action_conditioned' = 'state_hypothesis'): Prediction {
  assert.equal(app.store.world(worldId).agentId, agentId);
  return app.runtime.predictions.formGap(app.store.world(worldId), { expectation: 'Checking a prior location reduces search effort.', confidence: 0.4,
    kind, horizon: 'After an observed comparable search', evaluateAfterCycle: null,
    capsule: { interpretation: 'A testable possibility', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] } },
  { threadId: 'evidence', gap: 'Untested method', consequentialValue: 'Search effort', existingStructureInsufficient: 'No demonstrated comparison',
    futureInference: { prediction: 'Test benefit', retrieval: 'Relevant records', causal: 'Check costs', action: 'Consider recall', compression: 'No special object logic' } });
}
function verdict(input: ConstructedInput, memory: Memory, overrides: object = {}) {
  return { relationship: 'validated', evidence: [{ memoryId: memory.id, memoryVersion: memory.version, occurrence: 'after_prediction', basis: 'experienced',
    testedClaim: input.predictions![0]!.expectation, stance: 'supports', test: 'outcome', conditions: 'met', actionInfluence: 'observational',
    outcomeSourceIds: input.predictionReviewContext!.memories.find(item => item.memoryId === memory.id)!.sources!.map(source => (source as { sourceId: string }).sourceId),
    explanation: 'Explicit fixture test, not a semantic observation.', ...overrides }],
    coverage: { supportingMemoryIds: input.memories!.map(memory => memory.id), contradictingMemoryIds: [], undeterminedMemoryIds: [], assessment: 'Authored coverage fixture.' },
    interpretation: 'I have a sourced test.', causalAttribution: 'Qualified by the supplied test conditions.', limitations: 'Deterministic contract evidence only.' };
}

test('recollection and synthesis keep original sources; old facts cannot become a prospective test', async () => {
  const { store, app, reasoning, agent } = setup();
  try {
    const first = await app.message(agent.id, 'A support record says a prior location check found a tool.', 'observer', 'evidence');
    const original = store.list('memory', agent.id)[0]!;
    const prediction = form(app, agent.id, first.cycle.worldId);
    const later = await app.message(agent.id, 'No new outcome was observed; only the old record is reconsidered.', 'observer', 'evidence');
    const alias = { ...original, id: 'recollected-alias', version: 1, createdCycle: later.cycle.id,
      content: 'I feel more convinced after remembering it again.', gist: 'support alias',
      evidence: { sources: [], parents: [{ memoryId: original.id, version: original.version }], dispositionIds: [] } };
    store.save('memory', alias, 0, { origin: 'seed', reason: 'Explicit derived-memory fixture', sourceIds: [original.id] });
    assert.deepEqual(memoryEvidenceLineage(store, alias).experienceIds, memoryEvidenceLineage(store, original).experienceIds);
    assert.equal(ordinaryMemory(original).evidence, undefined, 'Ordinary recall cannot bypass the remembered-detail boundary through audit excerpts');
    assert.throws(() => captureMemoryEvidence(store, store.world(later.cycle.worldId), [{ sourceId: 'invented', quote: 'Never observed' }], []), /supplied external record/);
    reasoning.reply = input => verdict(input, input.memories!.find(memory => memory.id === alias.id) ?? input.memories!.find(memory => memory.id === original.id)!);
    // The selected old-root memory may be its original rather than its derived alias.
    await assert.rejects(app.consolidation.run(agent.id), /Prospective/);
    assert.equal(store.get('prediction', prediction.id).status, 'open');
    assert.equal(store.consolidations(agent.id).at(-1)!.status, 'failed', 'Rejected certification is not fabricated unverifiable cognition');
    assert.equal(store.get('memory', original.id).evidence!.sources[0]!.firstRecordedAt, store.cycle(first.cycle.id).startedAt);
  } finally { await app.close(); store.close(); }
});

test('sleep queries contrary and unknown outcomes without disposition preference or duplicate-source crowding', async () => {
  const { store, app, decisions, agent } = setup();
  try {
    for (const text of ['support: one claim was inaccurate', 'contrary: a checked claim was truthful', 'unknown: no check established accuracy'])
      await app.message(agent.id, text, 'observer', 'evidence');
    const original = store.list('memory', agent.id).find(memory => memory.gist.includes('support:'))!;
    for (let index = 0; index < 8; index++) store.save('memory', { ...original, id: `support-alias-${index}`, version: 1,
      content: 'I interpret this as deception.', evidence: { sources: [], parents: [{ memoryId: original.id, version: original.version }], dispositionIds: [] } },
    0, { origin: 'seed', reason: 'Repeated interpretations of one event', sourceIds: [original.id] });
    const cycle = store.cycles(agent.id).at(-1)!; const prediction = form(app, agent.id, cycle.worldId);
    const pending = selectSleepPredictionReviews(store, agent.id, [cycle.id], SleepPredictionPolicySchema.parse({ maxPredictionMemories: 3 })).find(review => review.predictionId === prediction.id)!;
    const selected = await searchSleepPredictionEvidence(store, app.runtime.constructed, pending, 3);
    assert.equal(selected.sourceMemories.length, 3);
    const gists = selected.sourceMemories.map(reference => store.get('memory', reference.memoryId).gist);
    assert.ok(gists.some(gist => gist.includes('contrary:'))); assert.ok(gists.some(gist => gist.includes('unknown:')));
    assert.ok(decisions.searches.every(input => !input.world.facts.length && input.candidates.every(candidate => !('disposition' in candidate.context))));
    assert.ok(store.eventsByType(agent.id, ['construction.judgment']).filter(event => event.type === 'construction.judgment' && event.payload.input.candidates.some(candidate => 'sleepEvidenceQuery' in candidate.context)).every(event => event.cycleId === null));
  } finally { await app.close(); store.close(); }
});

test('stable source records keep their experience across re-exposure and branching; a fresh timestamp remains a new trial', async () => {
  const { store, app, agent } = setup();
  try {
    const timestamp = new Date().toISOString();
    const first = await app.runtime.run(agent.id, [{ source: 'observer', kind: 'observes', text: 'support: a checked location used 2 steps instead of 12.', timestamp, referenceId: 'trial-record' }], 'evidence');
    const original = store.list('memory', agent.id)[0]!;
    const mapping = store.branchAgent(agent.id, 'branched-evidence-agent');
    const branchId = mapping[agent.id]!;
    const inherited = store.get('memory', mapping[original.id]!);
    assert.deepEqual(memoryEvidenceLineage(store, inherited).experienceIds, [mapping[first.cycle.id]!]);
    await app.runtime.run(branchId, [{ source: 'observer', kind: 'observes', text: 'support: a checked location used 2 steps instead of 12.', timestamp, referenceId: 'trial-record' }], 'evidence');
    const replayed = store.list('memory', branchId).at(-1)!;
    assert.deepEqual(memoryEvidenceLineage(store, replayed).experienceIds, memoryEvidenceLineage(store, inherited).experienceIds);
    assert.equal(replayed.evidence!.sources[0]!.firstRecordedAt, original.evidence!.sources[0]!.firstRecordedAt);
    const fresh = await app.runtime.run(branchId, [{ source: 'observer', kind: 'observes', text: 'support: a different trial of the same method used 3 steps instead of 15.', timestamp: new Date().toISOString(), referenceId: 'trial-record' }], 'evidence');
    assert.deepEqual(memoryEvidenceLineage(store, store.list('memory', branchId).at(-1)!).experienceIds, [fresh.cycle.id]);
    assert.equal(store.list('memory', agent.id).length, 1, 'Branch trials preserve the source Agent');
  } finally { await app.close(); store.close(); }
});

for (const change of [{ conditions: 'unknown' }, { test: 'interpretation' }, { actionInfluence: 'self_influenced' }, { testedClaim: 'The recalled location was accurate.' }])
test(`a new event does not certify an untested or self-influenced claim: ${JSON.stringify(change)}`, async () => {
  const { store, app, reasoning, agent } = setup();
  try {
    const first = await app.message(agent.id, 'There is no tested method yet.', 'observer', 'evidence');
    const prediction = form(app, agent.id, first.cycle.worldId);
    await app.message(agent.id, 'A new external record reports a reaction; effort and cause remain undetermined.', 'observer', 'evidence');
    reasoning.reply = input => verdict(input, input.memories!.slice().sort((a, b) => store.cycle(b.createdCycle).sequence - store.cycle(a.createdCycle).sequence)[0]!, change);
    await assert.rejects(app.consolidation.run(agent.id), /independently sourced observable test/);
    assert.equal(store.get('prediction', prediction.id).status, 'open');
  } finally { await app.close(); store.close(); }
});

test('a newly delivered old-dated record is not a prospective test in waking checks or sleep', async () => {
  const { store, app, reasoning, agent } = setup();
  try {
    const first = await app.message(agent.id, 'A method has not been tested.', 'observer', 'evidence');
    const prediction = form(app, agent.id, first.cycle.worldId);
    const checked = store.eventsByType(agent.id, ['prediction.outcome_checked']).length;
    await app.runtime.run(agent.id, [{ source: 'observer', kind: 'observes', text: 'An archived outcome dated years earlier is delivered now.', timestamp: '2020-01-01T00:00:00.000Z', referenceId: 'archived-outcome' }], 'evidence');
    assert.equal(store.eventsByType(agent.id, ['prediction.outcome_checked']).length, checked);
    reasoning.reply = input => verdict(input, input.memories!.slice().sort((a, b) => store.cycle(b.createdCycle).sequence - store.cycle(a.createdCycle).sequence)[0]!);
    await assert.rejects(app.consolidation.run(agent.id), /independently sourced observable test/);
    assert.equal(store.get('prediction', prediction.id).status, 'open');
  } finally { await app.close(); store.close(); }
});

test('revision resets the evidence boundary and current evaluation rather than inheriting previous support', async () => {
  const { store, app, reasoning, agent } = setup();
  try {
    const first = await app.message(agent.id, 'A method awaits comparison.', 'observer', 'evidence');
    const prediction = form(app, agent.id, first.cycle.worldId);
    const later = await app.message(agent.id, 'A comparable location check reduced observed steps from 12 to 2.', 'observer', 'evidence');
    const world = store.world(later.cycle.worldId);
    const continued = app.runtime.predictions.apply(prediction, world, { operation: 'continue', revision: null,
      evaluation: { assessment: 'partly_confirmed', interpretation: 'I have partial support for the original claim.', causalAttribution: 'Some conditions remain uncertain.', evidence: [], evidenceWorldId: world.id },
      memory: null, mutation: null, reason: 'Authored partial-evidence fixture' });
    const revised = app.runtime.predictions.apply(continued, world, { operation: 'revise',
      revision: { expectation: 'Checking a prior location reduces effort under matched access conditions.', confidence: 0.4, capsule: prediction.capsule, horizon: prediction.horizon, evaluateAfterCycle: null },
      evaluation: null, memory: null, mutation: null, reason: 'Test a more precise claim prospectively' });
    assert.equal(revised.evaluation, null); assert.equal(revised.memoryId, null);
    assert.ok(revised.evidenceOrigin!.knownExperienceIds.includes(later.cycle.id));
    assert.equal(revised.committedAfterSequence, later.cycle.sequence);
    assert.equal(store.versions('prediction', prediction.id).find(record => record.state.version === continued.version)!.state.evaluation!.assessment, 'partly_confirmed');
    reasoning.reply = input => verdict(input, input.memories!.slice().sort((a, b) => store.cycle(b.createdCycle).sequence - store.cycle(a.createdCycle).sequence)[0]!);
    await assert.rejects(app.consolidation.run(agent.id), /Prospective/);
    assert.equal(store.get('prediction', prediction.id).status, 'open');
  } finally { await app.close(); store.close(); }
});

test('an explicitly action-conditioned prediction can retain a qualified sourced test of its own strategy', async () => {
  const { store, app, reasoning, agent } = setup();
  try {
    const first = await app.message(agent.id, 'A conditional method awaits comparison.', 'observer', 'evidence');
    const prediction = form(app, agent.id, first.cycle.worldId, 'action_conditioned');
    await app.message(agent.id, 'The selected location-check strategy was performed in matched conditions and took 2 steps compared with 12 in the recorded comparison.', 'observer', 'evidence');
    reasoning.reply = input => verdict(input, input.memories!.slice().sort((a, b) => store.cycle(b.createdCycle).sequence - store.cycle(a.createdCycle).sequence)[0]!, { actionInfluence: 'action_conditioned' });
    const run = await app.consolidation.run(agent.id);
    assert.equal(store.get('prediction', prediction.id).status, 'resolved');
    assert.equal(run.predictionReviews!.find(review => review.predictionId === prediction.id)!.independentOutcomeExperienceIds!.length, 1);
  } finally { await app.close(); store.close(); }
});

test('confidence needs independent outcomes, consumes them once and can subsequently weaken without new confirmation', async () => {
  const { store, app, agent } = setup();
  try {
    store.save('disposition', { id: 'scope', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Need Useful Recall', concern: 'Recall useful prior locations',
      cues: ['record'], scope: 'location recall', prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
      development: { retrievalIntent: 'Recall useful records', contextCues: [], internalStateCues: [], status: 'provisional', confidence: 'Tentative', lineage: [], previousVersion: null, evidence: [], createdAt: new Date(Date.now() - 1000).toISOString() } },
    0, { origin: 'seed', reason: 'Explicit initial sensitivity, preceding outcome experience', sourceIds: [] });
    for (const text of ['support: a checked location reduced the search from 12 steps to 2', 'support: another comparable check reduced the search from 15 steps to 3'])
      await app.message(agent.id, text, 'observer', 'evidence');
    const memories = store.list('memory', agent.id); const [first, second] = memories;
    const alias = { ...second!, id: 'same-event-again', evidence: { sources: [], parents: [{ memoryId: first!.id, version: first!.version }], dispositionIds: [] } };
    store.save('memory', alias, 0, { origin: 'seed', reason: 'Reinterpretation is not another test', sourceIds: [first!.id] });
    const operation = (selected: Memory[], confidence = 'Supported by actual comparisons') => ReconciliationOperationSchema.parse({ operation: 'ASSESS_HYPOTHESIS', confidenceEffect: 'strengthen',
      status: 'established', confidence, sourceDispositionIds: ['scope'], memoryIds: selected.map(memory => memory.id),
      judgments: selected.map(memory => ({ memoryId: memory.id, dispositionId: 'scope', usefulness: 'appropriate', experiencedContext: 'Recorded comparable searches', reason: 'Explicit outcome fixture',
        outcomeEvidence: [{ memoryId: memory.id, sourceIds: memoryEvidenceLineage(store, memory).sources.map(source => source.sourceId), testedClaim: 'Location recall reduces search effort', conditionsMet: true,
          observableOutcome: 'Recorded comparable costs differ.', test: 'outcome', occurrence: 'after_prediction', stance: 'supports', actionInfluence: 'observational' }] })),
      discriminatingFeatures: [], alternativeExplanations: ['Different starting conditions'], evidencePreserved: 'All prior versions remain', continuityReason: 'Same sensitivity', reason: 'Explicit prospective assessment fixture' });
    const observations = { episodes: [...memories, alias].map(memory => ({ memoryId: memory.id, cycleId: memory.createdCycle, context: memory.context })),
      coactivations: [...memories, alias].map(memory => ({ cycleId: memory.createdCycle, dispositionIds: ['scope'], recalledMemoryIds: { scope: [memory.id] }, experiencedMemoryIds: { scope: [memory.id] } })) };
    const inspection = new Inspection(store);
    assert.equal(commitReconciliation(store, inspection, agent.id, [operation([first!, alias])], [...memories, alias], observations).length, 0, 'One original event cannot establish repeated confirmation');
    assert.equal(commitReconciliation(store, inspection, agent.id, [operation(memories)], [...memories, alias], observations).length, 1);
    const established = store.get('disposition', 'scope'); assert.equal(established.development!.usedExperienceIds!.length, 2);
    assert.equal(commitReconciliation(store, inspection, agent.id, [operation(memories, 'Even more certain after rereading')], [...memories, alias], observations).length, 0);
    assert.deepEqual(store.get('disposition', 'scope'), established);
    const weaker = { ...operation(memories), confidenceEffect: 'weaken' as const, status: 'provisional' as const, confidence: 'I remain uncertain about transfer.' };
    assert.equal(commitReconciliation(store, inspection, agent.id, [weaker], [...memories, alias], observations).length, 1);
    assert.deepEqual(store.get('disposition', 'scope').development!.usedExperienceIds, established.development!.usedExperienceIds);
    const weakened = store.get('disposition', 'scope');
    store.save('disposition', { ...weakened, version: weakened.version + 1, development: { ...weakened.development!, previousVersion: weakened.version, usedExperienceIds: [] } }, weakened.version, { origin: 'seed', reason: 'Rollback fixture cannot erase consumed source credit', sourceIds: [] });
    assert.deepEqual(new Set(consumedExperienceIds(store, [store.get('disposition', 'scope')])), new Set(established.development!.usedExperienceIds));
    assert.equal(commitReconciliation(store, inspection, agent.id, [operation(memories, 'Reused after rollback')], [...memories, alias], observations).length, 0);
    assert.equal(store.versions('disposition', 'scope').find(record => record.state.version === established.version)!.state.development!.confidence, established.development!.confidence);
  } finally { await app.close(); store.close(); }
});
