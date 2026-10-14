import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Inspection } from '../../packages/core/src/inspection.js';
import { ReconciliationOperationSchema } from '../../packages/core/src/disposition-reconciliation.js';
import { commitReconciliation } from '../../packages/core/src/reconciliation-commit.js';
import { api } from '../../packages/sdk/src/api.js';

test('split, merge and archive retain lineage and subjective evidence transactionally', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    for (const description of ['wet slope and stream', 'moist valley water', 'dry slope no water', 'dry basin no water'])
      await app.message(agent.id, description, 'observer', 'life');
    const memories = store.list('memory', agent.id);
    const memoryIds = memories.map(memory => memory.id);
    const episodes = memories.map(memory => ({ memoryId: memory.id, cycleId: memory.createdCycle, context: memory.context }));
    store.save('disposition', { id: 'terrain-parent', agentId: agent.id, version: 1, schemaVersion: 1,
      name: 'Terrain concern', concern: 'Recall terrain searches', cues: ['terrain'], scope: 'terrain', prerequisites: [],
      threshold: 2, memoryIds, sourcePredictionId: null, temporary: false, active: true }, 0,
    { origin: 'seed', reason: 'Explicit structural plumbing fixture', sourceIds: memoryIds });
    const parent = store.get('disposition', 'terrain-parent');
    const draft = (scope: string) => ({ name: 'Terrain concern', concern: 'Recall terrain searches', scope,
      activationCues: [{ text: scope, memoryIds }], contextCues: [], internalStateCues: [],
      retrievalIntent: 'Recall contextual searches', prerequisites: [], confidence: 'Tentative' });
    const common = { memoryIds, discriminatingFeatures: ['wet versus dry'], alternativeExplanations: ['Changing water availability'],
      evidencePreserved: 'Every earlier subjective episode', continuityReason: 'Preserved sources and versions', reason: 'Explicit fixture proposal' };
    const split = ReconciliationOperationSchema.parse({ ...common, operation: 'SPLIT', sourceDispositionIds: [parent.id],
      judgments: memories.map((memory, index) => ({ memoryId: memory.id, dispositionId: parent.id,
        usefulness: index < 2 ? 'appropriate' : 'misleading', experiencedContext: index < 2 ? 'wet' : 'dry', reason: 'Fixture relevance judgment' })),
      children: [draft('wet terrain'), draft('dry terrain')] });
    const children = commitReconciliation(store, new Inspection(store), agent.id, [split], memories, { episodes, coactivations: [] });
    assert.equal(children.length, 2);
    assert.deepEqual(store.get('disposition', parent.id), parent);
    for (const child of children) {
      assert.equal(child.development!.status, 'provisional');
      assert.deepEqual(child.development!.cueEvidence?.[0]?.memoryIds, memoryIds);
      assert.deepEqual(child.development!.lineage, [{ dispositionId: parent.id, version: parent.version, relationship: 'split_from' }]);
    }
    const assess = ReconciliationOperationSchema.parse({ ...common, operation: 'ASSESS_HYPOTHESIS', sourceDispositionIds: [children[0]!.id],
      status: 'established', confidence: 'Repeated later appropriate retrieval supports this distinction',
      judgments: memories.map(memory => ({ memoryId: memory.id, dispositionId: children[0]!.id,
        usefulness: 'appropriate', experiencedContext: 'terrain', reason: 'Fixture appropriate retrieval' })) });
    assert.deepEqual(commitReconciliation(store, new Inspection(store), agent.id, [assess], memories, { episodes, coactivations: [] }), []);
    const rejection = store.eventsByType(agent.id, ['disposition.reconciliation_rejected']).at(-1)!;
    if (rejection.type === 'disposition.reconciliation_rejected') assert.match(rejection.payload.reason, /after hypothesis creation/);
    const laterMemories = [];
    await new Promise(resolve => setTimeout(resolve, 2));
    for (let index = 0; index < 2; index++) {
      const cycle = store.startCycle(agent.id, 'life'); store.saveCycle({ ...cycle, status: 'completed' });
      const memory = { ...memories[0]!, id: `prospective-${index}`, version: 1, createdCycle: cycle.id, ancestorIds: [],
        predictionId: null, content: 'Another experienced terrain search', gist: 'Later terrain search' };
      store.save('memory', memory, 0, { origin: 'seed', reason: 'Explicit prospective evidence fixture', sourceIds: [] });
      laterMemories.push(memory);
    }
    if (assess.operation === 'ASSESS_HYPOTHESIS') {
      const laterAssessment = { ...assess, memoryIds: laterMemories.map(memory => memory.id),
        judgments: laterMemories.map(memory => ({ ...assess.judgments[0]!, memoryId: memory.id })) };
      commitReconciliation(store, new Inspection(store), agent.id, [laterAssessment], laterMemories,
        { episodes: laterMemories.map(memory => ({ memoryId: memory.id, cycleId: memory.createdCycle, context: memory.context })), coactivations: [] });
      assert.equal(store.get('disposition', children[0]!.id).development!.status, 'established');
      assert.deepEqual(store.get('disposition', children[0]!.id).cues, children[0]!.cues);
    }
    const coactivations = episodes.slice(0, 3).map(episode => ({ cycleId: episode.cycleId,
      dispositionIds: children.map(child => child.id), recalledMemoryIds: Object.fromEntries(children.map(child => [child.id, memoryIds])) }));
    const merge = ReconciliationOperationSchema.parse({ ...common, operation: 'MERGE', sourceDispositionIds: children.map(child => child.id),
      judgments: children.flatMap(child => memories.map(memory => ({ memoryId: memory.id, dispositionId: child.id,
        usefulness: 'appropriate', experiencedContext: 'terrain', reason: 'Recorded overlap fixture' }))), draft: draft('terrain search') });
    const merged = commitReconciliation(store, new Inspection(store), agent.id, [merge], memories, { episodes, coactivations })[0]!;
    assert.ok(children.every(child => merged.development!.lineage.some(link => link.dispositionId === child.id && link.version === store.get('disposition', child.id).version)));
    const archive = ReconciliationOperationSchema.parse({ ...common, operation: 'ARCHIVE', sourceDispositionIds: [merged.id],
      scopeCoverage: 'Repeated terrain searches', judgments: memories.map(memory => ({ memoryId: memory.id, dispositionId: merged.id,
        usefulness: 'misleading', experiencedContext: 'terrain', reason: 'Explicit unhelpful-retrieval fixture' })) });
    commitReconciliation(store, new Inspection(store), agent.id, [archive], memories, { episodes, coactivations: [] });
    assert.equal(store.get('disposition', merged.id).active, false);
    assert.equal(store.get('disposition', merged.id).development!.status, 'archived');
    assert.deepEqual(store.versions('disposition', merged.id)[0]!.state, merged);
    const beforeStaleProposal = store.get('disposition', merged.id);
    assert.throws(() => commitReconciliation(store, new Inspection(store), agent.id, [archive], memories,
      { episodes, coactivations: [] }, { [merged.id]: merged.version }), /changed during inference/);
    assert.deepEqual(store.get('disposition', merged.id), beforeStaleProposal);
    for (const memory of memories) assert.deepEqual(store.get('memory', memory.id), memory);
    await api(app, 'PATCH', `/api/dispositions/${merged.id}`, { expectedVersion: 2, patch: { concern: 'Researcher clarified retrieval concern' } });
    assert.equal(store.get('disposition', merged.id).development!.previousVersion, 2);
    await api(app, 'POST', `/api/dispositions/${merged.id}/restore`, { expectedVersion: 3, version: 1 });
    assert.equal(store.get('disposition', merged.id).development!.previousVersion, 3);
    assert.equal(store.get('disposition', merged.id).concern, merged.concern);
    await api(app, 'DELETE', `/api/dispositions/${merged.id}`, { expectedVersion: 4 });
    assert.equal(store.versions('disposition', merged.id).at(-1)!.state.development!.previousVersion, 4);
    assert.equal(store.versions('disposition', merged.id).length, 5);
  } finally { store.close(); }
});
