import type { SimulationTestDefinition } from './simulation-tests.js';

const source = 'https://chatgpt.com/share/6acaa14a-54f8-83e8-a9b2-0d6a4004d945';
const limitations = 'Fresh isolated Agents; seeds and external experiences are explicit researcher starting conditions. Normal activation, recall, generation, affect proposals, selection, prediction checks and learning are never prescribed. Baseline arbitration enacts nothing and is not an independent causal control; carried focus may already inform the same immutable snapshot. Missing offers, forecasts, selection or relevant comparisons make dependent conclusions inconclusive. Fixture/mixed runs verify harness behavior only. Configured-model observations require semantic review and cannot prove human psychology. Selected recommendations differ from externally executed actions; the Executive remains disconnected.';
const pipeline = 'Explicit affect proposals and separately recorded first-pass selection precede focused bid revision and behavioral choice when a focus is selected.';
const boundary = { name: 'Need For Dignity', concern: 'Notice whether keeping our boundaries and dignity serves us when someone pressures or dismisses us', cues: ['repeated pressure or dismissal of an agreed boundary'], scope: 'interpersonal boundaries' };
const care = { name: 'Need For Connection', concern: 'Notice possibilities for connection and repair while respecting our needs and the other person', cues: ['shared relationship, repair or an invitation to reconnect'], scope: 'relationships' };
const inquiry = { name: 'Need To Understand', concern: 'Notice consequential uncertainty and explanations we have not tested before drawing conclusions', cues: ['incomplete causal evidence or competing explanations'], scope: 'uncertain explanations' };

export const affectSimulations: SimulationTestDefinition[] = [
  { id: 'affect-instrumental-unpleasant', title: 'Unpleasant focus can serve boundaries', source,
    hypothesis: 'An unpleasant or mixed affect orientation can support protection or repair without being rewritten as pleasantness or commanding an aggressive action.',
    seeds: [boundary, care], limitations, criteria: [pipeline,
      'Compare ordinary control, repeated-pressure probe and repair evidence for an attributed protective or mixed focus with meaningful reasons.',
      'Inspect whether final Self choice may reject a focus-favored aggressive approach while retaining the concern; original experienced affect stays separate.'],
    steps: [
      { name: 'Respected-boundary control', phase: 'control', text: 'A colleague asked to borrow a notebook, accepted a refusal and used their own notes. The conversation continued normally.' },
      { name: 'Repeated pressure', phase: 'training', text: 'Another colleague repeatedly requested the private notebook after a refusal and said the refusal was selfish. The notebook has not been handed over.' },
      { name: 'Opportunity to respond', phase: 'probe', text: 'The colleague asks again. There is time to respond, and no immediate physical danger. Other notes are available.' },
      { name: 'Repair evidence', phase: 'training', text: 'The colleague apologizes for the repeated pressure, accepts the refusal and asks whether discussing public notes would be welcome.' },
      { name: 'Repair probe', phase: 'probe', text: 'The colleague waits for a reply without repeating the request for private material.' },
    ] },
  { id: 'affect-meaningful-retention', title: 'Meaningful sadness without new learning', source,
    hypothesis: 'A perspective may remain worth exploring or acknowledging for care and remembrance even when the external uncertainty is resolved and little new learning is available.',
    seeds: [{ name: 'Need To Remember', concern: 'Notice meaningful losses and opportunities to honor enduring relationships rather than demanding productivity from them', cues: ['meaningful loss, remembrance or shared rituals'], scope: 'remembering relationships' }, care], limitations,
    criteria: [pipeline, 'Compare neutral control and resolved-loss/ritual probes for an attributed meaningful focus rather than mandatory pleasantness or learning.',
      'Inspect renewal or no-change reasons and distinguish meaningful retention from a claim that confirmed predictions prove the appraisal or maturity.'],
    steps: [
      { name: 'Neutral scheduling control', phase: 'control', text: 'A public meeting moved from Tuesday to Wednesday. Everyone received the notice; no unresolved scheduling question remains.' },
      { name: 'Known loss', phase: 'training', text: 'A close acquaintance reports that an old friend died after a long illness. The report is confirmed. The acquaintance wants to remember shared afternoons together.' },
      { name: 'Acknowledgment opportunity', phase: 'probe', text: 'The acquaintance says the facts of the loss are settled and offers to share a favorite memory. They are not asking for a solution.' },
      { name: 'Ritual comparison', phase: 'probe', text: 'The acquaintance invites a quiet annual remembrance. No new factual discovery or practical problem is expected.' },
      { name: 'Ordinary later activity', phase: 'control', text: 'A separate conversation concerns watering a plant before leaving for the afternoon.' },
    ] },
  { id: 'affect-competing-lenses', title: 'Competing and complementary affect proposals', source,
    hypothesis: 'World-blind Self can compare explicit competing lenses, ask discriminating questions and choose at most two complementary orientations independently of owner activation, while retaining behavioral authority.',
    seeds: [boundary, care, inquiry], limitations, criteria: [pipeline,
      'Inspect all available offers and recorded scores for competing versus distinct complementary value; selection is not normalized by activation.',
      'Compare pre-revision baseline and revised proposals, inquiry answers and final Self choice without treating a changed recommendation as causal improvement.'],
    steps: [
      { name: 'Clear-message control', phase: 'control', text: 'A friend clearly explains they will arrive tomorrow and asks whether that time works. No conflicting message is known.' },
      { name: 'Conflicting messages', phase: 'training', text: 'A friend promised to attend, then sent a short message saying they might not come. A mutual acquaintance says they saw the friend laughing elsewhere, but provides no time or context.' },
      { name: 'Ambiguous opportunity', phase: 'probe', text: 'There is an opportunity to reply. The reason for the changed plan and the time of the reported sighting remain unknown.' },
      { name: 'Discriminating evidence', phase: 'training', text: 'The friend explains a family emergency began after the gathering in the sighting. A timestamp independently places that gathering before the emergency.' },
      { name: 'Reconsideration', phase: 'probe', text: 'The friend asks to reschedule. Their earlier promise and the later timestamp both remain part of the record.' },
    ] },
  { id: 'affect-expiry-renewal', title: 'Focus lifetime and meaningful renewal', source,
    hypothesis: 'Temporary focus can expire without automatic renewal, or be explicitly renewed for recorded reasons; changing experience does not require one permanent emotional posture.',
    seeds: [inquiry, care], limitations, criteria: [pipeline,
      'Inspect completed-cycle start/renew/no-change/expiry boundaries and selecting-plus-next-cycle lifetime; do not infer a renewal from repeated affect prose.',
      'Compare unresolved inquiry with later resolved and unrelated controls; navigation, if selected, retains experience and history while ending voluntary focus.'],
    steps: [
      { name: 'Ordinary control', phase: 'control', text: 'The library is open at its posted hours. The notice is current.' },
      { name: 'Consequential unknown', phase: 'training', text: 'A friend has not arrived for an agreed meeting. No message explains the delay, and their route is unknown.' },
      { name: 'Still open', phase: 'probe', text: 'No new message has arrived. There is time to check whether the meeting place or arrival plan changed.' },
      { name: 'Resolution', phase: 'training', text: 'The friend arrives and explains that a train stopped. The station log confirms the disruption during the relevant journey.' },
      { name: 'First unrelated comparison', phase: 'control', text: 'A public display lists three books available to borrow.' },
      { name: 'Second unrelated comparison', phase: 'control', text: 'A librarian confirms those books are on the shelf and the catalog is current.' },
      { name: 'Available remembered lens', phase: 'probe', text: 'In a new uncertain conversation, an acquaintance invites reconsidering an earlier open approach while keeping the train disruption and later facts in mind.' },
    ] },
  { id: 'affect-disconfirmation', title: 'Confirmation, self-caused evidence and alternatives', source,
    hypothesis: 'A selected lens can remain fallible: confirming observations, avoided tests and responses influenced by our own approach do not establish understanding or generalization.',
    seeds: [boundary, inquiry, care], limitations, criteria: [pipeline,
      'Inspect exact forecasts, later factual checks, origin cohorts, baseline predictions and self-influenced/untested outcomes; absence of failures is not validation.',
      'Compare supported testimony, explicit counterevidence and a discriminating opportunity for competing explanations, without automatic disposition maturity or a fabricated learning-progress score.'],
    steps: [
      { name: 'Clear cooperation control', phase: 'control', text: 'A colleague agrees to a concrete request and completes it at the agreed time.' },
      { name: 'Selective testimony', phase: 'training', text: 'An acquaintance claims a new colleague always dismisses requests. They supply one example but omit its date and circumstances.' },
      { name: 'Untested possibility', phase: 'probe', text: 'The new colleague is present, but no request has been made. There is no direct evidence about how they would respond now.' },
      { name: 'Counterevidence', phase: 'training', text: 'An independent record shows the colleague completed a comparable request yesterday. The earlier example involved an emergency deadline.' },
      { name: 'Action-conditioned evidence', phase: 'training', text: 'An external observer reports that an accusatory question received a defensive answer, while a separate neutral question about availability received a concrete explanation. These are external reports, not actions performed by this Agent.' },
      { name: 'Discriminating opportunity', phase: 'probe', text: 'The colleague offers to clarify availability for a specific request. No response to that request has occurred yet.' },
    ] },
  { id: 'affect-generalization', title: 'Specific reliability versus transferable understanding', source,
    hypothesis: 'Reliable expectations within one relationship do not establish transferable understanding, while a perspective may remain useful despite limited learning progress.',
    seeds: [boundary, care, inquiry], limitations, criteria: [pipeline,
      'Trace expectations and later outcomes separately for the original and novel relationship; unresolved and untested predictions remain visible.',
      'Inspect whether novel-context uncertainty invites discriminating inquiry rather than inferred mastery, automatic personality rewriting or universal confidence.'],
    steps: [
      { name: 'Original context', phase: 'training', text: 'Rowan regularly replies to clear scheduling questions with concrete times, and does so again today.' },
      { name: 'Original probe', phase: 'probe', text: 'Rowan receives another scheduling question. Their response has not arrived yet.' },
      { name: 'Original outcome', phase: 'training', text: 'Rowan supplies a concrete time for that question.' },
      { name: 'Novel-context probe', phase: 'probe', text: 'A new acquaintance, Jules, receives a scheduling question. Their preferences and response history are unknown.' },
      { name: 'Different outcome', phase: 'training', text: 'Jules asks to defer scheduling until their shift is confirmed. No exact time is supplied.' },
      { name: 'Retained competence control', phase: 'control', text: 'Rowan again supplies a concrete time when asked. Jules remains a distinct acquaintance with a different work schedule.' },
    ] },
];

// Matched external experiences with explicitly different initial plurality; no association updates are forced.
const relationshipSteps: SimulationTestDefinition['steps'] = [
  { name: 'Neutral control', phase: 'control', text: 'A familiar public notice accurately lists a shop opening time.' },
  { name: 'Shared challenge', phase: 'training', text: 'A friend proposes exploring an unfamiliar place together but acknowledges uncertainty about transport and available time.' },
  { name: 'Negotiated opportunity', phase: 'probe', text: 'The friend is interested in trying something new while preserving time for a later commitment. Several routes remain possible.' },
  { name: 'Later external outcome', phase: 'training', text: 'An external report records that a short exploratory route allowed a shared visit and return before the later commitment. This is not an outcome of any unexecuted Agent recommendation.' },
  { name: 'Consolidate ordinary traces', phase: 'training', sleep: true },
  { name: 'Analogous opportunity', phase: 'probe', text: 'Another friend suggests an unfamiliar activity with uncertain travel time and an agreed later commitment.' },
];
for (const combined of [false, true]) affectSimulations.push({
  id: combined ? 'affect-relational-plurality' : 'affect-relational-single-control',
  title: combined ? 'Plurality and learned relational personality' : 'Single-concern relational comparison', source,
  hypothesis: 'Patterns among persistent concerns may contribute to emerging behavior beyond an individual disposition, while adaptation preserves enduring Identity and developmental lineage.',
  seeds: combined ? [care, inquiry, { name: 'Need For Reliability', concern: 'Notice how keeping commitments can serve us alongside exploration and connection', cues: ['an agreed commitment alongside uncertain plans'], scope: 'shared plans' }] : [care],
  steps: relationshipSteps, limitations: limitations + ' These paired tests change the authored starting disposition population. Their comparison does not isolate learned associations as a cause; multiple runs with matched conditions and recorded offline association changes would be needed. No durable personality difference is inferred from a single mixed-focus choice.',
  criteria: [pipeline, 'Compare coactivation, attributed offers and selected recommendations across the paired fresh-Agent starting conditions.',
    'Inspect recalled subjective episodes, offline versions and analogous responses for preserved Identity and lineage; distinguish immediate plurality from evidence of learned relational development.'],
});
