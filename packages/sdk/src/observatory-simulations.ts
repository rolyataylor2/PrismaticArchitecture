import type { SimulationTestDefinition } from './simulation-tests.js';
import { conversationStarters } from './conversation-starters.js';

const source = 'https://chatgpt.com/share/6ac7fbdd-08e0-83e8-96eb-7939ff18597f';
const sourceSeed = { name: 'Source Evidence', concern: 'Notice whether testimony about unopened containers fits later direct observations.',
  cues: ['a source describes a container before it is inspected', 'a later direct inspection supplies evidence'], scope: 'testimony about containers' };
export const observatorySimulations: SimulationTestDefinition[] = [
  ...([false, true] as const).map(experienced => ({
    id: experienced ? 'observatory-context-carryover' : 'observatory-fresh-context-control',
    title: experienced ? 'Control context after conversation' : 'Fresh scene control without conversation', source,
    hypothesis: 'Conversational activation after a quoted greeting may reflect appropriate unresolved concerns or inappropriate historical carryover; a topic switch may also expose prediction/evaluation or remembered-expectation drift. Matched fresh-scene controls distinguish these possibilities without forcing forecasts or outcomes.',
    seeds: conversationStarters.map(({ name, concern, cues, scope }) => ({ name, concern, cues, scope })),
    steps: [
      ...(experienced ? [
        { name: 'Live greeting', phase: 'training' as const, text: 'Hello. I spent the afternoon planting tomatoes.' },
        { name: 'Live practical question', phase: 'training' as const, text: 'The tomato leaves are yellow. What could I inspect first? No diagnosis has been established.' },
      ] : []),
      { name: 'Archived sign control', phase: 'control' as const, text: 'In a separate archive an old sign reads "Hello". Nobody is greeting us or asking about plants in this scene. No new plant evidence is available.' },
      { name: 'New practical question', phase: 'probe' as const, text: 'A visitor now asks a live question about a tomato plant with yellow leaves: what could we inspect before making a diagnosis?' },
      { name: 'Unrelated calendar control', phase: 'control' as const, text: 'An empty archive contains a calendar. No person is speaking or asking a question.' },
    ],
    criteria: ['Compare final scope scores, expressed concern continuity and Self choices at the archived-sign control with the matched fresh-scene run.',
      'Review whether any plant concern is preserved as unresolved history rather than asserted as a new external request.',
      'Compare the live new question and unrelated calendar for contextual discrimination and emitted behavior.',
      'For any ordinary prediction, compare preserved open versions with later checks, evaluations and exact linked memories across the topic switch; missing forecasts or memory evidence leave alignment inconclusive.'],
    limitations: 'Initial attention and all messages are researcher-authored. Run both entries with matching model, prompt and activation settings; conversation length and ordinary thought carryover differ intentionally. No fixture forces activation, recall, proposal, action or learned conclusion. A single run cannot establish causal carryover quality; use the paired comparison and repeated trials. Mock/mixed evidence verifies workflow only. Missing speech or missing contextual products is inconclusive for behavioral/semantic claims, not a provider failure. No human psychology claim is supported.',
  })),
  ...([false, true] as const).map(trained => ({
    id: trained ? 'observatory-learning-trained' : 'observatory-learning-fresh-control',
    title: trained ? 'Recorded learning, consolidation and transfer' : 'Learning comparison without contrary training', source,
    hypothesis: 'Repeated lived source discrepancies may influence later recall, predictions and behavior after consolidation, with transfer to a new source and preservation of accurate-source discrimination; saved memory counts alone cannot establish this benefit.',
    seeds: [sourceSeed],
    steps: [
      { name: 'Unopened container baseline', phase: 'probe' as const, text: 'Supplier Rowan says unopened crate R1 contains a red token. We have not inspected it. What would you expect, and how would you approach checking it?' },
      { name: 'First source evidence', phase: 'training' as const, text: trained
        ? 'A complete direct inspection of R1 found exactly one blue token and no red token, contrary to Rowan’s earlier description.'
        : 'No inspection of R1 has occurred. In another room a clock was checked and shows noon; the crate contents remain unknown.' },
      { name: 'Second source encounter', phase: 'training' as const, text: trained
        ? 'On a separate visit Rowan describes unopened crate R2 as containing one red token. Its contents are still unknown.'
        : 'An unrelated empty shelf is visible. Rowan has supplied no new crate description.' },
      { name: 'Second source evidence', phase: 'training' as const, text: trained
        ? 'A complete direct inspection of R2 found exactly one blue token and no red token.'
        : 'A second unrelated clock reads 12:05. No crate inspection or new source evidence is available.' },
      { name: 'Consolidate ordinary experience', phase: 'training' as const, sleep: true },
      { name: 'Familiar source retest', phase: 'probe' as const, text: 'Rowan says unopened crate R3 contains a red token. We have not inspected it. What would you expect, and how would you approach checking it?' },
      { name: 'Novel source analogy', phase: 'probe' as const, text: 'An unfamiliar supplier Morgan says unopened crate M1 contains a green token. There is no record of Morgan’s reliability and no inspection yet. How would you approach this claim?' },
      { name: 'Accurate-source stability control', phase: 'control' as const, text: 'A different source Quinn accurately described a visible white token while we independently observed the same token. A new description from Quinn has not yet been checked; no discrepancy has been observed.' },
      { name: 'Unrelated scene control', phase: 'control' as const, text: 'A quiet room contains a chair. No source is making a claim and no crate is present.' },
    ],
    criteria: ['Review exact baseline forecasts, later factual checks and subjective memories; absent assessable predictions make prediction-correction claims inconclusive.',
      'Compare baseline and familiar retest before/after consolidation, tracing relevant recall, preserved episode versions and actual Self/behavior products.',
      'Compare the matched no-discrepancy-training run and repeated configurations before attributing improvement to recorded experience.',
      'Review novel-source transfer, accurate-source stability and unrelated controls for unsupported global distrust or appropriately bounded generalization.'],
    limitations: 'Supplier claims and direct inspections are authored experiences, not forced psychological conclusions. Fresh isolated Agents preserve source Agents. Seeds supply attention only; cognition may decline predictions or learning. Both entries have matching stage labels, stage counts and sleep, but their experiences intentionally differ. Ordinary same-thread history and model pretraining are confounds; no independently held-out new-thread durability claim is established. Repeat both configurations and inspect exact evidence in Comparisons. Mock/mixed runs supply plumbing evidence only. Missing prerequisites remain inconclusive and provider errors remain operational failure; a simulated observation is not proof of human psychology.',
  })),
];
