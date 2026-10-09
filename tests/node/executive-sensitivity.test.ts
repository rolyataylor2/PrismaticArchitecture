import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultExecutiveSensitivity, reviseSensitivityThresholds } from '../../packages/core/src/executive-sensitivity.js';
import { ExecutiveReactionPolicy } from '../../packages/executive/src/reaction-policy.js';

test('all five operational signals have risk-aware responses without treating novelty as failure', () => {
  const expected = { failure: 'request_guidance', drift: 'request_guidance', surprise: 'inspect',
    novelty: 'inspect', uncertainty: 'inspect' } as const;
  for (const [signal, response] of Object.entries(expected)) {
    const policy = new ExecutiveReactionPolicy(defaultExecutiveSensitivity());
    const observed = { signal: signal as keyof typeof expected, intensity: 0.6, evidence: 'Explicit operational fixture observation' };
    assert.equal(policy.evaluate(observed, { risk: 'harmless', timestampMs: 0 }).response, response);
    assert.equal(new ExecutiveReactionPolicy(defaultExecutiveSensitivity()).evaluate(observed,
      { risk: 'consequential', timestampMs: 0 }).response, 'request_guidance');
  }
  const policy = new ExecutiveReactionPolicy(defaultExecutiveSensitivity());
  assert.equal(policy.evaluate({ signal: 'uncertainty', intensity: 0.4, evidence: 'Incomplete result' },
    { risk: 'harmless', timestampMs: 0 }).response, 'continue');
  assert.equal(policy.evaluate({ signal: 'uncertainty', intensity: 0.4, evidence: 'Incomplete result' },
    { risk: 'consequential', timestampMs: 1 }).response, 'request_guidance');
});

test('cooldowns are per signal and cannot suppress unresolved submissions or constraint violations', () => {
  const policy = new ExecutiveReactionPolicy(defaultExecutiveSensitivity());
  const observation = { signal: 'uncertainty' as const, intensity: 1, evidence: 'Insufficient information' };
  assert.equal(policy.evaluate(observation, { risk: 'consequential', timestampMs: 0 }).response, 'request_guidance');
  assert.equal(policy.evaluate(observation, { risk: 'consequential', timestampMs: 1 }).suppressedByCooldown, true);
  assert.equal(policy.evaluate({ ...observation, signal: 'novelty' }, { risk: 'harmless', timestampMs: 2 }).response, 'inspect');
  assert.equal(policy.evaluate({ ...observation, intensity: 0 }, { risk: 'consequential', timestampMs: 3,
    unresolvedSubmission: true }).response, 'stop');
  assert.equal(policy.evaluate({ ...observation, intensity: 0 }, { risk: 'harmless', timestampMs: 4,
    constraintViolated: true }).response, 'stop');
  assert.equal(policy.evaluate(observation, { risk: 'consequential', timestampMs: 10000 }).response, 'request_guidance');
  assert.throws(() => policy.evaluate(observation, { risk: 'consequential', timestampMs: 9999 }), /monotonic/);
});

test('supervised threshold proposals preserve bounds and prior profile values', () => {
  const original = defaultExecutiveSensitivity();
  const revised = reviseSensitivityThresholds(original, { uncertainty: 0.8, novelty: 0.2 });
  assert.equal(original.uncertainty.threshold, 0.5);
  assert.equal(revised.uncertainty.threshold, 0.8);
  assert.equal(revised.failure.threshold, original.failure.threshold);
  assert.throws(() => reviseSensitivityThresholds(original, { uncertainty: 1 }), /bounds/);
  assert.throws(() => reviseSensitivityThresholds(original, { uncertainty: NaN }));
});
