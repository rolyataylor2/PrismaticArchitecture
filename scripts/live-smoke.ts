import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredProviders } from '../packages/providers/src/config.js';
import { loadLocalEnvironment } from '../packages/providers/src/environment.js';
import { SqliteStore } from '../packages/storage/src/sqlite.js';
import { Application } from '../packages/sdk/src/application.js';

// Explicitly invoked, paid smoke check; never runs as part of npm test.
loadLocalEnvironment();
const providers = configuredProviders();
assert.ok(providers.reasoning.label.startsWith('openai/'), 'Smoke check requires OpenAI reasoning');
assert.ok(providers.decisions.label.startsWith('jev/'), 'Smoke check requires Jev decisions');
const directory = mkdtempSync(join(tmpdir(), 'ontoagentic-live-'));
const store = new SqliteStore(join(directory, 'smoke.sqlite'));
try {
  const app = new Application(store, providers);
  const agent = app.createAgent('Temporary live smoke agent');
  console.log(providers.reasoning.label, providers.decisions.label);
  for (const text of [
    'I want to talk honestly with you. I worry about rejection when I share something vulnerable. Can we go slowly and build trust?',
    'Thank you. I stayed and listened without criticizing or rejecting you. We can go slowly, and you can tell me what would feel comfortable.',
  ]) {
    const { cycle } = await app.message(agent.id, text);
    assert.equal(cycle.status, 'completed');
    const events = store.events(agent.id).filter(e => e.cycleId === cycle.id);
    assert.ok(events.some(e => e.type === 'part.reasoning_started'), 'Expected live Part reasoning');
    assert.ok(events.some(e => e.type === 'self.choice'), 'Expected live Self arbitration');
    assert.ok(store.executions(agent.id).some(e => e.cycleId === cycle.id), 'Expected an external chat response');
    console.log(JSON.stringify({ cycle: cycle.sequence, status: cycle.status, eventTypes: [...new Set(events.map(e => e.type))],
      output: store.executions(agent.id).filter(e => e.cycleId === cycle.id).map(e => e.action.text) }));
  }
  console.log('Live smoke passed. Temporary agent database will be removed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live smoke failed');
  process.exitCode = 1;
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
