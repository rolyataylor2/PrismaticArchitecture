import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { prompts } from '../../packages/providers/src/prompts.js';

export class DraftProvider extends OpenAIProvider {
  inputs: string[] = [];
  override async author<T>(schema: z.ZodType<T>, prompt: string): Promise<T> {
    this.inputs.push(prompt);
    return schema.parse({ text: 'I expect my question to be welcomed.', summary: 'Welcomed curiosity', context: ['My question was invited'], horizon: 'Next reply', confidence: 0.65 });
  }
}
test('researcher creation validates ownership, provenance, evidence and open-prediction constraints', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent(); const other = app.createAgent();
    const part = store.list('part', agent.id)[0]!; const foreign = store.list('part', other.id)[0]!;
    const cycle = store.startCycle(agent.id); store.saveCycle({ ...cycle, status: 'completed' });
    const base = `/api/agents/${agent.id}`;
    const memory = { partId: part.id, createdCycle: cycle.id, content: 'I felt welcome.', gist: 'Welcome', context: ['A greeting'] };
    await api(app, 'POST', `${base}/memories`, memory);
    assert.equal(store.list('memory', agent.id).length, 1);
    const stored = store.list('memory', agent.id)[0]!;
    assert.equal(store.versions('memory', stored.id)[0]!.change.origin, 'researcher_edit');
    await assert.rejects(api(app, 'POST', `${base}/memories`, { ...memory, partId: foreign.id }), /another Agent/);
    await assert.rejects(api(app, 'POST', `${base}/memories`, { ...memory, createdCycle: 'missing' }), /cycle/);
    const prediction = { partId: part.id, createdCycle: cycle.id, expectation: 'I will receive a reply.', horizon: 'Next turn', confidence: 0.6, context: ['I asked a question'] };
    await api(app, 'POST', `${base}/predictions`, prediction);
    await assert.rejects(api(app, 'POST', `${base}/predictions`, prediction), /already has an open prediction/);
    assert.equal(store.list('prediction', agent.id).length, 1);
    const disposition = { name: 'Welcomed curiosity', concern: 'I want to explore safely', cues: ['An invitation'], scope: null, prerequisites: [], longTermInterest: 0, shortTermInterest: 0, memoryIds: [], sourcePredictionId: null, temporary: false };
    await api(app, 'POST', `${base}/dispositions`, disposition);
    assert.equal(store.list('disposition', agent.id).length, 1);
    const original = store.list('disposition', agent.id)[0]!;
    const route = `/api/dispositions/${original.id}`;
    await api(app, 'PATCH', route, { expectedVersion: 1, patch: { concern: 'I want to stay curious' } });
    const history = await api(app, 'GET', route) as { versions: { state: typeof original }[] };
    assert.equal(history.versions.length, 2);
    assert.equal(history.versions.find(item => item.state.version === 1)!.state.concern, disposition.concern);
    assert.equal(store.get('disposition', original.id).concern, 'I want to stay curious');
    await assert.rejects(api(app, 'PATCH', route, { expectedVersion: 1, patch: { name: 'Stale edit' } }));
    await assert.rejects(api(app, 'PATCH', route, { expectedVersion: 2, patch: { prerequisites: [original.id] } }), /Invalid disposition prerequisite/);
    await assert.rejects(api(app, 'PATCH', route, { expectedVersion: 2, patch: { memoryIds: [stored.id] } }));
    await assert.rejects(api(app, 'POST', `${base}/dispositions`, { ...disposition, memoryIds: [stored.id] }), /learning evidence/);
    await api(app, 'POST', `${route}/restore`, { expectedVersion: 2, version: 1 });
    assert.equal(store.get('disposition', original.id).concern, disposition.concern);
    assert.equal(store.versions('disposition', original.id).length, 3);
    await api(app, 'DELETE', route, { expectedVersion: 3 });
    assert.equal(store.list('disposition', agent.id).length, 0);
    assert.equal(store.get('disposition', original.id).active, false);
    assert.equal(store.versions('disposition', original.id).length, 4);
    await assert.rejects(api(app, 'PATCH', route, { expectedVersion: 4, patch: { active: true } }), /deleted/);
  } finally { store.close(); }
});
test('smart creation returns an editable draft without writes or private context; task has a world-free preview', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const provider = new DraftProvider('fixture', 'fixture'); app.researcherAuthoringProvider = () => provider;
    const description = 'I want a prediction about my question being welcomed.';
    const result = await api(app, 'POST', `/api/agents/${agent.id}/component-draft`, { kind: 'prediction', description });
    assert.equal((result as { confidence: number }).confidence, 0.65);
    assert.equal(store.list('prediction', agent.id).length, 0);
    assert.equal(store.list('memory', agent.id).length, 0);
    assert.ok(provider.inputs[0]!.includes(description));
    for (const part of store.list('part', agent.id)) assert.ok(!provider.inputs[0]!.includes(part.mission));
    const preview = previewPrompt(store, agent.id, 'researcher_authoring', prompts.researcher_authoring.text);
    assert.equal(preview.worldId, null); assert.equal(preview.cycleId, null);
  } finally { store.close(); }
});
