import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import type { PredictionUpdate } from '../../packages/core/src/domain.js';

test('twelve incorrect predictions lose five points; one correct restores one; confidence persists and cannot be rewritten by reflection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'part-confidence-'));
  const path = join(dir, 'agents.sqlite');
  let store = new SqliteStore(path);
  try {
    const app = new Application(store); const agent = app.createAgent();
    const { cycle } = await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
    const world = store.world(cycle.worldId);
    const initial = store.list('prediction', agent.id)[0]!;
    const draft = { expectation: initial.expectation, capsule: initial.capsule, confidence: 0, horizon: initial.horizon, evaluateAfterCycle: initial.evaluateAfterCycle };
    const originalPart = store.get('part', initial.partId!);
    assert.equal(originalPart.beliefConfidence, 1);
    assert.equal(initial.confidence, 1);
    const update: PredictionUpdate = {
      operation: 'resolve', revision: null,
      // Confidence follows the bounded result, not the Part's disagreement with it.
      evaluation: { assessment: 'confirmed', interpretation: 'My beliefs remain right.', causalAttribution: 'I interpret this from my own perspective.', evidence: [], evidenceWorldId: world.id },
      memory: null, mutation: null, reason: 'Resolve the preserved expectation.',
    };
    let prediction = initial;
    for (let index = 0; index < 12; index++) {
      if (index) prediction = app.runtime.predictions.form(originalPart.id, world, draft);
      assert.equal(prediction.confidence, store.get('part', originalPart.id).beliefConfidence);
      app.runtime.predictions.apply(prediction, world, update, 'incorrect');
    }
    const afterErrors = store.get('part', originalPart.id);
    assert.equal(afterErrors.beliefConfidence, 0.95);
    assert.equal(afterErrors.name, originalPart.name);
    assert.equal(afterErrors.mission, originalPart.mission);
    assert.deepEqual(afterErrors.beliefs, originalPart.beliefs);
    assert.throws(() => app.runtime.predictions.apply(prediction, world, update, 'incorrect'));
    assert.equal(store.get('part', originalPart.id).beliefConfidence, 0.95);
    prediction = app.runtime.predictions.form(originalPart.id, world, draft);
    assert.equal(prediction.confidence, 0.95);
    app.runtime.predictions.apply(prediction, world, { ...update, mutation: { beliefConfidence: 0.2 } }, 'correct');
    assert.equal(store.get('part', originalPart.id).beliefConfidence, 0.96);
    assert.equal(store.get('prediction', prediction.id).confidence, 0.95);
    assert.ok(store.events(agent.id).some(event => event.type === 'part.mutation_rejected'));
    assert.equal(store.versions('part', originalPart.id)[0]!.state.beliefConfidence, 1);
    store.close(); store = new SqliteStore(path);
    assert.equal(store.get('part', originalPart.id).beliefConfidence, 0.96);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('confidence stays bounded and unresolved/irrelevant updates do not change it', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const { cycle } = await app.message(agent.id, 'I am afraid of vulnerability and uncertain about a personal question.');
    const world = store.world(cycle.worldId); const initial = store.list('prediction', agent.id)[0]!;
    const update: PredictionUpdate = { operation: 'resolve', revision: null,
      evaluation: { assessment: 'confirmed', interpretation: 'I was right.', causalAttribution: 'The response.', evidence: [], evidenceWorldId: world.id },
      memory: null, mutation: null, reason: 'Prediction outcome.' };
    app.runtime.predictions.apply(initial, world, update, 'correct');
    assert.equal(store.get('part', initial.partId!).beliefConfidence, 1);
    const draft = { expectation: initial.expectation, capsule: initial.capsule, confidence: 0, horizon: initial.horizon, evaluateAfterCycle: initial.evaluateAfterCycle };
    const part = store.get('part', initial.partId!);
    app.runtime.mutations.patch(part.id, part.version, { beliefConfidence: 0 }, { origin: 'researcher_edit', reason: 'Test lower boundary', sourceIds: [] });
    let prediction = app.runtime.predictions.form(part.id, world, draft);
    app.runtime.predictions.apply(prediction, world, update, 'incorrect');
    assert.equal(store.get('part', part.id).beliefConfidence, 0);
    prediction = app.runtime.predictions.form(part.id, world, draft);
    app.runtime.predictions.apply(prediction, world, { ...update, operation: 'continue', evaluation: null });
    assert.equal(store.get('part', part.id).beliefConfidence, 0);
    const continued = store.get('prediction', prediction.id);
    app.runtime.predictions.apply(continued, world, { ...update, operation: 'invalidate', evaluation: null });
    assert.equal(store.get('part', part.id).beliefConfidence, 0);
  } finally { store.close(); }
});
