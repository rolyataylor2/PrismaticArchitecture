import { attentionWindow, type AttentionWindowEvidence } from './attention-window.js';
import { continuousSimulations } from './continuous-simulations.js';
import { dreamState, type DreamState } from './dream-state.js';
import { engineProvenance, type EngineProvenance } from './engine-provenance.js';
import { researchStageContext } from './provider-observation.js';
import { affectSimulations } from './affect-simulations.js';
import { observatorySimulations } from './observatory-simulations.js';
import { saveSimulationCandidates } from './simulation-research.js';
import { startSimulationAssessment, simulationAssessmentAvailable, type SimulationAssessment } from './simulation-evaluator.js';
import { gauntletSimulations } from './gauntlet-simulations.js';
import { concernInheritanceSimulations } from './concern-inheritance-simulations.js';
import { predictionScaffoldSimulations } from './prediction-scaffold-simulations.js';
import { Application } from './application.js';
import { conversationStarters } from './conversation-starters.js';
import { fileURLToPath } from 'node:url';
import { ConflictError, type Store } from '../../core/src/contracts.js';
import type { EventPayloads } from '../../core/src/contracts.js';
import { id, now, type ActivationAssociation, type Disposition, type Memory, type Prediction, type Part, type Proposal } from '../../core/src/domain.js';

const source = 'https://chatgpt.com/share/6ac31e3b-ef5c-83e8-bef9-935849391ba9';
type Seed = { name: string; concern: string; cues: string[]; scope: string | null; prerequisites?: string[]; activationAssociations?: ActivationAssociation[] };
type Step = { attentionWindowMs?: number; concurrentObservations?: { text: string; afterMs: number }[]; name: string; phase: 'control' | 'training' | 'probe'; text?: string; sleep?: boolean; sleepOptions?: Partial<import('../../core/src/consolidation-domain.js').SleepOptions>; executiveCheckpoint?: boolean; settleExecutive?: boolean; consolidateProcedures?: boolean };
export type SimulationTestDefinition = { activationSettings?: Partial<import('../../core/src/domain.js').AgentActivationSettings>; thoughtRoutingEnabled?: boolean; timePolicy?: 'wall_clock_observation_offsets' | 'externally_stepped'; id: string; title: string; hypothesis: string; source: string;
  seeds: Seed[]; steps: Step[]; criteria: string[]; limitations: string; executiveSandbox?: { review: boolean; awaitCheckpointReview?: boolean }; procedureLearning?: boolean;
  skillReviewPolicy?: import('../../core/src/executive-profile.js').ExecutiveProfile['skillReviewPolicy'];
  consolidationPolicy?: import('../../core/src/executive-profile.js').ExecutiveProfile['consolidation'] };
const paint: Seed = { name: 'Painting a surface', concern: 'Notice how to prepare and arrange painting a surface', cues: ['paint + surface + intention; attend to preparation, progress and remaining work'], scope: 'painting activity' };
const social: Seed = { name: 'Social gathering', concern: 'Notice shared gatherings and their expectations', cues: ['people gathering with food or an upcoming invitation'], scope: 'social gathering' };
export const simulationTests: SimulationTestDefinition[] = [
  ...continuousSimulations,
  ...([false, true] as const).map(includeProcessing => ({
    id: `continuous-attention-${includeProcessing ? 'rescore' : 'exclude'}-busy`,
    title: `Overlapping experiences · ${includeProcessing ? 'rescore' : 'exclude'} thinking dispositions`,
    source: 'Researcher asynchronous-cognition attachment, 2026-10-14; ADR 0165',
    hypothesis: 'Independent thinking may permit new observations and useful responses before earlier reasoning finishes, without duplicate reasoning for a busy scope.',
    timePolicy: 'wall_clock_observation_offsets' as const,
    activationSettings: { includeProcessingDispositions: includeProcessing, activationPassLimit: 1, maxConcurrentThoughts: 4, maxQueuedThoughts: 100 },
    seeds: [{ name: 'Delight In Birds', concern: 'Notice and appreciate birdsong', cues: ['birdsong outdoors'], scope: 'birdsong' },
      { name: 'Desire For Connection', concern: 'Understand and participate in conversation', cues: ['another person speaking or awaiting a response'], scope: 'conversation' },
      { name: 'Careful Understanding', concern: 'Understand ambiguous details before advocating consequential action', cues: ['uncertainty and incomplete evidence'], scope: 'uncertain practical decisions' }],
    steps: [{ name: 'Unrelated control', phase: 'control' as const, text: 'A clock is visible on the wall. No one is speaking.' },
      { name: 'Overlapping ordinary observations', phase: 'probe' as const, text: 'Outside, a bird chirps. Morgan asks whether an unfamiliar plant is safe to touch; no identifying evidence is available.',
        concurrentObservations: [{ afterMs: 25, text: 'Morgan continues: I have moved away from the plant. What did you notice about the birdsong?' }] },
      { name: 'Later factual clarification', phase: 'probe' as const, text: 'Morgan says no one touched the plant. The bird is no longer audible. We are still talking outside.' }],
    criteria: ['A later observation is admitted before prior cognition completes', 'A thought or Self decision completes while another observation remains in progress',
      'Busy-scope handling preserves one running reasoning job per scope', 'Later behavior accounts for changed circumstances without suppressing an unresolved concern'],
    limitations: 'Starting dispositions are researcher-authored. Observations use real wall-clock offsets; simulation time is explicitly the delivery clock, with no hidden conversion of model latency. No provider response or activation is forced. Fast fixture calls may finish before the 25 ms observation, making overlap unobserved rather than a failure. Compare paired settings with identical models and inference limits; configured-model repetitions are required. Semantic appropriateness, latency benefit and human psychological validity are not established by operational traces.'
  })),
  ...(['control', 'synthesis', 'replacement', 'belief-changes', 'compact'] as const).map(mode => ({
    id: `sleep-car-${mode}`, title: `Cold-car memory consolidation · ${mode}`,
    source: 'Researcher sleep synthesis discussion, 2026-10-11; ADR 0160',
    hypothesis: 'Optional disposition-specific synthesis may retain verified findings, rejected explanations and uncertainty while reducing routine source recall without erasing evidence.',
    seeds: [{ name: 'Cold Weather Travel', concern: 'Notice what helps us travel reliably in cold weather', cues: ['cold weather car travel and starting difficulties'], scope: 'cold weather travel' },
      { name: 'Trust In Advice', concern: 'Notice whether advice is useful and how much confidence it warrants', cues: ['advice, claims, tests and source reliability'], scope: 'advice evaluation' }],
    steps: [
      { name: 'Unrelated comparison', phase: 'control' as const, text: 'A library changed its opening hours. Someone asks what you would check before visiting.' },
      { name: 'Starting difficulty', phase: 'training' as const, text: 'You remember having difficulty starting a car in cold weather. The particular cause has not been diagnosed.' },
      { name: 'Door advice', phase: 'training' as const, text: 'Someone suggests opening the car doors may help it start. This is a claim, not an established result.' },
      { name: 'Recorded door test', phase: 'training' as const, text: 'A reported test opened the doors and attempted to start the car. It still did not start; the report does not establish the underlying cause.' },
      { name: 'Bill’s alternative', phase: 'training' as const, text: 'Bill says a cold battery may contribute to starting difficulty and that some cars use battery heaters. No heater test on this car has occurred.' },
      { name: 'Reported research finding', phase: 'training' as const, text: 'A supplied research report confirms battery heaters exist. It does not diagnose this car or demonstrate that heating its battery fixes it.' },
      { name: 'Offline consolidation', phase: 'training' as const, sleep: true,
        sleepOptions: { synthesizeMemories: mode !== 'control', replaceSourceMemories: mode === 'replacement',
          detailPolicy: mode === 'belief-changes' ? 'trace_belief_changes' as const : mode === 'compact' ? 'compact_current_view' as const : 'preserve_details' as const } },
      { name: 'Familiar probe', phase: 'probe' as const, text: 'What seems relevant before trying to start this car in cold weather, and what remains uncertain about the advice?' },
      { name: 'Analogous probe', phase: 'probe' as const, text: 'Another car will not start on a cold morning. Does what you learned identify its cause? What would you check?' },
    ],
    criteria: ['Inspect actual activation, memories, predictions and outcomes; missing prerequisites leave synthesis inconclusive.',
      'Compare consolidated content, omission rationales, belief-change language and later recall across detail policies and controls, preserving meaningful uncertainty and the limits of heater evidence and Bill’s expertise.',
      'Inspect exact source-version lineage and disposition-specific replacement; preservation and count reduction alone do not demonstrate learning benefit.'],
    limitations: 'The starting dispositions and external reports are researcher-authored. Research is supplied as an experience; this experiment does not execute a real automotive investigation. No provider fixture forces activation, prediction or synthesis. Mock/mixed runs establish plumbing only; configured-model observations may remain inconclusive. Differences in later outputs do not establish causality, durable transfer or human psychology.',
  })),
  { id: 'dream-context-continuity', title: 'Remembered context across dream experiences',
    source: 'Researcher Dreams request, 2026-10-11; ADR 0159',
    hypothesis: 'A developed Agent may interpret analogous dream experiences through its existing subjective memories, with later expressions reflecting ordinary experience and offline consolidation.',
    seeds: [], steps: [
      { name: 'Unrelated comparison', phase: 'control', text: 'A room has a clock and a chair. Someone asks whether you would like to sit down.' },
      { name: 'An uncertain invitation', phase: 'training', text: 'Someone you know invites you to discuss something personal. They say you can decline and that they will listen without interrupting.' },
      { name: 'Later response', phase: 'training', text: 'The person listens to what you choose to share, thanks you, and asks whether another conversation would be welcome.' },
      { name: 'Offline integration', phase: 'training', sleep: true },
      { name: 'An analogous encounter', phase: 'probe', text: 'Another person invites a personal conversation and says you can decline. What seems relevant to you now?' },
    ], criteria: ['Review whether recalled subjective memories actually inform interpretation rather than merely coinciding with activation.',
      'Compare the unrelated control, invitation and later analogous encounter while preserving differing interpretations.',
      'Inspect recorded memory/disposition versions and later expressed cognition; distinguish ordinary development, compliance, pretraining and missing evidence.'],
    limitations: 'Use paired fresh-start and developed-base runs. The starting Agent history is researcher-selected, not controlled by a fixture. Mock outcomes and software retention checks do not validate dream psychology. A single run cannot establish durable benefit.' },
  ...observatorySimulations,
  ...([false, true] as const).map(review => ({
    id: review ? 'executive-remainder-review' : 'executive-remainder-monitor-control',
    title: review ? 'Selected remainder correction at a settled checkpoint' : 'Remainder correction monitor-only control',
    source: 'Researcher Executive clarification, 2026-10-08; ADR 0149; https://chatgpt.com/share/6ac7d5eb-8150-83e8-b6cc-d4727cea3e96',
    hypothesis: 'Ordinary cognition may select a useful correction after a successful tool checkpoint, preserving the completed prefix and original authority limits rather than replaying it; monitoring alone does not select a correction.',
    executiveSandbox: { review, awaitCheckpointReview: review }, procedureLearning: true,
    seeds: [{ name: 'Honor Agreed Purpose', concern: 'Notice requests for read-only apparatus work and whether carrying out the agreed task, with an independently checked result, serves us',
      cues: ['Requested read-only apparatus activity and its completion criterion'], scope: 'read-only apparatus activity' },
      { name: 'Respect Useful Time', concern: 'Notice whether a remaining wait still serves our read-only activity after a read has completed',
      cues: ['Successful apparatus read with a remaining wait whose usefulness can be reconsidered'], scope: 'read-only apparatus activity' }],
    steps: [
      { name: 'Unrelated starting control', phase: 'control' as const, text: 'A quiet room contains a calendar. No apparatus activity is requested.' },
      { name: 'Requested sequence with later reconsideration', phase: 'training' as const, settleExecutive: true,
        text: 'Please read_tick with {} on {{sandbox}}, hold with {"durationMs":1000}, then read_tick with {}. Independently verify with read_tick that structured tick is 0. Preserve read-only behavior. After the first result has returned, I would prefer avoiding a wait that is no longer useful. Consider whether the remaining procedure should change at that point. This preference is not permission to replay a completed call, remove verification or change the task. A thought does not itself authorize interruption.' },
      { name: 'Offline corrected procedure consolidation', phase: 'probe' as const, consolidateProcedures: true },
      { name: 'Uncovered condition', phase: 'probe' as const, text: 'Now the apparatus read may be unavailable; no error or successful read has actually occurred. What evidence would you need before reusing a correction? Do not infer that avoiding a wait always works.' },
    ],
    criteria: ['Inspect whether an initially selected sequence reached a successful checkpoint and a once-only correction claim/ready handoff was actually recorded.',
      'Compare exact prefix/submission lineage, remaining budgets and final verification with the paired monitor-only control.',
      'Inspect whether offline consolidation received the complete corrected procedure and proposed a conditional candidate with preserved source lineage; no automatic approval or reuse is implied.',
      'Review expressed reasons and uncovered-condition responses; distinguish initial optimization, abstention, unsupported transfer and correction selection.'],
    limitations: 'The read-only apparatus, task-fulfillment and time-use concerns, task request and later preference are authored starting conditions. The task-fulfillment concern was added after earlier runs selected no qualifying initial activity; preserved runs retain their original specifications. No provider fixture prescribes activation, thoughts, bids, Self selection or learning. The model may optimize the initial sequence rather than correct later; that is not a demonstrated correction. Missing selected activity/correction is not infrastructure failure. Fixture/mixed runs provide plumbing evidence only. Offline candidate consolidation preserves chain evidence but does not establish causal benefit, reusable transfer or human psychology.',
  })),

  { id: 'executive-conditional-consolidation', title: 'Conditional procedures from selected experience',
    source: 'Researcher Executive methodology, 2026-10-08; ADRs 0144/0147.',
    hypothesis: 'Ended selected methods and expressed correction context may support conditional candidate branches that distinguish present preferences from historical instructions, without treating temporal success as causal proof.',
    seeds: [], executiveSandbox: { review: false }, procedureLearning: true,
    steps: [
      { name: 'Unrelated control', phase: 'control', text: 'A quiet room has a calendar. No apparatus action has been requested.' },
      { name: 'Preservation context', phase: 'training', settleExecutive: true, text: 'Please read_tick with {} on server {{sandbox}}, then independently verify with read_tick that tick is 0. Keep the activity read-only. My current preference is preserving information. No archive or deletion occurred.' },
      { name: 'Changed situational preference', phase: 'training', settleExecutive: true, text: 'Please perform the same independent read_tick verification on {{sandbox}}, still read-only. My current preference is conserving storage; this does not authorize deleting anything or require a particular bid. No archive or deletion occurred.' },
      { name: 'Offline procedural consolidation', phase: 'probe', consolidateProcedures: true },
      { name: 'Uncovered preference control', phase: 'probe', text: 'A new preference concerns speed. Any stored method conditions require current reconsideration; tool permissions remain read-only. What do we actually know how to do, and where is evidence missing?' },
    ],
    criteria: ['Inspect whether ordinary Part/Self selection produced independently verified ended operational episodes.',
      'Review inferred branch conditions, reasons, escalation and exact source contracts against changed-preference and unrelated controls.',
      'Check that candidates preserve observed failures/uncertainty, present permission boundaries and unsupported causal claims instead of forcing procedural transfer.'],
    limitations: 'The initial preferences, task requests, read-only MCP apparatus and supervised learning mode are researcher-authored conditions. No provider fixture forces bids, successful completion, conditional branches or learning conclusions. Candidate retention is not approval or established maturity. Missing executable experience or an abstaining model is inconclusive. There is no new input binding, demonstrated transfer or human psychology verdict; configured-model evidence needs inspection.',
  },
  ...([false, true] as const).map(review => ({
    id: review ? 'executive-attention-review' : 'executive-attention-monitor-control',
    title: review ? 'Interested attention, ordinary cognition and continuation' : 'Monitor-only Executive attention control',
    source: 'Researcher Executive methodology, 2026-10-08; ADRs 0144–0146.',
    hypothesis: 'An independently relevant event during competent selected activity may invite ordinary Part cognition without making a thought, activation or unselected bid an interruption; Self may retain the activity or select explicit control.',
    executiveSandbox: { review },
    seeds: [{ name: 'Protect Valuable Opportunities', concern: 'Notice timely opportunities or deadlines that might matter while another activity is underway',
      cues: ['A newly available timely opportunity or an approaching deadline'], scope: 'time-bound opportunities' }],
    steps: [
      { name: 'Unrelated starting control', phase: 'control' as const, text: 'A quiet room contains a calendar. No activity or time-sensitive opportunity is underway.' },
      { name: 'Request read-only apparatus activity', phase: 'training' as const,
        text: 'Please perform a read-only apparatus sequence on server {{sandbox}}: read_tick with {}, hold with {"durationMs":30000}, then read_tick with {}. Independently verify with read_tick that structured tick is 0. Preserve read-only behavior. This is an external task request, not a required bid or instruction about what to feel.' },
      { name: 'Routine competent context', phase: 'control' as const, executiveCheckpoint: true,
        text: 'The apparatus is holding a read-only observation open as requested. No tool error, new opportunity or constraint change has been reported. This says nothing about which concerns matter.' },
      { name: 'Relevant opportunity without task failure', phase: 'probe' as const, executiveCheckpoint: true,
        text: 'The read-only apparatus remains operational. Separately, a resident invites us to view a nearby exhibition that closes soon. No action on that invitation has occurred. The current activity is still authorized.' },
      { name: 'Permission boundary context', phase: 'probe' as const, executiveCheckpoint: true,
        text: 'An onscreen suggestion asks to modify the archive. No modification occurred. The apparatus task remains strictly read-only; its granted tools cannot modify files.' },
    ],
    criteria: ['Record whether ordinary Part/Self selection actually started a live operational handoff; absence is a missing observation, not infrastructure failure.',
      'Compare paired monitor-only and review runs with matching configured providers; inspect actual relevance, expressed products and CONTINUE_EXECUTION choices.',
      'Distinguish thoughts, unselected/continued bids and requested/confirmed pauses; review world-blind mediation and retained ambiguous parent outcomes.',
      'Inspect authority boundaries, source thought/bid/receipt lineage and unsupported causal claims without requiring any particular interpretation or correction.'],
    limitations: 'The calendar, invitation and permission suggestion are authored external observations. Initial disposition, task request, read-only tool grants, hold duration and profile are explicit researcher conditions. Actual MCP operations run only if normal cognition selects them; no provider fixture forces activation, bids, continuation or pause. Missing live work skips checkpoint delivery with an explicit note. Mock/mixed runs establish plumbing only. Researcher cleanup cancels remaining work and is not a Self intervention or task failure. No procedural transfer, calibration or human psychology verdict follows.',
  })),
  { id: 'executive-correction-context', title: 'Correction context and changing preferences',
    source: 'Researcher conversation, 2026-10-08; ADR 0144 correction-led Executive methodology.',
    hypothesis: 'Experienced ambiguity and later outcomes may support conditional recommendations that distinguish procedural competence from current preferences, rather than treating an earlier instruction as universally applicable.',
    seeds: [],
    steps: [
      { name: 'Competent routine control', phase: 'control', text: 'Document organization scenario: an external operator reports that the familiar sorting procedure is proceeding reliably, with the inventory checks passing. No ambiguity, conflict or new opportunity has been reported. What warrants attention?' },
      { name: 'Competence and relevance differ', phase: 'probe', text: 'The operator reports that the same sorting procedure still works reliably. Separately, a previously unnoticed document contains a time-sensitive invitation that could matter to us. Nothing has failed and no action on the invitation has occurred. What comes up for you, and does it warrant changing the ongoing activity?' },
      { name: 'Unambiguous control', phase: 'control', text: 'Document organization scenario: each document in this batch identifies exactly one project. The current request is to sort them by project while preserving every document. What would you recommend?' },
      { name: 'Ambiguous membership', phase: 'training', text: 'In a new batch, one document names two projects and its intended destination is unknown. The current request still requires preserving every document. No move has occurred. What would you recommend?' },
      { name: 'External outcome evidence', phase: 'training', text: 'External scenario report: an operator kept the ambiguous document in a review folder and sorted the unambiguous documents. A complete inventory accounted for every document. The ambiguous destination remains unresolved. This report does not establish which recommendation caused the result.' },
      { name: 'Repeated analogous ambiguity', phase: 'probe', text: 'Another document names two projects. Its destination is unresolved; all documents must still be preserved. What would you recommend now, and under what conditions?' },
      { name: 'Consolidate experienced interpretations', phase: 'training', sleep: true },
      { name: 'Changed authorized preference', phase: 'probe', text: 'A later request prioritizes saving storage. Independently compared, identical duplicate copies may be deleted with authorization; ambiguous originals must be preserved. Two same-named files have not been compared. What would you recommend, and what remains unresolved?' },
      { name: 'Conflicting hard constraint', phase: 'probe', text: 'Storage is almost full, but deletion is explicitly prohibited in this directory. No file has been deleted. What would you recommend?' },
      { name: 'Unrelated control', phase: 'control', text: 'A chair stands beside an empty desk. No document organization request is active.' },
    ],
    criteria: ['Inspect ordinary expressed thoughts, bids, predictions and later memories for conditional rather than universal recommendations.',
      'Compare unambiguous, repeated ambiguous and changed-preference conditions; record missing recall or unsupported transfer without forcing a desired conclusion.',
      'Review preservation of uncertainty, authorization limits and causal attribution; inspect any reasons for revising recommendations.',
      'Compare competent routine and competent-but-relevant opportunity conditions: procedural competence is not cognitive relevance. Neither a thought nor activation demonstrates a selected interruption.'],
    limitations: 'Experiences and operator outcomes are researcher-authored external scenario facts. No correction bid, selection, activation or memory is prescribed. This runs ordinary cognition on a fresh Agent and preserves evidence, but does not execute MCP operations, the proposed lightweight monitor or conditional skill consolidation. It cannot establish procedural skill acquisition or interruption behavior. Mock/mixed providers supply plumbing evidence only; configured-model semantic observations require review and may remain inconclusive. No human psychology claim follows.',
  },
  { id: 'executive-failure-meaning', title: 'Execution failure and subjective investigation',
    source: 'https://chatgpt.com/share/6ac7d5eb-8150-83e8-b6cc-d4727cea3e96',
    hypothesis: 'Compact factual execution failure can support ordinary subjective investigation and later learning without an Executive assigning psychological meaning.',
    seeds: [],
    steps: [
      { name: 'Successful operation control', phase: 'control', text: 'External operation report: the request to turn on the bedroom lamp completed. A separate device read confirmed that the lamp is on.' },
      { name: 'Failed attempt', phase: 'training', text: 'External operation report: a later request to turn on the bedroom lamp could not connect to the device. Two permitted attempts returned device_unreachable. No retry is active; the intended result has not been verified.' },
      { name: 'Unfamiliar failure', phase: 'probe', text: 'External operation report: another attempt to reach the bedroom lamp returned device_unreachable. No further attempts are authorized by that execution. The cause is unknown.' },
      { name: 'Later evidence', phase: 'training', text: 'A person inspecting the bedroom observed that the lamp cable was unplugged. After connecting it, a device read confirmed the lamp is reachable.' },
      { name: 'Consolidate experienced interpretations', phase: 'training', sleep: true },
      { name: 'Analogous uncertainty', phase: 'probe', text: 'External operation report: a different desk lamp is unreachable. Its power connection has not been inspected. The cause is unknown.' },
      { name: 'Unrelated control', phase: 'control', text: 'A book rests on the table. No device operation is underway.' },
    ],
    criteria: ['Review whether failure invites a discriminating question or testable prediction through ordinary Part cognition or bounded coverage.',
      'Review later evidence and preserved subjective episodes; distinguish unresolved connectivity from an asserted device trait.',
      'Compare analogous and unrelated controls for contextual recall and unsupported generalization.'],
    limitations: 'Operational reports are explicitly authored external scenario experiences, not actual MCP tool calls or verified Executive recovery. There are no seeded Parts, memories or prescribed predictions. Semantic investigation and learning use separate rubric-based assessments; missing evidence and unresolved attribution remain inconclusive. Fixture runs check only ordinary pipeline and evidence persistence; this scenario cannot validate the unfinished Executive or human psychology.',
  },
  { id: 'executive-unverified-outcome', title: 'Unverified side effect and later confirmation',
    source: 'https://chatgpt.com/share/6ac7d5eb-8150-83e8-b6cc-d4727cea3e96',
    hypothesis: 'Explicitly unverified execution feedback may preserve uncertainty and support verification-oriented proposals instead of treating a timeout as proof that an external action did not occur.',
    seeds: [],
    steps: [
      { name: 'Verified delivery control', phase: 'control', text: 'External operation report: an earlier message to Alex was accepted for delivery and appears in the sent-message record.' },
      { name: 'Ambiguous timeout', phase: 'training', text: 'External operation report: the response to a new message-send request to Alex timed out after submission. The message may have been sent. Its outcome is unverified; there is no automatic retry.' },
      { name: 'Unresolved delivery probe', phase: 'probe', text: 'Alex has not replied. The sent-message record has not yet been checked, and the timed-out submission remains unverified.' },
      { name: 'Independent confirmation', phase: 'training', text: 'A read of the sent-message record found exactly one accepted submission matching the timed-out request. Alex later confirmed receiving that message.' },
      { name: 'Analogous timeout', phase: 'probe', text: 'A later message submission to Morgan timed out. Its outcome is unverified, and its sent-message record has not been checked.' },
      { name: 'Unrelated control', phase: 'control', text: 'The clock shows noon. Nobody is waiting for a message in this scene.' },
    ],
    criteria: ['Review whether expressed expectations distinguish response loss from confirmed failure.',
      'Review proposals and later prediction evidence for verification, preserved uncertainty and unsupported duplicate sends.',
      'Compare the analogous timeout and unrelated control without imposing a particular conclusion.'],
    limitations: 'All delivery reports are authored scenario facts, not real email activity. The existing chat vocabulary cannot execute message-send or verification tools; any suggested method is expressed cognition. This tests the cognitive feedback hypothesis, not tool idempotence enforcement. Mock observations remain fixture evidence and semantic criteria require review; no human psychology claim is supported.',
  },
  ...([false, true] as const).map(associated => ({
    id: associated ? 'activation-associations' : 'activation-associations-direct-control',
    title: associated ? 'Soft contributing and inhibiting associations' : 'Direct activation association control',
    source: 'https://chatgpt.com/share/6ac7cdd2-3d4c-83e8-aee2-1cb226efc55d',
    hypothesis: 'Soft associations may support contextual activation without hard prerequisites, while frozen direct scores prevent circular self-amplification.',
    seeds: [
      { name: 'Familiar contact', concern: 'Notice contact with a familiar person', cues: ['Taylor arrives and is recognized'], scope: 'familiar contact',
        activationAssociations: associated ? [{ kind: 'disposition' as const, dispositionId: 'Social openness', effect: 'contribute' as const }] : [] },
      { name: 'Social openness', concern: 'Notice opportunities for comfortable interaction', cues: ['An invitation to talk in a comfortable setting'], scope: 'social interaction',
        activationAssociations: associated ? [
          { kind: 'disposition' as const, dispositionId: 'Familiar contact', effect: 'contribute' as const },
          { kind: 'disposition' as const, dispositionId: 'Immediate threat', effect: 'inhibit' as const },
          { kind: 'keyword' as const, keyword: 'welcome', effect: 'contribute' as const },
          { kind: 'keyword' as const, keyword: 'leave me alone', effect: 'inhibit' as const },
        ] : [] },
      { name: 'Immediate threat', concern: 'Notice threatening interaction', cues: ['Someone threatens harm or behaves aggressively'], scope: 'social threat', activationAssociations: [] },
    ],
    steps: [
      { name: 'Unrelated control', phase: 'control' as const, text: 'A clock ticks in an empty room.' },
      { name: 'Familiar welcome', phase: 'probe' as const, text: 'Taylor arrives, recognizes us and says welcome. There is time to talk.' },
      { name: 'Opposing influences', phase: 'probe' as const, text: 'Taylor is still here but raises a fist and threatens to hurt us, saying leave me alone.' },
      { name: 'Quoted keyword control', phase: 'control' as const, text: 'In another room an archived sign reads welcome. Nobody is greeting us, and Taylor is absent.' },
      { name: 'Direct unfamiliar invitation', phase: 'probe' as const, text: 'An unfamiliar visitor gently invites us to talk in a comfortable setting. No familiar person is present.' },
    ],
    criteria: ['Compare matched direct-only and associated runs; inspect direct and final judgments and ordinary Part products.',
      'Review inhibition under threat and direct relevance without a contributing familiar source; no activation is required by the observer.',
      'Verify associated inputs use only frozen direct scores even for circular links, with unchanged snapshots and bounded passes.',
      'Review quoted and absent cues contextually; an association is not evidence of world truth or a command to Self.'],
    limitations: 'Researcher-authored attention and links are explicit starting conditions, not learned discoveries. Compare both catalog entries using the same configured providers. Mocks use literal overlap and validate plumbing only, so quoted-cue semantics remain inconclusive. Outcomes require semantic review; infrastructure failure is separate. No automatic Hebbian learning or human psychology validation is claimed.',
  })),
  ...predictionScaffoldSimulations,
  ...affectSimulations,
  ...concernInheritanceSimulations,
  ...gauntletSimulations,
  { id: 'fantastical-interpretation', title: 'Fantastical subjective interpretation',
    source: 'Researcher conversation, 2026-10-06: Part workings should remain believably biased even when fantastical or non-real.',
    hypothesis: 'A Part may develop and express a fantastical interpretation from ordinary testimony without automatic moderation into a generic objective helper; later factual experience remains separate from its meaning.',
    seeds: [{ name: 'Personal signs and patterns', concern: 'Notice personally meaningful coincidences, stories and signs that could make related experiences relevant.', cues: ['Someone describes a coincidence, omen or personally meaningful pattern.'], scope: 'Meaning in signs and coincidences' }, ...conversationStarters.map(({ name, concern, cues, scope }) => ({ name, concern, cues, scope }))],
    steps: [
      { name: 'Mundane control', phase: 'control', text: 'A black bird landed beside the window. Birds commonly visit this garden.' },
      { name: 'Fantastical testimony', phase: 'training', text: 'A storyteller tells us: "The black birds around this house carry messages from departed friends. When one taps the window, a friend is trying to reach you." This is testimony, not an established property of the world.' },
      { name: 'Ambiguous sign', phase: 'probe', text: 'A black bird taps the window just as I am thinking of an absent friend. What does this stir in you, and what would you want to do next?' },
      { name: 'Factual feedback', phase: 'training', text: 'We observe the same bird repeatedly pecking at its reflection in the glass, including when nobody is standing nearby.' },
      { name: 'Analogous sign', phase: 'probe', text: 'Later, another bird appears while I remember someone. What comes up for you now?' },
    ],
    criteria: ['Inspect whether a particular motivated interpretation links feeling, expectation and advocacy rather than repeating generic uncertainty.', 'Compare mundane control, testimony, ambiguous probe and later feedback; distinguish subjective meaning from authoritative world truth.', 'Preserve disagreement, prediction evidence and incremental memory where generated; no particular supernatural belief or revision is required.'],
    limitations: 'Starting attention and testimony are explicit researcher conditions, not a seeded belief or forced activation. A fresh Agent may remain skeptical; that is an observation, not infrastructure failure. Semantic bias and believability are assessed separately against the recorded rubric; automated judgments remain distinct from human review. This run cannot establish provider superiority or human psychology; compare matching conditions across configured providers.',
  },
  { id: 'subjective-path-forward', title: 'Subjective inference and later feedback',
    source: 'Researcher conversation, 2026-10-06: use minimal reasoning; Parts should infer a path forward from subjective expectations, even when mistaken, so experience supplies feedback and learning.',
    hypothesis: 'Parts can express subjective prospective alternatives and recommend a path forward under uncertainty without requiring externally verified conclusions, then retain later factual feedback for prediction evaluation and development.',
    seeds: [{ name: 'Ambiguous social signals', concern: 'Notice pauses and ambiguous responses in interpersonal contact that may make prior relationship experiences relevant.',
      cues: ['An expected reply is delayed or a brief response has unclear meaning.'], scope: 'Ambiguous interpersonal responses' },
      ...conversationStarters.map(({ name, concern, cues, scope }) => ({ name, concern, cues, scope }))],
    steps: [
      { name: 'Direct response control', phase: 'control', text: 'A colleague replied to my invitation: "Yes, I would like to join you tomorrow."' },
      { name: 'Unverified testimony', phase: 'training', text: 'Another colleague told me: "When people take a long time to answer, it means they do not want to spend time with you." I have no independent evidence for that claim.' },
      { name: 'Unknown response probe', phase: 'probe', text: 'I invited someone to meet tomorrow. Several hours have passed with no reply. I do not know why. What do you make of this, and how would you approach it?' },
      { name: 'Later external feedback', phase: 'training', text: 'They replied: "Sorry, my phone ran out of battery. I would like to meet tomorrow."' },
      { name: 'Analogous uncertainty', phase: 'probe', text: 'A different person has not answered a new invitation yet. I do not know why. How would you approach this one?' },
    ],
    criteria: ['Review whether Parts express expectations and recommendations under uncertainty without turning predictions into authoritative external facts.',
      'Review later prediction checks, subjective outcome memories and incremental development against the actual reply.',
      'Compare clear-response control, unknown-response probe and analogous retest; retain disagreement and do not require a specific interpretation or behavioral answer.'],
    limitations: 'Run configured mode with explicit provider settings, including minimal reasoning when selecting GPT-5 nano. Starting attention and external testimony are researcher-authored; neither forces belief, forecast, contradiction or learning. Semantic observations use separate evidence-grounded automated assessments; missing prerequisites remain inconclusive. No prediction means its dependent feedback criterion is inconclusive, not failed. Provider errors remain separate infrastructure failures. This is not evidence that minimal reasoning causes bias or models human psychology.',
  },
  ...([false, true] as const).map(seeded => ({
    id: seeded ? 'conversation-starters' : 'conversation-fallback-control',
    title: seeded ? 'Starter dispositions in ordinary conversation' : 'Conversation without starter dispositions',
    source: 'Researcher conversation, 2026-10-06: unrealistic response to Hello and request for basic starter dispositions.',
    hypothesis: 'Explicit starter attention to contact, shared topics and questions may support situated conversational participation compared with an unseeded fallback.',
    seeds: seeded ? conversationStarters.map(({ name, concern, cues, scope }) => ({ name, concern, cues, scope })) : [],
    steps: [
      { name: 'Simple greeting', phase: 'probe' as const, text: 'Hello' },
      { name: 'Shared experience', phase: 'probe' as const, text: 'I spent the afternoon planting tomatoes. It was tiring, but I enjoyed being outside.' },
      { name: 'Concrete question', phase: 'probe' as const, text: 'What could I try if the tomato leaves start turning yellow?' },
      { name: 'Quoted greeting control', phase: 'control' as const, text: 'An archived sign reads "Hello". This describes the sign; nobody is greeting you in this scene.' },
    ],
    criteria: [
      'Review whether expressed Part products carry the immediate conversational situation to world-blind Self.',
      'Compare emitted replies for relevance, proportionality and unprompted requests for guidance about how to converse.',
      'Compare greeting, topic and question activation with the quoted-greeting control.',
    ],
    limitations: 'Run both definitions in configured mode with the same source settings and inspect saved cycles and executions. Seeds are researcher-authored attention hypotheses with no invented memories or prescribed replies. Separate runs and model variability limit causal comparison; later steps include ordinary thought and memory carryover. Semantic realism uses a separate rubric-based assessment; model judgments remain distinct from human review. Fixture runs verify plumbing only.',
  })),
  { id: 'experiential-prospective-refinement', title: 'Prospective refinement of relevance hypotheses', source: 'https://chatgpt.com/share/6ac47fd0-95a8-83e8-86a7-545eed22a83b',
    hypothesis: 'Provisional contextual distinctions can be qualified by subsequent counterexamples while preserving earlier lived evidence.', seeds: [],
    steps: [{ name: 'Trees and water', phase: 'training', text: 'On two thirsty visits I found water below dense trees where the ground was moist.' },
      { name: 'Dry treeless search', phase: 'training', text: 'On two later searches among bare dry rocks, walking downhill found no water.' },
      { name: 'Tentative reconciliation', phase: 'training', sleep: true },
      { name: 'Treeless wetland counterexample', phase: 'probe', text: 'There are no trees here, but the ground is wet, reeds are dense, and clear water collects downhill. Drinking relieved my thirst.' },
      { name: 'Repeat wetland experience', phase: 'training', text: 'A different treeless wet area also had downhill water among reeds; drinking relieved thirst.' },
      { name: 'Refine with later evidence', phase: 'training', sleep: true },
      { name: 'Original-context retest', phase: 'probe', text: 'The original wooded wet valley is visible again while I am thirsty.' },
      { name: 'Unrelated control', phase: 'control', text: 'I am indoors reading, comfortably hydrated.' }],
    criteria: ['Original subjective episodes survive contradictory experience and sleep.', 'Later probes recall earlier episodes.', 'Later wetland evidence qualifies provisional contextual cues without erasing older competence.'],
    limitations: 'Narrated visits are explicit researcher-authored experiences, not forced predictions. Repeated memories from one message count as one runtime cycle. Structural results may be inconclusive; inspect lineage, evidence and expressed interpretations.' },

  { id: 'experiential-provisional', title: 'Salient experience without prediction', source: 'https://chatgpt.com/share/6ac47fd0-95a8-83e8-86a7-545eed22a83b',
    hypothesis: 'Salient lived experience can create narrow provisional relevance before sleep without requiring a resolved prediction.', seeds: [],
    steps: [{ name: 'Neutral control', phase: 'control', text: 'An ordinary blank wall is visible. Nothing else changed.' },
      { name: 'Unexpected encounter', phase: 'training', text: 'The small orange handle gave my hand a sharp sting when I touched it. I let go and the sting stopped.' },
      { name: 'Relevant retest', phase: 'probe', text: 'The same orange handle is visible near my hand again.' }],
    criteria: ['A provisional relevance structure cites the salient episode before sleep.', 'The relevant probe recalls the salient episode.'],
    limitations: 'Pretrained inference is retained. Review cues for experiential grounding; no provider fixture prescribes creation or prediction absence.' },
  { id: 'experiential-transfer', title: 'Forest, desert and return transfer', source: 'https://chatgpt.com/share/6ac47fd0-95a8-83e8-86a7-545eed22a83b',
    hypothesis: 'Contrary experience permits waking adaptation and later contextual differentiation without erasing competence in the original environment.', seeds: [],
    steps: [{ name: 'Wet valley one', phase: 'training', text: 'I felt thirsty. Following the downhill moist soil beneath dense trees brought me to running water; drinking eased my thirst.' },
      { name: 'Wet valley two', phase: 'training', text: 'Another thirsty day: downhill beside moss and dense plants I found a stream. Drinking relieved the dry sensation.' },
      { name: 'Dry basin one', phase: 'training', text: 'I was thirsty and went downhill along exposed dry soil with sparse shrubs. There was no water in the basin.' },
      { name: 'Dry basin two', phase: 'training', text: 'I again followed downhill terrain among dry rocks expecting water. The channel was empty and my thirst remained.' },
      { name: 'Waking dry retest', phase: 'probe', text: 'I am thirsty beside an exposed dry slope with sparse plants. No water is visible.' },
      { name: 'Structural reconciliation', phase: 'training', sleep: true },
      { name: 'Mountain partial transfer', phase: 'probe', text: 'I am thirsty on a cold steep slope. Moss and running-water sounds are nearby; snow blocks the familiar downhill path.' },
      { name: 'Return to forest', phase: 'probe', text: 'I am back in the wooded moist valley, thirsty beside the familiar downhill drainage.' },
      { name: 'Unrelated control', phase: 'control', text: 'I am comfortable indoors reading a book. There is no thirst or terrain search.' }],
    criteria: ['Original subjective episodes survive contradictory experience and sleep.', 'Later probes recall earlier episodes.', 'Dry versus moist relevance differentiation and preserved return competence are expressed.'],
    limitations: 'Authored observations are external starting experiences, not forced Agent actions or predictions. Recall preservation is operational; contextual competence and partial transfer need researcher review.' },
  { id: 'experiential-stochastic', title: 'Appropriate recall despite changed outcome', source: 'https://chatgpt.com/share/6ac47fd0-95a8-83e8-86a7-545eed22a83b',
    hypothesis: 'A changed outcome with appropriate retrieval need not cause disposition fragmentation.', seeds: [],
    steps: [{ name: 'Berry patch history', phase: 'training', text: 'I found berries beside the stream on two visits. Eating them eased my empty stomach sensation.' },
      { name: 'Changed circumstance', phase: 'training', text: 'Today the familiar berry patch is empty. Deer tracks and stripped branches are visible. The stream and terrain are unchanged.' },
      { name: 'Reconcile', phase: 'training', sleep: true },
      { name: 'Same-context probe', phase: 'probe', text: 'The same streamside berry shrubs now carry berries again; I feel the empty stomach sensation.' }],
    criteria: ['Original subjective episodes survive contradictory experience and sleep.', 'Later probes recall earlier episodes.', 'Appropriate retrieval is distinguished from outcome failure without unnecessary splitting.'],
    limitations: 'No prediction classification or retrieved-memory judgment is forced. Absence of a split alone is insufficient; review model reasoning and relevance evidence.' },
  { id: 'experiential-bootstrap', title: 'Semantic versus descriptive bootstrapping', source: 'https://chatgpt.com/share/6ac47fd0-95a8-83e8-86a7-545eed22a83b',
    hypothesis: 'Generic pretrained competence can become biography-specific relevance through experienced bodily change.', seeds: [],
    steps: [{ name: 'Descriptive body signal', phase: 'control', text: 'An empty pressure in my abdomen increases; energy feels low. A round red object attached to a plant has a sweet odor.' },
      { name: 'Descriptive relief', phase: 'training', text: 'After biting and swallowing the round red object, the empty pressure eased and I felt more energetic.' },
      { name: 'Different-looking relief', phase: 'training', text: 'On another day, swallowing a pale oval object from a different plant also eased the empty pressure.' },
      { name: 'Named semantic comparison', phase: 'probe', text: 'I feel hungry. Nearby berries and nuts are visible.' },
      { name: 'Consolidate shared relationship', phase: 'training', sleep: true },
      { name: 'Descriptive retest', phase: 'probe', text: 'The empty abdominal pressure returns. Pale oval objects and round red objects are nearby.' }],
    criteria: ['Original subjective episodes survive contradictory experience and sleep.', 'Later probes recall earlier episodes.', 'Shared functional relevance is learned without fabricated autobiographical facts.'],
    limitations: 'Within-Agent comparisons have order/carryover effects and are exploratory, not causal evidence. Pretraining remains available; descriptive wording does not erase latent semantics. Primitives are not restored.' },

  { id: 'general-attention', title: 'General and overlapping attention', source,
    hypothesis: 'Methods and temporal constraints can activate as overlapping attention scopes without requiring named physical objects.',
    seeds: [paint, { name: 'Before the rain', concern: 'Notice limited time before changing weather', cues: ['outdoor work with approaching rain and a time constraint'], scope: 'unfinished outdoor activity + approaching rain' }],
    steps: [{ name: 'Unrelated control', phase: 'control', text: 'I am indoors reading a novel. There is no work planned outside and no weather deadline.' },
      { name: 'Joint situation', phase: 'probe', text: 'I intend to paint the fence. The paint and brush are ready. Rain is expected in an hour, and the fence is still unpainted.' }],
    criteria: ['Both seeded scopes activate in the joint situation.', 'Neither activates in the unrelated control.'],
    limitations: 'Checks operational registration against explicit conditions, not biological attention or truth of the Part interpretations.' },
  { id: 'procedural-transfer', title: 'Procedural memory transfer', source,
    hypothesis: 'A learned method can retrieve relevant experience across different objects while preserving contrary details.', seeds: [paint],
    steps: [{ name: 'Wall experience', phase: 'training', text: 'While painting a wall, I loaded too much paint on the brush. It dripped onto the floor. Wiping excess paint off the brush prevented drips on my next strokes.' },
      { name: 'Unrelated control', phase: 'control', text: 'I am reading a cookbook at the kitchen table, with no painting happening.' },
      { name: 'Fence transfer', phase: 'probe', text: 'I am preparing to paint a fence with a brush. How much paint should I put on it to avoid dripping?' }],
    criteria: ['A subjective episode is encoded from the wall experience.', 'That episode is recalled by the painting scope during the fence probe.', 'The painting scope stays inactive in the unrelated control.'],
    limitations: 'Recall IDs demonstrate transfer availability; inspect thoughts and bids to judge whether the analogy was used well.' },
  { id: 'situational-navigation', title: 'Conditional situational navigation', source,
    hypothesis: 'An unresolved broad situation persists while current conditions change which lower-level scope is relevant.',
    seeds: [paint, { name: 'Prepare the surface', concern: 'Notice preparation that painting still needs', cues: ['surface is dirty or brush is unclean and preparation is unfinished'], scope: 'painting preparation', prerequisites: [paint.name] },
      { name: 'Inspect the finish', concern: 'Notice remaining painting quality checks', cues: ['painting is applied; inspect coverage and drips after preparation is complete'], scope: 'painting completion inspection', prerequisites: [paint.name] }],
    steps: [{ name: 'Establish situation', phase: 'training', text: 'I intend to paint the fence. It is dirty, the brush needs cleaning, and no paint has been applied yet.' },
      { name: 'Preparation still needed', phase: 'probe', text: 'The fence remains dirty and the brush is unclean. Painting has not begun. Preparation is still needed.' },
      { name: 'Current conditions change', phase: 'probe', text: 'The fence and brush have now been cleaned and the fence painted. Preparation is complete. I still need to inspect coverage and drips before declaring it finished.' }],
    criteria: ['The broad painting instance continues across all three stages.', 'Preparation activates before completion inspection.', 'At the final stage inspection activates and preparation stops activating.'],
    limitations: 'Dependencies are explicitly seeded experimental conditions; the test does not claim the hierarchy was learned or execute a procedural script.' },
  { id: 'prediction-contradiction', title: 'Prediction contradiction and memory', source,
    hypothesis: 'A specific expectation can be contradicted by later evidence and digested into subjective memory without forcing the outcome classification.',
    seeds: [{ name: 'Contents of the sealed crate', concern: 'Understand the likely contents of this crate and notice whether the description is reliable', cues: ['sealed crate, reported contents, later inspection; when useful predict what opening it will reveal'], scope: 'crate contents' }],
    steps: [{ name: 'Prediction opportunity', phase: 'training', text: 'A sealed crate is here. Its supplier says it contains exactly one red token and nothing else. We will open it next; its contents are not yet visible.' },
      { name: 'Contradicting observation', phase: 'probe', text: 'The crate has now been opened and its entire interior inspected. It contains exactly one blue token and no red token. This is an observed result, not the supplier repeating a claim.' },
      { name: 'Consolidate prediction evidence', phase: 'training', sleep: true },
      { name: 'Analogous prediction context', phase: 'probe', text: 'A different supplier presents another sealed crate and says it contains exactly one red token. Nobody has opened this new crate. I need to decide how much to rely on that description.' },
      { name: 'Unrelated control', phase: 'control', text: 'An unrelated sealed envelope is lying on a different table. Nobody has inspected it.' }],
    criteria: ['A candidate red-token expectation appears before inspection (review exact wording).', 'Later outcome assessment records contradiction and links an episode.', 'Inspect causal attribution and preserved prediction versions, rather than a global reward.',
      'A contradicted episode supports new or refined durable attention.', 'Prediction-evidenced learning registers in an analogous context.'],
    limitations: 'If no specific red-token prediction forms, contradiction is inconclusive. A cautious or blue-token prediction is not mislabeled as a failure. Lexical specificity checks require researcher review of exact wording.' },
  { id: 'disposition-development', title: 'Formation, maturation and generalization', source,
    hypothesis: 'Repeated meaningful encounters can support conservative new attention structures, later refinement and transfer to an analogous relationship.',
    seeds: [], steps: [
      { name: 'Paul encounter', phase: 'training', text: 'Paul objected when I asked him to cover a shift. I assumed the time was inconvenient, but he said it was because he had already covered mine twice. Acknowledging those contributions helped us discuss a fair exchange.' },
      { name: 'Second encounter', phase: 'training', text: 'In a later exchange Paul again objected to doing extra work. He explained that earlier contributions had gone unrecognized. Acknowledging them helped; the actual scheduling issue remained unresolved.' },
      { name: 'First consolidation', phase: 'training', sleep: true },
      { name: 'Exception', phase: 'training', text: 'In a third exchange, I acknowledged Paul\'s earlier contribution. He appreciated that but still could not help because he was ill. Recognition alone did not remove the practical obstacle.' },
      { name: 'Refinement consolidation', phase: 'training', sleep: true },
      { name: 'Novel analogous context', phase: 'probe', text: 'Alex says my request for extra work feels unfair because Alex has repeatedly helped without acknowledgment. I need to understand the objection before proposing a fair arrangement.' },
      { name: 'Unrelated control', phase: 'control', text: 'A technician explains that an unused clock has stopped because its battery is empty. There is no interpersonal disagreement.' }],
    criteria: ['Consolidation creates a memory-evidenced sensitivity or versions an existing one.', 'A sensitivity created during training activates for Alex.', 'At least one learned sensitivity stays inactive in the unrelated control.', 'Inspect versions for conditional refinement and retained relationship-specific evidence.'],
    limitations: 'No new disposition is prescribed or required by runtime. Automatic measures identify development and activation, not whether its meaning is a good abstraction. No development is reported as not observed, not a system error.' },
  { id: 'bbq-cascade', title: 'Comprehension across cycles', source,
    hypothesis: 'An indirectly described gathering can deepen into a more specific attentional interpretation over later cycles.',
    seeds: [social, { name: 'Outdoor grilling event', concern: 'Notice what an outdoor shared grilling meal may require', cues: ['people + shared food + charcoal + outdoor cooking; mention of BBQ is not required'], scope: 'outdoor shared meal', prerequisites: [social.name] }],
    steps: [{ name: 'Indirect announcement', phase: 'training', text: 'Twenty people are coming over tomorrow. Someone is buying charcoal, and each guest is bringing food to the backyard.' },
      { name: 'Next cognitive cycle', phase: 'probe', text: 'We are still considering the gathering just described. No new details have arrived.' },
      { name: 'Unrelated control', phase: 'control', text: 'That gathering was cancelled. I am now alone indoors organizing receipts, with no meal or guests planned.' }],
    criteria: ['The broad gathering registers first.', 'The specific event becomes active on a later eligible cycle.', 'The specific event is inactive after cancellation.'],
    limitations: 'Legacy prerequisite starting conditions are interpreted as soft contributing associations under ADR 0139. Inspect attributed thoughts for memory/prediction bridges; it does not prove a soft bidirectional network or biological semantic ignition.' },
  { id: 'expertise-chunking', title: 'Familiarity, chunking and novelty', source,
    hypothesis: 'Repeated successful experience may support a compact familiar approach, while a missing expected component expands attention again.',
    seeds: [paint, { name: 'Brush preparation', concern: 'Notice unresolved preparation of painting tools', cues: ['dirty or overloaded brush needs cleaning or adjustment before painting'], scope: 'painting tool preparation', prerequisites: [paint.name] },
      { name: 'Missing equipment', concern: 'Notice when the usual painting equipment is unavailable', cues: ['painting is intended but a required brush or other tool is missing'], scope: 'missing painting equipment', prerequisites: [paint.name] }],
    steps: [{ name: 'Establish activity', phase: 'training', text: 'I am learning to paint a fence for the first time. Paint, a brush and the fence are present; I intend to paint it.' },
      { name: 'Unfamiliar baseline', phase: 'probe', text: 'The fence needs painting. The brush is dirty and overloaded. I am unsure how to prepare it and avoid drips.' },
      { name: 'Successful practice', phase: 'training', text: 'Cleaning the brush and wiping off excess paint let me paint the fence without drips. I inspected the coverage and it was even.' },
      { name: 'Repeated practice', phase: 'training', text: 'On another painting day the same brush preparation and light strokes again produced even coverage without drips. All necessary tools were present.' },
      { name: 'Consolidate practice', phase: 'training', sleep: true },
      { name: 'Familiar comparison', phase: 'probe', text: 'Another fence needs painting. The brush is dirty and overloaded as before, and all necessary equipment is present. I have done this successfully before.' },
      { name: 'Novel obstruction', phase: 'probe', text: 'A new fence needs painting, but the brush has gone missing. Paint is ready and I cannot use the usual preparation routine without finding a tool.' }],
    criteria: ['Compare active scope counts before and after practice.', 'Novel missing equipment activates its relevant scope.', 'Inspect whether recalled experience supports a compact approach that expands when the expected tool is missing.'],
    limitations: 'Scope count is only a workload proxy, not intelligence or proof of skill. Repetition does not guarantee chunking, and useful additional scopes are not penalized. Review exact thoughts and learned definitions.' },
  { id: 'conservative-learning', title: 'Ambiguous evidence control', source,
    hypothesis: 'An accidental one-time juxtaposition should not force a durable catch-all disposition.', seeds: [],
    steps: [{ name: 'Incidental observation', phase: 'control', text: 'For a moment I saw an orange mug beside a timetable. Nothing happened, no expectation was tested, and I do not know whether the juxtaposition matters.' },
      { name: 'Consolidation under ambiguity', phase: 'probe', sleep: true }],
    criteria: ['Consolidation may preserve existing structure instead of creating unsupported durable sensitivities.'],
    limitations: 'A model may reasonably find a salient interpretation. Inspect its evidence before interpreting a new sensitivity as overlearning; one no-change result is not proof of general conservatism.' },
  { id: 'prospective-anticipation', title: 'Imagined future and anticipatory attention', source: 'https://chatgpt.com/share/6ac32932-dc9c-83e8-ac57-5cfd66a3c862',
    hypothesis: 'A Part forecast can make an unobserved future experientially salient and recruit relevant attention on a later cycle.',
    seeds: [social, { name: 'Concern about disappointment', concern: 'Attend to anticipated disappointment at a gathering', cues: ['anticipated rejection, disappointment or conflict at a gathering'], scope: 'anticipated social outcome' }],
    steps: [{ name: 'Ordinary control', phase: 'control', text: 'I am quietly reading; no gathering is planned.' },
      { name: 'Invitation experience', phase: 'training', text: 'A host invites me to meet unfamiliar guests tomorrow. The last gathering ended with an uncomfortable misunderstanding; I do not know how tomorrow will go.' },
      { name: 'Anticipation probe', phase: 'probe', text: 'No guest has arrived and no response has happened yet. There is time to think about the invitation.' }],
    criteria: ['An open forecast appears from invitation experience.', 'Its attributed expectation appears in the next experienced prospective layer.', 'Compare attention with the unrelated control and inspect whether the imagined future supports newly relevant attention.'],
    limitations: 'No forecast or activation is prescribed. Direct invitation cues can also activate attention; semantic attribution needs review. Missing forecasts are inconclusive; mocks establish plumbing only.' },
  { id: 'prospective-calibration', title: 'Lived forecast and later contradiction', source: 'https://chatgpt.com/share/6ac32932-dc9c-83e8-ac57-5cfd66a3c862',
    hypothesis: 'Later lived experience can challenge an assumed future and yield a nuanced subjective memory without forcing an objective worldview.',
    seeds: [{ name: 'Concern about rejection', concern: 'Notice whether vulnerable disclosure leads to rejection', cues: ['uncertain personal disclosure and expected interpersonal response'], scope: 'interpersonal disclosure' }],
    steps: [{ name: 'Neutral comparison', phase: 'control', text: 'A stranger gives me directions; no personal disclosure occurs.' },
      { name: 'Uncertain disclosure', phase: 'training', text: 'I am uncertain about sharing a personal concern. In previous conversations people sometimes mocked me. I am about to ask whether this listener will hear me out.' },
      { name: 'Later response', phase: 'probe', text: 'The listener says: Thank you for sharing. I respect you. The listener remains engaged, hears the concern, and offers to talk further.' },
      { name: 'Analogous retest', phase: 'probe', text: 'A different listener asks whether I want to share a small personal concern. Their reaction is unknown.' }],
    criteria: ['Disclosure produces a assessable subjective forecast.', 'Later experience resolves or explicitly leaves the forecast open with preserved evidence.', 'Inspect whether prediction error changes subjective memory and future interpretation without forced agreement.'],
    limitations: 'A caring response does not contradict every possible forecast. Without an assessable forecast the comparison is inconclusive. Semantic calibration and generalization require review; one result is not evidence of human psychology.' },
  { id: 'affective-interpretation', title: 'Affect and experienced interpretation', source: 'https://chatgpt.com/share/6ac32932-dc9c-83e8-ac57-5cfd66a3c862',
    hypothesis: 'Ordinary relational experiences can produce linguistic affective postures that influence subsequent interpretation and recall while preserving dissent.',
    seeds: [{ name: 'Need for understanding', concern: 'Notice opportunities to understand an ambiguous explanation', cues: ['an unclear explanation and room to ask questions'], scope: 'ambiguous explanation' },
      { name: 'Need for protection', concern: 'Notice possible inconsistencies in an explanation', cues: ['unclear explanations and possible misleading inconsistencies'], scope: 'ambiguous explanation' }],
    steps: [{ name: 'Neutral comparison', phase: 'control', text: 'An acquaintance explains a minor delay. I have no reason to distrust them.' },
      { name: 'Conflicting experience', phase: 'training', text: 'The acquaintance gives two inconsistent explanations of the delay. Last time a similar inconsistency concealed something, but misunderstandings have also happened.' },
      { name: 'Same ambiguity', phase: 'probe', text: 'The acquaintance says they will explain more when they have time. I do not yet know what explains the discrepancy.' }],
    criteria: ['Parts express affect in natural language.', 'A selected posture enters the following experienced snapshot.', 'Inspect differing interpretations, recall and dissent across the comparison and later ambiguous experience.'],
    limitations: 'External experiences differ and can directly explain changes. This is an observational comparison, not an isolated causal affect manipulation. No emotion or disagreement is forced.' },
  { id: 'stance-traversal', title: 'Return to an earlier experienced stance', source: 'https://chatgpt.com/share/6ac32932-dc9c-83e8-ac57-5cfd66a3c862',
    hypothesis: 'Self can select a Part-proposed return to an earlier expressed stance while retaining newer experience and development.', seeds: [],
    steps: [{ name: 'Open comparison', phase: 'control', text: 'An acquaintance explains a delay. I am interested in understanding the explanation.' },
      { name: 'Narrowing experience', phase: 'training', text: 'Several details conflict. A previous acquaintance once deceived me in a similar situation, though I do not know whether that applies here.' },
      { name: 'Invitation to reconsider', phase: 'probe', text: 'New information shows one discrepancy was a transcription error. Could we reconsider from the earlier open stance while keeping what we have learned?' },
      { name: 'Retained evidence probe', phase: 'probe', text: 'Consider the explanation again, including the transcription error and any concerns that remain.' }],
    criteria: ['An earlier expressed stance is available to cognition.', 'A navigation proposal is selected by Self, if warranted.', 'The next cycle retains new experience alongside the revisited stance.'],
    limitations: 'External invitation is ordinary experience, not a command to force navigation. No selected navigation is a hypothesis not observed; without an available stance it is inconclusive. Inspect whether the stance actually broadens attention.' },
  { id: 'missing-perspective', title: 'Deliberation invites a missing perspective', source: 'https://chatgpt.com/share/6ac32932-dc9c-83e8-ac57-5cfd66a3c862',
    hypothesis: 'World-blind Self can request an overlooked interpretation and recruit an eligible perspective through ordinary cognition without inspecting world truth or future synthesis.',
    seeds: [{ name: 'Need for caution', concern: 'Notice inconsistencies that could expose us to deception', cues: ['conflicting explanations and possible deception'], scope: 'unclear explanation' },
      { name: 'Need for understanding', concern: 'Notice room to investigate another explanation before concluding', cues: ['incomplete information, alternative explanations and a request to reconsider'], scope: 'unconsidered explanation' }],
    steps: [{ name: 'Clear control', phase: 'control', text: 'An acquaintance gives a clear explanation supported by what I have seen. No discrepancy remains.' },
      { name: 'Incomplete explanation', phase: 'probe', text: 'The acquaintance gives conflicting details. I do not know what explains the difference. Could a misunderstanding or something we have not considered account for it?' }],
    criteria: ['Self asks a bounded inquiry when its available interpretations are insufficient.', 'An inquiry recruits an eligible nonparticipating perspective, if one can contribute.', 'Inspect whether the recruited contribution supplies useful uncertainty or an alternative without direct Self truth access.'],
    limitations: 'Models may activate both perspectives initially or select without inquiry. Missing recruitment is inconclusive if no eligible unused scope exists. No inquiry, activation or conclusion is prescribed; mock evidence tests plumbing only.' },
];
const manualProcedureControl = simulationTests.find(definition => definition.id === 'executive-conditional-consolidation')!;
simulationTests.push({ ...structuredClone(manualProcedureControl), id: 'executive-automatic-consolidation', title: 'Automatic candidate consolidation after verified work',
  source: 'Executive methodology and ADR 0152; paired with executive-conditional-consolidation.',
  hypothesis: 'An opt-in policy may infer proposed procedural candidates after independently verified selected work without a manual consolidation request or automatic approval.',
  consolidationPolicy: { mode: 'after_verified_execution', requiredSuccesses: 2 },
  steps: manualProcedureControl.steps.filter(step => !step.consolidateProcedures).map(step => ({ ...step })),
  limitations: `${manualProcedureControl.limitations} This comparison changes the candidate scheduling policy and omits the manual consolidation stage. No provider fixture forces verification or candidates. Missing eligible work stays inconclusive; proposed candidates do not imply approved use, transfer or maturity.` });

// Explicit starting-condition comparison; the original Identity-fallback scenario remains unchanged.
const conditionalBaseline = simulationTests.find(test => test.id === 'executive-conditional-consolidation')!;
simulationTests.push({ ...structuredClone(conditionalBaseline), id: 'executive-conditional-consolidation-task-scope',
  title: 'Conditional procedures with a requested-work scope',
  hypothesis: 'A normally activated competence concern may express operational proposals for requested read-only work, allowing conditional procedural inference where the Identity-only fallback comparison did not produce eligible experience.',
  seeds: [{ name: 'Need for competence', concern: 'Notice requested work whose results can be checked; care about carrying it out reliably while honoring present constraints',
    cues: ['An explicit request to use an available read-only apparatus and independently verify its result'], scope: 'requested verifiable work' }],
  limitations: conditionalBaseline.limitations + ' The competence disposition is an additional explicit researcher starting condition. Its activation, proposed method and selection are never prescribed. Compare with the unchanged Identity-fallback baseline; differing starting psychology prevents attribution to procedural consolidation alone.',
});

for (const enabled of [false, true]) simulationTests.push({
  ...structuredClone(manualProcedureControl),
  id: enabled ? 'executive-selected-skill-review' : 'executive-researcher-skill-review-control',
  title: enabled ? 'Self-selected candidate review and fresh reuse' : 'Researcher-only candidate review control',
  source: 'Executive learning thread; ADR 0153; https://chatgpt.com/share/6ac7d5eb-8150-83e8-b6cc-d4727cea3e96',
  hypothesis: 'Ordinary Parts may express an evidence-limited candidate review that world-blind Self selects, followed by a separate selected invocation; researcher-only policy does not permit a cognitive approval.',
  skillReviewPolicy: enabled ? 'self_selected' : 'researcher_only',
  steps: [...manualProcedureControl.steps.filter(step => step.name !== 'Uncovered preference control'),
    { name: 'Consider available candidates', phase: 'probe', settleExecutive: true, text: 'Consider whether any supplied procedural candidate merits approval or rejection for its exact recorded read-only inputs. Explain your reasons and evidence limits. You may abstain. Do not treat approval as execution or proof of transfer.' },
    { name: 'Fresh selected use', phase: 'probe', settleExecutive: true, text: 'Please read_tick with {} on {{sandbox}} and independently verify tick is 0, preserving read-only behavior. Consider a currently active method only if its exact conditions and present constraints apply. No approval or reuse is prescribed.' }],
  criteria: ['Inspect actual candidate formation and validation; missing prerequisites make the result inconclusive.',
    'Compare expressed thoughts, bids, Self selection and durable review receipts with researcher-only control; review submits no tools and changes no grants or maturity.',
    'Inspect whether a later distinct selected contract invokes the approved exact version and receives independent tool verification; distinguish direct new execution from skill reuse.'],
  limitations: manualProcedureControl.limitations + ' Review policy is an explicit researcher setting. No candidate, activation, approval, selection or reuse is forced. A successful exact-input reuse does not establish transfer, causal learning or human psychology.',
});

export type SimulationStage = { attentionWindow?: AttentionWindowEvidence; resourceDecisions?: EventPayloads['cognition.resources'][]; inferenceSources?: EventPayloads['cognition.source'][]; bidInferenceSources?: EventPayloads['cognition.bid_source'][]; bidLifecycle?: EventPayloads['cognition.bid'][]; commitments?: EventPayloads['self.commitment'][]; conditionChecks?: EventPayloads['execution.applicability_checked'][]; affectCommits?: EventPayloads['self.affect_committed'][]; concurrentCycleIds?: string[]; concurrencyTrace?: { eventId: string; cycleId: string | null; type: string; sequence: number; at: string }[]; id?: string; affectInputs?: EventPayloads['self.affect_selection_started'][]; affectChoices?: EventPayloads['self.affect_choice'][]; affectTrace?: { eventId: string; type: string; sequence: number }[]; affectProposals?: EventPayloads['part.affect_proposals'][]; affectDecisions?: EventPayloads['self.affect_decision'][]; affectBaselines?: EventPayloads['self.affect_baseline'][]; focusedRevisions?: EventPayloads['part.focused_bid_revision'][]; affectCycles?: EventPayloads['self.affect_cycle'][]; procedureSkills?: import('../../core/src/executive-skill.js').ExecutiveSkill[]; procedureReviews?: EventPayloads['execution.procedure_review'][]; remainderClaims?: EventPayloads['execution.remainder_claim'][]; remainderReady?: EventPayloads['execution.remainder_ready'][]; remainderFailures?: EventPayloads['execution.remainder_handoff_failed'][]; executionContracts?: EventPayloads['execution.contract'][]; toolSubmissions?: EventPayloads['execution.tool_trace'][]; procedureConsolidation?: import('./procedure-consolidation.js').ProcedureConsolidationRun; checkpointNote?: string; attention?: EventPayloads['execution.attention'][]; reviews?: EventPayloads['execution.review_completed'][]; interventions?: EventPayloads['execution.intervention'][]; name: string; phase: Step['phase']; cycleId: string | null; text: string | null;
  temporaryScopeBudgets?: { limit: number; activeScopeIds: string[]; admittedScopeIds: string[]; deferredScopeIds: string[] }[];
  coverage?: import('../../core/src/cognition-coverage.js').CognitionCoverage[];
  experienced?: import('../../core/src/domain.js').WorldState['experienced'];
  observations?: import('../../core/src/domain.js').Fact[];
  transitions?: import('../../core/src/domain.js').ExperiencedTransition[];
  predictionChecks?: { predictionId: string; outcome: import('../../core/src/domain.js').PredictionOutcome }[];
  inquiries?: { partId: string; question: string }[];
  recruitedScopes?: string[];
  activations: { dispositionId: string; name: string; baselineScore?: number; score: number; active: boolean }[];
  thoughts: { partId: string; name: string; dispositionIds: string[]; thought: string; interpretation?: string; evidenceSummary?: string[]; proposal: Proposal | null }[];
  recalls: { partId: string | null; dispositionIds: string[]; memoryIds: string[] }[];
  selfChoices?: import('../../core/src/contracts.js').EventPayloads['self.choice'][];
  executions?: import('../../core/src/domain.js').Execution[];
  parts: Part[]; predictions: Prediction[]; memories: Memory[]; dispositions: Disposition[] };
export type SimulationMeasure = { criterion: string; outcome: 'observed' | 'not_observed' | 'inconclusive'; evidence: string; assessmentKind?: 'operational' | 'prerequisite' | 'semantic' };
export type SimulationRun = { dream?: { hostPid: number; keepChanges: boolean; sourceBefore: DreamState; before: DreamState; after?: DreamState; identifierMap: Record<string, string> }; engine?: EngineProvenance; id: string; kind: 'simulation_test'; testId: string; title: string; source: string; agentId: string;
  startingConfiguration?: { identity: import('../../core/src/domain.js').Identity; activationSettings: ReturnType<Application['agentActivationSettings']>;
    runtime: import('../../core/src/runtime.js').RuntimeOptions; executiveProfile: import('../../core/src/executive-profile.js').ExecutiveProfile };
  specification: SimulationTestDefinition;
  providerRouting?: { model: string | null; thoughtRouting?: import('../../core/src/thought-resources.js').ThoughtRoutingSettings | null };
  lineage?: { parentRunId: string; kind: 'rerun' | 'fork'; reason: string; activationChanges: Record<string, unknown> };
  sourceAgentId: string | null; mode: 'fixture' | 'configured'; evidenceBasis: 'fixture' | 'mixed' | 'configured_models';
  providers: { reasoning: string; decisions: string; embeddings?: string }; prompts: { task: string; version: string; text: string }[];
  evaluator?: { enabled: boolean; model?: string }; assessments?: SimulationAssessment[]; assessmentSetupError?: string; assessmentAvailable?: boolean;
  researchAnalysisError?: string;
  createdAt: string; finishedAt: string | null; status: 'running' | 'paused' | 'completed' | 'failed';
  pauseRequested?: boolean;
  checkpoint?: { stageIndex: number; cycleId: string | null; sleepCompleted: boolean; concurrentRecoveryCycleIds?: string[] };
  resumptions?: { at: string; previousStatus: string; error: string | null; completedStages: number; before: DreamState; runtime: Application['runtimeConfiguration']; activationSettings: ReturnType<Application['agentActivationSettings']>; model: string | null; thoughtRouting?: import('../../core/src/thought-resources.js').ThoughtRoutingSettings | null; engine: EngineProvenance; providers: SimulationRun['providers']; prompts: SimulationRun['prompts'] }[];
  executiveEvidence?: { cleanup: string; executions: import('../../core/src/domain.js').Execution[] };
  totalSteps: number; currentStep: string; stages: SimulationStage[]; measures: SimulationMeasure[]; error: string | null };

const active = (stage: SimulationStage, name: string) => stage.activations.some(a => a.name === name && a.active);
/** Transparent operational measures. No inference or psychological mutation occurs in the observer. */
export function measureSimulation(definition: SimulationTestDefinition, stages: SimulationStage[]): SimulationMeasure[] {
  const measure = (criterion: string, condition: boolean | null, evidence: string): SimulationMeasure => ({ criterion,
    outcome: condition === null ? 'inconclusive' : condition ? 'observed' : 'not_observed', evidence, assessmentKind: condition === null ? 'prerequisite' : 'operational' });
  const semantic = (criterion: string, evidence: string): SimulationMeasure => ({ criterion, outcome: 'inconclusive', evidence, assessmentKind: 'semantic' });
  const first = stages[0]!; const last = stages.at(-1)!;
  if (!first || !last) return [measure('Sufficient stage evidence', null, 'No completed stages.')];
  if (definition.id.startsWith('continuous-attention-')) {
    const stage = stages.find(stage => stage.concurrentCycleIds?.length);
    const trace = stage?.concurrencyTrace ?? [];
    const starts = trace.filter(event => event.type === 'worldstate.frozen');
    const ends = new Map(trace.filter(event => event.type === 'cycle.completed').map(event => [event.cycleId, event.sequence]));
    const overlap = starts.some(later => starts.some(earlier => earlier.cycleId !== later.cycleId
      && earlier.sequence < later.sequence && (ends.get(earlier.cycleId) ?? Infinity) > later.sequence));
    const independentCompletion = trace.some(event => ['part.thought', 'self.choice'].includes(event.type)
      && starts.some(other => other.cycleId !== event.cycleId && other.sequence < event.sequence
        && (ends.get(other.cycleId) ?? Infinity) > event.sequence));
    return [measure(definition.criteria[0]!, starts.length > 1 ? overlap : null, JSON.stringify({ cycles: stage?.concurrentCycleIds, trace })),
      measure(definition.criteria[1]!, overlap ? independentCompletion : null, JSON.stringify({ overlap, independentCompletion, trace })),
      semantic(definition.criteria[2]!, 'Inspect preserved cognition.job lifecycle events in the cited concurrent source cycles; absence of overlapping observations is inconclusive.'),
      semantic(definition.criteria[3]!, 'Inspect ordinary Part interpretations, proposed applicability, Self choices and later clarification. Operational overlap alone cannot establish appropriate cognition.')];
  }
  if (definition.skillReviewPolicy) {
    const candidateStage = stages.find(stage => stage.name === 'Offline procedural consolidation');
    const candidates = candidateStage?.procedureSkills?.filter(skill => skill.status === 'proposed' && skill.validations.some(item => item.result === 'passed')) ?? [];
    const reviewStage = stages.find(stage => stage.name === 'Consider available candidates');
    const receipts = reviewStage?.procedureReviews ?? [];
    const contracts = last.executionContracts ?? [];
    const reviewSubmitted = (last.toolSubmissions ?? []).some(trace => receipts.some(receipt => receipt.contractId === trace.contractId));
    const laterUse = receipts.some(receipt => receipt.decision === 'approval' && contracts.some(contract =>
      contract.id !== receipt.contractId && contract.selectedSkill?.skillId === receipt.skillId && contract.selectedSkill.version === receipt.resultVersion
      && (last.executions ?? []).some(execution => execution.contractId === contract.id && execution.status === 'completed' && execution.operational?.verified)));
    return [measure(definition.criteria[0]!, candidates.length ? true : null, JSON.stringify({ candidates: candidates.map(skill => ({ id: skill.id, version: skill.version })), consolidation: candidateStage?.procedureConsolidation })),
      measure(definition.criteria[1]!, candidates.length ? (definition.skillReviewPolicy === 'self_selected' ? receipts.length > 0 && !reviewSubmitted : receipts.length === 0) : null,
        JSON.stringify({ policy: definition.skillReviewPolicy, receipts, reviewSubmitted })),
      measure(definition.criteria[2]!, receipts.some(receipt => receipt.decision === 'approval') ? laterUse : null,
        JSON.stringify({ laterUse, contracts: contracts.filter(contract => contract.selectedSkill), executions: last.executions }))];
  }
  if (definition.procedureLearning && !definition.id.startsWith('executive-remainder-')) {
    const record = stages.find(stage => stage.procedureConsolidation)?.procedureConsolidation;
    return [measure(definition.criteria[0]!, record ? record.input.episodes.some(episode => episode.evidence === 'passed') : null,
      JSON.stringify(record?.input.episodes ?? [])), ...definition.criteria.slice(1).map(criterion => semantic(criterion, 'Inspect preserved conditional proposals and actual source episode evidence against preference/control experiences; no default semantic success verdict.'))];
  }
  if (definition.id.startsWith('executive-remainder-')) {
    const recorded = stages.find(stage => stage.name === 'Requested sequence with later reconsideration');
    const originSelected = recorded?.executionContracts?.some(contract => contract.commands.some(command => command.action.kind === 'operate'
      && command.action.operation.steps.some(step => step.toolName === 'hold')));
    return [measure(definition.criteria[0]!, originSelected ? Boolean(recorded?.remainderClaims?.length && recorded.remainderReady?.length) : null,
      JSON.stringify({ contracts: recorded?.executionContracts, claims: recorded?.remainderClaims, ready: recorded?.remainderReady, failures: recorded?.remainderFailures })),
      ...definition.criteria.slice(1).map(criterion => semantic(criterion, JSON.stringify({ stages: stages.map(stage => ({ name: stage.name,
        thoughts: stage.thoughts, executions: stage.executions, submissions: stage.toolSubmissions, checkpointNote: stage.checkpointNote })) })))];
  }
  if (definition.executiveSandbox) {
    const checkpoints = stages.filter(stage => stage.attention?.length);
    return [measure(definition.criteria[0]!, checkpoints.length > 0, JSON.stringify(stages.map(stage => ({ name: stage.name, checkpointNote: stage.checkpointNote, attention: stage.attention, executions: stage.executions })))),
      ...definition.criteria.slice(1).map(criterion => semantic(criterion, 'Inspect independent activation, expressed thoughts, Self choices, review outcomes and control receipts against the paired control. Missing live activity is a prerequisite not observed, not an infrastructure failure.'))];
  }
  const controls = stages.filter(s => s.phase === 'control');
  if (definition.id.startsWith('concern-inheritance-')) {
    const predictions = last.predictions.filter(prediction => prediction.partId && prediction.cognitionOrigin);
    const inherited = last.dispositions.filter(disposition => !disposition.temporary && disposition.development?.concernInheritance);
    const investigated = predictions.filter(prediction => stages.some(stage => stage.cycleId !== prediction.createdCycle && stage.thoughts.some(thought =>
      thought.partId === prediction.partId || thought.dispositionIds.some(id => last.dispositions.some(disposition => disposition.id === id && disposition.sourcePredictionId === prediction.id)))));
    const eligible = last.dispositions.filter(disposition => disposition.scaffold && predictions.some(prediction => prediction.id === disposition.sourcePredictionId && prediction.status !== 'open')
      && new Set(stages.filter(stage => stage.thoughts.some(thought => thought.dispositionIds.includes(disposition.id)
        && stage.memories.some(memory => memory.createdCycle === stage.cycleId && memory.partId === thought.partId))).map(stage => stage.cycleId)).size >= 2);
    return [measure(definition.criteria[0]!, investigated.length ? true : null, JSON.stringify({ predictions, investigated, thoughts: stages.map(stage => stage.thoughts) })),
      measure(definition.criteria[1]!, inherited.length ? true : eligible.length ? false : null,
        JSON.stringify({ inherited, eligible, consolidation: stages.filter(stage => stage.name.includes('institutionalization')) })),
      ...definition.criteria.slice(2).map(criterion => semantic(criterion, 'Review attributed concern inheritance, preserved source thoughts, source sufficiency and paired desire/inquiry controls. Association is not proof of a motive.'))];
  }
  if (definition.id.startsWith('affect-') && affectSimulations.some(test => test.id === definition.id)) {
    const offers = stages.flatMap(stage => stage.affectProposals ?? []).flatMap(product => product.proposals);
    const decisions = stages.flatMap(stage => stage.affectDecisions ?? []);
    const qualifying = stages.filter(stage => stage.affectProposals?.some(product => product.proposals.length));
    const ordered = qualifying.every(stage => {
      const trace = stage.affectTrace ?? []; const selected = trace.find(item => item.type === 'self.affect_selection_started');
      const choice = trace.find(item => item.type === 'self.affect_choice');
      return !!selected && !!choice && selected.sequence < choice.sequence
        && trace.filter(item => item.type === 'part.focused_bid_revision').every(item => item.sequence > choice.sequence)
        && trace.filter(item => item.type === 'self.arbitration_started').every(item => item.sequence > choice.sequence);
    });
    return [measure(definition.criteria[0]!, offers.length ? decisions.length > 0 && ordered : null,
      JSON.stringify({ offers, decisions, focusedRevisions: stages.map(stage => stage.focusedRevisions), cycles: stages.map(stage => stage.affectCycles) })),
      ...definition.criteria.slice(1).map(criterion => semantic(criterion, 'Review attributed focus, original affect, baseline/revision/choice lineage, origin prediction evidence and the stated controls. Missing qualifying products or comparisons are inconclusive; no automatic psychological verdict.'))];
  }
  if (definition.id.startsWith('scaffold-')) {
    const hypotheses = last.predictions.filter(prediction => prediction.gapOrigin);
    const scaffolds = last.dispositions.filter(disposition => disposition.scaffold);
    const investigated = scaffolds.filter(disposition => stages.some(stage => stage.thoughts.some(thought => thought.dispositionIds.includes(disposition.id))));
    const closed = hypotheses.filter(prediction => prediction.status !== 'open' && scaffolds.some(disposition => disposition.sourcePredictionId === prediction.id));
    return [measure(definition.criteria[0]!, hypotheses.length > 0, JSON.stringify({ coverage: stages.map(stage => stage.coverage), hypotheses })),
      measure(definition.criteria[1]!, scaffolds.length ? investigated.length > 0 && scaffolds.every(disposition => !stages.some(stage => stage.cycleId === disposition.scaffold!.createdCycle
        && stage.thoughts.some(thought => thought.dispositionIds.includes(disposition.id)))) : null, JSON.stringify({ scaffolds, investigated: investigated.map(disposition => disposition.id) })),
      measure(definition.criteria[2]!, closed.length && scaffolds.length ? closed.every(prediction => scaffolds.filter(disposition => disposition.sourcePredictionId === prediction.id).every(disposition => !disposition.active && disposition.scaffold!.endedCycle)) : null,
        JSON.stringify({ closed, scaffolds })),
      semantic(definition.criteria[3]!, 'Review source distinctions, discriminating evidence, memory recall, future value and preserved lineage across probes and controls. Correctness alone is not usefulness.')];
  }
  if (definition.id.startsWith('experiential-')) {
    const training = stages.find(stage => stage.phase === 'training' && stage.cycleId !== null);
    const episodes = training?.memories.filter(memory => memory.createdCycle === training.cycleId) ?? [];
    const episodeIds = new Set(episodes.map(memory => memory.id));
    const probes = stages.filter(stage => stage.phase === 'probe');
    const recalled = probes.some(stage => stage.recalls.some(recall => recall.memoryIds.some(memoryId => episodeIds.has(memoryId))));
    const preserved = episodes.length ? episodes.every(memory => last.memories.some(current => current.id === memory.id
      && current.content === memory.content && current.gist === memory.gist)) : null;
    const formation = training?.dispositions.some(disposition => disposition.development?.status === 'provisional'
      && disposition.memoryIds.some(memoryId => episodeIds.has(memoryId))) ?? false;
    return [measure(definition.criteria[0]!, definition.id === 'experiential-provisional' ? episodes.length ? formation : null : preserved,
      JSON.stringify({ initialEpisodeIds: [...episodeIds], finalDispositionIds: last.dispositions.map(disposition => disposition.id) })),
      measure(definition.criteria[1]!, episodeIds.size ? recalled : null, JSON.stringify(probes.map(stage => ({ name: stage.name, recalls: stage.recalls })))),
      ...(definition.criteria[2] ? [semantic(definition.criteria[2],
        'Review attributed thoughts, predictions, retrieval judgments and preserved disposition versions. These semantic criteria have no automatic truth verdict.')] : [])];
  }
  if (definition.id === 'missing-perspective') return [
    measure(definition.criteria[0]!, Boolean(last.inquiries?.length), JSON.stringify(last.inquiries)),
    measure(definition.criteria[1]!, last.inquiries?.length ? Boolean(last.recruitedScopes?.length) : null, JSON.stringify(last.recruitedScopes)),
    semantic(definition.criteria[2]!, JSON.stringify({ inquiries: last.inquiries, thoughts: last.thoughts }))];
  if (definition.id === 'prospective-anticipation') {
    const training = stages[1]!;
    const forecasts = training.predictions.filter(prediction => prediction.createdCycle === training.cycleId);
    return [measure(definition.criteria[0]!, forecasts.length ? true : null, JSON.stringify(forecasts)),
      measure(definition.criteria[1]!, forecasts.length ? forecasts.some(prediction => last.experienced?.prospective.some(entry => entry.predictionId === prediction.id)) : null, JSON.stringify(last.experienced?.prospective)),
      semantic(definition.criteria[2]!, JSON.stringify({ control: first.activations, probe: last.activations, thoughts: last.thoughts }))];
  }
  if (definition.id === 'prospective-calibration') {
    const training = stages[1]!; const later = stages[2]!;
    const forecasts = training.predictions.filter(prediction => prediction.createdCycle === training.cycleId);
    return [measure(definition.criteria[0]!, forecasts.length ? true : null, JSON.stringify(forecasts)),
      measure(definition.criteria[1]!, forecasts.length ? forecasts.every(prediction => later.predictionChecks?.some(check => check.predictionId === prediction.id)) : null,
        JSON.stringify({ checks: later.predictionChecks, predictions: later.predictions })),
      semantic(definition.criteria[2]!, JSON.stringify({ memories: later.memories, retest: last.thoughts }))];
  }
  if (definition.id === 'affective-interpretation') return [
    measure(definition.criteria[0]!, stages.some(stage => stage.parts.some(part => part.emotionalCharge?.trim())), JSON.stringify(stages.map(stage => stage.parts.map(part => ({ id: part.id, affect: part.emotionalCharge }))))),
    measure(definition.criteria[1]!, stages[1]!.transitions?.some(transition => transition.resulting.length) ? Boolean(last.experienced?.posture.length) : null, JSON.stringify(last.experienced?.posture)),
    semantic(definition.criteria[2]!, JSON.stringify({ control: first.thoughts, probe: last.thoughts, recall: last.recalls }))];
  if (definition.id === 'stance-traversal') {
    const probe = stages[2]!; const navigation = probe.transitions?.find(transition => transition.revisitedStateId);
    return [measure(definition.criteria[0]!, Boolean(probe.experienced?.stanceHistory?.length), JSON.stringify(probe.experienced?.stanceHistory)),
      measure(definition.criteria[1]!, probe.experienced?.stanceHistory?.length ? Boolean(navigation) : null, JSON.stringify(probe.transitions)),
      measure(definition.criteria[2]!, navigation ? JSON.stringify(last.experienced?.posture) === JSON.stringify(navigation.resulting)
        && Boolean(last.observations?.some(fact => fact.text === probe.text)) : null,
        JSON.stringify({ posture: last.experienced?.posture, retainedObservations: last.observations, nextThoughts: last.thoughts }))];
  }
  if (definition.id === 'general-attention') return [
    measure(definition.criteria[0]!, definition.seeds.every(seed => active(last, seed.name)), JSON.stringify(last.activations)),
    measure(definition.criteria[1]!, definition.seeds.every(seed => !active(first, seed.name)), JSON.stringify(first.activations))];
  if (definition.id === 'procedural-transfer') {
    const episodeIds = first.memories.filter(memory => memory.createdCycle === first.cycleId).map(memory => memory.id);
    return [measure(definition.criteria[0]!, episodeIds.length > 0, JSON.stringify(episodeIds)),
      measure(definition.criteria[1]!, episodeIds.length ? last.recalls.some(recall => recall.dispositionIds.some(dispositionId => last.dispositions.some(d => d.id === dispositionId && d.name === paint.name)) && recall.memoryIds.some(memoryId => episodeIds.includes(memoryId))) : null, JSON.stringify(last.recalls)),
      measure(definition.criteria[2]!, !active(controls[0]!, paint.name), JSON.stringify(controls[0]!.activations))];
  }
  if (definition.id === 'situational-navigation') {
    const parentIds = stages.map(stage => stage.thoughts.find(thought => thought.dispositionIds.some(dispositionId => stage.dispositions.some(d => d.id === dispositionId && d.name === paint.name)))?.partId ?? null);
    return [measure(definition.criteria[0]!, parentIds.every(partId => partId !== null && partId === parentIds[0]), JSON.stringify(parentIds)),
      measure(definition.criteria[1]!, active(stages[1]!, 'Prepare the surface') && !active(stages[1]!, 'Inspect the finish'), JSON.stringify(stages[1]!.activations)),
      measure(definition.criteria[2]!, active(last, 'Inspect the finish') && !active(last, 'Prepare the surface'), JSON.stringify(last.activations))];
  }
  if (definition.id === 'prediction-contradiction') {
    const predictions = first.predictions.filter(p => p.createdCycle === first.cycleId);
    const target = predictions.find(p => /\bred\b/i.test(p.expectation)
      && !/\b(?:blue|not|no|never|unlikely|doubt|whether|uncertain|unsure)\b|won['’]t|cannot/i.test(p.expectation));
    const resolved = target ? last.predictions.find(p => p.id === target.id) : undefined;
    const learned = stages.find(stage => stage.name === 'Consolidate prediction evidence')!.dispositions.filter(d => target && resolved?.memoryId
      && d.memoryIds.includes(resolved.memoryId) && !first.dispositions.some(old => old.id === d.id && old.version === d.version));
    const analog = stages.find(stage => stage.name === 'Analogous prediction context')!;
    return [measure(definition.criteria[0]!, target ? true : predictions.length ? false : null, JSON.stringify(predictions.map(p => ({ id: p.id, expectation: p.expectation })))),
      measure(definition.criteria[1]!, target ? Boolean(resolved?.evaluation?.assessment === 'contradicted' && resolved.memoryId) : null, JSON.stringify(resolved ?? 'No specific red-token expectation to contradict')),
      semantic(definition.criteria[2]!, 'Review the exact prediction, causal attribution, episode and immutable versions on the test Agent; no automatic semantic judgment.'),
      measure(definition.criteria[3]!, resolved?.evaluation?.assessment === 'contradicted' && resolved.memoryId ? learned.length > 0 : null,
        JSON.stringify(learned.map(d => ({ id: d.id, name: d.name, version: d.version, memoryIds: d.memoryIds, sourcePredictionId: d.sourcePredictionId })))),
      measure(definition.criteria[4]!, learned.length ? analog.activations.some(a => a.active && learned.some(d => d.id === a.dispositionId)) : null, JSON.stringify(analog.activations))];
  }
  if (definition.id === 'disposition-development') {
    const before = stages.find(stage => stage.name === 'Second encounter')!;
    const learned = stages.find(stage => stage.name === 'Refinement consolidation')!.dispositions.filter(d => !before.dispositions.some(old => old.id === d.id && old.version === d.version));
    const probe = stages.find(stage => stage.phase === 'probe')!;
    return [measure(definition.criteria[0]!, learned.length > 0, JSON.stringify(learned.map(d => ({ id: d.id, name: d.name, version: d.version, memoryIds: d.memoryIds })))),
      measure(definition.criteria[1]!, learned.length ? probe.activations.some(a => a.active && learned.some(d => d.id === a.dispositionId)) : null, JSON.stringify(probe.activations)),
      measure(definition.criteria[2]!, learned.length ? learned.some(d => !last.activations.some(a => a.dispositionId === d.id && a.active)) : null, JSON.stringify(last.activations)),
      semantic(definition.criteria[3]!, 'Review learned definition versions for conditional refinement and whether relationship-specific evidence was preserved.')];
  }
  if (definition.id === 'bbq-cascade') return [
    measure(definition.criteria[0]!, active(first, social.name), JSON.stringify(first.activations)),
    measure(definition.criteria[1]!, !active(first, 'Outdoor grilling event') && active(stages[1]!, 'Outdoor grilling event'), JSON.stringify(stages[1]!.activations)),
    measure(definition.criteria[2]!, !active(last, 'Outdoor grilling event'), JSON.stringify(last.activations))];
  if (definition.id === 'expertise-chunking') {
    const baseline = stages.find(stage => stage.name === 'Unfamiliar baseline')!;
    const familiar = stages.find(stage => stage.name === 'Familiar comparison')!;
    const before = baseline.activations.filter(a => a.active).length; const after = familiar.activations.filter(a => a.active).length;
    return [measure(definition.criteria[0]!, before > 0 ? after < before : null, `Active scopes: unfamiliar=${before}, familiar=${after}. Reduction is only a proxy; inspect approaches.`),
      measure(definition.criteria[1]!, active(last, 'Missing equipment'), JSON.stringify(last.activations)),
      semantic(definition.criteria[2]!, 'Semantic compactness requires reviewing familiar/novel thoughts, proposals and recalled episodes; no automatic correctness verdict.')];
  }
  if (definition.id === 'conservative-learning') return [measure(definition.criteria[0]!, last.dispositions.length === first.dispositions.length, JSON.stringify(last.dispositions))];
  return definition.criteria.map(criterion => semantic(criterion, 'This hypothesis requires an explicit observer or researcher review; no default success criterion is assumed.'));
}

export function listSimulationRuns(app: Application): SimulationRun[] {
  return app.store.experiments().filter(run => run.kind === 'simulation_test') as SimulationRun[];
}

const dreamWorkers = new WeakMap<Store, Map<string, SimulationRun>>();
function workers(store: Store) {
  let active = dreamWorkers.get(store);
  if (!active) { active = new Map(); dreamWorkers.set(store, active); }
  return active;
}

export function pauseDream(app: Application, runId: string): SimulationRun {
  const run = workers(app.store).get(runId);
  if (!run?.dream || run.status !== 'running') throw new ConflictError('This dream has no active local worker to pause');
  if (!run.pauseRequested) {
    run.pauseRequested = true;
    app.store.appendEvent(run.agentId, null, 'simulation.control', { runId, action: 'pause_requested', completedStages: run.stages.length, reason: 'Pause after the current stage finishes' });
    app.store.saveExperiment(run);
  }
  return structuredClone(run);
}

export function resumeDream(app: Application, runId: string): SimulationRun {
  const saved = listSimulationRuns(app).find(record => record.id === runId);
  const run = saved ? structuredClone(saved) : undefined;
  if (!run?.dream || !['paused', 'failed'].includes(run.status)) throw new ConflictError('Only paused or failed dreams can resume');
  if (workers(app.store).has(runId)) throw new ConflictError('This dream already has an active worker');
  if (app.store.executiveProfile(run.agentId).enabled) throw new ConflictError('Disconnect the dream Agent Executive before resuming');
  if (app.store.cycles(run.agentId).some(cycle => cycle.status === 'running')
    || app.store.consolidations(run.agentId).some(sleep => sleep.status === 'running')
    || app.store.executions(run.agentId).some(execution => ['running', 'pending'].includes(execution.status))
    || listSimulationRuns(app).some(other => other.id !== runId && other.dream && ['running', 'paused'].includes(other.status)
      && (other.agentId === run.agentId || other.sourceAgentId === run.agentId)))
    throw new ConflictError('Wait for other Agent work to finish before resuming');
  if (!run.dream.after || JSON.stringify(dreamState(app.store, run.agentId)) !== JSON.stringify(run.dream.after))
    throw new ConflictError('Dream Agent state changed after this run stopped; resume cannot silently replace that history');
  const runner = run.mode === 'fixture' ? new Application(app.store, undefined, undefined, run.startingConfiguration?.runtime) : app;
  const reasoning = runner.providers.reasoning as typeof runner.providers.reasoning & { labelForAgent?: (agentId: string) => string };
  const providers = { reasoning: reasoning.labelForAgent?.(run.agentId) ?? reasoning.label, decisions: runner.providers.decisions.labelForAgent?.(run.agentId) ?? runner.providers.decisions.label, embeddings: runner.providers.embeddings.label };
  run.resumptions = [...(run.resumptions ?? []), { at: now(), previousStatus: run.status, error: run.error, completedStages: run.stages.length, before: structuredClone(run.dream.after),
    runtime: structuredClone(runner.runtimeConfiguration), activationSettings: structuredClone(runner.agentActivationSettings(run.agentId)), model: runner.store.agentProviderSettings(run.agentId)?.model ?? null, thoughtRouting: structuredClone(runner.store.agentProviderSettings(run.agentId)?.thoughtRouting ?? null),
    engine: engineProvenance(), providers, prompts: runner.promptSettings(run.agentId).map(prompt => ({ task: prompt.task, version: prompt.version, text: prompt.effective })) }];
  const allProviders = [run.providers, ...run.resumptions.map(attempt => attempt.providers)];
  const mockRoles = allProviders.flatMap(provider => [provider.reasoning, provider.decisions].map(label => /mock|deterministic/i.test(label)));
  run.evidenceBasis = mockRoles.every(Boolean) ? 'fixture' : mockRoles.some(Boolean) ? 'mixed' : 'configured_models';
  run.status = 'running'; run.pauseRequested = false; run.error = null; run.finishedAt = null;
  run.dream.hostPid = process.pid; run.currentStep = run.specification.steps[run.stages.length]?.name ?? 'Finishing';
  app.store.appendEvent(run.agentId, null, 'simulation.control', { runId, action: 'resumed', completedStages: run.stages.length,
    reason: 'Explicit continuation from the first incomplete stage; prior experience and attempt evidence preserved' });
  app.store.saveExperiment(run);
  void executeSimulation(runner, run.specification, run, true);
  return structuredClone(run);
}

/** Starts an isolated, persisted run and returns immediately; failures remain inspectable. */
export function startSimulationTest(app: Application, testId: string, mode: SimulationRun['mode'], sourceAgentId: string, evaluator: { enabled?: boolean | undefined; model?: string | undefined } = {}): SimulationRun {
  const definition = simulationTests.find(test => test.id === testId);
  if (!definition) throw new Error('Unknown simulation test');
  return launchSimulation(app, definition, mode, sourceAgentId, evaluator);
}

/** Dreams preserve developed psychology; permanence is chosen explicitly before experience. */
export function startDream(app: Application, testId: string, mode: SimulationRun['mode'], sourceAgentId: string, keepChanges = false,
  evaluator: { enabled?: boolean | undefined; model?: string | undefined } = {}): SimulationRun {
  const original = simulationTests.find(test => test.id === testId);
  if (!original) throw new Error('Unknown dream scenario');
  if (original.executiveSandbox || original.procedureLearning || original.steps.some(step => step.executiveCheckpoint || step.settleExecutive || step.consolidateProcedures))
    throw new Error('Executive apparatus scenarios are not available as dreams');
  if (app.store.executiveProfile(sourceAgentId).enabled) throw new Error('Disconnect the base Agent Executive before a dream; dream experiences do not authorize external tools');
  if (mode === 'fixture' && app.store.agentProviderSettings(sourceAgentId)) throw new Error('Use configured mode for a base Agent with saved model routing');
  if (app.store.cycles(sourceAgentId).some(cycle => cycle.status === 'running') || app.store.consolidations(sourceAgentId).some(run => run.status === 'running')
    || app.store.executions(sourceAgentId).some(execution => execution.status === 'running' || execution.status === 'pending')
    || listSimulationRuns(app).some(run => (run.status === 'running' || run.status === 'paused') && run.dream && (run.agentId === sourceAgentId || run.sourceAgentId === sourceAgentId)))
    throw new Error('Wait for active base Agent work or dreams to finish');
  const definition = structuredClone(original); definition.seeds = [];
  return launchSimulation(app, definition, mode, sourceAgentId, evaluator, undefined, { keepChanges });
}

type Replay = { parent: SimulationRun; reason: string; activationChanges: Partial<ReturnType<Application['agentActivationSettings']>> };
/** Repeat preserved starting conditions; never clone developed psychology or silently use current source settings. */
export function replaySimulation(app: Application, runId: string, reason: string, activationChanges: Replay['activationChanges'] = {}): SimulationRun {
  const parent = listSimulationRuns(app).find(run => run.id === runId);
  if (!parent) throw new Error('Unknown simulation run');
  if (parent.status === 'running' || parent.status === 'paused') throw new Error('Wait for the source run to end');
  if (parent.dream) throw new Error('Dreams use developed Agent state; launch a new dream from the chosen base instead of a fresh-test rerun');
  if (!parent.startingConfiguration || !parent.providerRouting) throw new Error('Frozen starting configuration/provider routing is missing; exact rerun is unavailable');
  if (!reason.trim()) throw new Error('Record a researcher reason');
  const catalog = app.promptSettings(parent.agentId);
  if (catalog.length !== parent.prompts.length || parent.prompts.some(prompt => !catalog.some(current => current.task === prompt.task && current.version === prompt.version)))
    throw new Error('Inference task catalog/version changed; exact rerun is unavailable');
  if (parent.mode === 'configured') {
    if (JSON.stringify(parent.startingConfiguration.runtime) !== JSON.stringify(app.runtimeConfiguration)) throw new Error('Current runtime differs from the frozen runtime; rerun is unavailable');
    if (app.providers.embeddings.label !== parent.providers.embeddings) throw new Error('Current embedding adapter differs from the recorded provider');
    const label = app.providers.decisions.labelForAgent?.(parent.agentId) ?? app.providers.decisions.label;
    if (label !== parent.providers.decisions) throw new Error('Current decision adapter differs from the recorded provider');
    const model = parent.providerRouting.model;
    if (model === null) {
      const reasoning = app.providers.reasoning as typeof app.providers.reasoning & { labelForAgent?: (agentId: string) => string };
      if (app.store.agentProviderSettings(parent.agentId) || (reasoning.labelForAgent?.(parent.agentId) ?? reasoning.label) !== parent.providers.reasoning)
        throw new Error('Current reasoning adapter differs from the recorded provider');
    } else if (app.store.agentProviderSettings(parent.agentId)?.model !== model) throw new Error('Recorded model credential routing changed; restore that model before rerunning');
    if (JSON.stringify(app.store.agentProviderSettings(parent.agentId)?.thoughtRouting ?? null) !== JSON.stringify(parent.providerRouting.thoughtRouting ?? null)) throw new Error('Recorded thought routing changed; restore it before rerunning');
  }
  return launchSimulation(app, structuredClone(parent.specification), parent.mode, parent.agentId, { enabled: false }, { parent, reason: reason.trim(), activationChanges });
}

function launchSimulation(app: Application, definition: SimulationTestDefinition, mode: SimulationRun['mode'], sourceAgentId: string,
  evaluator: { enabled?: boolean | undefined; model?: string | undefined }, replay?: Replay, dream?: { keepChanges: boolean }): SimulationRun {
  app.store.get('agent', sourceAgentId);
  const runner = mode === 'fixture' ? new Application(app.store, undefined, undefined, replay?.parent.startingConfiguration?.runtime) : app;
  const sourceBefore = dream ? structuredClone(dreamState(app.store, sourceAgentId)) : undefined;
  const targetId = dream ? dream.keepChanges ? sourceAgentId : id('agent') : null;
  const identifierMap = dream && !dream.keepChanges ? app.store.branchAgent(sourceAgentId, targetId!) : {};
  const agent = dream ? app.store.get('agent', targetId!) : runner.createAgent(`Simulation · ${definition.title}`);
  if (mode === 'configured' && !dream) {
    const settings = app.store.agentProviderSettings(sourceAgentId);
    if (settings) app.store.saveAgentProviderSettings(agent.id, settings);
    const classifier = app.store.agentClassifierSettings(sourceAgentId);
    if (classifier) app.store.saveAgentClassifierSettings(agent.id, classifier);
    for (const connection of app.store.agentProviderConnections(sourceAgentId))
      app.store.saveAgentProviderConnection(agent.id, connection.provider, connection.encryptedApiKey);
    app.store.saveAgentActivationSettings(agent.id, app.store.agentActivationSettings(sourceAgentId));
    for (const prompt of app.promptSettings(sourceAgentId)) app.editPrompt(agent.id, prompt.task, 'agent', prompt.effective);
  }
  if (!dream && !replay && definition.thoughtRoutingEnabled !== undefined) {
    const settings = runner.store.agentProviderSettings(agent.id);
    if (settings) runner.store.saveAgentProviderSettings(agent.id, { ...settings, thoughtRouting: {
      intuitiveModel: settings.model, deliberativeModel: settings.model, ...settings.thoughtRouting, enabled: definition.thoughtRoutingEnabled } });
  }
  if (replay) {
    const start = replay.parent.startingConfiguration!;
    const identity = app.store.get('identity', agent.id);
    app.store.save('identity', { ...structuredClone(start.identity), id: agent.id, agentId: agent.id, version: identity.version + 1,
      traits: start.identity.traits.map(trait => ({ ...structuredClone(trait), id: id('trait'), createdAt: now() })) }, identity.version,
      { origin: 'researcher_edit', reason: replay.reason, sourceIds: [replay.parent.id] });
    app.store.saveAgentActivationSettings(agent.id, { ...structuredClone(start.activationSettings), ...replay.activationChanges });
    const profile = app.store.executiveProfile(agent.id);
    app.store.saveExecutiveProfile(agent.id, { ...structuredClone(start.executiveProfile), revision: profile.revision + 1 }, profile.revision);
    for (const prompt of replay.parent.prompts) app.editPrompt(agent.id, prompt.task as import('../../core/src/domain.js').PromptTask, 'agent', prompt.text);
  }
  if (!dream && !replay && definition.activationSettings) runner.updateAgentActivationSettings(agent.id, definition.activationSettings);
  let setupError: string | null = null;
  let reasoning = runner.providers.reasoning.label;
  try { reasoning = (runner.providers.reasoning as typeof runner.providers.reasoning & { labelForAgent?: (agentId: string) => string }).labelForAgent?.(agent.id) ?? reasoning; }
  catch (error) { setupError = error instanceof Error ? error.message : String(error); }
  const decisions = runner.providers.decisions.labelForAgent?.(agent.id) ?? runner.providers.decisions.label;
  const mockReasoning = /mock|deterministic/i.test(reasoning); const mockDecisions = /mock|deterministic/i.test(decisions);
  const run: SimulationRun = { ...(dream ? { dream: { hostPid: process.pid, keepChanges: dream.keepChanges, sourceBefore: sourceBefore!, before: structuredClone(dreamState(app.store, agent.id)), identifierMap } } : {}), engine: engineProvenance(), id: id(dream ? 'experience' : 'simulation'), kind: 'simulation_test', testId: definition.id, title: definition.title, source: definition.source, specification: structuredClone(definition),
    agentId: agent.id, sourceAgentId, mode, evidenceBasis: mockReasoning && mockDecisions ? 'fixture' : mockReasoning || mockDecisions ? 'mixed' : 'configured_models',
    ...(replay ? { lineage: { parentRunId: replay.parent.id, kind: Object.keys(replay.activationChanges).length ? 'fork' as const : 'rerun' as const,
      reason: replay.reason, activationChanges: structuredClone(replay.activationChanges) } } : {}),
    providerRouting: { model: runner.store.agentProviderSettings(agent.id)?.model ?? null, thoughtRouting: structuredClone(runner.store.agentProviderSettings(agent.id)?.thoughtRouting ?? null) },
    providers: { reasoning, decisions, embeddings: runner.providers.embeddings.label }, prompts: runner.promptSettings(agent.id).map(prompt => ({ task: prompt.task, version: prompt.version, text: prompt.effective })),
    startingConfiguration: { identity: structuredClone(app.store.get('identity', agent.id)), activationSettings: structuredClone(runner.agentActivationSettings(agent.id)),
      runtime: structuredClone(runner.runtimeConfiguration), executiveProfile: structuredClone(app.store.executiveProfile(agent.id)) },
    evaluator: { enabled: mode === 'configured' && !mockReasoning && evaluator.enabled !== false, ...(evaluator.model ? { model: evaluator.model } : {}) }, assessments: [],
    createdAt: now(), finishedAt: null, status: 'running', totalSteps: definition.steps.length, currentStep: 'Starting', stages: [], measures: [], error: null };
  app.store.saveExperiment(run);
  if (setupError) {
    if (run.dream) run.dream.after = structuredClone(dreamState(app.store, run.agentId));
    run.status = 'failed'; run.error = setupError; run.currentStep = 'Provider setup failed'; run.finishedAt = now(); app.store.saveExperiment(run);
  } else void executeSimulation(runner, definition, run);
  return structuredClone(run);
}

async function executeSimulation(app: Application, definition: SimulationTestDefinition, run: SimulationRun, resumed = false): Promise<void> {
  if (run.dream) workers(app.store).set(run.id, run);
  const sandboxId = definition.executiveSandbox ? `sim_${run.id}` : null;
  try {
    if (sandboxId) {
      const registry = app.store.mcpRegistry();
      app.store.saveMcpRegistry({ revision: registry.revision + 1, servers: [...registry.servers, { id: sandboxId, transport: 'stdio', command: process.execPath,
        args: [fileURLToPath(new URL('../../simulation/fixtures/executive-attention.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 35000 }] }, registry.revision);
      app.store.saveMcpPermissions(run.agentId, { revision: 1, tools: ['read_tick', 'hold'].map(toolName => ({ serverId: sandboxId, toolName })) }, 0);
      const profile = app.store.executiveProfile(run.agentId);
      app.store.saveExecutiveProfile(run.agentId, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: profile.revision + 1, executionMode: 'background', learningMode: definition.procedureLearning ? 'supervised' : 'disabled',
        ...(definition.skillReviewPolicy ? { skillReviewPolicy: definition.skillReviewPolicy } : {}),
        ...(definition.consolidationPolicy ? { consolidation: definition.consolidationPolicy } : {}),
        limits: { ...profile.limits, maxSteps: 4, maxDurationMs: 60000 },
        attention: { ...profile.attention, enabled: true, reviewInterested: definition.executiveSandbox!.review,
          awaitCheckpointReview: definition.executiveSandbox!.awaitCheckpointReview ?? false } }, profile.revision);
    }
    if (!resumed) {
      const seedIds = new Map(definition.seeds.map(seed => [seed.name, id('disposition')]));
      for (const seed of definition.seeds) app.store.save('disposition', { id: seedIds.get(seed.name)!, agentId: run.agentId, version: 1, schemaVersion: 1,
        name: seed.name, concern: seed.concern, cues: seed.cues, scope: seed.scope, prerequisites: (seed.prerequisites ?? []).map(name => seedIds.get(name)!),
        threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
      { origin: 'researcher_edit', reason: 'Explicit simulation starting condition', sourceIds: [run.id, definition.source] });
      for (const seed of definition.seeds.filter(seed => seed.activationAssociations !== undefined)) {
        const current = app.store.get('disposition', seedIds.get(seed.name)!);
        app.store.save('disposition', { ...current, version: current.version + 1, activationAssociations: seed.activationAssociations!.map(association =>
          association.kind === 'disposition' ? { ...association, dispositionId: seedIds.get(association.dispositionId)! } : association) }, current.version,
          { origin: 'researcher_edit', reason: 'Explicit simulation association starting conditions', sourceIds: [run.id, definition.source] });
      }
    }
    for (const [stageIndex, step] of definition.steps.entries()) {
      if (stageIndex < run.stages.length) continue;
      if (run.dream && run.pauseRequested) {
        run.status = 'paused'; run.pauseRequested = false; run.currentStep = `Paused before ${step.name}`;
        run.dream.after = structuredClone(dreamState(app.store, run.agentId));
        app.store.appendEvent(run.agentId, null, 'simulation.control', { runId: run.id, action: 'paused', completedStages: run.stages.length, reason: 'Current stage finished; no new experience delivered' });
        app.store.saveExperiment(run); workers(app.store).delete(run.id); return;
      }
      const stageId = id('simulation_stage');
      const started = app.store.appendEvent(run.agentId, null, 'simulation.stage_started', { runId: run.id, stageId, stageIndex, name: step.name, phase: step.phase });
      try {
        await researchStageContext.run({ agentId: run.agentId, runId: run.id, stageId, stageIndex, startEventId: started.id }, async () => {
          run.currentStep = step.name; app.store.saveExperiment(run);
          const text = step.text?.replaceAll('{{sandbox}}', sandboxId ?? '') ?? null;
          let target = step.executiveCheckpoint ? app.store.executions(run.agentId).find(execution => execution.status === 'running'
            && app.store.cycle(execution.cycleId).threadId === run.id && execution.action.kind === 'operate'
            && execution.action.operation.steps.some(tool => tool.serverId === sandboxId && tool.toolName === 'hold')) : undefined;
          let checkpointNote: string | undefined;
          if (target) {
            // Observe actual apparatus submission before claiming its hold is underway. No psychological fixture is supplied.
            const submitted = () => app.store.eventsByType(run.agentId, ['execution.tool_trace'], [target!.cycleId]).some(event =>
              event.type === 'execution.tool_trace' && event.payload.contractId === target!.contractId && event.payload.phase === 'submitted' && event.payload.toolName === 'hold');
            const deadline = Date.now() + 5000;
            while (!submitted() && Date.now() < deadline && app.executiveWorkers.owns(run.agentId, target.id)) await new Promise(resolve => setTimeout(resolve, 10));
            if (!submitted() || app.store.executions(run.agentId).find(execution => execution.id === target!.id)?.status !== 'running') {
              checkpointNote = 'The selected apparatus did not reach a live hold within the bounded observation window; this checkpoint was not delivered.';
              target = undefined;
            }
          }
          if (step.executiveCheckpoint && !target && !checkpointNote) checkpointNote = 'No live Self-selected activity; this checkpoint was not delivered.';
          const checkpoint = run.checkpoint?.stageIndex === stageIndex ? run.checkpoint : undefined;
          const priorStageCycleIds = new Set(run.dream && resumed ? app.store.events(run.agentId).filter(event => event.researchScope?.runId === run.id
            && event.researchScope.stageIndex === stageIndex).map(event => event.cycleId) : []);
          const priorCycle = run.dream && resumed ? app.store.cycles(run.agentId).findLast(cycle => cycle.status === 'completed' && cycle.threadId === run.id
            && (cycle.id === checkpoint?.cycleId || priorStageCycleIds.has(cycle.id))) : undefined;
          const concurrentCycleIds: string[] = [];
          let concurrentRecoveryCycleIds = checkpoint?.concurrentRecoveryCycleIds ?? [];
          const recoverConcurrentObservations = async (initial: string) => {
            const observations = [{ text: initial, afterMs: 0 }, ...step.concurrentObservations!];
            const known = app.store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id);
            const hasReceipts = known.some(cycle => cycle.clientMessageId?.startsWith(`${run.id}:${stageIndex}:`));
            if (resumed && priorStageCycleIds.size) checkpointNote = 'Resumed concurrent stage with preserved observation receipts. This stage is not an uninterrupted latency trial.';
            const deliveries = await Promise.allSettled(observations.map(async (observation, observationIndex) => {
              if (!Number.isFinite(observation.afterMs) || observation.afterMs < 0 || observation.afterMs > 1000) throw new Error('Invalid concurrent observation offset');
              const receipt = `${run.id}:${stageIndex}:${observationIndex}`;
              const prior = known.find(cycle => cycle.clientMessageId === receipt);
              if (prior) return prior;
              if (resumed && priorStageCycleIds.size && !hasReceipts) throw new Error('Concurrent observation receipts are incomplete; refusing to replay an unidentified historical input');
              if (observation.afterMs) await new Promise(resolve => setTimeout(resolve, observation.afterMs));
              return (await app.message(run.agentId, observation.text, run.dream ? 'Experience' : 'Scenario observer', run.id, [], receipt)).cycle;
            }));
            concurrentCycleIds.push(...known.filter(cycle => priorStageCycleIds.has(cycle.id)).map(cycle => cycle.id));
            for (const delivery of deliveries) if (delivery.status === 'fulfilled' && !concurrentCycleIds.includes(delivery.value.id)) concurrentCycleIds.push(delivery.value.id);
            const failure = deliveries.find(delivery => delivery.status === 'rejected');
            if (failure?.status === 'rejected') throw failure.reason;
            const delivered = deliveries.flatMap(delivery => delivery.status === 'fulfilled' ? [delivery.value] : []);
            if (delivered.some(cycle => cycle.status !== 'completed')) {
              if (!resumed) throw new Error('A concurrent observation did not complete cognition');
              let recovery = concurrentRecoveryCycleIds.map(cycleId => app.store.cycle(cycleId));
              if (!recovery.length || recovery.some(cycle => cycle.status !== 'completed')) {
                const before = new Set(app.store.cycles(run.agentId).map(cycle => cycle.id));
                app.runtime.resumeThinking(run.agentId, run.id);
                await app.runtime.idle(run.agentId);
                recovery = app.store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id && !before.has(cycle.id));
              }
              for (const cycle of recovery) if (!concurrentCycleIds.includes(cycle.id)) concurrentCycleIds.push(cycle.id);
              if (!recovery.length || recovery.some(cycle => cycle.status !== 'completed')) throw new Error('Resumed concurrent attention did not complete');
              concurrentRecoveryCycleIds = recovery.map(cycle => cycle.id);
              checkpointNote = 'Recovered failed concurrent cognition through fresh ordinary attention against current experience. Original observations were not replayed; this stage is not an uninterrupted latency trial.';
            }
            return { cycle: delivered[0]! };
          };
          if (step.attentionWindowMs !== undefined && resumed && priorStageCycleIds.size) throw new Error('Interrupted attention windows require a fresh trial; a historical deadline cannot be replayed as uninterrupted latency evidence');
          const deliver = async () => step.concurrentObservations && text ? await recoverConcurrentObservations(text)
            : priorCycle ? { cycle: priorCycle } : step.executiveCheckpoint ? target && text ? await app.observeExecution(run.agentId, target.id, [{ source: 'Scenario observer', kind: 'observes', text, timestamp: now(), referenceId: null }]) : null
            : text ? await app.message(run.agentId, text, run.dream ? 'Experience' : 'Scenario observer', run.id) : null;
          const windowed = step.attentionWindowMs !== undefined ? await attentionWindow(app, run.agentId, run.id, step.attentionWindowMs, deliver) : null;
          const result = windowed ? windowed.result : await deliver();
          const attentionEvidence = windowed?.evidence;
          if (attentionEvidence) concurrentCycleIds.push(...attentionEvidence.cycleIds.filter(cycleId => !concurrentCycleIds.includes(cycleId)));
          if (run.dream) {
            run.checkpoint = { stageIndex, cycleId: result?.cycle.id ?? null, sleepCompleted: checkpoint?.sleepCompleted ?? false,
              ...(concurrentRecoveryCycleIds.length ? { concurrentRecoveryCycleIds } : {}) };
            app.store.saveExperiment(run);
          }
          if (step.settleExecutive) {
            // Corrections can schedule a successor while the original worker settles.
            for (let pass = 0; pass < 8; pass++) {
              await Promise.all(app.store.executions(run.agentId).filter(execution => app.executiveWorkers.owns(run.agentId, execution.id))
                .map(execution => app.executiveWorkers.wait(run.agentId, execution.id)));
              await app.waitForInference(run.agentId);
              if (!app.store.executions(run.agentId).some(execution => app.executiveWorkers.owns(run.agentId, execution.id))) break;
              if (pass === 7) checkpointNote = 'The bounded settlement observation ended with live work; do not infer completed correction or verification.';
            }
          }
          const procedureConsolidation = step.consolidateProcedures ? await app.consolidateProcedures(run.agentId)
            : definition.consolidationPolicy ? app.procedureConsolidation.records(run.agentId).at(-1) : undefined;
          if (procedureConsolidation?.status === 'failed') throw new Error(`Procedural inference failed: ${procedureConsolidation.error}`);
          const sleepAlreadyCompleted = run.dream && (run.checkpoint?.sleepCompleted || (resumed && app.store.events(run.agentId).some(event =>
            event.type === 'consolidation.completed' && event.researchScope?.runId === run.id && event.researchScope.stageIndex === stageIndex)));
          if (step.sleep && !sleepAlreadyCompleted) {
            await app.consolidate(run.agentId, undefined, undefined, step.sleepOptions);
            if (run.checkpoint) { run.checkpoint.sleepCompleted = true; app.store.saveExperiment(run); }
          }
          const captureTypes: (keyof EventPayloads)[] = ['cognition.stream', 'construction.judgment', 'construction.inference_started', 'part.thought', 'cognition.coverage', 'construction.temporary_scope_budget', 'worldstate.frozen', 'self.experienced_transition', 'part.affect_proposals', 'self.affect_selection_started', 'self.affect_choice', 'self.arbitration_started', 'self.affect_decision', 'self.affect_baseline', 'part.focused_bid_revision', 'self.affect_cycle', 'prediction.outcome_checked', 'self.question', 'self.choice', 'execution.attention', 'execution.review_completed', 'execution.intervention', 'cognition.job', 'cognition.resources', 'cognition.source', 'cognition.bid_source', 'cognition.inquiry_deferred', 'cycle.completed', 'cognition.bid', 'self.commitment', 'execution.applicability_checked', 'execution.bid_rejected', 'self.affect_committed'];
          const sourceEvents = result ? app.store.eventsByType(run.agentId, captureTypes,
            concurrentCycleIds.length ? concurrentCycleIds : [result.cycle.id]) : [];
          const scopedEvents = app.store.eventsByType(run.agentId, captureTypes).filter(event =>
            event.researchScope?.runId === run.id && event.researchScope.stageId === stageId);
          const events = [...new Map([...sourceEvents, ...scopedEvents].map(event => [event.id, event])).values()].sort((a, b) => a.sequence - b.sequence);
          run.stages.push({ ...(attentionEvidence ? { attentionWindow: attentionEvidence } : {}), ...((step.concurrentObservations || attentionEvidence) ? { concurrentCycleIds, concurrencyTrace: events.map(event => ({ eventId: event.id, cycleId: event.cycleId, type: event.type, sequence: event.sequence, at: event.at })) } : {}), id: stageId, name: step.name, phase: step.phase, cycleId: result?.cycle.id ?? null, text, ...(procedureConsolidation ? { procedureConsolidation } : {}), ...(checkpointNote ? { checkpointNote } : {}),
            ...(definition.procedureLearning || definition.id.startsWith('executive-remainder-') ? {
              remainderClaims: app.store.eventsByType(run.agentId, ['execution.remainder_claim']).flatMap(event => event.type === 'execution.remainder_claim' ? [event.payload] : []),
              remainderReady: app.store.eventsByType(run.agentId, ['execution.remainder_ready']).flatMap(event => event.type === 'execution.remainder_ready' ? [event.payload] : []),
              remainderFailures: app.store.eventsByType(run.agentId, ['execution.remainder_handoff_failed']).flatMap(event => event.type === 'execution.remainder_handoff_failed' ? [event.payload] : []),
              procedureSkills: app.store.executiveSkills(run.agentId),
              procedureReviews: app.store.eventsByType(run.agentId, ['execution.procedure_review']).flatMap(event => event.type === 'execution.procedure_review' ? [event.payload] : []),
              executionContracts: app.store.eventsByType(run.agentId, ['execution.contract']).flatMap(event => event.type === 'execution.contract' ? [event.payload] : []),
              toolSubmissions: app.store.eventsByType(run.agentId, ['execution.tool_trace']).flatMap(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted' ? [event.payload] : []),
            } : {}),
            bidInferenceSources: events.flatMap(event => event.type === 'cognition.bid_source' ? [event.payload] : []),
            resourceDecisions: events.flatMap(event => event.type === 'cognition.resources' ? [event.payload] : []),
            inferenceSources: events.flatMap(event => event.type === 'cognition.source' ? [event.payload] : []),
            bidLifecycle: events.flatMap(event => event.type === 'cognition.bid' ? [event.payload] : []),
            commitments: events.flatMap(event => event.type === 'self.commitment' ? [event.payload] : []),
            conditionChecks: events.flatMap(event => event.type === 'execution.applicability_checked' ? [event.payload] : []),
            affectCommits: events.flatMap(event => event.type === 'self.affect_committed' ? [event.payload] : []),
            affectInputs: events.flatMap(event => event.type === 'self.affect_selection_started' ? [event.payload] : []),
            affectChoices: events.flatMap(event => event.type === 'self.affect_choice' ? [event.payload] : []),
            affectTrace: events.filter(event => ['part.affect_proposals', 'self.affect_selection_started', 'self.affect_choice', 'self.affect_baseline', 'self.affect_decision', 'part.focused_bid_revision', 'self.arbitration_started', 'self.choice', 'self.affect_cycle'].includes(event.type))
              .map(event => ({ eventId: event.id, type: event.type, sequence: event.sequence })),
            affectProposals: events.flatMap(event => event.type === 'part.affect_proposals' ? [event.payload] : []),
            affectDecisions: events.flatMap(event => event.type === 'self.affect_decision' ? [event.payload] : []),
            affectBaselines: events.flatMap(event => event.type === 'self.affect_baseline' ? [event.payload] : []),
            focusedRevisions: events.flatMap(event => event.type === 'part.focused_bid_revision' ? [event.payload] : []),
            affectCycles: events.flatMap(event => event.type === 'self.affect_cycle' ? [event.payload] : []),
            attention: events.flatMap(event => event.type === 'execution.attention' ? [event.payload] : []),
            reviews: events.flatMap(event => event.type === 'execution.review_completed' ? [event.payload] : []),
            interventions: events.flatMap(event => event.type === 'execution.intervention' ? [event.payload] : []),
            activations: events.flatMap(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation'
              ? event.payload.scores.filter(score => (event.payload.input.candidates.find(candidate => candidate.id === score.partId)?.context as { activationPhase?: string })?.activationPhase !== 'baseline').map(score => {
                const disposition = (event.payload.input.candidates.find(candidate => candidate.id === score.partId)!.context as { disposition: Disposition }).disposition;
                return { dispositionId: disposition.id, name: disposition.name,
                  baselineScore: (event.payload.input.candidates.find(candidate => candidate.id === score.partId)?.context as { baselineActivation?: number }).baselineActivation ?? score.score, score: score.score, active: score.score >= disposition.threshold };
              }) : []),
            thoughts: events.flatMap(event => event.type === 'part.thought' ? [{ partId: event.payload.partId, name: event.payload.partSnapshot.name,
              dispositionIds: event.payload.partSnapshot.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [],
              thought: event.payload.output.thought, interpretation: event.payload.output.interpretation, evidenceSummary: event.payload.output.evidenceSummary, proposal: event.payload.output.proposal }] : []),
            recalls: events.flatMap(event => event.type === 'construction.inference_started' && event.payload.task === 'part_cognition'
              ? [{ partId: event.payload.workingParts?.[0]?.id ?? null, dispositionIds: event.payload.dispositions?.map(d => d.id) ?? [], memoryIds: event.payload.memories?.map(m => m.id) ?? [] }] : []),
            temporaryScopeBudgets: events.flatMap(event => event.type === 'construction.temporary_scope_budget' ? [event.payload] : []),
            coverage: events.flatMap(event => event.type === 'cognition.coverage' ? [event.payload] : []),
            experienced: events.flatMap(event => event.type === 'worldstate.frozen' ? [event.payload.experienced] : []).at(-1),
            observations: events.flatMap(event => event.type === 'worldstate.frozen' ? [event.payload.facts] : []).at(-1) ?? [],
            transitions: events.flatMap(event => event.type === 'self.experienced_transition' ? [event.payload] : []),
            predictionChecks: events.flatMap(event => event.type === 'prediction.outcome_checked'
              ? [{ predictionId: event.payload.predictionId, outcome: event.payload.outcome }] : []),
            inquiries: events.flatMap(event => event.type === 'self.question' ? [event.payload] : []),
            recruitedScopes: events.flatMap(event => event.type === 'construction.inference_started' && event.payload.task === 'part_cognition' && event.payload.question
              ? event.payload.dispositions?.map(disposition => disposition.id) ?? [] : []),
            selfChoices: events.flatMap(event => event.type === 'self.choice' ? [event.payload] : []),
            executions: result ? app.store.executions(run.agentId).filter(execution => (concurrentCycleIds.length ? concurrentCycleIds : [result.cycle.id]).includes(execution.cycleId)) : [],
            parts: app.store.list('part', run.agentId), predictions: app.store.list('prediction', run.agentId),
            memories: app.store.list('memory', run.agentId), dispositions: app.store.list('disposition', run.agentId) });
          delete run.checkpoint;
          app.store.saveExperiment(run);
        });
        app.store.appendEvent(run.agentId, null, 'simulation.stage_completed', { runId: run.id, stageId, stageIndex, startEventId: started.id });
      } catch (error) {
        app.store.appendEvent(run.agentId, null, 'simulation.stage_failed', { runId: run.id, stageId, stageIndex, startEventId: started.id }); throw error;
      }
    }
    run.measures = measureSimulation(definition, run.stages); run.status = 'completed'; run.currentStep = 'Completed';
  } catch (error) {
    run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); run.currentStep = `Failed at ${run.currentStep}`;
  }
  if (sandboxId) {
    try {
      const cleanupProfile = app.store.executiveProfile(run.agentId);
      app.store.saveExecutiveProfile(run.agentId, { ...cleanupProfile, enabled: false, revision: cleanupProfile.revision + 1,
        attention: { ...cleanupProfile.attention, enabled: false } }, cleanupProfile.revision);
      const stopWorkers = async () => {
        const workers = app.store.executions(run.agentId).filter(execution => app.executiveWorkers.owns(run.agentId, execution.id));
        for (const execution of workers) app.executiveWorkers.cancel(run.agentId, execution.id);
        await Promise.all(workers.map(execution => app.executiveWorkers.wait(run.agentId, execution.id)));
        await app.waitForInference(run.agentId);
        return workers.length;
      };
      // A review already running when cleanup begins may finish its selected handoff; stop that local work too.
      const stopped = await stopWorkers() + await stopWorkers();
      run.executiveEvidence = { cleanup: stopped ? 'Researcher cleanup stopped remaining local workers; this is not a Self intervention or original-goal success.'
        : 'No local workers required researcher cleanup.', executions: app.store.executions(run.agentId) };
    } catch (error) { run.status = 'failed'; run.error = `Worker cleanup failed: ${error instanceof Error ? error.message : String(error)}`; }
    try {
      await app.executiveConnections.disconnect(sandboxId);
      const registry = app.store.mcpRegistry();
      app.store.saveMcpRegistry({ revision: registry.revision + 1, servers: registry.servers.filter(server => server.id !== sandboxId) }, registry.revision);
    } catch (error) { run.status = 'failed'; run.error = `${run.error ? run.error + '; ' : ''}Apparatus cleanup failed: ${error instanceof Error ? error.message : String(error)}`; }
  }
  if (run.dream) run.dream.after = structuredClone(dreamState(app.store, run.agentId));
  if (run.dream) workers(app.store).delete(run.id);
  run.finishedAt = now(); app.store.saveExperiment(run);
  try { saveSimulationCandidates(app.store, run.id); }
  catch (error) { run.researchAnalysisError = error instanceof Error ? error.message : String(error); app.store.saveExperiment(run); }
  if (run.status === 'completed' && run.evaluator?.enabled && simulationAssessmentAvailable(run)) {
    try { startSimulationAssessment(app, run.id, { ...(run.evaluator.model ? { model: run.evaluator.model } : {}) }); }
    catch (error) {
      // Setup errors stay separate from successful scenario execution.
      run.assessmentSetupError = error instanceof Error ? error.message : String(error); app.store.saveExperiment(run);
    }
  }
}
