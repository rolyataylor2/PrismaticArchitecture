import type { SimulationTestDefinition } from './simulation-tests.js';

export const concernInheritanceSimulations: SimulationTestDefinition[] = (['desire', 'inquiry'] as const).map(condition => ({
  id: `concern-inheritance-${condition}`, title: `Offline concern inheritance: ${condition} comparison`,
  source: 'Researcher prediction/motive inheritance conversation, 2026-10-09; ADR 0154',
  hypothesis: 'Originating and later expressed cognition can support a useful durable concern distinct from mere performance relevance; motivational versus analytical meaning should follow recorded experience rather than prediction correctness.',
  seeds: [{ name: condition === 'desire' ? 'Need For Responsive Tools' : 'Curiosity About Performance',
    concern: condition === 'desire' ? 'Notice how computer delays interrupt our work; I want responsive tools so we can work without waiting.'
      : 'Notice unexplained computer performance differences; I want to understand their causes without assuming that optimization is needed.',
    cues: ['computer responsiveness, delay and performance evidence'], scope: 'computer performance' }],
  steps: [
    { name: 'Unrelated control', phase: 'control', text: 'A printed calendar is on the wall. No computer is in use.' },
    { name: 'Unresolved performance', phase: 'training', text: 'Opening the same document takes 20 seconds today rather than yesterday’s 2 seconds. A background indexing process is running, but its impact is unknown. No diagnosis or change has been made.' },
    { name: 'First ordinary comparison', phase: 'training', text: 'During indexing the document again took 20 seconds to open. Available memory was low. The operator has not changed any settings.' },
    { name: 'Second ordinary comparison', phase: 'training', text: 'Another document opened slowly while indexing continued. Other activity was unchanged. The cause is still uncertain.' },
    { name: 'Discriminating outcome', phase: 'training', text: 'Indexing ended. With the same documents and other programs still open, measured opening times returned to 2 seconds. This observation does not establish what would happen on another computer.' },
    { name: 'Offline institutionalization', phase: 'training', sleep: true },
    { name: 'Analogous transfer probe', phase: 'probe', text: 'A different computer opens a document slowly. Background activity and available memory have not been checked. No remedy has been tried.' },
    { name: 'Irrelevant final control', phase: 'control', text: 'A handwritten note is readable. No computer performance issue is reported.' },
  ],
  criteria: ['Inspect whether ordinary cognition formed a Part-origin prediction with an attributable originating thought and later investigation products.',
    'Inspect whether any inherited durable concern cites originating and later thoughts, preserves source scaffolds and passes repeated-use evidence; absence of an eligible investigation is inconclusive.',
    'Compare the desire and inquiry runs: judge concern/meaning against actual expressed thoughts, existing sufficient dispositions and alternatives, rather than keyword labels or confirmed slowness.',
    'Inspect transfer and irrelevant controls for ordinary activation and advocacy, without assuming that inheritance guarantees activation, selection or successful optimization.'],
  limitations: 'Fresh isolated Agents receive researcher-authored starting concerns and external performance records. These seeds make the comparison explicit; neither condition guarantees a particular originating thought. Providers use the ordinary pipeline and are not prescribed activation, predictions, outcomes, learning or motives. Fixture/mixed runs establish plumbing only. Missing scaffolds, closure or repeated usefulness makes dependent inheritance findings inconclusive; an eligible investigation with no inheritance can be not observed. Semantic quality requires configured-model review, and one simulation does not establish human psychology. Source Agents remain preserved.',
}));
