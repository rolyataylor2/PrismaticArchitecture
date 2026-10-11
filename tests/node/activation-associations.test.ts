import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { activationAssociations, type Disposition, type ActivationAssociation } from '../../packages/core/src/domain.js';
import type { JudgmentInput, ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { dispositionStatistics } from '../../packages/sdk/src/disposition-statistics.js';

const draft = { name: 'Attention', concern: 'Notice relevance', cues: ['ordinary scene'], scope: null, threshold: 2,
  memoryIds: [], sourcePredictionId: null, temporary: false };

test('association authoring validates references and retains history, including explicit empty replacement', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent(); const other = app.createAgent();
    const create = (owner: string) => api(app, 'POST', `/api/agents/${owner}/dispositions`, draft) as Promise<Disposition>;
    const source = await create(agent.id); const target = await create(agent.id); const foreign = await create(other.id);
    const route = `/api/dispositions/${target.id}`;
    const links: ActivationAssociation[] = [{ kind: 'keyword', keyword: 'welcome', effect: 'contribute' },
      { kind: 'disposition', dispositionId: source.id, effect: 'inhibit' }];
    await api(app, 'PATCH', route, { expectedVersion: 1, patch: { activationAssociations: links } });
    assert.deepEqual(store.get('disposition', target.id).activationAssociations, links);
    for (const dispositionId of [target.id, foreign.id, 'missing']) await assert.rejects(api(app, 'PATCH', route,
      { expectedVersion: 2, patch: { activationAssociations: [{ kind: 'disposition', dispositionId, effect: 'contribute' }] } }));
    assert.equal(store.versions('disposition', target.id).length, 2, 'Invalid writes do not append versions');
    await api(app, 'PATCH', route, { expectedVersion: 2, patch: { activationAssociations: [] } });
    assert.deepEqual(activationAssociations(store.get('disposition', target.id)), []);
    await api(app, 'POST', `${route}/restore`, { expectedVersion: 3, version: 2 });
    assert.deepEqual(activationAssociations(store.get('disposition', target.id)), links);
    assert.equal(store.versions('disposition', target.id).length, 4);
    assert.deepEqual(activationAssociations({ prerequisites: [source.id] }), [{ kind: 'disposition', dispositionId: source.id, effect: 'contribute' }]);
    assert.deepEqual(activationAssociations({ prerequisites: [source.id], activationAssociations: [] }), []);
  } finally { store.close(); }
});

test('two-pass plumbing freezes direct signals, admits soft contribution, inhibits activation and avoids circular feedback', async () => {
  const store = new SqliteStore(':memory:'); const judgments: JudgmentInput[] = []; const generations: ConstructedInput[] = [];
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      judgments.push(input);
      if (input.task !== 'disposition_activation') return super.judge(input);
      return input.candidates.map(candidate => {
        const context = candidate.context as { activationPhase: string; baselineActivation?: number;
          associationSignals?: { dispositionId?: string; baselineActivation?: number; available?: boolean }[] };
        if (context.activationPhase !== 'associated') return { partId: candidate.id, score: candidate.id === 'source' ? 4 : candidate.id === 'inhibited' ? 4 : 0 };
        assert.ok(Object.isFrozen(context.associationSignals));
        assert.ok(context.associationSignals?.every(signal => signal.dispositionId !== 'source' || signal.baselineActivation === 4));
        return { partId: candidate.id, score: candidate.id === 'boosted' ? 3 : 0 };
      });
    }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') generations.push(input); return super.constructed(input); }
  }
  try {
    const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    for (const name of ['source', 'boosted', 'inhibited', 'circular', 'inactive']) store.save('disposition', {
      ...draft, id: name, name, agentId: agent.id, schemaVersion: 1, version: 1, prerequisites: [], active: name !== 'inactive',
    }, 0, { origin: 'seed', reason: 'Deterministic plumbing fixture, not hypothesis evidence', sourceIds: [] });
    const links: Record<string, ActivationAssociation[]> = {
      source: [{ kind: 'disposition', dispositionId: 'boosted', effect: 'contribute' }],
      boosted: [{ kind: 'disposition', dispositionId: 'source', effect: 'contribute' }, { kind: 'keyword', keyword: 'welcome', effect: 'contribute' }],
      inhibited: [{ kind: 'disposition', dispositionId: 'source', effect: 'inhibit' }],
      circular: [{ kind: 'disposition', dispositionId: 'boosted', effect: 'contribute' }, { kind: 'disposition', dispositionId: 'inactive', effect: 'contribute' }],
    };
    for (const [name, activationAssociations] of Object.entries(links)) store.save('disposition', {
      ...store.get('disposition', name), version: 2, activationAssociations,
    }, 1, { origin: 'researcher_edit', reason: 'Association plumbing fixture', sourceIds: [] });
    const result = await app.message(agent.id, 'A welcome in an ordinary scene.', 'observer', 'associations');
    const activation = judgments.filter(input => input.task === 'disposition_activation');
    assert.equal(activation.length, 2);
    assert.ok(judgments.every(input => input.world === activation[0]!.world));
    assert.deepEqual(activation[0]!.candidates.map(candidate => candidate.id), ['source', 'boosted', 'inhibited', 'circular']);
    const context = activation[1]!.candidates.find(candidate => candidate.id === 'circular')!.context as { associationSignals: { baselineActivation: number; available: boolean }[] };
    assert.equal(context.associationSignals[0]!.baselineActivation, 0, 'Boosted final activation never feeds a circular link');
    assert.deepEqual(context.associationSignals[1], { kind: 'disposition', dispositionId: 'inactive', effect: 'contribute', name: null, baselineActivation: 0, available: false });
    assert.deepEqual(generations.map(input => input.dispositions?.[0]?.id), ['boosted']);
    assert.equal(dispositionStatistics(store, 'inhibited').activatedCycles, 0, 'Baseline activity must not count as final use');
    assert.equal(dispositionStatistics(store, 'boosted').activatedCycles, 1);
    const eligibility = store.eventsByType(agent.id, ['construction.eligibility'], [result.cycle.id])[0]!;
    assert.ok(eligibility.type === 'construction.eligibility');
    assert.deepEqual(eligibility.payload.scopes.find(scope => scope.dispositionId === 'inactive')!.reasons, ['inactive scope']);
    assert.equal(eligibility.payload.scopes.find(scope => scope.dispositionId === 'inactive')!.eligible, false);
    const admission = store.eventsByType(agent.id, ['construction.admission'], [result.cycle.id])[0]!;
    assert.ok(admission.type === 'construction.admission');
    assert.equal(admission.payload.scopes.find(scope => scope.dispositionId === 'inhibited')!.status, 'below_threshold');
    assert.equal(admission.payload.scopes.find(scope => scope.dispositionId === 'boosted')!.status, 'admitted');
    assert.equal(admission.payload.scopes.find(scope => scope.dispositionId === 'inhibited')!.score, 0);
    assert.equal(result.cycle.status, 'completed');
  } finally { store.close(); }
});
