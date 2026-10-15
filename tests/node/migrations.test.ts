import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';

for (const missingTimestamp of [true, false]) {
  test(`version-7 migration preserves chat history with timestamp ${missingTimestamp ? 'missing' : 'present'}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-migration-'));
    const path = join(directory, 'state.sqlite');
    let store = new SqliteStore(path);
    try {
      const app = new Application(store);
      const agent = app.createAgent();
      const first = await app.message(agent.id, 'I am uncertain about a personal conversation.', 'user', 'thread-a');
      assert.ok(first.execution);
      const events = store.events(agent.id);
      const executions = store.executions(agent.id);
      store.close();
      const db = new DatabaseSync(path);
      try {
        if (missingTimestamp) db.exec('ALTER TABLE executions DROP COLUMN updated_at');
        db.exec(`DROP TABLE executive_skill_history; DROP TABLE executive_skills; DROP TABLE executive_profile_history; DROP TABLE executive_profiles; DROP TABLE mcp_permissions_history; DROP TABLE mcp_permissions; DROP TABLE mcp_registry_history; DROP TABLE mcp_registry; DROP TABLE deleted_agents; DROP TABLE primitive_settings; DROP TABLE primitive_settings_history; DROP TABLE identity_authoring_settings; DROP TABLE agent_activation_settings;
          CREATE TABLE prompt_revisions(sequence INTEGER PRIMARY KEY,scope TEXT,agent_id TEXT,task TEXT,mode TEXT,body TEXT);
          INSERT INTO prompt_revisions VALUES
            (1,'global',NULL,'cognition','custom','Legacy global cognition prompt.'),
            (2,'agent','${agent.id}','cognition','custom','Legacy Agent cognition prompt.');
          DROP TABLE prompt_overrides;
          PRAGMA user_version = 7`);
      } finally { db.close(); }
      store = new SqliteStore(path);
      assert.equal(store.promptOverrides({ scope: 'global', task: 'cognition' })[0]?.text, 'Legacy global cognition prompt.');
      assert.equal(store.promptOverrides({ scope: 'agent', agentId: agent.id, task: 'cognition' })[0]?.text, 'Legacy Agent cognition prompt.');
      assert.deepEqual(store.events(agent.id), events);
      assert.deepEqual(store.executions(agent.id), executions);
      assert.equal(store.executiveProfile(agent.id).enabled, true, 'Unconfigured migrated Agents use the speech-only default');
      assert.deepEqual(store.executiveProfile(agent.id).modules, { speaking: true, tools: false });
      const initialProfile = store.executiveProfile(agent.id);
      store.saveExecutiveProfile(agent.id, { ...initialProfile, enabled: false, revision: initialProfile.revision + 1 }, initialProfile.revision);
      assert.ok(!store.recentFacts(agent.id, 20, 'thread-a').some(fact => fact.referenceId === first.execution!.id));
      const profile = store.executiveProfile(agent.id);
      store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1 }, profile.revision);
      assert.ok(store.recentFacts(agent.id, 20, 'thread-a').some(fact => fact.referenceId === first.execution!.id));
      assert.deepEqual(store.recentFacts(agent.id, 20, 'thread-b'), []);
      const second = await new Application(store).message(agent.id, 'Please continue.', 'user', 'thread-a');
      assert.equal(second.cycle.status, 'completed');
      assert.ok(store.world(second.cycle.worldId).facts.some(fact => fact.referenceId === first.execution!.id));
      store.close();
      store = new SqliteStore(path);
      assert.ok(store.recentFacts(agent.id, 20, 'thread-a').length);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
}
