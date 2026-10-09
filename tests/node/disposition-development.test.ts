import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DispositionSchema, now } from '../../packages/core/src/domain.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { ExperientialFormationSchema, validateExperientialFormation } from '../../packages/core/src/experiential-formation.js';
import { promptCatalog, renderTaskPrompt } from '../../packages/providers/src/prompts.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { Application } from '../../packages/sdk/src/application.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { ReconciliationOperationSchema, validateReconciliationCitations, validateReconciliationEvidence } from '../../packages/core/src/disposition-reconciliation.js';
import { commitReconciliation } from '../../packages/core/src/reconciliation-commit.js';
import { Inspection } from '../../packages/core/src/inspection.js';
import { dispositionStatistics } from '../../packages/sdk/src/disposition-statistics.js';

test('separate memory reinterpretation preserves old meaning and rejects unsupported revision evidence', async () => {
  const store = new SqliteStore(':memory:');
  let invalid = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task !== 'memory_reinterpretation') return super.constructed(input);
      assert.equal(input.world, undefined);
      assert.equal(input.workingParts, undefined);
      assert.equal(input.dispositions, undefined);
      const memory = input.memories![0]!;
      return { revisions: [{ memoryId: memory.id, supportingMemoryIds: invalid ? ['unexperienced'] : [memory.id],
        content: 'I used to see this invitation as rejection; now I am unsure and want to ask.', gist: 'An uncertain invitation',
        continuity: 'My original fear remains part of this experience.', reason: 'Reconsider my interpretation' }], reason: 'Conservative reflection' };
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'I felt rejected by an uncertain invitation.', 'observer', 'life');
    const memory = structuredClone(store.list('memory', agent.id)[0]!);
    const beforeDispositionVersions = store.list('disposition', agent.id);
    await assert.rejects(app.runtime.constructed.learn(agent.id, [memory], []), /supporting evidence/);
    assert.deepEqual(store.get('memory', memory.id), memory);
    assert.equal(store.versions('memory', memory.id).length, 1);
    invalid = false;
    await app.runtime.constructed.learn(agent.id, [memory], []);
    const current = store.get('memory', memory.id);
    assert.equal(current.version, memory.version + 1);
    assert.match(current.content, /used to see/);
    assert.deepEqual(store.versions('memory', memory.id)[0]!.state, memory);
    assert.equal(current.partId, memory.partId);
    assert.deepEqual(current.ancestorIds, memory.ancestorIds);
    assert.deepEqual(store.list('disposition', agent.id), beforeDispositionVersions,
      'Memory reinterpretation cannot change relevance structure');
  } finally { store.close(); }
});

test('structural reconciliation cannot split on prediction error without contrasting retrieval evidence', () => {
  const draft = { name: 'Terrain recall', concern: 'Recall terrain experience', scope: 'terrain',
    activationCues: [{ text: 'terrain', memoryIds: ['a'] }], contextCues: [], internalStateCues: [],
    retrievalIntent: 'Recall relevant searches', prerequisites: [], confidence: 'Tentative' };
  const operation = ReconciliationOperationSchema.parse({ operation: 'SPLIT', sourceDispositionIds: ['water'],
    memoryIds: ['a', 'b', 'c', 'd'], judgments: ['a', 'b', 'c', 'd'].map(memoryId => ({ memoryId, dispositionId: 'water',
      usefulness: 'appropriate', experiencedContext: 'terrain', reason: 'Retrieval was relevant although the outcome differed' })),
    discriminatingFeatures: ['moist versus dry'], alternativeExplanations: ['World conditions changed'],
    evidencePreserved: 'All prior episodes', continuityReason: 'Parent retained', reason: 'Contextual hypothesis', children: [draft, draft] });
  const observations = { episodes: ['a', 'b', 'c', 'd'].map(memoryId => ({ memoryId, cycleId: memoryId, context: ['terrain'] })), coactivations: [] };
  assert.doesNotThrow(() => validateReconciliationCitations(operation, ['a', 'b', 'c', 'd'], ['water']));
  assert.throws(() => validateReconciliationEvidence(operation, observations),
    'Repeated failed outcomes with appropriate retrieval do not justify a split');
  assert.throws(() => validateReconciliationCitations(operation, ['a'], ['water']));
  if (operation.operation === 'SPLIT') {
    const { children: _children, ...evidence } = operation;
    const archive = ReconciliationOperationSchema.parse({ ...evidence, operation: 'ARCHIVE', scopeCoverage: 'Terrain search' });
    assert.throws(() => validateReconciliationEvidence(archive, observations),
      'Repeated changed outcomes with relevant recall do not establish unhelpfulness or redundancy');
  }
  if (operation.operation === 'SPLIT') {
    const contrast = { ...operation, judgments: operation.judgments.map((judgment, index) => ({ ...judgment,
      usefulness: index < 2 ? 'appropriate' as const : 'misleading' as const })) };
    assert.doesNotThrow(() => validateReconciliationEvidence(contrast, observations));
    assert.throws(() => validateReconciliationEvidence(contrast, { ...observations,
      episodes: observations.episodes.map(episode => ({ ...episode, cycleId: 'one-event' })) }),
    'Several interpretations of one event cannot fabricate repeated evidence');
  }
});

test('ordinary committed experience attaches evidence without rewriting an existing relevance scope', async () => {
  const store = new SqliteStore(':memory:');
  const calls: ConstructedInput[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      calls.push(input);
      if (input.task !== 'experiential_formation') return super.constructed(input);
      const memory = input.memories![0]!;
      assert.ok(store.get('memory', memory.id), 'Formation observes a committed memory');
      assert.equal(input.world, undefined);
      assert.equal(input.workingParts, undefined);
      const existing = input.dispositions?.[0];
      if (existing) return { operation: 'ATTACH_TO_EXISTING', dispositionId: existing.id, memoryIds: [memory.id], reason: 'Another relevant experience' };
      return { operation: 'NO_CHANGE', reason: 'No existing fixture scope to attach to' };
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
    override async checkPrediction(): Promise<'incorrect'> { return 'incorrect'; }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await app.message(agent.id, 'An invitation leaves me uncertain.', 'host', 'life');
    assert.equal(store.list('disposition', agent.id).length, 0, 'A subjective episode cannot directly create persistent relevance online');
    const episode = store.list('memory', agent.id)[0]!;
    const first = DispositionSchema.parse({ id: 'invitation-fixture', agentId: agent.id, version: 1, schemaVersion: 1,
      name: 'Uncertain invitation', concern: 'Recall invitation experiences', scope: 'invitation', cues: ['invitation'],
      prerequisites: [], threshold: 2, memoryIds: [episode.id], sourcePredictionId: null, temporary: false, active: true,
      development: { retrievalIntent: 'Recall my uncertainty about invitations', contextCues: [], internalStateCues: [],
        cueEvidence: [{ cue: 'invitation', kind: 'activation', memoryIds: [episode.id] }], status: 'provisional', confidence: 'Researcher-authored fixture',
        lineage: [], previousVersion: null, createdAt: now(), evidence: [{ memoryId: episode.id, predictionId: null, cycleId: episode.createdCycle,
          threadId: 'life', dispositionVersion: null, relationship: 'unclassified', retrievalUsefulness: 'unknown', reconciliation: 'pending', reason: 'Explicit starting fixture evidence' }] } });
    store.save('disposition', first, 0, { origin: 'researcher_edit', reason: 'Explicit attachment boundary fixture; not generated learning', sourceIds: [episode.id] });
    assert.equal(first.development!.status, 'provisional');
    assert.deepEqual(first.development!.cueEvidence, [{ cue: 'invitation', kind: 'activation', memoryIds: first.memoryIds }],
      'Persist each learned cue’s specific experiential citation');
    assert.equal(dispositionStatistics(store, first.id).activatedCycles, 0,
      'Newly formed relevance cannot fabricate an activation in its formation cycle');
    assert.ok(calls.filter(call => call.task === 'part_cognition').every(call => !call.dispositions?.length),
      'New relevance structure cannot participate in the cycle that formed it');
    assert.equal(first.development!.evidence[0]!.predictionId, null, 'Salient experience need not resolve a prediction');
    await app.message(agent.id, 'Another invitation arrives.', 'host', 'life');
    const next = store.get('disposition', first.id);
    assert.ok(next.memoryIds.length > first.memoryIds.length);
    assert.deepEqual(next.cues, first.cues, 'Evidence attachment cannot rewrite activation cues');
    assert.equal(next.scope, first.scope);
    assert.deepEqual(store.versions('disposition', first.id)[0]!.state, first);
    const priorMemories = store.list('memory', agent.id).map(memory => structuredClone(memory));
    await app.message(agent.id, 'The invitation was cancelled; no meeting happened.', 'host', 'life');
    const reconciliations = store.get('disposition', first.id).development!.evidence.filter(evidence => evidence.predictionId !== null);
    assert.ok(reconciliations.length > 0, 'Resolved prediction episode attaches to its originating disposition');
    for (const evidence of reconciliations) {
      assert.equal(evidence.reconciliation, 'pending');
      assert.equal(evidence.retrievalUsefulness, 'unknown', 'A failed prediction does not imply inappropriate retrieval');
      assert.equal(evidence.relationship, 'unclassified', 'Runtime does not invent psychological interpretation');
      assert.ok(evidence.dispositionVersion !== null);
      assert.equal(store.get('prediction', evidence.predictionId!).memoryId, evidence.memoryId);
    }
    const statistics = dispositionStatistics(store, first.id);
    assert.equal(statistics.activatedCycles, 2);
    assert.ok(statistics.incorrect > 0);
    assert.equal(statistics.correct, 0);
    for (const memory of priorMemories) {
      const current = store.get('memory', memory.id);
      assert.equal(current.content, memory.content, 'Later contradiction cannot overwrite older episode content');
      assert.equal(current.gist, memory.gist);
      assert.deepEqual(current.encoding, memory.encoding);
      assert.deepEqual(store.versions('memory', memory.id).find(record => record.state.version === memory.version)!.state, memory);
    }
  } finally { store.close(); }
});

test('experiential formation is routed with its own editable prompt and conservative mock', async () => {
  assert.ok(promptCatalog.some(entry => entry.task === 'experiential_formation'));
  const input = { task: 'experiential_formation' as const, agentId: 'agent', memories: [], predictions: [], dispositions: [] };
  const rendered = renderTaskPrompt('agent', input.task, input);
  assert.match(rendered, /ATTACH_TO_EXISTING/);
  assert.match(rendered, /No raw WorldState/);
  const result = ExperientialFormationSchema.parse(await new MockReasoning().constructed(input));
  assert.equal(result.operation, 'NO_CHANGE');
});

test('online formation excludes structural rewrites and rejects invented experience citations', () => {
  const proposed = { operation: 'CREATE_PROVISIONAL', memoryIds: ['episode'], reason: 'New context matters',
    draft: { name: 'Dry terrain concern', concern: 'Recall this unsuccessful search', scope: 'dry terrain',
      activationCues: [{ text: 'thirst', memoryIds: ['episode'] }], contextCues: [], internalStateCues: [],
      retrievalIntent: 'Recall my dry-terrain search', prerequisites: ['water'], confidence: 'Provisional' } };
  assert.equal(ExperientialFormationSchema.safeParse(proposed).success, false, 'Online attachment cannot directly create durable relevance');
  const valid = ExperientialFormationSchema.parse({ operation: 'ATTACH_TO_EXISTING', dispositionId: 'water', memoryIds: ['episode'], reason: 'Attributed evidence only' });
  assert.doesNotThrow(() => validateExperientialFormation(valid, ['episode'], ['water']));
  assert.throws(() => validateExperientialFormation(valid, ['other-memory'], ['water']));
  assert.throws(() => validateExperientialFormation(valid, ['episode'], []));
  for (const operation of ['SPLIT', 'MERGE', 'ARCHIVE', 'GENERALIZE', 'SPECIALIZE'])
    assert.equal(ExperientialFormationSchema.safeParse({ ...proposed, operation }).success, false);
  assert.equal(ExperientialFormationSchema.safeParse({ operation: 'ATTACH_TO_EXISTING', dispositionId: 'water',
    memoryIds: ['episode'], reason: 'Evidence only', draft: proposed.draft }).success, false,
  'Attaching evidence cannot smuggle a semantic rewrite');
});

test('developmental evidence and lineage survive restart without rewriting legacy ancestry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'disposition-development-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const change = { origin: 'consolidation' as const, reason: 'Contextual refinement', sourceIds: ['episode'] };
  const legacy = DispositionSchema.parse({ id: 'water', agentId: 'agent', version: 1, schemaVersion: 1,
    name: 'Water search', concern: 'Recall terrain experiences when thirsty', cues: ['thirst'], scope: null,
    prerequisites: [], threshold: 2, memoryIds: ['old-episode'], sourcePredictionId: null, temporary: false, active: true });
  try {
    store.save('agent', { id: 'agent', agentId: 'agent', version: 1, schemaVersion: 1,
      name: 'Continuity test', createdAt: now(), architecture: 'constructed' }, 0, { ...change, origin: 'seed' });
    store.save('part', { id: 'observer', agentId: 'agent', version: 1, schemaVersion: 1,
      name: 'Water concern', mission: 'Remember terrain experiences', beliefs: [], strategies: [], triggers: ['thirst'],
      stickiness: { retained: false, unresolved: false, concern: '' }, associations: [], provenance: [], lineage: [],
      lifecycle: 'archived', mode: 'perspective', temporary: true, emotionalCharge: null, cognitiveCharacteristics: [] },
    0, { ...change, origin: 'seed' });
    const cycle = store.startCycle('agent', 'life');
    store.saveCycle({ ...cycle, status: 'completed' });
    for (const memoryId of ['old-episode', 'episode']) store.save('memory', { id: memoryId, agentId: 'agent',
      version: 1, schemaVersion: 1, partId: 'observer', content: `My experience ${memoryId}`, gist: memoryId,
      context: ['terrain'], ancestorIds: [], predictionId: null, createdCycle: cycle.id, referencingPartIds: ['observer'] },
    0, { ...change, origin: 'seed' });
    store.save('disposition', legacy, 0, { ...change, origin: 'seed' });
    const refined = DispositionSchema.parse({ ...legacy, version: 2, memoryIds: ['old-episode', 'episode'],
      development: { retrievalIntent: 'Recall where terrain search helped or misled me', contextCues: ['dry terrain'],
        internalStateCues: ['thirst'], status: 'provisional', confidence: 'A tentative contextual distinction',
        lineage: [{ dispositionId: 'water', version: 1, relationship: 'specialized_from' }], previousVersion: 1,
        evidence: [{ memoryId: 'episode', predictionId: null, cycleId: cycle.id, threadId: 'life',
          dispositionVersion: 1, relationship: 'contradictory', retrievalUsefulness: 'unknown',
          reconciliation: 'pending', reason: 'Outcome differed; retrieval relevance has not been judged' }], createdAt: now() } });
    store.save('disposition', refined, 1, change);
    for (const invalid of [
      { ...refined.development!, previousVersion: 1 },
      { ...refined.development!, previousVersion: 2, lineage: [{ dispositionId: 'water', version: 99, relationship: 'specialized_from' as const }] },
      { ...refined.development!, previousVersion: 2, evidence: [{ ...refined.development!.evidence[0]!, threadId: 'other-thread' }] },
      { ...refined.development!, previousVersion: 2, evidence: [{ ...refined.development!.evidence[0]!, dispositionVersion: 99 }] },
    ]) {
      assert.throws(() => store.save('disposition', { ...refined, version: 3, development: invalid }, 2, change));
      assert.equal(store.versions('disposition', 'water').length, 2, 'Rejected provenance cannot append history');
      assert.deepEqual(store.get('disposition', 'water'), refined);
    }
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.get('disposition', 'water'), refined);
    assert.deepEqual(store.versions('disposition', 'water')[0]!.state, legacy);
    assert.equal(store.versions('disposition', 'water')[0]!.state.development, undefined,
      'Legacy history must not acquire fabricated developmental judgments');
    assert.deepEqual(store.get('disposition', 'water').memoryIds, ['old-episode', 'episode']);
    assert.equal(store.get('disposition', 'water').development!.evidence[0]!.retrievalUsefulness, 'unknown',
      'Contradiction does not automatically classify retrieval as misleading');
    store.save('disposition', { ...legacy, id: 'terrain', memoryIds: [] }, 0, { ...change, origin: 'seed' });
    const operation = ReconciliationOperationSchema.parse({ operation: 'ADD_DEPENDENCY', sourceDispositionIds: ['water'],
      dependencyId: 'terrain', memoryIds: ['episode'], judgments: [{ memoryId: 'episode', dispositionId: 'water',
        usefulness: 'appropriate', experiencedContext: 'dry terrain', reason: 'Terrain recognition matters before search' }],
      discriminatingFeatures: [], alternativeExplanations: [], evidencePreserved: 'Prior water memories remain',
      continuityReason: 'Conditional eligibility without rewriting memories', reason: 'Add experienced dependency' });
    const memory = store.get('memory', 'episode');
    commitReconciliation(store, new Inspection(store), 'agent', [operation], [memory],
      { episodes: [{ memoryId: memory.id, cycleId: cycle.id, context: memory.context }], coactivations: [] });
    assert.deepEqual(store.get('disposition', 'water').prerequisites, ['terrain']);
    assert.deepEqual(store.get('memory', memory.id), memory, 'Structural changes do not reinterpret memories');
    assert.deepEqual(store.versions('disposition', 'water')[1]!.state, refined);
    const { dependencyId: _legacy, ...associationEvidence } = operation as Extract<typeof operation, { dependencyId: string }>;
    for (const association of [{ kind: 'keyword', keyword: 'flooded terrain', effect: 'inhibit' },
      { kind: 'disposition', dispositionId: 'terrain', effect: 'inhibit' }] as const) {
      const add = ReconciliationOperationSchema.parse({ ...associationEvidence, operation: 'ADD_ASSOCIATION', association });
      commitReconciliation(store, new Inspection(store), 'agent', [add], [memory],
        { episodes: [{ memoryId: memory.id, cycleId: cycle.id, context: memory.context }], coactivations: [] });
      assert.ok(store.get('disposition', 'water').activationAssociations!.some(entry => entry.effect === 'inhibit' && entry.kind === association.kind));
      const remove = ReconciliationOperationSchema.parse({ ...associationEvidence, operation: 'REMOVE_ASSOCIATION', association });
      commitReconciliation(store, new Inspection(store), 'agent', [remove], [memory],
        { episodes: [{ memoryId: memory.id, cycleId: cycle.id, context: memory.context }], coactivations: [] });
    }
    assert.deepEqual(store.get('disposition', 'water').activationAssociations, [{ kind: 'disposition', dispositionId: 'terrain', effect: 'contribute' }]);
    assert.deepEqual(store.get('memory', memory.id), memory);

  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
