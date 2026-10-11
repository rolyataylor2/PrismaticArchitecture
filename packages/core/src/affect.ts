import { freeze, id, type Identity, type Contribution, type Prediction } from './domain.js';
import { InfrastructureError } from './contracts.js';
import { AffectBidSchema, AffectDecisionSchema, AffectFeedbackSchema, AffectSelectionSchema, SelectedAffectSchema,
  type AffectBid, type AffectFeedback, type AffectSelectionContext, type AffectDecision, type SelectedAffect } from './affect-domain.js';

/** Explicit projection, including for callers supplying wider runtime objects. */
function proposalProjection(proposal: AffectBid): AffectBid {
  return AffectBidSchema.parse({ id: proposal.id, partId: proposal.partId, name: proposal.name,
    orientation: proposal.orientation, motivation: proposal.motivation, reason: proposal.reason,
    expectedValue: proposal.expectedValue, supportingPredictionIds: [...proposal.supportingPredictionIds] });
}
function focusProjection(focus: SelectedAffect): SelectedAffect {
  return SelectedAffectSchema.parse({ periodId: focus.periodId, agentId: focus.agentId, threadId: focus.threadId,
    startedCycleId: focus.startedCycleId, renewedCycleId: focus.renewedCycleId,
    startedSequence: focus.startedSequence, renewedSequence: focus.renewedSequence,
    expiresAfterSequence: focus.expiresAfterSequence, proposals: focus.proposals.map(proposalProjection), reason: focus.reason });
}
function feedbackProjection(feedback: AffectFeedback): AffectFeedback {
  return AffectFeedbackSchema.parse(Object.fromEntries(Object.keys(AffectFeedbackSchema.shape)
    .map(key => [key, feedback[key as keyof AffectFeedback]])));
}

export function affectSelectionContext(input: {
  identity: Identity; contributions: Contribution[]; proposals: AffectBid[];
  currentFocus?: SelectedAffect | null; previousPeriodFeedback?: AffectFeedback | null;
  canDeliberate?: boolean;
}): AffectSelectionContext {
  const participants = new Map(input.contributions.map(c => [c.partId, c.name]));
  const proposals = input.proposals.map(proposalProjection);
  if (participants.size !== input.contributions.length || new Set(proposals.map(proposal => proposal.id)).size !== proposals.length
    || proposals.some(proposal => participants.get(proposal.partId) !== proposal.name)) {
    throw new InfrastructureError('affect_selection', 'Affect proposals require distinct IDs and participating owners');
  }
  const currentFocus = input.currentFocus ? focusProjection(input.currentFocus) : null;
  if (currentFocus && currentFocus.agentId !== input.identity.agentId) {
    throw new InfrastructureError('affect_selection', 'Selected focus belongs to another Agent');
  }
  return freeze({
    identity: { ...structuredClone(input.identity), traits: structuredClone(input.identity.traits.filter(trait => trait.role !== 'autobiographical')) },
    proposals, currentFocus,
    previousPeriodFeedback: input.previousPeriodFeedback ? feedbackProjection(input.previousPeriodFeedback) : null,
    availableContributors: [...participants].map(([partId, name]) => ({ partId, name })),
    canDeliberate: input.canDeliberate ?? true,
  });
}

/** Reproject at provider dispatch so wider caller objects cannot enter a Self prompt. */
export function projectAffectSelectionContext(context: AffectSelectionContext): AffectSelectionContext {
  return affectSelectionContext({ identity: context.identity, proposals: context.proposals,
    currentFocus: context.currentFocus, previousPeriodFeedback: context.previousPeriodFeedback,
    canDeliberate: context.canDeliberate,
    contributions: context.availableContributors.map(({ partId, name }) => ({ partId, name,
      thought: '', interpretation: '', evidenceSummary: [], prediction: null, bid: null })) });
}

/** One thread's completed-cognition ordinal, supplied by host; no global turn count. */
export function activeAffect(focus: SelectedAffect | null, agentId: string, threadId: string | null,
  sequence: number): SelectedAffect | null {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new InfrastructureError('affect_selection', 'Invalid thread cognition sequence');
  if (!focus) return null;
  const value = focusProjection(focus);
  if (value.agentId !== agentId || value.threadId !== threadId) {
    throw new InfrastructureError('affect_selection', 'Selected focus scope mismatch');
  }
  if (sequence < value.renewedSequence) throw new InfrastructureError('affect_selection', 'Cannot reuse focus before its recorded renewal');
  return sequence <= value.expiresAfterSequence ? value : null;
}

/** Validate a selection before host persistence, revision inference or external effects. */
export function decideAffect(input: {
  context: AffectSelectionContext; selection: unknown; cycleId: string; threadId: string | null;
  sequence: number; periodId?: string;
}): AffectDecision {
  const selection = AffectSelectionSchema.parse(input.selection);
  const agentId = input.context.identity.agentId;
  const previous = input.context.currentFocus;
  const current = activeAffect(previous, agentId, input.threadId, input.sequence);
  let resultingFocus = current;
  let endedPeriodId = previous && !current ? previous.periodId : null;
  let boundary: AffectDecision['boundary'] = endedPeriodId ? 'expired' : 'unchanged';
  if (selection.mode === 'select') {
    const proposals = selection.selectedProposalIds.map(proposalId => {
      const proposal = input.context.proposals.find(candidate => candidate.id === proposalId);
      if (!proposal) throw new InfrastructureError('affect_selection', 'Self selected an unavailable affect proposal');
      return proposalProjection(proposal);
    });
    const periodId = input.periodId ?? id('affect_period');
    if (periodId === previous?.periodId) throw new InfrastructureError('affect_selection', 'A new focus requires a new period ID');
    resultingFocus = { periodId, agentId, threadId: input.threadId,
      startedCycleId: input.cycleId, renewedCycleId: input.cycleId,
      startedSequence: input.sequence, renewedSequence: input.sequence,
      expiresAfterSequence: input.sequence + 1, proposals, reason: selection.reason };
    endedPeriodId = previous?.periodId ?? null;
    boundary = current ? 'switched' : 'started';
  } else if (selection.mode === 'maintain') {
    if (!current) throw new InfrastructureError('affect_selection', 'Cannot renew an absent or expired focus');
    resultingFocus = { ...current, renewedCycleId: input.cycleId, renewedSequence: input.sequence, expiresAfterSequence: input.sequence + 1 };
    boundary = 'renewed';
  } else if (selection.mode === 'deliberate') {
    const available = new Set(input.context.availableContributors.map(c => c.partId));
    if (selection.explorationRequest!.target_parts.some(target => !available.has(target))) {
      throw new InfrastructureError('affect_selection', 'Affect inquiry targets an unavailable contributor');
    }
    if (!endedPeriodId) boundary = 'inquiry';
  }
  return freeze(AffectDecisionSchema.parse({ cycleId: input.cycleId, agentId, threadId: input.threadId,
    sequence: input.sequence, selection, previousFocus: previous, resultingFocus, endedPeriodId, boundary }));
}

/** Counts only the supplied origin cohort; no causal or psychological conclusions. */
export function affectFeedback(input: {
  periodId: string; completedCycles: number; baselinePredictionIds: string[];
  originatedPredictionIds: string[]; predictions: Pick<Prediction, 'id' | 'status' | 'evaluation'>[];
}): AffectFeedback {
  const baseline = new Set(input.baselinePredictionIds);
  const originated = new Set(input.originatedPredictionIds);
  if ([...originated].some(predictionId => baseline.has(predictionId))) {
    throw new InfrastructureError('affect_feedback', 'Baseline predictions cannot also originate in this period');
  }
  const predictions = new Map(input.predictions.map(prediction => [prediction.id, prediction]));
  if (predictions.size !== input.predictions.length) throw new InfrastructureError('affect_feedback', 'Duplicate prediction snapshots');
  const counts = { supported: 0, contradicted: 0, partlySupported: 0, ambiguous: 0, selfInfluenced: 0,
    externalCircumstances: 0, interrupted: 0, notTestable: 0,
    unresolved: 0, untested: 0, abandoned: 0, expired: 0, invalidated: 0 };
  let resolved = 0;
  for (const predictionId of originated) {
    const prediction = predictions.get(predictionId);
    if (!prediction) throw new InfrastructureError('affect_feedback', 'Missing origin prediction evidence');
    if (prediction.status === 'open') { counts.unresolved++; counts.untested++; }
    else if (prediction.status === 'resolved') {
      resolved++;
      const assessment = prediction.evaluation?.assessment;
      if (assessment === 'confirmed') counts.supported++;
      else if (assessment === 'contradicted') counts.contradicted++;
      else if (assessment === 'partly_confirmed') counts.partlySupported++;
      else if (assessment === 'ambiguous') counts.ambiguous++;
      else if (assessment === 'self_influenced') counts.selfInfluenced++;
      else if (assessment === 'external_circumstances') counts.externalCircumstances++;
      else if (assessment === 'invalidated') { counts.invalidated++; counts.untested++; }
      else if (assessment === 'interrupted') { counts.interrupted++; counts.untested++; }
      else if (assessment === 'not_testable') { counts.notTestable++; counts.untested++; }
      else counts.untested++;
    }
    else if (prediction.status === 'abandoned') { counts.abandoned++; counts.untested++; }
    else if (prediction.status === 'expired') { counts.expired++; counts.untested++; }
    else if (prediction.status === 'invalidated') { counts.invalidated++; counts.untested++; }
    else counts.untested++;
  }
  const decisive = counts.supported + counts.contradicted;
  return freeze(AffectFeedbackSchema.parse({ periodId: input.periodId, completedCycles: input.completedCycles,
    baselinePredictions: baseline.size, originatedPredictions: originated.size, ...counts,
    resolvedFraction: originated.size ? resolved / originated.size : null,
    supportedFractionAmongDecisive: decisive ? counts.supported / decisive : null,
    learningProgress: 'unavailable', practicalValue: 'requires_part_interpretation' }));
}
