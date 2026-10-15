import test from 'node:test';
import assert from 'node:assert/strict';
import { ThoughtJobs } from '../../packages/core/src/thought-jobs.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const scope = { agentId: 'agent', threadId: 'thread', dispositionId: 'bird' };

test('slow thought does not block another scope; newer context cannot interrupt or duplicate it', async () => {
  const jobs = new ThoughtJobs(2, 3);
  const slow = gate();
  const started = gate();
  const first = jobs.submit({ ...scope, worldId: 'w1', run: async () => { started.release(); await slow.promise; return 'old thought'; } });
  await started.promise;
  assert.equal(jobs.isProcessing(scope), true);
  const obsolete = jobs.submit({ ...scope, worldId: 'w2', run: async () => 'obsolete' });
  const latest = jobs.submit({ ...scope, worldId: 'w3', run: async () => 'new thought' });
  assert.deepEqual(await obsolete, { status: 'superseded' });
  const other = await jobs.submit({ ...scope, dispositionId: 'conversation', worldId: 'w2', run: async () => 'listening' });
  assert.deepEqual(other, { status: 'completed', value: 'listening' });
  assert.equal(jobs.isProcessing(scope), true);
  slow.release();
  assert.deepEqual(await first, { status: 'completed', value: 'old thought' });
  assert.deepEqual(await latest, { status: 'completed', value: 'new thought' });
  await jobs.close();
  assert.equal(jobs.activeCount, 0);
  assert.equal(jobs.queuedCount, 0);
});

test('failure releases capacity, queue bounds are explicit, and close drains accepted jobs', async () => {
  const jobs = new ThoughtJobs(1, 1);
  const slow = gate();
  const started = gate();
  const failed = jobs.submit({ ...scope, worldId: 'w1', run: async () => { started.release(); await slow.promise; throw new Error('provider failed'); } });
  const rejection = assert.rejects(failed, /provider failed/);
  await started.promise;
  const queued = jobs.submit({ ...scope, dispositionId: 'conversation', worldId: 'w2', run: async () => 42 });
  assert.deepEqual(await jobs.submit({ ...scope, dispositionId: 'third', worldId: 'w2', run: async () => 0 }), { status: 'deferred' });
  const closed = jobs.close();
  assert.deepEqual(await jobs.submit({ ...scope, worldId: 'w3', run: async () => 0 }), { status: 'closed' });
  slow.release();
  await rejection;
  assert.deepEqual(await queued, { status: 'completed', value: 42 });
  await closed;
});

test('queued reflection and inquiry retain separate work while sharing one running scope', async () => {
  const jobs = new ThoughtJobs(2, 4); const held = gate(); const started = gate(); const order: string[] = [];
  const running = jobs.submit({ ...scope, worldId: 'w1', run: async () => { started.release(); await held.promise; order.push('thought'); } });
  await started.promise;
  const reflection = jobs.submit({ ...scope, purpose: 'prediction:p1', worldId: 'w2', run: async () => { order.push('reflection'); } });
  const oldInquiry = jobs.submit({ ...scope, purpose: 'self_inquiry', worldId: 'w1', run: async () => { order.push('obsolete'); } });
  const inquiry = jobs.submit({ ...scope, purpose: 'self_inquiry', worldId: 'w2', run: async () => { order.push('inquiry'); } });
  assert.deepEqual(await oldInquiry, { status: 'superseded' });
  held.release();
  const outcomes = await Promise.all([running, reflection, inquiry]);
  assert.ok(outcomes.every(outcome => outcome.status === 'completed'));
  assert.deepEqual(order, ['thought', 'reflection', 'inquiry']); await jobs.close();
});
