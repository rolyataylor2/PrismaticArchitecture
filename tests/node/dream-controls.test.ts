import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { startDream, resumeDream, listSimulationRuns, simulationTests } from '../../packages/sdk/src/simulation-tests.js';
import { dreamState } from '../../packages/sdk/src/dream-state.js';
import { dreamConsole } from '../../packages/sdk/src/dream-console.js';
import { api } from '../../packages/sdk/src/api.js';

async function settled(app: Application, id: string) {
  for (let i = 0; i < 1000; i++) {
    const run = listSimulationRuns(app).find(r => r.id === id)!;
    if (run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Dream did not settle');
}

test('pause waits for current experience, survives restart and resumes without replay or source mutation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-dream-controls-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && first) { first = false; enter(); await hold; }
      return super.constructed(input);
    }
  }
  let app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent('Pause source'); const before = dreamState(store, source.id);
    const run = startDream(app, 'conversation-starters', 'configured', source.id, false, { enabled: false });
    await entered;
    assert.match(dreamConsole(app, run.id).currentTask, /part cognition/);
    const requested = await api(app, 'POST', `/api/simulation-tests/${run.id}/pause`, {}) as typeof run;
    assert.equal(requested.status, 'running'); assert.equal(requested.pauseRequested, true);
    assert.equal(requested.stages.length, 0);
    release(); const paused = await settled(app, run.id);
    assert.equal(paused.status, 'paused'); assert.equal(paused.stages.length, 1);
    const stage = structuredClone(paused.stages[0]);
    await assert.rejects(app.message(run.agentId, 'Competing external experience'), /experiencing a dream/);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${run.agentId}`, { name: 'Competing edit' }), /dream to finish/);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.equal(listSimulationRuns(app).find(r => r.id === run.id)!.status, 'paused');
    const history = dreamConsole(app, run.id);
    assert.ok(history.lines.some(line => line.message.includes('Current stage finished')));
    resumeDream(app, run.id);
    assert.throws(() => resumeDream(app, run.id), /Only paused or failed|active worker/);
    const completed = await settled(app, run.id);
    assert.equal(completed.status, 'completed', completed.error ?? '');
    assert.deepEqual(completed.stages[0], stage);
    assert.equal(store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id).length, 4);
    assert.deepEqual(dreamState(store, source.id), before);
    assert.equal(completed.resumptions!.length, 1);
    const log = dreamConsole(app, run.id);
    assert.equal(log.status, 'completed'); assert.ok(log.lines.some(line => line.message.includes('Explicit continuation')));
    assert.deepEqual(log.lines.map(line => line.sequence), log.lines.map(line => line.sequence).sort((a, b) => a - b));
    const page = dreamConsole(app, run.id, log.lines[0]!.sequence);
    assert.ok(page.lines.every(line => line.sequence > log.lines[0]!.sequence));
    assert.equal('input' in log.lines[0]!, false);
  } finally { release(); await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('failed sleep resumes the same stage without redelivering its completed experience', async () => {
  const definition = { id: 'dream-controls-plumbing', title: 'Dream control plumbing', source: 'Deterministic coordination regression',
    hypothesis: 'Engineering regression only', seeds: [], criteria: ['Stage continuation'], limitations: 'Mock plumbing, no psychological conclusion',
    steps: [{ name: 'Experience and rest', phase: 'training' as const, text: 'An unopened sample is visible.', sleep: true },
      { name: 'Later experience', phase: 'probe' as const, text: 'The sample was opened.' }] };
  simulationTests.push(definition);
  const store = new SqliteStore(':memory:'); let fail = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'disposition_learning' && fail) throw new Error('Authored rest provider interruption');
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent(); const run = startDream(app, definition.id, 'configured', source.id, false, { enabled: false });
    const failed = await settled(app, run.id);
    assert.equal(failed.status, 'failed'); assert.equal(failed.stages.length, 0);
    assert.ok(failed.checkpoint?.cycleId);
    assert.ok(dreamConsole(app, run.id).lines.some(line => line.level === 'error' && line.message.includes('Authored rest')));
    fail = false; resumeDream(app, run.id); const completed = await settled(app, run.id);
    assert.equal(completed.status, 'completed', completed.error ?? ''); assert.equal(completed.stages.length, 2);
    assert.equal(completed.stages[0]!.cycleId, failed.checkpoint!.cycleId);
    assert.equal(store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id).length, 2);
    assert.match(completed.resumptions![0]!.error!, /Authored rest/);
    assert.deepEqual(completed.resumptions![0]!.before, failed.dream!.after, 'Earlier terminal snapshot remains preserved after resume');
    assert.equal(completed.dream!.keepChanges, false);
    assert.throws(() => resumeDream(app, run.id), /Only paused or failed/);
  } finally { await app.close(); store.close(); simulationTests.splice(simulationTests.indexOf(definition), 1); }
});

test('resume rejects changed terminal psychology instead of overwriting later history', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning { override async constructed(): Promise<never> { throw new Error('Authored interruption'); } }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent(); const run = startDream(app, 'conversation-starters', 'configured', source.id);
    await settled(app, run.id);
    const agent = store.get('agent', run.agentId);
    store.save('agent', { ...agent, version: agent.version + 1, name: 'Later researcher change' }, agent.version, { origin: 'researcher_edit', reason: 'Explicit regression edit', sourceIds: [] });
    assert.throws(() => resumeDream(app, run.id), /state changed/);
  } finally { await app.close(); store.close(); }
});


test('historical failed rest without a checkpoint resumes after its preserved completed stages', async () => {
  const store = new SqliteStore(':memory:'); let fail = true;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'disposition_learning' && fail) throw new Error('Historical rest interruption');
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const source = app.createAgent(); const started = startDream(app, 'observatory-learning-trained', 'configured', source.id, false, { enabled: false });
    const failed = await settled(app, started.id); assert.equal(failed.stages.length, 4);
    const legacy = structuredClone(failed); delete legacy.checkpoint; store.saveExperiment(legacy);
    fail = false; await api(app, 'POST', `/api/simulation-tests/${started.id}/resume`, {});
    const completed = await settled(app, started.id);
    assert.equal(completed.status, 'completed', completed.error ?? ''); assert.equal(completed.stages.length, 9);
    assert.deepEqual(completed.stages.slice(0, 4), failed.stages);
    assert.equal(store.cycles(completed.agentId).filter(cycle => cycle.threadId === completed.id).length, 8);
    let cursor = 0; const captured: number[] = [];
    for (let i = 0; i < 210; i++) store.appendEvent(completed.agentId, null, 'simulation.control', { runId: completed.id, action: 'resumed', completedStages: 9, reason: `Authored pagination fixture ${i}` });
    let more = true;
    while (more) { const page = dreamConsole(app, completed.id, cursor); assert.ok(page.lines.length <= 200); captured.push(...page.lines.map(line => line.sequence)); cursor = page.cursor; more = page.hasMore; }
    assert.equal(new Set(captured).size, captured.length, 'Incremental console pages have no duplicates');
    const controlSequences = store.eventsByType(completed.agentId, ['simulation.control']).map(event => event.sequence);
    assert.ok(controlSequences.every(sequence => captured.includes(sequence)), 'Historical console pages retain every control receipt');
  } finally { await app.close(); store.close(); }
});
