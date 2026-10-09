import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';

test('prediction reflection supplies later facts, capsule and memories to constructed and legacy owners', () => {
  const context = { outcome: 'correct', world: { id: 'current-world', cycleId: 'current-cycle', sequence: 2,
    facts: [{ source: 'observer', kind: 'observes', timestamp: '2026-10-07T00:00:00Z', text: 'The opened box contains a blue token.' }] },
    prediction: { expectation: 'We will open the box.', capsule: { interpretation: 'Inspection expected', details: ['Box initially sealed'], entities: ['box'] },
      confidence: 0.6, horizon: 'next exchange', createdCycle: 'earlier-cycle', status: 'open' },
    laterEvidence: [{ source: 'observer', kind: 'observes', timestamp: '2026-10-07T00:00:00Z', text: 'Inspection completed; no red token was present.' }],
    memories: [{ gist: 'Earlier uncertain contents', content: 'I wondered about the unopened sample.' }], activation: { score: 2, delta: 0 } };
  for (const instance of [null, { interpretation: 'I want to inspect the sample', retirement: null }]) {
    const text = renderTaskPrompt('agent', 'evaluation', { ...context, part: { name: 'Curious about contents', mission: 'Understand this sample',
      beliefs: ['Inspection may help'], strategies: [], cognitiveCharacteristics: [], stickiness: { concern: 'Contents unclear' }, instance } });
    assert.ok(text.includes('The opened box contains a blue token.'), 'Current observation must reach reflection');
    assert.ok(text.includes('Inspection completed; no red token was present.'), 'Later outcome evidence must reach reflection');
    assert.ok(text.includes('We will open the box.'), 'Preserved expectation must reach reflection');
    assert.ok(text.includes('I wondered about the unopened sample.'), 'Subjective memories must reach reflection');
    assert.equal(text.includes('## Subtle additive learning'), instance === null);
  }
});
