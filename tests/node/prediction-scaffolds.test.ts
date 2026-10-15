import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { defaultRuntimeOptions } from '../../packages/core/src/runtime.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { type ConstructedInput, PartGenerationSchema } from '../../packages/core/src/constructed-domain.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { ExperienceAttachmentSchema } from '../../packages/core/src/experiential-formation.js';
import { ReconciliationOperationSchema, validateReconciliationEvidence } from '../../packages/core/src/disposition-reconciliation.js';
import { promptCatalog, prompts } from '../../packages/providers/src/prompts.js';

// Explicit fixture hypotheses test authority/lifecycle plumbing, not model discovery.
test('Partless gap hypothesis scaffolds investigate on later original-thread cycles and preserve closed history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-scaffold-history-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const calls: ConstructedInput[] = [];
  let generated = false;
  let resolve = false;
  let institutionalization: unknown = null;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      calls.push(input);
      if (input.task === 'disposition_learning' && institutionalization) {
        assert.ok(input.hypothesisHistory!.some(prediction => prediction.gapOrigin && prediction.status === 'open'), 'Offline learning retains selected earlier hypothesis claims');
        assert.ok(input.hypothesisHistory!.some(prediction => prediction.gapOrigin && prediction.status === 'resolved'), 'Offline learning receives their closure separately');
        return { operations: [institutionalization], reason: 'Explicit conservative institutionalization fixture; not discovered meaning' };
      }
      if (input.task === 'cognition_coverage') {
        assert.equal(input.identity, undefined);
        assert.equal(input.workingParts, undefined);
        assert.equal(input.memories, undefined);
        assert.ok(Object.isFrozen(input.world));
        if (generated) return { operation: 'SUFFICIENT', reason: 'Fixture already proposed the investigation' };
        generated = true;
        return { operation: 'INVESTIGATE', gap: 'Which recurring source produced the signal?', consequentialValue: 'Avoid transferring expectations to a different source',
          reason: 'Explicit deterministic hypothesis fixture', hypotheses: [{
            prediction: { expectation: 'This signal comes from the source encountered earlier', kind: 'state_hypothesis', confidence: 0.4,
              capsule: { interpretation: 'Source continuity is unclear', details: ['A signal was observed'], entities: [], activation: 0, spike: 0, sourceIds: [input.world!.id] },
              horizon: 'When a discriminating source record arrives', evaluateAfterCycle: null,
              scaffolds: [{ name: 'Uncertain source continuity', target: 'signal source', cues: ['source identifying evidence'],
                retrievalIntent: 'Recall evidence discriminating recurring sources', relevantMemoryIds: [],
                supportEvidence: ['A stable source identifier matches'], contradictEvidence: ['Distinct source identifiers'],
                trackedDistinction: 'Continuing versus different source', futureValue: 'Retrieve source-specific experience' }] },
            futureInference: { prediction: 'Calibrate recurring expectations', retrieval: 'Connect appropriate episodes', causal: 'Attribute signals', action: 'Ask for discriminating evidence', compression: 'Connect repeated signals without conflating sources' },
            existingStructureInsufficient: 'No learned source scope exists' }] };
      }
      if (input.task === 'hypothesis_reflection') {
        assert.equal(input.world!.experienced, undefined);
        assert.equal(input.world!.thoughtHistory, undefined);
        assert.equal(input.workingParts, undefined);
        assert.equal(input.hypothesis!.partId, null);
        return { operation: 'resolve', evaluation: { assessment: 'contradicted', interpretation: 'I attributed this signal to the wrong source', causalAttribution: 'Different source identifying evidence',
          evidence: input.laterEvidence!.map(fact => fact.text), evidenceWorldId: input.world!.id },
          memory: { content: 'I expected continuity, but the source record distinguished another source.', gist: 'My source hypothesis was challenged', context: ['Distinct source identifiers'] }, reason: 'Preserve experienced contradiction' };
      }
      const result = await super.constructed(input);
      if (input.task === 'part_cognition') {
        const product = PartGenerationSchema.parse(result);
        product.cognition.prediction = null;
        return product;
      }
      return result;
    }
  }
  class Decisions extends MockDecisions {
    override async checkHypothesis(): Promise<'incomplete' | 'incorrect'> { return resolve ? 'incorrect' : 'incomplete'; }
    override async judge(input: Parameters<MockDecisions['judge']>[0]) {
      return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 }));
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const first = await app.message(agent.id, 'A signal arrived from an unidentified source.', 'observer', 'signals');
    const hypothesis = store.list('prediction', agent.id)[0]!;
    const scaffold = store.list('disposition', agent.id).find(disposition => disposition.scaffold)!;
    assert.equal(hypothesis.partId, null);
    assert.equal(hypothesis.gapOrigin!.threadId, 'signals');
    assert.equal(scaffold.temporary, true);
    assert.equal(scaffold.development!.evidence.length, 0, 'A hypothesis is not lived learning evidence');
    assert.equal(scaffold.sourcePredictionId, hypothesis.id);
    assert.ok(!calls.some(input => input.task === 'part_cognition' && input.dispositions?.some(disposition => disposition.id === scaffold.id)), 'No same-cycle participation');
    assert.equal(store.list('part', agent.id).length, 1, 'Gap generation cannot manufacture an owning Part');
    const coveragePreview = previewPrompt(store, agent.id, 'cognition_coverage', prompts.cognition_coverage.text);
    assert.match(coveragePreview.text, /Consequential cognition coverage/);
    calls.length = 0;
    const otherThread = await app.message(agent.id, 'An unrelated signal elsewhere.', 'observer', 'elsewhere');
    const exclusions = store.eventsByType(agent.id, ['construction.eligibility'], [otherThread.cycle.id]).flatMap(event => event.type === 'construction.eligibility' ? event.payload.scopes : []);
    assert.ok(exclusions.find(scope => scope.dispositionId === scaffold.id)!.reasons.includes('different thread'));
    assert.ok(!calls.some(input => input.dispositions?.some(disposition => disposition.id === scaffold.id)), 'Original-thread scaffolds stay isolated');
    calls.length = 0;
    await app.message(agent.id, 'The source has not been identified yet.', 'observer', 'signals');
    const investigation = calls.find(input => input.task === 'part_cognition' && input.dispositions?.some(disposition => disposition.id === scaffold.id))!;
    assert.ok(investigation);
    assert.equal(investigation.identity, undefined);
    assert.equal(investigation.world!.experienced!.prospective[0]!.partId, null);
    assert.equal(investigation.world!.experienced!.prospective[0]!.kind, 'state_hypothesis');
    resolve = true;
    await app.message(agent.id, 'The identifying record shows a distinct source.', 'observer', 'signals');
    const closed = store.get('prediction', hypothesis.id);
    assert.equal(closed.status, 'resolved');
    const ended = store.get('disposition', scaffold.id);
    assert.equal(ended.active, false);
    assert.ok(ended.scaffold!.endedCycle);
    assert.equal(store.versions('disposition', scaffold.id)[0]!.state.active, true);
    const episode = store.get('memory', closed.memoryId!);
    assert.equal(episode.partId, null);
    assert.equal(episode.predictionId, hypothesis.id);
    assert.equal(episode.encoding!.prediction, hypothesis.expectation);
    assert.ok(store.versions('prediction', hypothesis.id).some(record => record.state.status === 'open'));
    calls.length = 0;
    await app.message(agent.id, 'The same source record remains available.', 'observer', 'signals');
    assert.ok(!calls.some(input => input.task === 'part_cognition' && input.dispositions?.some(disposition => disposition.id === scaffold.id)));
    const retired = store.list('part', agent.id).find(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === scaffold.id));
    assert.ok(retired!.instance!.retirement);
    assert.equal(store.list('disposition', agent.id).filter(disposition => !disposition.temporary).length, 0, 'Resolution does not automatically teach persistent psychology');
    assert.equal(first.cycle.status, 'completed');
    const supporting = store.list('memory', agent.id).filter(memory => memory.partId === retired!.id).slice(0, 2);
    assert.equal(supporting.length, 2);
    const memoryIds = supporting.map(memory => memory.id);
    institutionalization = { operation: 'INSTITUTIONALIZE', sourceDispositionIds: [scaffold.id], memoryIds,
      judgments: memoryIds.map(memoryId => ({ memoryId, dispositionId: scaffold.id, usefulness: 'appropriate',
        experiencedContext: 'Distinguishing signal sources', reason: 'Explicit fixture interpretation of recorded ordinary source investigation' })),
      discriminatingFeatures: ['Source continuity versus reused labels'], alternativeExplanations: ['A display label may be shared'],
      evidencePreserved: 'Preserve the failed claim and all subjective episodes', continuityReason: 'Keep useful relevance distinct from correctness',
      reason: 'Recorded repeated use supports a reusable source distinction', draft: { name: 'Source continuity matters',
        concern: 'Recall evidence distinguishing recurring sources', scope: 'signal source',
        activationCues: [{ text: 'Unresolved signal source continuity', memoryIds }], contextCues: [], internalStateCues: [],
        retrievalIntent: 'Recall prior evidence that distinguishes a source', prerequisites: [], confidence: 'Tentative reusable distinction' } };
    const operation = ReconciliationOperationSchema.parse(institutionalization);
    assert.throws(() => validateReconciliationEvidence(operation, { episodes: supporting.map(memory => ({ memoryId: memory.id, cycleId: memory.createdCycle, context: memory.context })),
      coactivations: [{ cycleId: supporting[0]!.createdCycle, dispositionIds: [scaffold.id], recalledMemoryIds: { [scaffold.id]: memoryIds } }] }), /repeated recorded/,
      'Several memories or correct outcomes in one use cannot fabricate repeated utility');
    const originalScaffold = structuredClone(store.get('disposition', scaffold.id));
    const originalMemories = supporting.map(memory => structuredClone(memory));
    await app.runtime.constructed.learn(agent.id, store.list('memory', agent.id), store.list('prediction', agent.id));
    const durable = store.list('disposition', agent.id).find(disposition => !disposition.temporary)!;
    assert.ok(durable);
    assert.equal(durable.scaffold, undefined, 'Durable descendants cannot inherit ended temporary lifecycle authority');
    assert.ok(durable.development!.lineage.some(link => link.dispositionId === scaffold.id && link.version === originalScaffold.version && link.relationship === 'institutionalized_from'));
    assert.deepEqual(store.get('disposition', scaffold.id), originalScaffold, 'Institutionalization preserves its closed source');
    for (const memory of originalMemories) assert.deepEqual(store.get('memory', memory.id), memory, 'Learning relevance cannot rewrite experience');
    const preservedPrediction = structuredClone(store.get('prediction', hypothesis.id));
    const preservedEpisode = structuredClone(store.get('memory', episode.id));
    const preservedPredictionVersions = structuredClone(store.versions('prediction', hypothesis.id));
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.get('prediction', hypothesis.id), preservedPrediction);
    assert.deepEqual(store.get('memory', episode.id), preservedEpisode);
    assert.deepEqual(store.get('disposition', scaffold.id), originalScaffold);
    assert.deepEqual(store.get('disposition', durable.id), durable);
    assert.deepEqual(store.versions('prediction', hypothesis.id), preservedPredictionVersions);
    const resumed = await new Application(store).message(agent.id, 'The signal source records remain available.', 'observer', 'signals');
    assert.equal(resumed.cycle.status, 'completed', 'Normal cognition can resume with persisted Partless records and ended scaffolds');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('coverage and hypothesis tasks are inspectable and reject private cognitive inputs', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await assert.rejects(app.runtime.constructed.infer('cognition_coverage', { agentId: agent.id, memories: [] }), /never private/);
    await assert.rejects(app.runtime.constructed.infer('hypothesis_reflection', { agentId: agent.id }), /requires factual/);
    for (const task of ['cognition_coverage', 'hypothesis_outcome', 'hypothesis_reflection']) assert.ok(promptCatalog.some(entry => entry.task === task));
  } finally { store.close(); }
});

test('online evidence attachment schema excludes direct persistent formation', () => {
  assert.equal(ExperienceAttachmentSchema.safeParse({ operation: 'CREATE_PROVISIONAL', reason: 'Jump directly to learned structure' }).success, false);
});


test('coverage revises and expires existing hypotheses at the open budget without rewriting earlier scaffolds', async () => {
  const store = new SqliteStore(':memory:');
  let pass = 0;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition') {
        const product = PartGenerationSchema.parse(await super.constructed(input));
        product.cognition.prediction = null;
        return product;
      }
      if (input.task !== 'cognition_coverage') return super.constructed(input);
      pass++;
      const draft = { expectation: pass === 1 ? 'The recurring signal has one source' : 'The recurring label may cover two sources',
        confidence: 0.3, capsule: { interpretation: 'Source continuity is uncertain', details: ['An ambiguous signal'], entities: [],
          activation: 0, spike: 0, sourceIds: [input.world!.id] }, horizon: 'When distinguishing evidence becomes available', evaluateAfterCycle: null,
        scaffolds: [{ name: 'Uncertain source continuity', target: 'signal source', cues: ['identifying evidence'],
          retrievalIntent: 'Recall discriminating source evidence', relevantMemoryIds: [], supportEvidence: ['matching identifiers'],
          contradictEvidence: ['distinct identifiers'], trackedDistinction: 'one or several persistent causes', futureValue: 'Avoid mistaken transfer' }] };
      if (pass === 1) {
        assert.equal(input.hypothesisLimit, 1);
        return { operation: 'INVESTIGATE', gap: 'Missing source coverage', consequentialValue: 'Correctly relate source experience', reason: 'Fixture',
          hypotheses: [{ prediction: draft, futureInference: { prediction: 'Distinguish sources', retrieval: 'Retrieve appropriate history', causal: 'Attribute signals', action: 'Request evidence', compression: 'Connect recurring causes' }, existingStructureInsufficient: 'No learned source relevance' }] };
      }
      if (pass === 2 || pass === 3) {
        assert.equal(input.hypothesisLimit, 0, 'At capacity, coverage can adjust an existing hypothesis but cannot stack another');
        const hypothesis = input.predictions!.find(prediction => prediction.gapOrigin && prediction.status === 'open')!;
        return { operation: 'SUFFICIENT', reason: 'Existing investigation covers the gap', adjustments: [{ predictionId: hypothesis.id,
          operation: pass === 2 ? 'revise' : 'expire', revision: pass === 2 ? draft : null,
          reason: pass === 2 ? 'Preserve an alternative source interpretation' : 'No discriminating information is forthcoming; stop this investigation without asserting falsity' }] };
      }
      return { operation: 'SUFFICIENT', reason: 'Fixture abstains' };
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: Parameters<MockDecisions['judge']>[0]) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, undefined,
      { ...defaultRuntimeOptions, coverage: { maxOpenHypotheses: 1, maxHypothesesPerCycle: 1 } });
    const agent = app.createAgent();
    await app.message(agent.id, 'An unidentified signal repeats.', 'observer', 'signals');
    const hypothesis = store.list('prediction', agent.id)[0]!;
    const initial = store.list('disposition', agent.id)[0]!;
    const second = await app.message(agent.id, 'The display label appears on two different devices.', 'observer', 'signals');
    assert.equal(store.get('prediction', hypothesis.id).version, 2);
    assert.equal(store.versions('prediction', hypothesis.id)[0]!.state.expectation, hypothesis.expectation);
    assert.equal(store.get('disposition', initial.id).active, false);
    const revised = store.list('disposition', agent.id).find(disposition => disposition.id !== initial.id)!;
    assert.equal(revised.scaffold!.createdCycle, second.cycle.id);
    assert.equal(revised.scaffold!.hypothesisVersion, 2);
    assert.ok(!store.eventsByType(agent.id, ['part.thought'], [second.cycle.id]).some(event => event.type === 'part.thought'
      && event.payload.partSnapshot.instance?.dispositionBindings?.some(binding => binding.dispositionId === revised.id)), 'Revised scaffolds cannot participate in their revision cycle');
    await app.message(agent.id, 'No further identifying evidence can be obtained.', 'observer', 'signals');
    assert.equal(store.get('prediction', hypothesis.id).status, 'expired');
    assert.equal(store.get('prediction', hypothesis.id).evaluation, null, 'Expiry is not contradiction');
    assert.equal(store.get('disposition', revised.id).active, false);
    assert.equal(store.versions('disposition', revised.id)[0]!.state.active, true);
    assert.equal(store.list('prediction', agent.id).length, 1);
    await app.message(agent.id, 'The signal stops.', 'observer', 'signals');
    assert.ok(store.list('part', agent.id).filter(part => part.instance?.dispositionBindings?.length).every(part => part.instance!.retirement));
  } finally { store.close(); }
});

test('ordinary Part predictions use the same persisted temporary relevance pathway', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      const product = PartGenerationSchema.parse(result);
      if (product.cognition.prediction) product.cognition.prediction.scaffolds = [{ name: 'Uncertain invitation response', target: 'invitation',
        cues: ['Invitation response evidence'], retrievalIntent: 'Recall responses to uncertain invitations',
        relevantMemoryIds: product.formation.evidenceMemoryIds, supportEvidence: ['A response matching the expectation'],
        contradictEvidence: ['A different response'], trackedDistinction: 'Expected versus experienced response', futureValue: 'Interpret future invitations' }];
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async checkPrediction(): Promise<'incomplete'> { return 'incomplete'; }
    override async judge(input: Parameters<MockDecisions['judge']>[0]) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'I am uncertain about this personal invitation.', 'observer', 'invitations');
    const prediction = store.list('prediction', agent.id)[0]!;
    const scaffold = store.list('disposition', agent.id)[0]!;
    assert.ok(prediction.partId);
    assert.equal(prediction.gapOrigin, undefined);
    assert.equal(scaffold.sourcePredictionId, prediction.id);
    assert.equal(scaffold.scaffold!.hypothesisVersion, 1);
    assert.equal(scaffold.temporary, true);
    await app.message(agent.id, 'The personal invitation still has no response.', 'observer', 'invitations');
    assert.ok(store.list('part', agent.id).some(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === scaffold.id)));
    assert.ok(store.eventsByType(agent.id, ['construction.judgment']).some(event => event.type === 'construction.judgment'
      && event.payload.input.candidates.some(candidate => candidate.id === scaffold.id)));
    const owner = store.get('part', prediction.partId);
    assert.ok(store.list('prediction', agent.id).filter(current => current.partId === owner.id && current.status === 'open').length <= 1);
  } finally { store.close(); }
});

test('temporary investigation budget limits Part admission without normalizing independent activation', async () => {
  const store = new SqliteStore(':memory:');
  class Decisions extends MockDecisions {
    override async judge(input: Parameters<MockDecisions['judge']>[0]) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
  }
  try {
    const app = new Application(store, { reasoning: new MockReasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, undefined,
      { ...defaultRuntimeOptions, maxTemporaryParts: 1 });
    const agent = app.createAgent();
    const initial = await app.message(agent.id, 'A signal is observed.', 'observer', 'signals');
    const world = store.world(initial.cycle.worldId);
    app.runtime.predictions.formGap(world, { expectation: 'The signal may have a recurring source', confidence: 0.4,
      capsule: { interpretation: 'Continuity is unresolved', details: ['A signal was observed'], entities: [], activation: 0, spike: 0, sourceIds: [world.id] },
      horizon: 'Later source evidence', evaluateAfterCycle: null,
      scaffolds: ['Source identifying marks', 'Source location', 'Source operation'].map(name => ({ name, target: name, cues: ['signal source evidence'],
        retrievalIntent: 'Recall discriminating source experience', relevantMemoryIds: [], supportEvidence: ['Continuous identifying evidence'],
        contradictEvidence: ['Different identifying evidence'], trackedDistinction: name, futureValue: 'Distinguish recurring sources' })) },
      { threadId: 'signals', gap: 'Source unknown', consequentialValue: 'Discriminate recurring causes', futureInference: { prediction: 'Distinguish', retrieval: 'Recall', causal: 'Attribute', action: 'Investigate', compression: 'Connect' }, existingStructureInsufficient: 'Explicit budget fixture' });
    await app.runtime.constructed.assess(world, 'signals');
    const sameCycleEligibility = store.eventsByType(agent.id, ['construction.eligibility'], [initial.cycle.id]).at(-1)!;
    assert.ok(sameCycleEligibility.type === 'construction.eligibility');
    assert.equal(sameCycleEligibility.payload.scopes.filter(scope => scope.reasons.includes('created in this cycle; later-cycle eligibility required')).length, 3);
    const later = await app.message(agent.id, 'The signal continues.', 'observer', 'signals');
    const budget = store.eventsByType(agent.id, ['construction.temporary_scope_budget'], [later.cycle.id])[0]!;
    assert.equal(budget.type, 'construction.temporary_scope_budget');
    if (budget.type !== 'construction.temporary_scope_budget') throw new Error('Missing budget evidence');
    assert.equal(budget.payload.activeScopeIds.length, 3);
    assert.equal(budget.payload.admittedScopeIds.length, 1);
    assert.equal(budget.payload.deferredScopeIds.length, 2);
    const admission = store.eventsByType(agent.id, ['construction.admission'], [later.cycle.id])[0]!;
    assert.ok(admission.type === 'construction.admission');
    assert.equal(admission.payload.scopes.filter(scope => scope.status === 'admitted').length, 1);
    assert.equal(admission.payload.scopes.filter(scope => scope.status === 'budget_deferred').length, 2);
    assert.ok(admission.payload.scopes.every(scope => scope.score === 4), 'Budget deferral is not independent nonactivation');
    const judgments = store.eventsByType(agent.id, ['construction.judgment'], [later.cycle.id]);
    const scores = judgments.flatMap(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation' ? event.payload.scores : []);
    assert.deepEqual(scores.map(score => score.score), [4, 4, 4], 'Admission must preserve every independent activation judgment');
    const products = store.eventsByType(agent.id, ['part.thought'], [later.cycle.id]);
    assert.equal(products.length, 1);
  } finally { store.close(); }
});

for (const origin of ['part', 'gap'] as const) {
  test(`${origin} outcome memories distinguish opaque capsule references from snapshot ancestry`, async () => {
    const store = new SqliteStore(':memory:');
    try {
      const app = new Application(store);
      const agent = app.createAgent();
      const first = await app.message(agent.id, 'An uncertain signal arrived.', 'observer', 'ancestry');
      const world = store.world(first.cycle.worldId);
      const initial = store.list('prediction', agent.id).find(prediction => prediction.partId)!;
      assert.ok(initial);
      const foreign = app.createAgent();
      const foreignCycle = await app.message(foreign.id, 'Another signal.', 'observer', 'foreign');
      const opaqueSources = ['event_missing', 'memory_missing', 'observer', foreignCycle.cycle.worldId,
        ...(origin === 'part' ? [world.id, world.id] : [])];
      const draft = { expectation: initial.expectation, kind: initial.kind, confidence: initial.confidence,
        horizon: initial.horizon, evaluateAfterCycle: initial.evaluateAfterCycle,
        capsule: { ...initial.capsule, sourceIds: opaqueSources }, scaffolds: [] };
      let prediction = origin === 'gap' ? app.runtime.predictions.formGap(world, draft, {
        threadId: 'ancestry', gap: 'Uncertain source', consequentialValue: 'Identify the signal',
        futureInference: { prediction: 'Calibration', retrieval: 'Recall', causal: 'Attribution', action: 'Inquiry', compression: 'Continuity' },
        existingStructureInsufficient: 'No source scope',
      }) : initial;
      if (origin === 'part') {
        store.save('prediction', { ...prediction, version: prediction.version + 1, capsule: draft.capsule }, prediction.version,
          { origin: 'researcher_edit', reason: 'Reproduce saved opaque source references', sourceIds: [] });
        prediction = store.get('prediction', prediction.id);
      }
      const evaluationCycle = store.startCycle(agent.id, 'ancestry');
      const evidence = { ...world, id: evaluationCycle.worldId, cycleId: evaluationCycle.id,
        sequence: evaluationCycle.sequence, capturedAt: evaluationCycle.startedAt, facts: [] };
      store.saveWorld(evidence);
      const resolved = app.runtime.predictions.apply(prediction, evidence, {
        operation: 'resolve', reason: 'Observed a different source', mutation: null, revision: null,
        evaluation: { assessment: 'contradicted', interpretation: 'I misattributed the signal', causalAttribution: 'Distinct source',
          evidence: ['Source differed'], evidenceWorldId: evidence.id },
        memory: { content: 'I expected continuity but saw a different source.', gist: 'Challenged continuity', context: [] },
      });
      assert.equal(resolved.status, 'resolved');
      const memory = store.get('memory', resolved.memoryId!);
      assert.deepEqual(memory.ancestorIds, [world.id, evidence.id]);
      assert.deepEqual(resolved.capsule.sourceIds, opaqueSources);
      assert.deepEqual(store.versions('prediction', prediction.id).at(-2)!.state.capsule.sourceIds, opaqueSources);
      assert.equal(memory.partId, origin === 'gap' ? null : initial.partId);
    } finally { store.close(); }
  });
}
