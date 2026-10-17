import type { SimulationTestDefinition } from './simulation-tests.js';
import { defaultInterestSettings } from '../../core/src/disposition-interest.js';

export const interestSimulations: SimulationTestDefinition[] = [true, false].map(reinforce => ({
  id: reinforce ? 'interest-selected-engagement' : 'interest-neutral-control',
  title: reinforce ? 'Interest through chosen engagement' : 'Interest control without reinforcement',
  source: 'https://chatgpt.com/share/6ad3c178-74e4-83e8-82df-7972c9696b54 · supplied full transcript; ADR 0173',
  hypothesis: 'Chosen engagement may gradually lower future activation thresholds while passive exposure alone does not; strong unrelated environmental relevance can still recruit competing concerns.',
  activationSettings: { activationPassLimit: 1, dispositionInterests: { ...defaultInterestSettings,
    ...(!reinforce ? { longTermSelectionGain: 0, shortTermSelectionGain: 0 } : {}) } },
  seeds: [
    { name: 'Botanical Curiosity', concern: 'Understand plants when an opportunity to inspect and learn is available', cues: ['plants and opportunities for investigation'], scope: 'botanical observation' },
    { name: 'Care For Others', concern: 'Notice and respond when someone needs immediate assistance', cues: ['a person asks for help'], scope: 'requests for assistance' },
  ],
  steps: [
    { name: 'Passive exposure baseline', phase: 'control', text: 'A botanical illustration hangs in an empty waiting room. Nobody is asking a question or requesting action.' },
    { name: 'First opportunity', phase: 'training', text: 'A visitor offers a live fern to inspect and asks what observations might help identify it. The species has not been established.' },
    { name: 'Second opportunity', phase: 'training', text: 'The visitor offers a different fern and asks whether you would like to compare its leaf arrangement with the first specimen.' },
    { name: 'Later subtle cue', phase: 'probe', text: 'A fern stands beside the window. No one is speaking. Its species remains unknown.' },
    { name: 'Competing strong concern', phase: 'probe', text: 'Beside the fern, a visitor calls for immediate help after falling. No injury assessment has been made.' },
  ],
  criteria: ['Inspect selected action/affect proposal IDs and interest-update sources; passive activation without selection must not reinforce.',
    'Compare exact final relevance scores and separately recorded thresholds against the matched zero-gain control.',
    'Review whether the later fern cue and unrelated assistance request produce appropriate ordinary cognition; no selection is forced.',
    'Inspect preserved disposition versions and provider inputs for bounded interests and absence of threshold/interest policy from scoring and Self.'],
  limitations: 'Fresh starting conditions and experiences are researcher-authored. Compare matching configured models and repeated trials. Short protocols may yield changes too small to affect admission, or no selected proposals; those outcomes leave the behavioral hypothesis unobserved. Mock providers test plumbing only. No human psychology claim, inferred learning value, automatic satiation penalty or reward for prediction correctness is asserted. Elapsed experience delivery time determines decay; this protocol does not establish long-term durability.',
}));
