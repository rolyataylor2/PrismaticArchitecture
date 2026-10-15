import type { PrimitiveContext } from './primitives.js';
import { deduplicateActionBids } from './bid-pool.js';
import { ChoiceSchema, DeliberationAnswerSchema, AffectDeliberationAnswerSchema, DeliberationSchema, ProposalSchema, freeze, id,
  type ActionBid, type NavigationBid, type Bid, type Contribution, type DeliberationMessage, type Identity, type WorldState } from './domain.js';
import { InfrastructureError, type DecisionProvider, type PartContext, type ReasoningProvider, type PartInferenceRunner } from './contracts.js';
import { selfContext, selfChoices } from './context.js';
import type { Inspection } from './inspection.js';
import type { SelectedActivity } from './execution-review.js';
import { AffectChoiceSchema, type AffectDecision, type AffectFeedback, type SelectedAffect } from './affect-domain.js';
import { activeAffect, affectSelectionContext, decideAffect } from './affect.js';
import { reviseFocusedContributions } from './focused-revision.js';

export async function select(input: {
  commitments?: import('./commitments.js').SelectedCommitment[]; decisionCycleId?: string; world: WorldState; identity: Identity; contributions: Contribution[]; contexts: Map<string, PartContext>;
  primitiveContexts?: Map<string, PrimitiveContext>;
  decisions: DecisionProvider; reasoning: ReasoningProvider; inspection: Inspection; maxDeliberationRounds: number;
  onSelection?: (contributions: Contribution[]) => void;
  onNavigation?: (bid: NavigationBid) => void;
  ongoingActivity?: SelectedActivity;
  selectedFocus?: import('./affect-domain.js').SelectedAffect;
  affect?: { sequence: number; threadId: string | null; currentFocus: SelectedAffect | null;
    feedback: AffectFeedback | null; onDecision: (decision: AffectDecision) => void };
  onContinue?: () => void;
  runPartInference?: PartInferenceRunner;
  answerContext?: (context: PartContext, question: string) => Promise<PartContext>;
  afterDeliberation?: (contributions: Contribution[], deliberation: DeliberationMessage[], inquiry: { question: string; target_parts: string[] }) => Promise<void>;
}): Promise<ActionBid[] | null> {
  const { world, identity, decisions, reasoning, inspection, contexts } = input;
  const cycleId = input.decisionCycleId ?? world.cycleId;
  const contributions = structuredClone(input.contributions);
  const deliberation: DeliberationMessage[] = [];
  const contributionHistory = structuredClone(contributions);
  const inquiries: NonNullable<import('./domain.js').SelfContext['inquiries']> = [];
  let focus = input.selectedFocus ?? input.affect?.currentFocus ?? null;
  let affectPending = Boolean(input.affect);
  let baselineRecorded = false;
  const validateTargets = (targets: string[]) => {
    if (!targets.length || new Set(targets).size !== targets.length || targets.some(target => {
      const contribution = contributions.find(c => c.partId === target);
      return !contribution || (contribution.sourceKind === 'primitive' ? !input.primitiveContexts?.has(target) : !contexts.has(target));
    })) throw new InfrastructureError('self', 'Inquiry refers to unavailable or duplicate contributors');
  };
  for (let round = 0; round <= input.maxDeliberationRounds; round++) {
    let affectInquiry: import('./domain.js').Deliberation | undefined;
    if (affectPending && input.affect) {
      const options = input.affect;
      const proposals = contributions.flatMap(c => c.sourceKind !== 'primitive' ? c.affectProposals ?? [] : []);
      const expired = focus && !activeAffect(focus, world.agentId, options.threadId, options.sequence);
      const recordDecision = (decision: AffectDecision) => {
        inspection.emit(world.agentId, cycleId, 'self.affect_decision', decision);
        options.onDecision(decision); focus = decision.resultingFocus;
      };
      if (expired) recordDecision(decideAffect({ context: affectSelectionContext({ identity, contributions, proposals, currentFocus: focus }),
        cycleId: cycleId, threadId: options.threadId, sequence: options.sequence,
        selection: { mode: 'no_change', selectedProposalIds: [], reason: 'The recorded voluntary focus reached its completed-thread-cycle expiry.', explorationRequest: null } }));
      if (proposals.length || focus) {
        if (!baselineRecorded) {
          const baseline = selfContext(identity, contributions, deliberation, { ...(input.commitments?.length ? { commitments: input.commitments } : {}), contributionHistory, inquiries, completedDeliberationRounds: round,
            ...(input.ongoingActivity ? { ongoingActivity: input.ongoingActivity } : {}),
            ...(world.experienced ? { stanceHistory: world.experienced.stanceHistory ?? [] } : {}) });
          const choice = ChoiceSchema.parse(await decisions.choose(baseline));
          if (!selfChoices(baseline).includes(choice.choice) || choice.selectedBidIds?.some(bidId => !contributions.some(c => c.bid?.id === bidId)))
            throw new InfrastructureError('self', 'Baseline evaluation selected an unavailable proposal');
          inspection.emit(world.agentId, cycleId, 'self.affect_baseline', { context: baseline, choice });
          baselineRecorded = true;
        }
        if (!decisions.chooseAffect) throw new InfrastructureError('affect_selection', 'Decision provider lacks affect selection');
        const affectContext = affectSelectionContext({ identity, contributions, proposals, currentFocus: focus,
          previousPeriodFeedback: options.feedback, canDeliberate: round < input.maxDeliberationRounds });
        inspection.emit(world.agentId, cycleId, 'self.affect_selection_started', affectContext);
        const choice = AffectChoiceSchema.parse(await decisions.chooseAffect(affectContext));
        inspection.emit(world.agentId, cycleId, 'self.affect_choice', choice);
        if (choice.mode === 'deliberate') {
          if (!affectContext.canDeliberate) throw new InfrastructureError('affect_selection', 'Affect inquiry exceeds the ordinary deliberation budget');
          if (!reasoning.affectInquiry) throw new InfrastructureError('affect_selection', 'Reasoning provider lacks affect inquiry');
          inspection.emit(world.agentId, cycleId, 'self.affect_inquiry_started', affectContext);
          affectInquiry = DeliberationSchema.parse(await reasoning.affectInquiry(affectContext));
          validateTargets(affectInquiry.target_parts);
          const { scores: _scores, ...selection } = choice;
          recordDecision(decideAffect({ context: affectContext, cycleId: cycleId, threadId: options.threadId, sequence: options.sequence,
            selection: { ...selection, explorationRequest: { target_parts: affectInquiry.target_parts, question: affectInquiry.question } } }));
        } else {
          const { scores: _scores, ...selection } = choice;
          recordDecision(decideAffect({ context: affectContext, cycleId: cycleId, threadId: options.threadId, sequence: options.sequence,
            selection: { ...selection, explorationRequest: null } }));
          affectPending = false;
          if (focus) await reviseFocusedContributions({ world, cycleId, focus, contributions, contexts, reasoning, inspection,
            deliberation, history: contributionHistory, validateTargets, ...(input.runPartInference ? { runPartInference: input.runPartInference } : {}) });
        }
      } else affectPending = false;
    }
    deduplicateActionBids(contributions);
    const context = selfContext(identity, contributions, deliberation, { ...(input.commitments?.length ? { commitments: input.commitments } : {}), contributionHistory, inquiries, completedDeliberationRounds: round,
      ...(input.ongoingActivity ? { ongoingActivity: input.ongoingActivity } : {}),
      ...(focus ? { selectedFocus: focus } : {}),
      ...(world.experienced ? { stanceHistory: world.experienced.stanceHistory ?? [] } : {}) });
    let selected: Bid | undefined;
    if (!affectInquiry) {
      inspection.emit(world.agentId, cycleId, 'self.arbitration_started', context);
      const choice = ChoiceSchema.parse(await decisions.choose(context));
      selected = contributions.find(c => c.bid?.id === choice.choice)?.bid ?? undefined;
      if (!selfChoices(context).includes(choice.choice)) throw new InfrastructureError('self', 'Self selected an option not proposed by an available contribution');
      inspection.emit(world.agentId, cycleId, 'self.choice', choice);
      if (choice.choice === 'CONTINUE_EXECUTION') {
        if (choice.selectedBidIds?.length) throw new InfrastructureError('self', 'Continuation must exclusively retain the selected activity');
        input.onSelection?.(contributions); input.onContinue?.(); return null;
      }
      if (choice.choice === 'NOTHING') { input.onSelection?.(contributions); return null; }
      if (selected?.type === 'navigate') {
        const stateId = selected.stateId;
        if ((choice.selectedBidIds && (choice.selectedBidIds.length !== 1 || choice.selectedBidIds[0] !== selected.id))
          || !context.stanceHistory?.some(record => record.id === stateId))
          throw new InfrastructureError('self', 'Navigation must exclusively select an available mediated stance');
        input.onSelection?.(contributions);
        input.onNavigation?.(selected);
        return null;
      }
      if (selected && selected.type !== 'deliberate') {
        const ids = choice.selectedBidIds ?? [selected.id];
        if (!ids.length || ids[0] !== selected.id || new Set(ids).size !== ids.length) throw new InfrastructureError('self', 'Invalid selected bid set');
        input.onSelection?.(contributions);
        return ids.map(bidId => {
          const bid = contributions.find(c => c.bid?.id === bidId)?.bid;
          if (!bid || bid.type === 'deliberate' || bid.type === 'navigate') throw new InfrastructureError('self', 'Unavailable external bid in selected set');
          return bid;
        });
      }
    }
    if (round === input.maxDeliberationRounds || !contributions.length) { input.onSelection?.(contributions); return null; }
    inspection.emit(world.agentId, cycleId, 'self.deliberation_started', { round: round + 1, sourceBidId: selected?.id ?? null });
    let inquiry: { target_parts: string[]; question: string };
    if (affectInquiry) {
      inspection.emit(world.agentId, cycleId, 'self.deliberation_planned', affectInquiry);
      inquiries.push({ ...affectInquiry, sourceBidId: null }); inquiry = affectInquiry;
    } else if (selected?.type === 'deliberate') {
      inquiries.push({ question: selected.question, target_parts: [...selected.target_parts], sourceBidId: selected.id });
      inquiry = selected; // Preserve the proposing Part's intention; no Self reinterpretation.
    } else {
      const plan = DeliberationSchema.parse(await reasoning.question(context));
      validateTargets(plan.target_parts);
      inspection.emit(world.agentId, cycleId, 'self.deliberation_planned', plan);
      inquiries.push({ ...plan, sourceBidId: null });
      inquiry = plan;
    }
    // Validate every target before routing any question or mutating a current bid.
    validateTargets(inquiry.target_parts);
    for (const target of inquiry.target_parts) {
      const contribution = contributions.find(c => c.partId === target)!;
      const question = { partId: target, question: inquiry.question };
      inspection.emit(world.agentId, cycleId, 'self.question', question);
      const mediated = deliberation.map(message => ({ ...message }));
      let response;
      let responseSource: import('./contracts.js').InferenceSource | undefined;
      if (contribution.sourceKind === 'primitive') {
        const primitive = input.primitiveContexts!.get(target)!;
        if (!reasoning.primitiveAnswer) throw new InfrastructureError('self', 'Primitive deliberation provider unavailable');
        response = DeliberationAnswerSchema.parse(await reasoning.primitiveAnswer(freeze({ ...primitive,
          currentBid: contribution.bid, deliberation: mediated }), inquiry.question));
        if (primitive.primitive.bidsEnabled === false) {
          response.bid_disposition = 'retain';
          response.new_bid = null;
        }
        if (response.new_bid && (response.new_bid.type === 'deliberate' || response.new_bid.type === 'navigate' || response.new_bid.executionOrder.length)) {
          throw new InfrastructureError('self', 'Primitive bids must remain basic external actions');
        }
        inspection.emit(world.agentId, cycleId, 'primitive.deliberation_response', { primitiveId: target, ...response });
      } else {
        const original = contexts.get(target)!;
        const run = async () => {
          const part = input.answerContext ? await input.answerContext(original, inquiry.question) : original;
          const raw = await reasoning.answer(freeze({ ...part,
            currentBid: contribution.bid, currentAffectProposals: contribution.affectProposals ?? [],
            ...(focus ? { selectedFocus: focus } : {}),
            deliberation: mediated, availableContributors: contributions.map(c => ({ partId: c.partId, name: c.name })) }), inquiry.question);
          return { part, response: AffectDeliberationAnswerSchema.parse(raw), source: reasoning.sourceFor?.(raw) };
        };
        const answered = input.runPartInference ? await input.runPartInference(original, run) : await run();
        if (!answered) continue;
        const { part } = answered; response = answered.response; responseSource = answered.source;
        if (response.new_bid?.type === 'deliberate') validateTargets(response.new_bid.target_parts);
        if (response.affectProposals !== undefined) {
          if (response.affectProposals.some(proposal => proposal.supportingPredictionIds.some(predictionId => predictionId !== part.prediction?.id)))
            throw new InfrastructureError('self', 'Affect inquiry response cited an unavailable owning-Part prediction');
          contribution.affectProposals = response.affectProposals.map(proposal => ({ ...proposal, id: id('affect_bid'), partId: target, name: contribution.name }));
          inspection.emit(world.agentId, cycleId, 'part.affect_proposals', { partId: target, proposals: contribution.affectProposals });
        }
        inspection.emit(world.agentId, cycleId, 'part.deliberation_response', { partId: target, ...response });
      }
      deliberation.push({ ...question, answer: response.response });
      const previous = contribution.bid;
      if (response.bid_disposition === 'replace') {
        contribution.bid = { ...ProposalSchema.parse(response.new_bid), id: id('bid'), partId: target,
          ...(contribution.sourceKind ? { sourceKind: contribution.sourceKind } : {}),
          ...(previous ? { replacesBidId: previous.id } : {}) } as Bid;
        if (contribution.sourceKind === 'primitive') inspection.emit(world.agentId, cycleId, 'primitive.bid_created', contribution.bid);
        else {
          inspection.emit(world.agentId, cycleId, 'part.bid_created', contribution.bid);
          if (responseSource) inspection.emit(world.agentId, cycleId, 'cognition.bid_source', { bidId: contribution.bid.id, partId: target, inferenceSource: responseSource });
        }
      } else if (response.bid_disposition === 'withdraw') {
        contribution.bid = null;
        if (contribution.sourceKind === 'primitive') inspection.emit(world.agentId, cycleId, 'primitive.bid_withdrawn', { primitiveId: target, bidId: previous?.id ?? null });
        else inspection.emit(world.agentId, cycleId, 'part.bid_withdrawn', { partId: target, bidId: previous?.id ?? null });
      }
      contributionHistory.push(structuredClone(contribution));
      // retain preserves the original record and ID, including an absent bid.
    }
    const before = new Map(contributions.map(c => [c.partId, JSON.stringify(c)]));
    await input.afterDeliberation?.(contributions, deliberation, inquiry);
    for (const contribution of contributions) if (before.get(contribution.partId) !== JSON.stringify(contribution)) contributionHistory.push(structuredClone(contribution));
  }
  return null;
}
