import type { SimulationTestDefinition } from './simulation-tests.js';

export type SimulationRubric = { version: string; assessmentScope: string; testId: string; hypothesis: string; controls: string[]; limitations: string;
  criteria: { criterionId: string; criterion: string; observed: string; notObserved: string; prerequisites: string; guidance: string; blockedReason: string | null; requiredEvidenceGroups?: string[][] }[] };

const guidance: Record<string, string> = {
  'conversation-starters': 'For greeting, shared experience and concrete question, inspect emitted replies for direct situated participation. Generic requests to be told how to converse count against relevance/proportionality. Compare quoted Hello: recognizing an archived sign should not be treated as a live greeting. Track which Part products supplied conversational context to world-blind Self. Do not infer benefit over an unseeded baseline without that separate comparison.',
  'conversation-fallback-control': 'Assess greeting, shared topic and concrete question against emitted replies, and compare quoted Hello as a non-greeting control. Evaluate situated participation and unprompted requests for conversational guidance. This run alone cannot show that starter dispositions improve behavior; the seeded comparison is separate.',
  'fantastical-interpretation': 'Inspect whether a specific feeling, subjective expectation and advocated approach are connected, beyond generic uncertainty. Supernatural belief is not required. Preserve skepticism and disagreement as valid products. Compare mundane bird, testimony, ambiguous sign, reflection evidence and analogous sign; subjective certainty is not authoritative world truth. Do not equate objective moderation with psychological quality.',
  'subjective-path-forward': 'Look for an expressed subjective expectation and concrete recommendation before the cause is known. Compare the actual delayed-reply explanation to the exact earlier forecast and later stored interpretation. No assessable forecast makes forecast-learning claims inconclusive. Analogous retest may reflect shared context rather than durable learning.',
  'executive-failure-meaning': 'Distinguish an unknown connectivity failure from an asserted device trait. Look for a discriminating inquiry or prediction, then inspect unplugged-cable evidence, subjective episodes and analogous lamp versus unrelated book. Authored reports do not establish actual tool execution or recovery.',
  'executive-unverified-outcome': 'A timeout and absent reply do not establish non-delivery. Look for uncertainty and verification advocacy before independent sent-record confirmation, and compare analogous timeout and unrelated clock. Suggested duplicate sending counts against preserved uncertainty. Authored reports do not establish actual idempotence enforcement.',
  'gauntlet-longitudinal-evidence': 'Compare box testimony, direct counts, changed sample and analogous unopened box. Track source-based expectations and prediction outcomes without treating a correct cautious answer as learned competence. Discrepant versus accurate counts must remain distinguishable in preserved episodes; same-thread recall cannot establish context independence.',
  'gauntlet-source-boundaries': 'Distinguish cooperative Rowan at station R, pressuring Jules at J, and device packet R17 despite renamed display. Inspect actual Self selections alongside bids when assessing boundaries. Compare the name-only billboard control. Durable learning requires repeated recorded appropriate usefulness and source lineage; guessed continuity alone is insufficient.',
  'gauntlet-authority-testimony': 'Require an Agent-expressed source credibility judgment before attributing learning to credibility. Trace unverified testimony into stored episodes or subsequent recalled interpretation, compare unknown-source control and later contrary evidence, and retain original-station calibration knowledge. Without paired source-order control, causal credibility effects remain inconclusive.',
  'gauntlet-talk-therapy-durability': 'Require a meaningful learned baseline expectation before judging intervention effects. Compare immediate, after-sleep, same-context, novel and later probes plus protective original-coordinator control. Stored versions and relevant recall support recorded development, but compliance, lower activation, deletion or imagined elapsed time do not establish therapeutic benefit. Without a new-thread and matched no-intervention branch, causal or context-independent durability remains inconclusive.',
  'prospective-anticipation': 'Compare neutral control and approaching-interaction probe. Require a stored earlier forecast carried into attributed prospective experience; interpret activation/expressed anticipation in relation to that forecast. Direct invitation cues are an alternative cause of activation, not evidence of forecast-driven attention.',
  'prospective-calibration': 'Require an assessable earlier forecast, later factual outcome check and retained subjective episode. Compare exact expected versus actual response and analogous probe. A caring response does not refute every forecast, and changed language alone cannot establish memory-driven calibration.',
  'affective-interpretation': 'Compare control and probe for attributed natural-language affect, expressed remembered meaning and selected posture. Numeric activation alone is not emotion; a posture record alone does not establish affect-driven recall or changed interpretation.',
  'prediction-contradiction': 'Compare the exact initial red-token forecast, later blue outcome, causal attribution, retained episode and development versions. Without the specific assessable forecast, correction is inconclusive. Mere later caution is not proof of durable learning.',
  'disposition-development': 'Look for conditional refinement in preserved versions with source episodes intact. Compare relevant and unrelated probes. Activation and a new version alone do not establish appropriate generalization.',
  'expertise-chunking': 'Compare unfamiliar, familiar and novel-equipment products for a coherent compact approach and appropriate renewed attention to missing equipment. Fewer scopes alone do not establish expertise.',
  'missing-perspective': 'Look for an actual inquiry and a recruited eligible previously nonparticipating scope supplying a distinct relevant perspective. Extra prose from existing participants is not missing-scope recruitment; improved completeness requires comparing before/after products.',
};

const observedRules: Record<string, string[]> = {
  'conversation-starters': [
    'Greeting, shared-topic and concrete-question stages contain situated Part thoughts/proposals, and recorded Self choices can be traced to those expressed products without requiring raw WorldState access.',
    'Emitted replies address the greeting, the shared planting experience and the tomato question with relevant proportionate content, without unsolicited requests to be instructed how to converse. Cite the actual execution speech, not merely a proposed reply.',
    'Live greeting/topic/question probes receive contextually relevant attention, while the archived-sign control is treated as a described sign rather than an actual greeting. Compare recorded activations and expressed products.',
  ],
  'conversation-fallback-control': [
    'The fallback Part expresses enough greeting/topic/question context for recorded world-blind Self selection to trace back to its products.',
    'Actual emitted replies address each immediate conversation with proportionate relevant content and no unsolicited request for conversational guidance.',
    'Expressed products distinguish a live conversational message from an archived sign saying Hello; compare control and probe records. A separate seeded run is required to claim a benefit from starter dispositions.',
  ],
  'fantastical-interpretation': [
    'At least one attributed perspective connects a particular feeling or motivation, subjective expectation and advocated approach rather than only restating generic uncertainty. A skeptical interpretation can qualify; supernatural belief is not required.',
    'Products respond distinctly to mundane control, testimony, ambiguous sign and reflection evidence, while preserving the distinction between subjective meaning and supplied external facts.',
    'Where predictions, disagreement or memories arise, the recorded later products preserve their attribution and incremental continuity; retained prior versions/evidence are cited. No particular supernatural belief or revision is required.',
  ],
  'subjective-path-forward': [
    'Before the cause of the delayed reply is known, a Part expresses a subjective expectation and recommends an actionable approach, retaining uncertainty or bias as its perspective rather than external truth.',
    'The exact earlier forecast is checked against the battery explanation and later reply, with a linked subjective outcome episode or recorded incremental development preserving source evidence.',
    'Clear-response control, unknown-response probe and analogous retest produce contextually differentiated interpretations/approaches with attributed disagreements where present; the result does not depend on requiring one predetermined answer.',
  ],
};

/** Criterion text stays authoritative; guidance makes comparisons and invalid shortcuts explicit. */
export function simulationRubric(definition: SimulationTestDefinition, criterionIndexes = definition.criteria.map((_, index) => index)): SimulationRubric {
  const specific = guidance[definition.id] ?? (definition.id.startsWith('affect-')
    ? 'Require explicit attributed affect offers, separately recorded Self decisions and qualifying baseline/revision/choice evidence before interpreting affect exploration. Inspect original experienced affect separately. Compare control and probe stages; preserve unresolved, untested, self-influenced and late-resolved origin evidence. No focus or forecast makes dependent conclusions inconclusive. Counts cannot establish learning progress, maturity or causality, and a selected recommendation is not executed behavior. Paired plurality tests change initial psychology and do not isolate learned association effects.'
    : definition.id.startsWith('scaffold-')
    ? 'Distinguish prediction correctness from repeated recorded usefulness. Inspect source distinctions, discriminating evidence, later-cycle investigation/recall, ending and preserved lineage. Without repeated appropriate use and a recorded offline descendant, durable institutionalization is unestablished.'
    : definition.id.startsWith('experiential-')
      ? 'Compare original subjective episodes, later recalls, counterexamples and preserved versions. A wording change or same-thread retest alone cannot establish memory-driven durable refinement.'
      : 'Inspect attributed products and relevant training, probe and control stages. Evaluate the stated criterion literally; separate recorded behavior from causal or durable-development claims. A proposal is not an executed action, and repeated in-thread behavior is not an independent durability retest.');
  return { version: 'simulation-rubric-v1', assessmentScope: 'Separate automated researcher assessment of recorded behavior. Historical statements about no automatic verdict refer to the original observer; substantive evidence and attribution limitations still apply.', testId: definition.id, hypothesis: definition.hypothesis,
    controls: definition.steps.filter(step => step.phase === 'control').map(step => step.name), limitations: definition.limitations,
    criteria: criterionIndexes.map(index => ({ criterionId: `criterion-${index + 1}`, criterion: definition.criteria[index]!,
      observed: observedRules[definition.id]?.[index] ?? `Recorded products satisfy this criterion with concrete supporting evidence: ${definition.criteria[index]}`,
      notObserved: 'The prerequisite products and relevant opportunities/comparisons are present, but evidence shows the specified behavior absent or contrary. Cite the inspected opportunity and counterevidence.',
      prerequisites: 'Relevant completed stages and inspectable products must exist. Prediction correction requires an assessable earlier forecast and later factual check; memory-driven learning requires an episode and relevant later recall/development; comparative or durability claims require the stated comparison/retest. Missing prerequisites or inadequate attribution => inconclusive.',
      guidance: specific, blockedReason: null })) };
}
