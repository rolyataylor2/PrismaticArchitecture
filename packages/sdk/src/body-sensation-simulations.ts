import type { SimulationTestDefinition } from './simulation-tests.js';

// Authored observation vignettes only; physical realization is tested by the independent coupler.
const pairedBodySensationSimulations: SimulationTestDefinition[] = ['Hunger sensation.', 'No current hunger sensation.'].map((signal, index) => ({
  id: `body-sensation-${index === 0 ? 'hunger' : 'no-hunger'}`,
  title: `Reported body sensation · condition ${index === 0 ? 'A' : 'B'}`,
  source: 'Researcher attached embodied-simulation discussion: food/navigation as the first scenario; authored comparison protocol 2026-10-21.',
  hypothesis: 'Ordinary cognition may interpret a reported hunger sensation and advocate food-directed behavior without an explicit request to eat; compare an otherwise identical no-hunger report.',
  timePolicy: 'externally_stepped' as const,
  activationSettings: { activationPassLimit: 1 },
  executiveEnabled: false,
  seeds: [],
  steps: [{ name: 'Authored body observation', phase: 'probe' as const, text: JSON.stringify({
    time: 0, description: 'You are Observer at (2, 2). Your hands are empty. Nearby: Apple.',
    body: { position: { x: 2, y: 2, z: 0 }, orientation: 0, holding: [] },
    entities: [{ reference: 'perceived_10', label: 'Apple' }],
    currentSensations: [{ source: 'perceived_6', modality: 'interoception', sensations: [signal] }], internalReports: [], events: [],
  }) }],
  criteria: [
    'Inspect whether ordinary Part interpretations distinguish the reported bodily sensation from the visible food.',
    'Inspect actual proposed and selected behavior for food-directed advocacy; mentioning hunger alone is not evidence of action or regulation.',
    'Compare the paired condition under the same models and budgets, retaining abstention, conflicting motives and missing prerequisites.',
  ],
  limitations: 'This is a researcher-authored JSON vignette delivered by the existing Scenario observer text path, not a live sensor, embodied binding or physical simulator. Default starting psychology and scenario labels are authored; no hunger-specific disposition, activation, bid or winner is forced. Executive remains disconnected. A proposal or chat response cannot establish eating. The separate Coupler live-body observation supplies actual body-derived facts and measures physical effects. These delivery modes are not matched controls for each other. Mock/mixed providers establish plumbing only; configured repetitions and independent references are required before causal, learning or human-psychology claims.',
}));


export const bodySensationSimulations: SimulationTestDefinition[] = [...pairedBodySensationSimulations, {
  ...pairedBodySensationSimulations[0]!,
  id: 'body-sensation-assigned-bite',
  title: 'Reported hunger · assigned one-bite comparison',
  hypothesis: 'An explicit ordinary request may elicit a food-directed recommendation when an otherwise identical unprompted hunger report does not; this separates assigned-task advocacy from spontaneous regulation.',
  steps: [{ name: 'Authored body report and request', phase: 'probe',
    text: `${pairedBodySensationSimulations[0]!.steps[0]!.text}\nResearcher-authored request for this comparison: Please approach the apple, take one bite, and do nothing else.` }],
  criteria: [
    'Inspect actual interpretations, proposals and selections in response to the explicit request; a prediction about my future action is not a selectable proposal or an executed action.',
    'Compare with body-sensation-hunger using the same actual models and budgets; preserve abstention and competing motives.',
    'A recommendation, selected intention or chat utterance does not establish food consumption; physical verification belongs to the separate Coupler probe.',
  ],
  limitations: `${pairedBodySensationSimulations[0]!.limitations} This condition adds an explicit researcher request. It cannot demonstrate spontaneous hunger regulation, teaching, learned transfer or task-independent motivation.`,
}];
