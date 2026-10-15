import type { SimulationTestDefinition } from './simulation-tests.js';

const source = 'Researcher asynchronous-cognition attachment, 2026-10-14; ADR 0165';
const limits = { activationPassLimit: 1, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, includeProcessingDispositions: false };
const care = { name: 'Care For Shared Plans', concern: 'Preserve useful shared commitments while responding to relevant changes',
  cues: ['an agreed plan, changed conditions or competing invitations'], scope: 'shared plans' };
const curiosity = { name: 'Wish To Understand', concern: 'Understand ambiguous evidence before advocating consequential conclusions',
  cues: ['uncertainty, competing explanations and potentially informative observations'], scope: 'uncertain evidence' };
const limitsNote = 'Starting dispositions are explicit researcher conditions. Use fresh-test mode for preset treatments; dreams preserve inherited starting settings. No activation, thought, forecast, bid, selection or learned conclusion is forced. Compare paired runs with the same source configuration, experiences and declared resource ceilings; inspect actual operation counts, tokens and latency before claiming matched work or benefit. Missing predictions, delayed products or required choices leave the corresponding hypothesis inconclusive. Fixture runs test transport only; simulated findings are not evidence about human psychology.';

export const continuousSimulations: SimulationTestDefinition[] = [
  ...([1, 3, null] as const).map(passes => ({
    id: `continuous-recursion-${passes === null ? 'unrestricted' : passes === 1 ? 'one-pass' : 'bounded'}`,
    title: `Internal attention · ${passes === null ? 'unrestricted passes' : passes === 1 ? 'one-pass control' : 'three-pass bound'}`,
    source, hypothesis: 'Additional internally triggered attention may support clarification or repeat uncertainty; the observed usefulness and resource cost depend on meaningful new expressed evidence.',
    activationSettings: { ...limits, activationPassLimit: passes }, timePolicy: 'wall_clock_observation_offsets' as const,
    seeds: [curiosity, { name: 'Need For Reassurance', concern: 'Notice unresolved uncertainty that could matter to our safety or shared plans',
      cues: ['unresolved consequential uncertainty and expressed requests for reassurance'], scope: 'unresolved uncertainty' }],
    steps: [{ name: 'Fixed attention observation window', phase: 'probe' as const, attentionWindowMs: 300,
      text: 'Two reports disagree about a faint sound near the library. No reliable source or cause has been identified. Rowan asks what is known and what evidence would help. No further external observation arrives during the declared attention window.' }],
    criteria: ['Inspect actual internal snapshot lineage, admission/deadline/drain times and pass counts; a slow first inference may leave additional attention unobserved.',
      'Compare actual generated thoughts, assessments, tokens and adapter latency under identical wall-clock and concurrency/queue ceilings; unmatched consumed work cannot establish a concurrency benefit.',
      'Inspect whether expressed reconsideration adds useful distinctions or repeats unresolved concerns; repeated activation is not itself a psychological diagnosis.'],
    limitations: limitsNote + ' The 300 ms wall-clock observation window starts at the first frozen experience. At its deadline the researcher pauses further activation and drains accepted thought without cancellation. Unrestricted means no pass cap inside that window, not unbounded runtime or cost. Interrupted windows require fresh trials. Model/provider latency may consume the entire window; no model is made artificially slow and no recursive conclusion is forced.'
  })),

  ...([false, true] as const).map(changed => ({
    id: `continuous-stale-${changed ? 'changed' : 'stable'}`, title: `Late proposals · ${changed ? 'changed circumstances' : 'stable control'}`,
    source, hypothesis: 'Owning perspectives may withdraw or revise obsolete proposals without losing an unresolved concern; current-world admission should prevent stale external submission.',
    activationSettings: limits, timePolicy: 'wall_clock_observation_offsets' as const,
    seeds: [{ name: 'Care For Nourishment', concern: 'Notice whether obtaining food serves our present need', cues: ['hunger, food availability and reported meals'], scope: 'nourishment' }, curiosity],
    steps: [{ name: 'Unrelated baseline', phase: 'control' as const, text: 'A quiet room has a calendar. No meal or food search is mentioned.' },
      { name: 'Meal circumstances while thinking', phase: 'probe' as const, text: 'Someone says: I am hungry and considering where to obtain food. No decision has been made.',
        concurrentObservations: [{ afterMs: 25, text: changed ? 'The same person reports: I have now eaten a sufficient meal. Finding food is no longer needed now.'
          : 'The same person reports: I have not eaten. The available food and my situation are unchanged.' }] },
      { name: 'Later ordinary need', phase: 'probe' as const, text: 'Much later, the person reports a new ordinary meal is due and asks what information would help decide where to eat.' }],
    criteria: ['Inspect whether an initial proposal actually finishes after the later observation; absent late proposals are an unmet prerequisite.',
      'Compare owning-Part retention, withdrawal or replacement and exact snapshot/bid admission across stable and changed conditions.',
      'Inspect whether later ordinary need can receive attention after an earlier proposal was unselected or withdrawn.'],
    limitations: limitsNote + ' The 25 ms delivery offset does not force model slowness. Executive is normally disconnected: selected proposals and rejected submissions are distinct from actual external action.'
  })),
  ...([false, true] as const).map(changed => ({
    id: `continuous-commitment-${changed ? 'reconsider' : 'retain'}`, title: `Commitment · ${changed ? 'relevant change' : 'distraction control'}`,
    source, hypothesis: 'Mediated selected-intention history may support coherent continuation or reasoned departure when later proposals compete for attention.',
    activationSettings: limits, timePolicy: 'externally_stepped' as const,
    seeds: [care, { name: 'Enjoy Novel Encounters', concern: 'Notice interesting opportunities for connection and exploration', cues: ['new invitations and interesting encounters'], scope: 'new encounters' }],
    steps: [{ name: 'Ordinary plan', phase: 'training' as const, text: 'Rowan says: We agreed to meet at the library to work on a shared project. The library is open and the project still matters to both of us.' },
      { name: 'Competing invitation', phase: 'probe' as const, text: 'Morgan mentions a nearby exhibition and asks whether you are interested. This invitation changes no fact about the library or the shared project.' },
      { name: 'Plan evidence', phase: 'probe' as const, text: changed ? 'The library reports an unexpected closure. Rowan says the project still matters and asks whether another location would work.'
        : 'The library reports it remains open. Rowan confirms the original meeting and the shared project still matter.' }],
    criteria: ['Confirm an actual earlier Self commitment exists before grading later continuity.',
      'Inspect later mediated commitments and expressed reasons for continuation or departure; a different proposal alone is not incoherence.',
      'Keep selected intention, external progress and supported interruption separate; no external worker is fabricated by this scenario.'], limitations: limitsNote
  })),
  { id: 'continuous-unselected-learning', title: 'Prediction learning without selected advocacy', source,
    hypothesis: 'A testable prediction may receive later evidence and subjective memory even when its accompanying proposal was not selected.',
    activationSettings: limits, timePolicy: 'externally_stepped', seeds: [curiosity, care],
    steps: [{ name: 'Unresolved source claim', phase: 'training', text: 'Rowan claims an unopened sample contains a red token. Morgan says it may contain a blue token. No inspection has occurred. A meeting is also due soon.' },
      { name: 'External result independent of selection', phase: 'probe', text: 'An independent laboratory reports it opened that sample and found a blue token. This inspection occurred independently of anything the Agent recommended.' },
      { name: 'Later analogous uncertainty', phase: 'probe', text: 'Rowan makes a new claim about a different unopened sample. No result for this new sample is known.' }],
    criteria: ['Identify a genuinely prior testable prediction with explicit thought lineage and an unselected proposal; missing either leaves the central hypothesis inconclusive.',
      'Inspect bounded later outcome checks and attributed memory without conditioning evaluation on Self selection.',
      'Inspect later use of that memory; do not equate recording an episode with beneficial learning.'], limitations: limitsNote },
  ...([false, true] as const).map(enabled => ({
    id: `continuous-resource-${enabled ? 'adaptive' : 'fixed'}`, title: `Thought resources · ${enabled ? 'adaptive' : 'fixed control'}`,
    source, hypothesis: 'Per-request difficulty and uncertainty routing may change observed latency and outcome quality without assigning permanent intelligence to a perspective.',
    activationSettings: limits, thoughtRoutingEnabled: enabled, timePolicy: 'externally_stepped' as const, seeds: [curiosity, care],
    steps: [{ name: 'Familiar recognition', phase: 'control' as const, text: 'A clearly labelled library sign says it opens at nine. It is now ten, and staff confirm it is open.' },
      { name: 'Interacting uncertainty', phase: 'probe' as const, text: 'Three reports disagree about whether the library will remain open. One predates a power outage, another concerns a different branch, and the latest report does not identify its branch. Rowan needs a reliable meeting location shortly. What remains unresolved?' },
      { name: 'Later factual distinction', phase: 'probe' as const, text: 'Staff at our branch now confirm a closure for the rest of today. The other branch remains open. These are later reports; do not treat them as information available earlier.' }],
    criteria: ['Inspect actual workload estimates, selected model operations and any intuitive-to-deliberative revision; missing distinct configured models is an unmet comparison prerequisite.',
      'Compare total assessment plus generation latency, measured tokens and actual calls under the same declared limits; do not omit routing overhead.',
      'Compare independently recorded prediction checks, selected proposals and external reports separately; outcome differences alone do not establish model causality.'],
    limitations: limitsNote + ' Configure intuitive/deliberative models on the source Agent before configured-model runs. With no saved models the fixture pipeline stays mock and has no routing-quality observation. Identical candidate models supply an overhead control, not a model-capability comparison.'
  })),
  ...([1, 4] as const).map(workers => ({
    id: `continuous-budget-${workers}-workers`, title: `Matched one-pass budget · ${workers} thought ${workers === 1 ? 'slot' : 'slots'}`,
    source, hypothesis: 'Independent publication may reduce response delay with equal one-pass activation allowance and the same candidate population, rather than additional reasoning rounds.',
    activationSettings: { ...limits, maxConcurrentThoughts: workers }, timePolicy: 'wall_clock_observation_offsets' as const,
    seeds: [care, curiosity],
    steps: [{ name: 'Unrelated baseline', phase: 'control' as const, text: 'A clock hangs on a wall.' },
      { name: 'Competing timescales', phase: 'probe' as const, text: 'Rowan asks for a careful explanation of conflicting library reports and says the agreed meeting still matters.',
        concurrentObservations: [{ afterMs: 25, text: 'Morgan mentions a bird chirping nearby, without changing any library report or meeting arrangement.' }] },
      { name: 'Later clarification', phase: 'probe' as const, text: 'Staff confirm our library branch is closed; another branch is open.' }],
    criteria: ['Compare actual activated scopes, admitted jobs and inference counts before treating the paired one-pass runs as matched work.',
      'Inspect observation, inference, thought publication and Self-choice times while another scope is still thinking.',
      'Compare retained intention and obsolete proposals; lower latency alone is not better cognition.'],
    limitations: limitsNote + ' Both conditions use the sole asynchronous runtime. One worker serializes resource admission, not observation intake. This is a replacement control for the explicitly removed legacy synchronous mode.'
  })),
];
