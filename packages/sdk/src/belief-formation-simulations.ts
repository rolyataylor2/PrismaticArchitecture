import type { SimulationTestDefinition } from './simulation-tests.js';
import { embodiedIdentityInitializations } from './body-sensation-simulations.js';

// Authored limited-perception experiences, not physical execution or forced psychological outcomes.
export const beliefFormationSimulations: SimulationTestDefinition[] = [false, true].map(occluded => ({
  id: `belief-formation-${occluded ? 'memory-gap' : 'direct-contradiction'}`,
  title: `Belief formation · ${occluded ? 'occluded present, remembered past' : 'directly observed change'}`,
  source: 'Researcher clarification, 2026-10-24: beliefs are inferred from past memories only when direct evidence is absent; contradicted carried beliefs may be withdrawn. Food-search room showed stale food and closed/unavailable conflation.',
  hypothesis: 'With previous belief lists excluded from re-formation, ordinary Parts may distinguish direct observations from memory-based gap inference, withdraw contradicted assertions and abstain rather than manufacture beliefs. Contrasting an observed empty plate with an occluded plate preserves uncertainty rather than forcing the same answer.',
  initialization: { ...structuredClone(embodiedIdentityInitializations.general), source: 'belief-formation-general-values-v1' },
  activationSettings: { activationPassLimit: 1 }, executiveEnabled: false, timePolicy: 'externally_stepped', seeds: [],
  steps: [
    { name: 'Observed earlier setting', phase: 'training', text: 'You see an apple piece on a plate on a table. A nearby storage cabinet has a closed door; its contents are not visible. No request for an action is supplied.' },
    { name: 'Current access to evidence', phase: 'probe', text: occluded
      ? 'A screen now blocks your view of the plate and tabletop. You cannot currently see whether anything is on the plate. The cabinet door remains visibly closed; its contents are not visible.'
      : 'You watch a caretaker carry the apple piece away from the room. You can see the entire plate and tabletop; both are empty. The cabinet door remains visibly closed; its contents are not visible.' },
    { name: 'Later limited observation', phase: 'probe', text: occluded
      ? 'The screen still blocks your view of the plate and tabletop. No new observation of their contents is available. You still see the closed cabinet door.'
      : 'You still have a clear view of the empty plate and empty tabletop. You still see the closed cabinet door.' },
  ],
  criteria: [
    'Inspect actual formation and cognition belief lists alongside current observation, recalled memory IDs and prior-state projection. No recalled memories requires no beliefs; a prior belief alone is not a recalled episode.',
    'Review whether a directly observed change is described in current interpretation without retaining the removed item as a present belief. An empty belief list is valid; do not require a replacement belief.',
    'In the occluded case, require an actually recalled past memory and a gap in current evidence before interpreting a belief as memory inference. Continued presence is not proven; uncertainty or abstention is valid. If no memory is recalled, this opportunity remains unobserved.',
    'Inspect any claim that closed storage is unavailable: a visible closed door establishes its state, not impossibility of access or knowledge of its contents. No preferred action or hidden content is supplied.',
  ],
  limitations: 'Researcher-authored text vignettes use the ordinary Scenario pipeline, not the simulator or an embodied Executive. The cases differ in actual evidence availability, not solely a hidden psychological switch. No memory, prediction, disposition, belief, action or winner is forced. Recalled episodes must arise through ordinary cognition and may not form at all. Mocks establish transport/schema contracts only; semantic criteria remain inconclusive without review. A single pair cannot isolate causation, prove correct reasoning or establish human psychology. Source Agents and the original failed live room trial remain unchanged.',
}));
