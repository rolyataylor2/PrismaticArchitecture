import type { DatabaseSync } from 'node:sqlite';
import { readIdentity, now } from '../../core/src/domain.js';

export function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > 30) throw new Error(`Database schema ${version} is newer than this application`);
  if (version < 1) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE entities (
      kind TEXT NOT NULL, id TEXT NOT NULL, agent_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version > 0), body TEXT NOT NULL CHECK(json_valid(body)),
      PRIMARY KEY(kind, id)
    );
    CREATE INDEX entities_agent ON entities(agent_id, kind);
    CREATE UNIQUE INDEX one_open_prediction ON entities(json_extract(body, '$.partId'))
      WHERE kind = 'prediction' AND json_extract(body, '$.status') = 'open';
    CREATE TABLE versions (
      kind TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL,
      body TEXT NOT NULL CHECK(json_valid(body)), change TEXT NOT NULL CHECK(json_valid(change)), at TEXT NOT NULL,
      PRIMARY KEY(kind, id, version), FOREIGN KEY(kind, id) REFERENCES entities(kind, id)
    );
    CREATE TRIGGER versions_no_update BEFORE UPDATE ON versions BEGIN SELECT RAISE(ABORT, 'Versions are immutable'); END;
    CREATE TRIGGER versions_no_delete BEFORE DELETE ON versions BEGIN SELECT RAISE(ABORT, 'Versions are immutable'); END;
    CREATE TABLE worlds (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TRIGGER worlds_no_update BEFORE UPDATE ON worlds BEGIN SELECT RAISE(ABORT, 'WorldState is immutable'); END;
    CREATE TRIGGER worlds_no_delete BEFORE DELETE ON worlds BEGIN SELECT RAISE(ABORT, 'WorldState is immutable'); END;
    CREATE TABLE cycles (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, sequence INTEGER NOT NULL, body TEXT NOT NULL,
      UNIQUE(agent_id, sequence));
    CREATE UNIQUE INDEX one_running_cycle ON cycles(agent_id) WHERE json_extract(body, '$.status') = 'running';
    CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      agent_id TEXT NOT NULL, cycle_id TEXT, at TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX events_agent ON events(agent_id, sequence);
    CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
    CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
    CREATE TABLE embeddings (part_id TEXT PRIMARY KEY, key TEXT NOT NULL, vector TEXT NOT NULL);
    CREATE TABLE executions (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, body TEXT NOT NULL);
    PRAGMA user_version = 1;
    COMMIT;`);
  if (version < 2) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE consolidations (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, body TEXT NOT NULL);
    CREATE UNIQUE INDEX one_running_consolidation ON consolidations(agent_id) WHERE json_extract(body, '$.status') = 'running';
    PRAGMA user_version = 2;
    COMMIT;`);
  if (version < 3) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE experiments (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, body TEXT NOT NULL);
    PRAGMA user_version = 3;
    COMMIT;`);
  if (version < 4) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE executions ADD COLUMN updated_order INTEGER NOT NULL DEFAULT 0;
    UPDATE executions SET updated_order = rowid;
    CREATE INDEX execution_recent_updates ON executions(agent_id, updated_order);
    PRAGMA user_version = 4;
    COMMIT;`);
  if (version < 5) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE agent_provider_settings (
      agent_id TEXT PRIMARY KEY,
      model TEXT NOT NULL CHECK(model IN ('gpt-5-nano', 'gpt-4.1-nano')),
      encrypted_api_key TEXT
    );
    PRAGMA user_version = 5;
    COMMIT;`);
  if (version < 6) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE prompt_revisions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('global','agent')),
      agent_id TEXT,
      task TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('custom','inherit','builtin')),
      body TEXT CHECK(body IS NULL OR length(body) BETWEEN 1 AND 16000),
      origin TEXT NOT NULL CHECK(origin IN ('edit','reset')),
      created_at TEXT NOT NULL,
      CHECK((scope='global' AND agent_id IS NULL AND mode IN ('custom','builtin')) OR
            (scope='agent' AND agent_id IS NOT NULL AND mode IN ('custom','inherit'))),
      CHECK((mode='custom' AND body IS NOT NULL) OR (mode!='custom' AND body IS NULL))
    );
    CREATE INDEX prompt_revisions_lookup ON prompt_revisions(scope, agent_id, task, sequence);
    CREATE TRIGGER prompt_revisions_no_update BEFORE UPDATE ON prompt_revisions BEGIN SELECT RAISE(ABORT, 'Prompt revisions are immutable'); END;
    CREATE TRIGGER prompt_revisions_no_delete BEFORE DELETE ON prompt_revisions BEGIN SELECT RAISE(ABORT, 'Prompt revisions are immutable'); END;
    PRAGMA user_version = 6;
    COMMIT;`);
  if (version < 7) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE executions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    UPDATE executions SET updated_at = COALESCE((SELECT MAX(at) FROM events WHERE type = 'execution.status' AND json_extract(payload,'$.id') = executions.id), (SELECT json_extract(body,'$.startedAt') FROM cycles WHERE id = json_extract(executions.body,'$.cycleId')), '');
    CREATE TABLE cycle_threads (cycle_id TEXT PRIMARY KEY REFERENCES cycles(id), agent_id TEXT NOT NULL, thread_id TEXT NOT NULL);
    CREATE INDEX cycle_threads_lookup ON cycle_threads(agent_id, thread_id);
    CREATE TABLE thread_part_stickiness (part_id TEXT NOT NULL, thread_id TEXT NOT NULL, body TEXT NOT NULL, cycle_id TEXT NOT NULL REFERENCES cycles(id), PRIMARY KEY(part_id, thread_id));
    PRAGMA user_version = 7;
    COMMIT;`);
  if (version < 8) {
    // Early version-7 databases shipped without the execution timestamp.
    // Preserve complete version-7 databases while repairing that older shape.
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(executions)').all();
      if (!columns.some(column => column.name === 'updated_at')) {
        db.exec(`ALTER TABLE executions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
          UPDATE executions SET updated_at = COALESCE((SELECT MAX(at) FROM events WHERE type = 'execution.status' AND json_extract(payload,'$.id') = executions.id), (SELECT json_extract(body,'$.startedAt') FROM cycles WHERE id = json_extract(executions.body,'$.cycleId')), '');`);
      }
      db.exec('PRAGMA user_version = 8; COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (version < 9) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE agent_activation_settings (agent_id TEXT PRIMARY KEY,
      vector_search_enabled INTEGER NOT NULL CHECK(vector_search_enabled IN (0,1)));
    PRAGMA user_version = 9;
    COMMIT;`);
  if (version < 10) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE prompt_overrides (
      scope TEXT NOT NULL CHECK(scope IN ('global','agent')),
      agent_id TEXT,
      task TEXT NOT NULL,
      body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 16000),
      CHECK((scope='global' AND agent_id IS NULL) OR (scope='agent' AND agent_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX prompt_global_override ON prompt_overrides(task) WHERE scope='global';
    CREATE UNIQUE INDEX prompt_agent_override ON prompt_overrides(agent_id,task) WHERE scope='agent';
    INSERT INTO prompt_overrides(scope,agent_id,task,body)
      SELECT current.scope,current.agent_id,current.task,current.body
      FROM prompt_revisions AS current
      WHERE current.mode='custom' AND current.sequence=(
        SELECT MAX(latest.sequence) FROM prompt_revisions AS latest
        WHERE latest.scope=current.scope AND latest.agent_id IS current.agent_id AND latest.task=current.task
      );
    DROP TABLE prompt_revisions;
    PRAGMA user_version = 10;
    COMMIT;`);
  if (version < 11) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = db.prepare(`SELECT identity.id, identity.body, agent.body AS agent_body FROM entities AS identity
        JOIN entities AS agent ON agent.kind = 'agent' AND agent.id = identity.agent_id WHERE identity.kind = 'identity'`).all();
      for (const row of rows) {
        const old = JSON.parse(row.body as string);
        if (old.schemaVersion === 2) continue;
        const createdAt = JSON.parse(row.agent_body as string).createdAt as string;
        const next = { ...readIdentity(old, createdAt), version: old.version + 1 };
        const body = JSON.stringify(next);
        db.prepare("UPDATE entities SET body = ?, version = ? WHERE kind = 'identity' AND id = ?").run(body, next.version, row.id as string);
        db.prepare("INSERT INTO versions(kind,id,version,body,change,at) VALUES('identity',?,?,?,?,?)")
          .run(row.id as string, next.version, body, JSON.stringify({ origin: 'migration', reason: 'Convert fixed Identity categories to question-and-answer Traits (ADR 0099)', sourceIds: [] }), now());
      }
      db.exec('PRAGMA user_version = 11; COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (version < 12) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE identity_authoring_settings (agent_id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body)));
    PRAGMA user_version = 12;
    COMMIT;`);

  if (version < 13) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE primitive_settings (agent_id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body)));
    CREATE TABLE primitive_settings_history (agent_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(agent_id, revision));
    PRAGMA user_version = 13;
    COMMIT;`);
  if (version < 14) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE agent_activation_settings ADD COLUMN reevaluate_after_deliberation INTEGER NOT NULL DEFAULT 0 CHECK(reevaluate_after_deliberation IN (0,1));
    PRAGMA user_version = 14;
    COMMIT;`);
  if (version < 15) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE deleted_agents (agent_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
    PRAGMA user_version = 15;
    COMMIT;`);
  if (version < 16) db.exec(`BEGIN IMMEDIATE;
    DROP TRIGGER versions_no_delete;
    DROP TRIGGER worlds_no_delete;
    DROP TRIGGER events_no_delete;
    CREATE TRIGGER versions_no_delete BEFORE DELETE ON versions
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id = json_extract(OLD.body, '$.agentId'))
      BEGIN SELECT RAISE(ABORT, 'Versions are immutable'); END;
    CREATE TRIGGER worlds_no_delete BEFORE DELETE ON worlds
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id = OLD.agent_id)
      BEGIN SELECT RAISE(ABORT, 'WorldState is immutable'); END;
    CREATE TRIGGER events_no_delete BEFORE DELETE ON events
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id = OLD.agent_id)
      BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
    PRAGMA user_version = 16;
    COMMIT;`);

  if (version < 17) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE agent_activation_settings ADD COLUMN primitives_first INTEGER NOT NULL DEFAULT 0 CHECK(primitives_first IN (0,1));
    PRAGMA user_version = 17;
    COMMIT;`);

  if (version < 18) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE agent_activation_settings ADD COLUMN memory_search_enabled INTEGER NOT NULL DEFAULT 0 CHECK(memory_search_enabled IN (0,1));
    ALTER TABLE agent_activation_settings ADD COLUMN memory_relevance_threshold REAL NOT NULL DEFAULT 0.5;
    ALTER TABLE agent_activation_settings ADD COLUMN memory_recall_limit INTEGER DEFAULT 12;
    PRAGMA user_version = 18;
    COMMIT;`);

  if (version < 19) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE agent_provider_settings_next (
      agent_id TEXT PRIMARY KEY,
      model TEXT NOT NULL CHECK(model IN ('gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini')),
      encrypted_api_key TEXT
    );
    INSERT INTO agent_provider_settings_next SELECT agent_id, model, encrypted_api_key FROM agent_provider_settings;
    DROP TABLE agent_provider_settings;
    ALTER TABLE agent_provider_settings_next RENAME TO agent_provider_settings;
    PRAGMA user_version = 19;
    COMMIT;`);
  if (version < 20) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE agent_provider_settings_next (
      agent_id TEXT PRIMARY KEY,
      model TEXT NOT NULL CHECK(model IN ('gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini', 'grok-4.3')),
      encrypted_api_key TEXT
    );
    INSERT INTO agent_provider_settings_next SELECT agent_id, model, encrypted_api_key FROM agent_provider_settings;
    DROP TABLE agent_provider_settings;
    ALTER TABLE agent_provider_settings_next RENAME TO agent_provider_settings;
    PRAGMA user_version = 20;
    COMMIT;`);
  if (version < 21) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE mcp_registry (singleton INTEGER PRIMARY KEY CHECK(singleton=1), body TEXT NOT NULL);
    CREATE TABLE mcp_registry_history (revision INTEGER PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE mcp_permissions (agent_id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE mcp_permissions_history (agent_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(agent_id,revision));
    CREATE TRIGGER mcp_registry_history_no_update BEFORE UPDATE ON mcp_registry_history BEGIN SELECT RAISE(ABORT, 'MCP registry history is immutable'); END;
    CREATE TRIGGER mcp_registry_history_no_delete BEFORE DELETE ON mcp_registry_history BEGIN SELECT RAISE(ABORT, 'MCP registry history is immutable'); END;
    CREATE TRIGGER mcp_permissions_history_no_update BEFORE UPDATE ON mcp_permissions_history BEGIN SELECT RAISE(ABORT, 'MCP permission history is immutable'); END;
    CREATE TRIGGER mcp_permissions_history_no_delete BEFORE DELETE ON mcp_permissions_history
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id=OLD.agent_id)
      BEGIN SELECT RAISE(ABORT, 'MCP permission history is immutable'); END;
    PRAGMA user_version = 21;
    COMMIT;`);
  if (version < 22) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE executive_profiles (agent_id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body)));
    CREATE TABLE executive_profile_history (agent_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)),
      created_at TEXT NOT NULL, PRIMARY KEY(agent_id,revision));
    CREATE TRIGGER executive_profile_history_no_update BEFORE UPDATE ON executive_profile_history
      BEGIN SELECT RAISE(ABORT, 'Executive profile history is immutable'); END;
    CREATE TRIGGER executive_profile_history_no_delete BEFORE DELETE ON executive_profile_history
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id=OLD.agent_id)
      BEGIN SELECT RAISE(ABORT, 'Executive profile history is immutable'); END;
    PRAGMA user_version = 22;
    COMMIT;`);
  if (version < 23) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE executive_skills (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
    CREATE TABLE executive_skill_history (id TEXT NOT NULL, agent_id TEXT NOT NULL, version INTEGER NOT NULL,
      body TEXT NOT NULL CHECK(json_valid(body)), created_at TEXT NOT NULL, PRIMARY KEY(id,version));
    CREATE TRIGGER executive_skill_history_no_update BEFORE UPDATE ON executive_skill_history
      BEGIN SELECT RAISE(ABORT, 'Executive skill history is immutable'); END;
    CREATE TRIGGER executive_skill_history_no_delete BEFORE DELETE ON executive_skill_history
      WHEN NOT EXISTS (SELECT 1 FROM deleted_agents WHERE agent_id=OLD.agent_id)
      BEGIN SELECT RAISE(ABORT, 'Executive skill history is immutable'); END;
    PRAGMA user_version=23;
    COMMIT;`);
  if (version < 24) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE prompt_overrides_expanded (
      scope TEXT NOT NULL CHECK(scope IN ('global','agent')),
      agent_id TEXT,
      task TEXT NOT NULL,
      body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 32768),
      CHECK((scope='global' AND agent_id IS NULL) OR (scope='agent' AND agent_id IS NOT NULL))
    );
    INSERT INTO prompt_overrides_expanded(scope,agent_id,task,body) SELECT scope,agent_id,task,body FROM prompt_overrides;
    DROP TABLE prompt_overrides;
    ALTER TABLE prompt_overrides_expanded RENAME TO prompt_overrides;
    CREATE UNIQUE INDEX prompt_global_override ON prompt_overrides(task) WHERE scope='global';
    CREATE UNIQUE INDEX prompt_agent_override ON prompt_overrides(agent_id,task) WHERE scope='agent';
    PRAGMA user_version=24;
    COMMIT;`);
  if (version < 25) {
    const columns = db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
    db.exec(`BEGIN IMMEDIATE;
      ${columns.some(column => column.name === 'research_scope') ? '' : 'ALTER TABLE events ADD COLUMN research_scope TEXT CHECK(research_scope IS NULL OR json_valid(research_scope));'}
      PRAGMA user_version = 25; COMMIT;`);
  }

  if (version < 26) {
    const columns = db.prepare('PRAGMA table_info(agent_activation_settings)').all() as { name: string }[];
    db.exec(`BEGIN IMMEDIATE;
      ${columns.some(column => column.name === 'continuous_settings') ? '' : "ALTER TABLE agent_activation_settings ADD COLUMN continuous_settings TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(continuous_settings));"}
      DROP INDEX IF EXISTS one_running_cycle;
      PRAGMA user_version = 26; COMMIT;`);
  }

  if (version < 27) {
    const columns = db.prepare('PRAGMA table_info(agent_provider_settings)').all() as { name: string }[];
    db.exec(`BEGIN IMMEDIATE;
      ${columns.some(column => column.name === 'thought_routing') ? '' : 'ALTER TABLE agent_provider_settings ADD COLUMN thought_routing TEXT CHECK(thought_routing IS NULL OR json_valid(thought_routing));'}
      PRAGMA user_version = 27; COMMIT;`);
  }

  if (version < 28) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS agent_image_settings (agent_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, encrypted_api_key TEXT);
    PRAGMA user_version = 28; COMMIT;`);
  if (version < 29) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS agent_classifier_settings (agent_id TEXT PRIMARY KEY, model TEXT NOT NULL, encrypted_api_key TEXT);
    PRAGMA user_version = 29; COMMIT;`);
  if (version < 30) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS agent_provider_connections (agent_id TEXT NOT NULL, provider TEXT NOT NULL, encrypted_api_key TEXT NOT NULL, PRIMARY KEY(agent_id,provider));
    PRAGMA user_version = 30; COMMIT;`);

}
