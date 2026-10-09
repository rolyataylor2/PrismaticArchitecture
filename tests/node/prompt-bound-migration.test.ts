import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { prompts } from '../../packages/providers/src/prompts.js';

test('version-24 prompt expansion preserves overrides and scopes while admitting the complete factory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prompt-bound-')); const database = join(root, 'state.sqlite');
  let store = new SqliteStore(database); let app = new Application(store);
  try {
    const agent = app.createAgent();
    app.editPrompt(agent.id, 'part_cognition', 'global', 'Original global template');
    app.editPrompt(agent.id, 'answer', 'agent', 'Original Agent template');
    const before = store.promptOverrides();
    await app.close(); store.close();
    const legacy = new DatabaseSync(database);
    legacy.exec(`BEGIN;
      ALTER TABLE prompt_overrides RENAME TO prompt_overrides_current;
      CREATE TABLE prompt_overrides(scope TEXT NOT NULL CHECK(scope IN ('global','agent')), agent_id TEXT, task TEXT NOT NULL,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 16000),
        CHECK((scope='global' AND agent_id IS NULL) OR (scope='agent' AND agent_id IS NOT NULL)));
      INSERT INTO prompt_overrides SELECT * FROM prompt_overrides_current;
      DROP TABLE prompt_overrides_current;
      CREATE UNIQUE INDEX prompt_global_override ON prompt_overrides(task) WHERE scope='global';
      CREATE UNIQUE INDEX prompt_agent_override ON prompt_overrides(agent_id,task) WHERE scope='agent';
      PRAGMA user_version=23; COMMIT;`);
    assert.throws(() => legacy.prepare('INSERT INTO prompt_overrides VALUES(?,?,?,?)').run('agent', agent.id, 'part_cognition', prompts.part_cognition.text), /CHECK/);
    legacy.close();
    store = new SqliteStore(database); app = new Application(store);
    assert.deepEqual(store.promptOverrides(), before);
    app.editPrompt(agent.id, 'part_cognition', 'agent', prompts.part_cognition.text);
    assert.equal(store.promptOverrides({ scope: 'agent', agentId: agent.id, task: 'part_cognition' })[0]!.text, prompts.part_cognition.text.trim());
    assert.throws(() => app.editPrompt(agent.id, 'part_cognition', 'agent', 'x'.repeat(32769)), /32,768/);
    const check = new DatabaseSync(database);
    try {
      assert.equal((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 24);
      assert.throws(() => check.prepare('INSERT INTO prompt_overrides VALUES(?,?,?,?)').run('global', null, 'part_cognition', 'Duplicate'), /UNIQUE/);
      assert.throws(() => check.prepare('INSERT INTO prompt_overrides VALUES(?,?,?,?)').run('agent', null, 'part_cognition', 'Invalid scope'), /CHECK/);
      assert.throws(() => check.prepare('INSERT INTO prompt_overrides VALUES(?,?,?,?)').run('global', null, 'other', 'x'.repeat(32769)), /CHECK/);
    } finally { check.close(); }
  } finally { await app.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
