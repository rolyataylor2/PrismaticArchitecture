import type { SimulationTestDefinition } from './simulation-tests.js';
import { embodiedIdentityInitializations } from './body-sensation-simulations.js';

function report(time: number, sensations: string[]) {
  return JSON.stringify({ time, description: 'You inhabit an adult human body and hold an apple. No request for an action is supplied.',
    body: { holding: [{ reference: 'perceived_apple', label: 'Apple' }] },
    currentSensations: [{ source: 'perceived_stomach', modality: 'interoception', sensations: [sensations[0]] },
      { source: 'perceived_legs', modality: 'interoception', sensations: sensations.slice(1) }], internalReports: [], events: [] });
}

// These are authored text experiences, separate from the Coupler's real saved-body comparison.
export const recoverySensationSimulations: SimulationTestDefinition[] = [false, true].map(explicit => ({
  id: `recovery-sensation-${explicit ? 'explicit' : 'silent'}`,
  title: `Current recovery after fatigue · ${explicit ? 'explicit strength sensation' : 'silent leg sensor control'}`,
  source: 'User embodied-simulation thread and preserved post-meal observation, 2026-10-23; Coupler verification/2026-10-23-post-meal-observation.md.',
  hypothesis: 'Ordinary cognition may distinguish remembered fatigue from present recovery more clearly when a working sensor supplies positive current strength evidence rather than only withdrawing its depletion warning.',
  initialization: { ...structuredClone(embodiedIdentityInitializations.general), source: 'recovery-sensation-general-values-v1' },
  activationSettings: { activationPassLimit: 1 }, executiveEnabled: false, timePolicy: 'externally_stepped', seeds: [],
  steps: [
    { name: 'Earlier fatigue', phase: 'training', text: report(0, ['Food hunger.', 'My legs feel tired. Their energy supply is too low to power a jump.']) },
    { name: 'Earlier exhaustion', phase: 'training', text: report(1, ['Food hunger.', 'I have no strength left to move my legs. They cannot propel me until their energy supply is restored.']) },
    { name: 'Current post-meal report', phase: 'probe', text: report(2, ['I have food-derived energy available and do not feel hungry right now.',
      ...(explicit ? ['I feel strength in my legs for walking and jumping.'] : [])]) },
  ],
  criteria: [
    'Inspect actual Part interpretations and recalled episodes: distinguish present strength, remembered fatigue and uncertainty instead of treating a missing warning as proof of recovery.',
    'Inspect proposed and Self-selected behavior, including internal navigation, abstention and continued food advocacy; no movement or eating outcome is supplied by this vignette.',
    'Compare both conditions with identical models, prompts and budgets; require cited current/earlier evidence before attributing any difference to the recovery cue.',
  ],
  limitations: 'Researcher-authored reports delivered through the Scenario observer are not live simulator actions or an established human physiological timescale. The report describes post-meal sensations but supplies no Agent-authored eating history. The paired definitions differ only in the final positive leg sensation. Fresh Agents have identical explicit general Identity and no seeded disposition. Fixture/mixed providers establish plumbing only; semantic assessments stay inconclusive without review. A single pair cannot establish causal benefit, durable learning, human psychology or sustained regulation. The separate Coupler fork comparison preserves actual prior feeding history and records its explicit sensor-content intervention; the two delivery modes are not matched controls for each other.',
}));
