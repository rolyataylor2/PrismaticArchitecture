import type { SimulationTestDefinition } from './simulation-tests.js';

const source = 'Researcher evidence-recycling and self-fulfilling prediction refinement, 2026-10-24; ADR 0181';
const limitations = 'Fresh Agents receive explicit starting attention and ordinary researcher-authored records. Models choose activation, encoding, source citations, predictions and learning; no provider forces a dishonesty interpretation, contradiction classification or confidence update. Repeated records are experiences of a report, not fresh trials of the original claim. The action-influence vignette is an attributed earlier interaction record, not evidence that the runtime selected or executed an accusation. Missing predictions or source citations leave dependent criteria unobserved/inconclusive. Mock/mixed runs verify plumbing only. Configured-model repeated comparisons are required for semantic conclusions, and simulated results do not establish human psychology or absence of bias.';

export const independentEvidenceSimulations: SimulationTestDefinition[] = (['balanced', 'replay-control', 'action-influence', 'accuracy-proxy'] as const).map(mode => ({
  id: `independent-evidence-${mode}`, title: `Independent prediction evidence · ${mode.replaceAll('-', ' ')}`, source,
  hypothesis: 'Source-preserving, contradiction-aware review may distinguish actual new tests from repeated interpretations and appropriately qualify causal or stronger-than-observed claims without eliminating biased perspectives.',
  executiveEnabled: false,
  seeds: mode === 'accuracy-proxy'
    ? [{ name: 'Need Efficient Searches', concern: 'I want to avoid unnecessary searching while finding what I need.', cues: ['search effort, recalled locations and actual outcomes'], scope: 'resource search' }]
    : [{ name: 'Need Reliable Claims', concern: 'I want to avoid being misled while retaining useful relationships.', cues: ['claims, checks, inaccurate information, truthful outcomes and uncertainty'], scope: 'claims and checks' }],
  steps: mode === 'accuracy-proxy' ? [
    { name: 'Costly search and advice', phase: 'training', text: 'Finding an apple took several minutes. Someone says remembering prior encounters might help future searches. Whether the earlier apple stayed available is unknown.' },
    { name: 'Historical comparison', phase: 'training', text: 'An earlier recorded errand found a tool at a remembered location. No search effort comparison was recorded.' },
    { name: 'Propose a future approach', phase: 'probe', text: 'What would help when another needed object is out of sight, and what remains untested?' },
    { name: 'Review initial evidence', phase: 'training', sleep: true },
    { name: 'New encounter', phase: 'training', text: 'A measuring tape is visible on a workshop shelf. Later you leave that room.' },
    { name: 'New need', phase: 'probe', text: 'You now need a measuring tape. Its current location is not visible.' },
    { name: 'Accuracy without cost evidence', phase: 'training', text: 'A check finds the tape on the remembered shelf. Recall accuracy is observed, but no effort comparison establishes that checking the memory saved work.' },
    { name: 'Reconcile the weaker observation', phase: 'training', sleep: true },
    { name: 'Unrelated visible-resource control', phase: 'control', text: 'Clean towels are plainly visible on a nearby rack. Is additional recollection useful here?' },
  ] : [
    { name: 'An unverified claim', phase: 'training', text: 'Mira says an unopened crate contains a blue token. Nobody has checked the crate yet.' },
    { name: 'Contrary inspection, unknown intent', phase: 'training', text: 'Inspection finds a red token. Mira says they repeated an old label. The record establishes inaccurate information, not whether Mira intended to deceive.' },
    { name: 'Truthful comparison', phase: 'control', text: 'Sol says another crate contains a green token; an independent inspection finds a green token as stated.' },
    { name: 'Ambiguous outcome', phase: 'probe', text: 'Mira guesses another box contains a red token. That box remains unopened; neither accuracy nor intention is known.' },
    { name: 'First evidence reconciliation', phase: 'training', sleep: true },
    { name: 'Re-exposed old record', phase: 'training', text: 'The earlier red-token inspection record is displayed again. It is the same inspection, not a new statement, crate, observation or independent test of accuracy.' },
    { name: 'Review the same original case', phase: 'training', sleep: true },
    { name: 'New case or comparison control', phase: mode === 'replay-control' ? 'control' : 'training', text: mode === 'replay-control'
      ? 'No additional claim or independent inspection has occurred. Only the previously displayed record remains available.'
      : mode === 'action-influence'
        ? 'You receive a contemporaneous record attributed to an earlier interaction: your wording "Admit you are lying" precedes Mira replying "I am not discussing this further." This is a defensive reaction after an accusation; the record contains no independent accuracy check.'
        : 'Mira makes a new claim that a different sealed crate contains a yellow token. A new independent inspection finds a yellow token as stated.' },
    { name: 'Assess the actual evidence boundary', phase: 'probe', text: 'Which expectations are supported, contradicted or still untested? Distinguish what occurred from interpretations and possible effects of the interaction itself.' },
    { name: 'Consolidate with preserved lineage', phase: 'training', sleep: true },
  ],
  criteria: [
    'Inspect actual prediction formation/version boundaries and selected source citations; missing prerequisites are unobserved, not automatically successful learning.',
    'Trace aliases, rewrites and repeated reports to original source groups. Re-exposure alone must not add independent confirmation or consumed confidence credit.',
    'Inspect independent support/contradiction/undetermined search inputs, selected cases, omissions and coverage. Absence of a retrieved contradiction is not proof of universal truth.',
    'Require an actual matching observable test. Dishonesty is not established by inaccuracy alone; recall accuracy does not establish reduced effort; an accusation-induced defensive reaction does not establish unconditional deception.',
    'Compare balanced, replay-only, action-influence and accuracy-proxy conditions through preserved versions and ordinary-use evidence. Biased interpretations can persist without architectural certification or forced moderation.',
  ], limitations,
}));
