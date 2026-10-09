import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';

test('schema 16 upgrades cognition ordering with existing activation settings preserved', () => {
  const directory = mkdtempSync(join(tmpdir(), 'primitives-first-'));
  const path = join(directory, 'agent.sqlite');
  try {
    const original = new SqliteStore(path);
    const agent = new Application(original).createAgent();
    original.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false, reevaluateAfterDeliberation: true });
    original.close();
    const db = new DatabaseSync(path);
    try {
      db.exec('DROP TABLE executive_skill_history; DROP TABLE executive_skills; DROP TABLE executive_profile_history; DROP TABLE executive_profiles; DROP TABLE mcp_permissions_history; DROP TABLE mcp_permissions; DROP TABLE mcp_registry_history; DROP TABLE mcp_registry; ALTER TABLE agent_activation_settings DROP COLUMN memory_search_enabled; ALTER TABLE agent_activation_settings DROP COLUMN memory_relevance_threshold; ALTER TABLE agent_activation_settings DROP COLUMN memory_recall_limit; ALTER TABLE agent_activation_settings DROP COLUMN primitives_first; PRAGMA user_version = 16;');
    } finally { db.close(); }
    const upgraded = new SqliteStore(path);
    try {
      assert.deepEqual(upgraded.agentActivationSettings(agent.id), {
        memorySearchEnabled: false, memoryRelevanceThreshold: 0.5, memoryRecallLimit: 12, vectorSearchEnabled: false, reevaluateAfterDeliberation: true, primitivesFirst: false,
      });
      upgraded.saveAgentActivationSettings(agent.id, { ...upgraded.agentActivationSettings(agent.id), primitivesFirst: true });
    } finally { upgraded.close(); }
    const reopened = new SqliteStore(path);
    try { assert.equal(reopened.agentActivationSettings(agent.id).primitivesFirst, true); }
    finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
