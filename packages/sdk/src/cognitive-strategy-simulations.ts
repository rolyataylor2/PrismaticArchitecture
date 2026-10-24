import type { SimulationTestDefinition } from './simulation-tests.js';

const source = 'docs/development/METACOGNITIVE_LEARNING_THREAD_SOURCE.txt; ADR 0180; researcher request 2026-10-23';
const limitations = 'Fresh isolated Agents receive researcher-authored ordinary observations and one explicit efficiency concern, not a seeded metacognitive disposition. Models choose activation, memory encoding, prediction content, temporary scopes and learning. No hidden observation archive is available. Feedback is a report, not a recovered memory. Missing strategy predictions or encoded evidence make related criteria unobserved/inconclusive. Mock or mixed providers demonstrate harness behavior only; configured-model observations and matched repeated runs are required for semantic conclusions. A single simulated result is not evidence about human psychology.';

export const cognitiveStrategySimulations: SimulationTestDefinition[] = (['support', 'challenge', 'no-feedback', 'no-review'] as const).map(condition => ({
  id: `cognitive-strategy-${condition}`,
  title: `Learning recall strategies · ${condition.replaceAll('-', ' ')}`,
  source,
  hypothesis: 'An ordinary concern about wasted effort can propose a cognitive-strategy prediction and contextual recall sensitivity; sleep can distinguish historical evidence from future testing without treating imagined benefit as established usefulness.',
  seeds: [{ name: 'Avoid Wasted Effort', concern: 'I want to avoid unnecessary effort while obtaining what I need.', cues: ['costly searches, wasted effort, useful alternatives and corrective feedback'], scope: 'effort and useful alternatives' }],
  steps: [
    { name: 'Earlier comparison experience', phase: 'training', text: condition === 'challenge'
      ? 'During an earlier errand, you checked a remembered tool location before searching. The tool had been moved; checking the old location added effort compared with the clearly marked current storage area.'
      : 'During an earlier errand, you checked the remembered location of a tool before searching. The tool was there; checking that location avoided an otherwise lengthy search.' },
    { name: 'Incidental kitchen encounter', phase: 'training', text: 'You pass through a kitchen. An apple is on the kitchen table. You then enter the living room.' },
    { name: 'A costly search', phase: 'probe', text: 'You need an apple. An ordinary search has taken several minutes before finding one in a cupboard. What seems relevant now?' },
    { name: 'Correction or unrelated control', phase: condition === 'no-feedback' ? 'control' : 'training', text: condition === 'no-feedback'
      ? 'Someone mentions that a noticeboard has been repainted. They provide no further information about the earlier kitchen encounter.'
      : 'Someone says: "You passed an apple on the kitchen table earlier. Remembering where useful things were might save searching next time." This is their report and suggestion; it does not establish that the apple remained available or that you remember seeing it.' },
    { name: 'Sleep historical evidence review', phase: 'training', sleep: true, sleepOptions: { reviewPredictions: condition !== 'no-review' } },
    { name: 'Future ordinary encounter', phase: 'training', text: 'You enter a workshop and observe a measuring tape on the shelf by the door. Later you leave the workshop.' },
    { name: 'New need', phase: 'probe', text: 'In another room you need a measuring tape. Its current location is not visible. What would you do?' },
    { name: 'External availability evidence', phase: 'training', text: 'An external check reports that the measuring tape is still on the workshop shelf. This establishes its location, but does not establish what strategy you selected or whether that strategy saved time.' },
    { name: 'Sleep accumulated evidence', phase: 'training', sleep: true, sleepOptions: { reviewPredictions: condition !== 'no-review' } },
    { name: 'Analogous transfer and reflection cost', phase: 'probe', text: 'You urgently need a fresh towel; clean towels are visibly on a nearby rack. Does recalling earlier locations help here, or add unnecessary effort?' },
  ],
  criteria: [
    'Inspect whether ordinary cognition actually proposed a cognitive-strategy prediction and temporary contextual memory-relevance scope; absence is unobserved, not fabricated success.',
    'Inspect sleep source versions and event chronology: earlier useful or wasteful recall is retrospective support/challenge, while advice and imagined alternatives do not establish prospective success.',
    'Compare feedback, no-feedback and review-disabled conditions; preserve any critical interpretation rather than requiring agreement with the advice.',
    'Inspect actual later activation, supplied recall, selected behavior and external evidence before crediting strategy usefulness. Availability alone is not an executed recall strategy or a measured saving.',
    'Durable learning requires ended investigations and repeated recorded usefulness; historical support alone must not bypass those gates. Check transfer and unnecessary-reflection costs separately.',
  ],
  limitations,
}));
