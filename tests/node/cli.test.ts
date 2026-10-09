import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Agent, Memory, Part, Prediction, VersionRecord } from '../../packages/core/src/domain.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';

test('CLI subprocesses manage and inspect the same persistent psychology across restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-cli-')); const db = join(directory, 'agent.sqlite');
  const executable = resolve('dist/apps/cli/src/main.js');
  const env = { ...process.env, PRISM_DB: db, PRISM_PROVIDER: 'mock', PRISM_DECISIONS: 'mock' };
  const cli = (...args: string[]): string => execFileSync(process.execPath, [executable, ...args], { env, encoding: 'utf8' });
  try {
    assert.ok(cli('--help').includes('inspect live'));
    const agent = JSON.parse(cli('agent', 'create', 'CLI Agent')) as Agent;
    const live = spawn(process.execPath, [executable, 'inspect', 'live', agent.id], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let streamed = ''; live.stdout.on('data', chunk => { streamed += String(chunk); });
    try {
      cli('chat', agent.id, 'I am uncertain about sharing a personal vulnerability.');
      cli('chat', agent.id, 'Thank you for sharing. I respect you.');
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => { clearInterval(poll); reject(new Error('Live CLI did not stream cycle events')); }, 5000);
        const poll = setInterval(() => { if (streamed.includes('cycle.completed')) { clearTimeout(deadline); clearInterval(poll); resolve(); } }, 50);
      });
    } finally { const stopped = once(live, 'exit'); live.kill('SIGINT'); await stopped; }
    const parts = JSON.parse(cli('parts', 'list', agent.id)) as Part[];
    const caution = parts.find(p => p.instance)!;
    assert.ok(caution.instance);
    const memories = JSON.parse(cli('memories', 'list', caution.id)) as Memory[];
    const predictions = JSON.parse(cli('predictions', 'list', agent.id)) as Prediction[];
    assert.ok(memories.length); assert.ok(predictions.length);
    assert.equal((JSON.parse(cli('predictions', 'history', predictions[0]!.id)) as unknown[]).length, 2);
    assert.equal((JSON.parse(cli('memories', 'show', memories[0]!.id)) as Memory).content, memories[0]!.content);
    assert.ok(cli('inspect', 'world', memories[0]!.ancestorIds[0]!).includes('Objective ancestor / audit record'));
    const patch = join(directory, 'patch.json'); writeFileSync(patch, JSON.stringify({ mission: 'My explicitly edited concern' }));
    cli('parts', 'edit', caution.id, patch); cli('parts', 'archive', caution.id);
    assert.throws(() => cli('parts', 'reactivate', caution.id), /Retired/);
    const history = JSON.parse(cli('parts', 'history', caution.id)) as VersionRecord<Part>[];
    assert.equal(history.at(-1)!.change.origin, 'researcher_edit');
    assert.equal(history.at(-1)!.state.lifecycle, 'archived');
    assert.throws(() => cli('parts', 'restore', caution.id, '1'), /Retired/);
    assert.equal((JSON.parse(cli('agent', 'list')) as Agent[])[0]!.id, agent.id);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('explicit interruption recovery preserves state and never repeats external handoff', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-recovery-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const agent = app.createAgent(); const cycle = store.startCycle(agent.id);
    store.close(); store = new SqliteStore(path);
    const resumed = new Application(store);
    resumed.recoverCycle(cycle.id, 'Previous test process stopped before making an external handoff.');
    assert.equal(store.cycle(cycle.id).status, 'failed'); assert.equal(store.executions(agent.id).length, 0);
    assert.ok(store.events(agent.id).some(e => e.type === 'researcher.recovery'));
    assert.equal(store.startCycle(agent.id).sequence, 2);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
