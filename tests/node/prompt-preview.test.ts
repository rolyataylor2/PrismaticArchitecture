import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { Application as OnlineApplication } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';

test('ordered Part prompt preview uses its recorded assembly and preserves world-blind Self', async () => {
  const store = new SqliteStore(':memory:'); const app = new OnlineApplication(store);
  try {
    const agent = app.createAgent(); const route = `/api/agents/${agent.id}/prompts/part_cognition/preview`;
    await assert.rejects(api(app, 'POST', route, { text: '{{ world.id }}' }), /No suitable saved WorldState/);
    await app.message(agent.id, 'I feel uncertain.');
    const events = store.events(agent.id); const parts = store.list('part', agent.id);
    const result = await api(app, 'POST', route, { text: '{{ world.agentId }} / {{ identity.agentId }} / {{ world.id }}' }) as { text: string; worldId: string };
    assert.equal(result.text, `${agent.id} / ${agent.id} / ${result.worldId}`);
    const prompts = await api(app, 'GET', `/api/agents/${agent.id}/prompts`) as { task: string; effective: string }[];
    for (const task of ['part_cognition', 'answer']) {
      const factory = prompts.find(prompt => prompt.task === task)!;
      const preview = await api(app, 'POST', `/api/agents/${agent.id}/prompts/${task}/preview`, { text: factory.effective }) as { text: string };
      assert.doesNotMatch(preview.text, /{%|{{/);
    }
    assert.deepEqual(store.events(agent.id), events); assert.deepEqual(store.list('part', agent.id), parts);
    const selfRoute = `/api/agents/${agent.id}/prompts/arbitration/preview`;
    const self = await api(app, 'POST', selfRoute, { text: '{{ identity.agentId }}' }) as { text: string };
    assert.equal(self.text, agent.id);
    await assert.rejects(api(app, 'POST', selfRoute, { text: '{{ world.id }}' }), /Invalid Twig prompt template/);
  } finally { store.close(); }
});

test('legacy operation-ID placeholders are omitted from preview while stored audit snapshots stay intact', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const cycle = store.startCycle(agent.id);
    const world = { id: cycle.worldId, agentId: agent.id, cycleId: cycle.id, sequence: cycle.sequence, capturedAt: cycle.startedAt,
      facts: [{ source: 'external execution status', kind: 'does' as const, text: 'Operation execution_old is completed.', timestamp: null, referenceId: 'execution_old' }] };
    store.saveWorld(world); app.inspection.emit(agent.id, cycle.id, 'worldstate.frozen', world);
    const result = await api(app, 'POST', `/api/agents/${agent.id}/prompts/activation/preview`, { text: '{% for fact in world.facts %}{{ fact.text }}{% endfor %}' }) as { text: string };
    assert.equal(result.text, '');
    assert.deepEqual(store.world(world.id).facts, world.facts);
  } finally { store.close(); }
});

test('Identity authoring previews show both prompts without Agent experiences or mutation', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const before = store.get('identity', agent.id);
    const rows = await api(app, 'GET', `/api/agents/${agent.id}/prompts`) as { task: string; effective: string }[];
    for (const task of ['identity_clarification', 'identity_answers']) {
      const row = rows.find(item => item.task === task)!;
      const result = await api(app, 'POST', `/api/agents/${agent.id}/prompts/${task}/preview`, { text: row.effective }) as { text: string; worldId: null };
      assert.match(result.text, /Sherlock Holmes/);
      assert.equal(result.worldId, null);
      assert.doesNotMatch(result.text, /{{/);
      await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/prompts/${task}/preview`, { text: '{{ world.id }}' }), /Invalid Twig prompt template/);
    }
    assert.deepEqual(store.get('identity', agent.id), before);
    assert.equal(store.cycles(agent.id).length, 0);
  } finally { store.close(); }
});

test('Self previews filter autobiographical traits from historical recorded input', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    await app.message(agent.id, 'I feel uncertain about sharing.');
    const cycle = store.cycles(agent.id)[0]!;
    const identity = structuredClone(store.get('identity', agent.id));
    identity.traits.push({ id: 'background', createdAt: agent.createdAt, question: 'My history', answer: 'PRIVATE_HISTORY_SENTINEL', keywords: [], role: 'autobiographical' });
    app.inspection.emit(agent.id, cycle.id, 'self.arbitration_started', { identity, contributions: [], deliberation: [] });
    for (const task of ['arbitration', 'deliberation']) {
      const result = await api(app, 'POST', `/api/agents/${agent.id}/prompts/${task}/preview`, { text: '{{ identity|json_encode }}' }) as { text: string };
      assert.doesNotMatch(result.text, /PRIVATE_HISTORY_SENTINEL/);
    }
    assert.match(JSON.stringify(store.events(agent.id)), /PRIVATE_HISTORY_SENTINEL/);
  } finally { store.close(); }
});

 test('Self preview includes newly saved self-definition traits while retaining role filtering and historical audit', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    await app.message(agent.id, 'I feel uncertain about sharing.');
    const identity = store.get('identity', agent.id);
    store.save('identity', { ...identity, version: identity.version + 1, traits: [...identity.traits,
      { id: 'supernatural', createdAt: agent.createdAt, question: 'What do I believe?', answer: 'SUPERNATURAL_BELIEF_SENTINEL', keywords: [], role: 'self_definition' },
      { id: 'background_new', createdAt: agent.createdAt, question: 'My history', answer: 'PRIVATE_NEW_HISTORY', keywords: [], role: 'autobiographical' },
    ] }, identity.version, { origin: 'researcher_edit', reason: 'Add preview traits', sourceIds: [] });
    const before = store.events(agent.id);
    for (const task of ['arbitration', 'deliberation']) {
      const result = await api(app, 'POST', `/api/agents/${agent.id}/prompts/${task}/preview`, { text: '{{ identity|json_encode }}' }) as { text: string; note: string };
      assert.match(result.text, /SUPERNATURAL_BELIEF_SENTINEL/);
      assert.doesNotMatch(result.text, /PRIVATE_NEW_HISTORY/);
      assert.match(result.note, /Current self-definition/);
    }
    assert.deepEqual(store.events(agent.id), before);
    assert.doesNotMatch(JSON.stringify(before), /SUPERNATURAL_BELIEF_SENTINEL/);
  } finally { store.close(); }
});
