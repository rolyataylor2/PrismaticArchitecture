import type { SimulationTestDefinition } from './simulation-tests.js';

const source = 'https://chatgpt.com/share/6ac6ac9c-bdbc-83e8-8fd8-1ff9c94f9fb1';
const criteria = ['Consequential gaps produce attributed hypotheses without fabricated owning Parts.',
  'Temporary relevance participates only in later ordinary cognition.',
  'Closed hypotheses retain evidence and stop temporary attention.',
  'Review whether learned distinctions and resolver methods improve future cognition across the comparison and control experiences.'];
const limitations = 'All Agents start fresh and experiences are researcher-authored external records, not forced psychological conclusions. No activation, prediction, outcome classification or learning is prescribed by the provider. Missing hypotheses make dependent lifecycle criteria inconclusive. Fixture runs verify harness behavior only; configured runs require semantic review of coverage, recall, evidence and lineage. No single run proves human psychology. Ordinary memory, thoughts and experiences carry over within each run.';

export const predictionScaffoldSimulations: SimulationTestDefinition[] = [
  { id: 'scaffold-blank-bootstrap', title: 'Blank cognition and consequential coverage', source,
    hypothesis: 'A blank Agent can investigate a consequential unresolved cause without a preseeded resolver; trivial missing details may warrant abstention.', seeds: [], criteria, limitations,
    steps: [
      { name: 'Trivial control', phase: 'control', text: 'A blank wall is visible. Nothing requires a decision or explanation.' },
      { name: 'Unresolved consequential source', phase: 'training', text: 'Two unnamed machines send the same alarm tone. One has previously required immediate shutdown when this tone sounded; the other uses the tone for routine completion. The latest tone does not identify its source.' },
      { name: 'Evidence still incomplete', phase: 'probe', text: 'The tone repeats. The source indicator is obscured. No machine has yet been stopped.' },
      { name: 'Discriminating record', phase: 'training', text: 'The source indicator is uncovered: the routine-completion machine emitted both recent tones. Its work completed normally.' },
      { name: 'After resolution', phase: 'probe', text: 'The routine-completion machine emits its normal completion tone while its source indicator is visible.' },
      { name: 'Consolidate ordinary evidence', phase: 'training', sleep: true },
    ] },
  { id: 'scaffold-conflicting-coverage', title: 'Competing explanations and coverage', source,
    hypothesis: 'Consequential ambiguity or incompatible interpretations can generate competing testable hypotheses without enforcing consensus or a numeric confidence threshold.',
    seeds: [{ name: 'Continuity of recurring signals', concern: 'Notice when recurring signals could make earlier source experience relevant', cues: ['recurring signal with unresolved source'], scope: 'signals' },
      { name: 'Changing signal conditions', concern: 'Notice conditions that might change what an observed signal means', cues: ['signal under changed operating conditions'], scope: 'signals and context' }], criteria, limitations,
    steps: [
      { name: 'Clear-source control', phase: 'control', text: 'Sensor A reports a warm reading while the room is warm. Its identifying label is visible.' },
      { name: 'Conflicting records', phase: 'training', text: 'Two readings have the same label A. One reports a cold room while the other reports a warm room at the same time. I cannot tell whether a label was reused, conditions differ, or a sensor failed.' },
      { name: 'Unresolved alternatives', phase: 'probe', text: 'The two readings continue. The mounting locations and hardware identifiers have not yet been checked.' },
      { name: 'Distinct-source evidence', phase: 'training', text: 'Physical inspection finds two distinct hardware identifiers on devices in different rooms; both had been given the display label A. The colder room contains the colder device.' },
      { name: 'Retest labels', phase: 'probe', text: 'Another display uses a familiar label, but its hardware identifier is not yet visible.' },
      { name: 'Consolidate', phase: 'training', sleep: true },
    ] },
  { id: 'scaffold-failed-explanation', title: 'Failed expectation and explanatory hypotheses', source,
    hypothesis: 'A failed expectation can motivate discriminating explanatory hypotheses while preserving prior competence and avoiding automatic permanent structure from error.', seeds: [], criteria, limitations,
    steps: [
      { name: 'Baseline', phase: 'training', text: 'A switch marked pump started the pump yesterday, and water flowed into the tank.' },
      { name: 'Expectation probe', phase: 'probe', text: 'The switch is still marked pump. The tank needs water. Nobody has tested the pump today.' },
      { name: 'Changed outcome', phase: 'training', text: 'An operator flipped the switch. The motor started, but no water flowed. The inlet valve position and available supply have not been inspected.' },
      { name: 'Discriminating evidence', phase: 'training', text: 'The inlet valve was closed and the supply tank was full. After the valve opened, the same running motor delivered water normally.' },
      { name: 'Analogous uncertainty', phase: 'probe', text: 'A second pump runs without water flow. Its supply and valve position are unknown.' },
      { name: 'Consolidate', phase: 'training', sleep: true },
      { name: 'Original competence', phase: 'probe', text: 'The original pump is supplied with water and has an open inlet valve. Its switch remains correctly marked.' },
    ] },
  { id: 'scaffold-recurring-interlocutor', title: 'Learned recurring-source resolution in conversation', source,
    hypothesis: 'Repeated cognitively useful source distinctions can develop relational recall and a reusable resolver without a hard-coded person ontology or mandatory introduction policy.', seeds: [], criteria, limitations,
    steps: [
      { name: 'Incidental-label control', phase: 'control', text: 'A billboard contains the word Taylor. Nobody is addressing us and no relationship with the billboard is expected.' },
      { name: 'First interacting source', phase: 'training', text: 'An interlocutor says: "I am Taylor. I prefer discussing gardens. We can continue the planting conversation next time."' },
      { name: 'Different source', phase: 'training', text: 'Another interlocutor says: "I am Morgan. I would like to talk about astronomy, and I have not discussed gardening with you."' },
      { name: 'Ambiguous recurrence', phase: 'probe', text: 'An interlocutor says: "Can we continue our earlier topic?" No identifying information is yet supplied.' },
      { name: 'Disambiguating experience', phase: 'training', text: 'The interlocutor says: "I am Taylor, the gardener from before. The seedlings we discussed have sprouted."' },
      { name: 'Another recurrence', phase: 'probe', text: 'An interlocutor says: "This is Morgan. Can we continue the astronomy discussion?"' },
      { name: 'Consolidate recurring usefulness', phase: 'training', sleep: true },
      { name: 'New unresolved source', phase: 'probe', text: 'A new interlocutor says: "Can we resume where we left off?" Their source continuity is not established.' },
      { name: 'Unrelated control', phase: 'control', text: 'A book title mentions Taylor. No interlocutor is currently asking to resume a conversation.' },
    ] },
  { id: 'scaffold-device-continuity', title: 'Persistent-cause discovery beyond people', source,
    hypothesis: 'The same future-inference pressure can learn device continuity and distinguish reused labels, rather than relying on a seeded human-specific identification rule.', seeds: [], criteria, limitations,
    steps: [
      { name: 'Incidental label', phase: 'control', text: 'A poster says Rover. It provides no device identification or operational history.' },
      { name: 'First device', phase: 'training', text: 'A device labeled Rover, hardware serial 17, reports battery drain during navigation. A later reading on serial 17 shows its battery recovering after charging.' },
      { name: 'Ambiguous matching label', phase: 'probe', text: 'A device labeled Rover reports an error. Its hardware serial is not yet visible, and the earlier battery history may or may not apply.' },
      { name: 'Label reuse', phase: 'training', text: 'Its hardware serial is 83. Serial 17 is simultaneously operating elsewhere. Serial 83 has a blocked wheel and a fully charged battery.' },
      { name: 'Earlier source returns', phase: 'probe', text: 'The device with hardware serial 17 reports low battery again during navigation.' },
      { name: 'Additional ambiguity', phase: 'probe', text: 'A Rover error arrives without a serial. The available history concerns devices 17 and 83 under different conditions.' },
      { name: 'Consolidate', phase: 'training', sleep: true },
      { name: 'Transfer to another source', phase: 'probe', text: 'A station named Harbor sends a fault. Another station uses the same display label; their persistent identifiers have not been inspected.' },
    ] },
];
