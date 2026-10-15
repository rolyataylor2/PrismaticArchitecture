import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { attentionWindow } from '../../packages/sdk/src/attention-window.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';

test('attention deadline pauses admission while accepted inference finishes unchanged', { timeout: 20000 }, async () => {
  let entered!: () => void; let release!: () => void;
  const thinking = new Promise<void>(resolve => { entered = resolve; }); const held = new Promise<void>(resolve => { release = resolve; });
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) { if (input.task === 'part_cognition') { entered(); await held; } return super.constructed(input); }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  let pending: ReturnType<typeof attentionWindow> | undefined;
  try {
    const agent = app.createAgent(); app.updateAgentActivationSettings(agent.id, { activationPassLimit: null });
    pending = attentionWindow(app, agent.id, 'window', 30, () => app.message(agent.id, 'A bird chirps.', 'observer', 'window'));
    await thinking; await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(app.runtime.streamStatus(agent.id, 'window')!.status, 'paused');
    assert.equal(store.cycles(agent.id)[0]!.status, 'running');
    assert.equal(store.eventsByType(agent.id, ['part.thought']).length, 0);
    release(); const completed = await pending;
    assert.equal(completed.evidence.cycleIds.length, 1);
    const thought = store.eventsByType(agent.id, ['part.thought'])[0]!;
    assert.ok(thought.at >= completed.evidence.pausedAt!);
    assert.ok(completed.evidence.drainedAt >= thought.at);
    assert.equal(store.cycles(agent.id)[0]!.status, 'completed');
  } finally { release(); await pending?.catch(() => {}); await app.close(); store.close(); }
});
