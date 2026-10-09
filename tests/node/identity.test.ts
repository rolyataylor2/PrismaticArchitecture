import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { migrate } from '../../packages/storage/src/migrations.js';
import { Application } from './persistent-fixture.js';
import { api } from '../../packages/sdk/src/api.js';
import { type Identity } from '../../packages/core/src/domain.js';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';

test('Trait operations preserve continuity, reject stale writes and keep deleted history', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent();
    const initial = store.get('identity', agent.id);
    const route = `/api/agents/${agent.id}/identity/traits`;
    const created = await api(app, 'POST', route, { expectedVersion: initial.version,
      question: 'What brings me joy?', answer: 'Exploring unfamiliar ideas.', keywords: ['joy', 'exploration'] }) as Identity;
    const trait = created.traits.at(-1)!;
    assert.ok(Number.isFinite(Date.parse(trait.createdAt)));
    const edited = await api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: created.version,
      answer: 'Exploring ideas with friends.', keywords: [] }) as Identity;
    assert.equal(edited.traits.at(-1)!.createdAt, trait.createdAt);
    assert.equal(edited.traits.at(-1)!.id, trait.id);
    await assert.rejects(api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: created.version, answer: 'Stale' }), /Stale/);
    await assert.rejects(api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: edited.version, createdAt: '2000-01-01T00:00:00.000Z' }));
    await assert.rejects(api(app, 'POST', route, { expectedVersion: edited.version, question: ' ', answer: 'Answer', keywords: [] }));
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/identity`, { expectedVersion: edited.version,
      patch: { traits: edited.traits.map(item => item.id === trait.id ? { ...item, createdAt: '2000-01-01T00:00:00.000Z' } : item) } }), /immutable/);
    const copied = await api(app, 'POST', `${route}/${trait.id}/duplicate`, { expectedVersion: edited.version }) as Identity;
    const copy = copied.traits.at(-1)!;
    assert.notEqual(copy.id, trait.id);
    assert.ok(Date.parse(copy.createdAt) >= Date.parse(trait.createdAt));
    assert.equal(copy.answer, edited.traits.at(-1)!.answer);
    assert.deepEqual(copy.keywords, []);
    const deleted = await api(app, 'DELETE', `${route}/${trait.id}`, { expectedVersion: copied.version }) as Identity;
    assert.equal(deleted.traits.some(item => item.id === trait.id), false);
    assert.equal(deleted.traits.some(item => item.id === copy.id), true);
    assert.equal(store.versions('identity', agent.id).find(version => version.state.version === created.version)!.state.traits.at(-1)!.answer, trait.answer);
    for (const task of ['arbitration', 'deliberation'] as const) {
      const prompt = renderTaskPrompt(agent.id, task, { identity: deleted, contributions: [], deliberation: [], choices: ['DELIBERATE'] });
      assert.match(prompt, /What brings me joy\?/);
      assert.match(prompt, /Exploring ideas with friends/);
    }
    const empty = await api(app, 'PATCH', `/api/agents/${agent.id}/identity`, { expectedVersion: deleted.version, patch: { traits: [] } }) as Identity;
    assert.deepEqual(empty.traits, []);
  } finally { store.close(); }
});

test('legacy Identity migration appends a version, preserves original bodies and survives restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-identity-'));
  const path = join(directory, 'state.sqlite');
  const db = new DatabaseSync(path);
  const createdAt = '2025-01-01T00:00:00.000Z';
  const legacy = { id: 'agent', agentId: 'agent', version: 1, schemaVersion: 1,
    values: ['care', 'curiosity'], roles: ['friend'], commitments: [], selfConceptions: ['I can learn'], aspirations: ['Keep exploring'], mask: null };
  const original = JSON.stringify(legacy);
  try {
    migrate(db);
    const agent = { id: 'agent', agentId: 'agent', version: 1, schemaVersion: 1, name: 'Legacy', createdAt };
    for (const [kind, body] of [['agent', JSON.stringify(agent)], ['identity', original]]) {
      db.prepare('INSERT INTO entities(kind,id,agent_id,version,body) VALUES(?,?,?,1,?)').run(kind!, 'agent', 'agent', body!);
      db.prepare('INSERT INTO versions(kind,id,version,body,change,at) VALUES(?,?,1,?,?,?)')
        .run(kind!, 'agent', body!, JSON.stringify({ origin: 'seed', reason: 'Legacy seed', sourceIds: [] }), createdAt);
    }
    db.exec('DROP TABLE executive_skill_history; DROP TABLE executive_skills; DROP TABLE executive_profile_history; DROP TABLE executive_profiles; DROP TABLE mcp_permissions_history; DROP TABLE mcp_permissions; DROP TABLE mcp_registry_history; DROP TABLE mcp_registry; ALTER TABLE agent_activation_settings DROP COLUMN primitives_first; ALTER TABLE agent_activation_settings DROP COLUMN memory_search_enabled; ALTER TABLE agent_activation_settings DROP COLUMN memory_relevance_threshold; ALTER TABLE agent_activation_settings DROP COLUMN memory_recall_limit; ALTER TABLE agent_activation_settings DROP COLUMN reevaluate_after_deliberation; DROP TABLE primitive_settings; DROP TABLE primitive_settings_history; DROP TABLE identity_authoring_settings; DROP TABLE deleted_agents; PRAGMA user_version = 10');
  } finally { db.close(); }
  let store = new SqliteStore(path);
  try {
    const current = store.get('identity', 'agent');
    assert.equal(current.schemaVersion, 2); assert.equal(current.version, 2);
    assert.deepEqual(current.traits.map(trait => trait.answer), ['care', 'curiosity', 'friend', 'I can learn', 'Keep exploring']);
    assert.ok(current.traits.every(trait => trait.createdAt === createdAt));
    const history = store.versions('identity', 'agent');
    assert.equal(history.length, 2); assert.equal(history[1]!.change.origin, 'migration');
    assert.deepEqual(history[0]!.state.traits, current.traits);
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.get('identity', 'agent'), current);
    assert.equal(store.versions('identity', 'agent').length, 2);
    const raw = new DatabaseSync(path);
    try { assert.equal(raw.prepare("SELECT body FROM versions WHERE kind='identity' AND version=1").get()!.body, original); }
    finally { raw.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('autobiographical roles survive edits and duplication while runtime excludes them from both Self tasks', async () => {
  const { selfContext } = await import('../../packages/core/src/context.js');
  const { IdentityTraitSchema } = await import('../../packages/core/src/domain.js');
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent(); const route = `/api/agents/${agent.id}/identity/traits`;
    const initial = store.get('identity', agent.id);
    const created = await api(app, 'POST', route, { expectedVersion: initial.version,
      question: 'Who raised me?', answer: 'BIOGRAPHY_PRIVATE_SENTINEL', keywords: ['mother'], role: 'autobiographical' }) as Identity;
    const trait = created.traits.at(-1)!;
    const edited = await api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: created.version, keywords: ['family'] }) as Identity;
    assert.equal(edited.traits.at(-1)!.role, 'autobiographical');
    const duplicated = await api(app, 'POST', `${route}/${trait.id}/duplicate`, { expectedVersion: edited.version }) as Identity;
    assert.equal(duplicated.traits.filter(item => item.role === 'autobiographical').length, 2);
    const context = selfContext(duplicated, [], []);
    assert.equal(context.identity.traits.length, initial.traits.length);
    assert.doesNotMatch(JSON.stringify(context), /BIOGRAPHY_PRIVATE_SENTINEL|Who raised me/);
    assert.equal(duplicated.traits.length, initial.traits.length + 2);
    for (const task of ['arbitration', 'deliberation'] as const) {
      assert.doesNotMatch(renderTaskPrompt(agent.id, task, { ...context, choices: ['DELIBERATE'] }), /BIOGRAPHY_PRIVATE_SENTINEL/);
      assert.doesNotMatch(renderTaskPrompt(agent.id, task, { ...context, choices: ['DELIBERATE'] }, () => '{{ identity|json_encode }}'), /BIOGRAPHY_PRIVATE_SENTINEL/);
    }
    const { role: _role, ...legacy } = trait;
    assert.equal(IdentityTraitSchema.parse(legacy).role, 'self_definition');
    await assert.rejects(api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: duplicated.version, role: 'unknown' }));
    const reclassified = await api(app, 'PATCH', `${route}/${trait.id}`, { expectedVersion: duplicated.version, role: 'self_definition' }) as Identity;
    assert.match(JSON.stringify(selfContext(reclassified, [], [])), /BIOGRAPHY_PRIVATE_SENTINEL/);
  } finally { store.close(); }
});


test('wizard character choices persist across restart, stay agent-scoped and preserve Identity', async () => {
  const { OpenAIProvider } = await import('../../packages/providers/src/openai.js');
  const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-wizard-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const agent = app.createAgent(); const other = app.createAgent();
    const before = store.get('identity', agent.id);
    const provider = new OpenAIProvider('unused-test-key');
    provider.author = async schema => schema.parse({ question: 'Which version?', options: [
      { label: 'Books', description: 'Original books' }, { label: 'TV', description: 'Television version' },
    ] });
    app.identityAuthoringProvider = () => provider;
    await api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/clarify`, { name: 'Example Character' });
    await api(app, 'PATCH', `/api/agents/${agent.id}/identity-authoring/settings`, { selectedVersion: 'Television version' });
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/identity-authoring/settings`, { selectedVersion: 'Unknown version' }));
    assert.deepEqual(store.get('identity', agent.id), before);
    assert.equal(store.identityAuthoringSettings(other.id), null);
    const saved = store.identityAuthoringSettings(agent.id)!;
    assert.equal(saved.name, 'Example Character'); assert.equal(saved.selectedVersion, 'Television version');
    provider.author = async () => { throw new Error('Failed clarification'); };
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/clarify`, { name: 'Another Character' }));
    assert.deepEqual(store.identityAuthoringSettings(agent.id), saved);
    store.close(); store = new SqliteStore(path);
    assert.deepEqual(store.identityAuthoringSettings(agent.id), saved);
    assert.equal(store.identityAuthoringSettings(other.id), null);
    assert.deepEqual(store.get('identity', agent.id), before);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
