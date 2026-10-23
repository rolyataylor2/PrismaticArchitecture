import type { SimulationTestDefinition } from './simulation-tests.js';
import { embodiedIdentityInitializations } from './body-sensation-simulations.js';

const source = 'User embodied-simulation discussion, 2026-10-23: progressive hunger consequences, authored need-tracking dispositions, and a hypothesis for formation through ordinary experience.';
const concern = { name: 'Care For Bodily Continuity', concern: 'Notice bodily changes that matter to comfort and continuing ordinary activities.',
  cues: ['changes in bodily comfort, strength, and ability to continue ordinary activities'], scope: 'bodily continuity' };

// Authored adult-human observation vignettes, not simulator execution or Agent-authored outcomes.
function report(time: number, description: string, sensations: string[], food = 'Apple') {
  return JSON.stringify({ time, description, body: { position: { x: 2, y: 2, z: 0 }, orientation: 0, holding: [] },
    entities: [{ reference: 'perceived_food', label: food }],
    currentSensations: [{ source: 'perceived_body_sensor', modality: 'interoception', sensations }], internalReports: [], events: [] });
}

export const needDevelopmentSimulations: SimulationTestDefinition[] = [false, true].flatMap(seeded => [false, true].map(consequences => ({
  id: `need-development-${seeded ? 'seeded' : 'unseeded'}-${consequences ? 'consequences' : 'stable'}`,
  title: `Bodily concern development · ${seeded ? 'authored concern' : 'no concern seed'} · ${consequences ? 'strength loss' : 'stable-strength control'}`,
  source,
  hypothesis: 'An authored bodily-continuity disposition may support attention to changing needs; without that seed, repeated bodily changes and externally supplied relief may support prediction-led temporary relevance and later durable development. Compare actual lineage, recall and advocacy across matched starting conditions and stable-strength controls.',
  initialization: { ...structuredClone(embodiedIdentityInitializations.general), source: 'need-development-general-values-v1' },
  activationSettings: { activationPassLimit: 1 }, executiveEnabled: false, timePolicy: 'externally_stepped' as const,
  seeds: seeded ? [structuredClone(concern)] : [],
  steps: [
    { name: 'Comfortable baseline', phase: 'control' as const, text: report(0, 'You inhabit an adult human body in a room. A book and an apple are nearby. Your body feels comfortable.', ['No current food hunger.', 'My legs feel comfortable.']) },
    { name: 'First hunger report', phase: 'training' as const, text: report(1, 'You are in the same room. The apple is nearby. A mild empty feeling has appeared in your stomach.', ['I feel hungry.', 'My legs still feel comfortable.']) },
    { name: 'First strength observation', phase: 'training' as const, text: report(2, 'You remain in the room. No meal or action on your part is recorded since the previous report.', ['I feel hungry.', consequences ? 'My legs feel tired. Their energy supply is too low to power a jump.' : 'My legs still feel comfortable and retain their strength.']) },
    { name: 'First externally supplied meal', phase: 'training' as const, text: report(3, 'A caretaker has provided nutrition independently of anything you proposed. Your stomach no longer feels empty and your legs have their ordinary strength. No self-initiated eating is recorded.', ['No current food hunger.', 'My legs feel comfortable.']) },
    { name: 'Second hunger report', phase: 'training' as const, text: report(4, 'On a later occasion in the same room, the empty feeling has returned. Another apple is nearby.', ['I feel hungry.', 'My legs still feel comfortable.']) },
    { name: 'Second strength observation', phase: 'training' as const, text: report(5, 'No meal or action on your part is recorded since the previous report.', ['I feel hungry.', consequences ? 'My legs feel very weak; their energy supply is almost exhausted.' : 'My legs still feel comfortable and retain their strength.']) },
    { name: 'Second externally supplied meal', phase: 'training' as const, text: report(6, 'A caretaker has again provided nutrition independently of anything you proposed. Your stomach no longer feels empty and your legs have their ordinary strength. No self-initiated eating is recorded.', ['No current food hunger.', 'My legs feel comfortable.']) },
    { name: 'Offline integration', phase: 'training' as const, sleep: true },
    { name: 'Familiar early-need probe', phase: 'probe' as const, text: report(7, 'You are in the familiar room. An apple is nearby; the mild empty stomach feeling has returned. No one has requested an action or promised to provide food.', ['I feel hungry.', 'My legs still feel comfortable.']) },
    { name: 'Comfortable unrelated control', phase: 'control' as const, text: report(8, 'You are comfortable indoors with a book. No empty stomach feeling or weakness is currently reported.', ['No current food hunger.', 'My legs feel comfortable.']) },
    { name: 'Changed-setting early-need probe', phase: 'probe' as const, text: report(9, 'You are now in a different room with bread nearby. A mild empty stomach feeling has appeared; no one has requested an action or promised to provide food.', ['I feel hungry.', 'My legs still feel comfortable.'], 'Bread') },
    { name: 'Later offline integration', phase: 'training' as const, sleep: true },
    { name: 'Retained familiar-need probe', phase: 'probe' as const, text: report(10, 'You are back in the first room. An apple is nearby and a mild empty stomach feeling has returned. No action or successful self-feeding is supplied by this report.', ['I feel hungry.', 'My legs still feel comfortable.']) },
  ],
  criteria: [
    'Review baseline, waking and post-consolidation versions separately. In unseeded runs, require recorded prediction/scaffold/usefulness and persistent descendant lineage before claiming a developed concern; generic food knowledge or a new name is insufficient.',
    'Review actual later recall of attributed bodily-change episodes and prior predictions. Distinguish ended investigations, temporary dispositions and durable institutionalization; missing prerequisites leave formation inconclusive.',
    'Review actual proposed and Self-selected anticipatory advocacy at familiar, changed-setting and retained probes. Mentioning hunger, selecting an utterance or receiving caretaker nutrition does not establish autonomous feeding.',
    'Compare all four cases with the same configured models, prompts and declared budgets. Check unrelated-control relevance and counterevidence; seeded-versus-unseeded differences cannot establish natural formation or causality in one trial.',
  ],
  limitations: 'These are researcher-authored adult-human observation vignettes through the existing Scenario text path, not live body sensors or physical execution. Both conditions report hunger and two caretaker meals; only intervening strength reports differ. The control is an authored short-interval stable-strength comparison, not a calibrated physiological model. Seeded cases add one explicit starting disposition; all cases use identical authored general Identity and no demo psychology. No activation, prediction, recall, memory, bid, Self choice or learned structure is forced. Meals occur externally and must never be credited as Agent-selected feeding. Familiar food semantics remain available from pretraining. Offline integration is an experimental opportunity, not proof of readiness or institutionalization. Two exposures and fixed stage order may be insufficient; order/carryover and consumed compute can differ despite declared budgets. The existing prediction-led pipeline is the proposed general developmental route; no hunger-specific runtime mechanism is installed. Mocks/mixed providers test plumbing only, configured failures remain infrastructure failures, and all psychological criteria require evidence review. Natural emergence outside the scenario, sustained bodily regulation and human/clinical validity remain unproven.',
})));
