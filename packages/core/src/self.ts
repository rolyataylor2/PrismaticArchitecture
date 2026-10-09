import type { PrimitiveContext } from './primitives.js';
import { ChoiceSchema, DeliberationAnswerSchema, DeliberationSchema, ProposalSchema, freeze, id,
  type ActionBid, type NavigationBid, type Bid, type Contribution, type DeliberationMessage, type Identity, type WorldState } from './domain.js';
import { InfrastructureError, type DecisionProvider, type PartContext, type ReasoningProvider } from './contracts.js';
import { selfContext, selfChoices } from './context.js';
import type { Inspection } from './inspection.js';
import type { SelectedActivity } from './execution-review.js';

export async function select(input: {
  world: WorldState; identity: Identity; contributions: Contribution[]; contexts: Map<string, PartContext>;
  primitiveContexts?: Map<string, PrimitiveContext>;
  decisions: DecisionProvider; reasoning: ReasoningProvider; inspection: Inspection; maxDeliberationRounds: number;
  onSelection?: (contributions: Contribution[]) => void;
  onNavigation?: (bid: NavigationBid) => void;
  ongoingActivity?: SelectedActivity;
  onContinue?: () => void;
  answerContext?: (context: PartContext, question: string) => Promise<PartContext>;
  afterDeliberation?: (contributions: Contribution[], deliberation: DeliberationMessage[]) => Promise<void>;
}): Promise<ActionBid[] | null> {
  const { world, identity, decisions, reasoning, inspection, contexts } = input;
  const contributions = structuredClone(input.contributions);
  const deliberation: DeliberationMessage[] = [];
  const contributionHistory = structuredClone(contributions);
  const inquiries: NonNullable<import('./domain.js').SelfContext['inquiries']> = [];
  const validateTargets = (targets: string[]) => {
    if (!targets.length || new Set(targets).size !== targets.length || targets.some(target => {
      const contribution = contributions.find(c => c.partId === target);
      return !contribution || (contribution.sourceKind === 'primitive' ? !input.primitiveContexts?.has(target) : !contexts.has(target));
    })) throw new InfrastructureError('self', 'Inquiry refers to unavailable or duplicate contributors');
  };
  for (let round = 0; round <= input.maxDeliberationRounds; round++) {
    const context = selfContext(identity, contributions, deliberation, { contributionHistory, inquiries, completedDeliberationRounds: round,
      ...(input.ongoingActivity ? { ongoingActivity: input.ongoingActivity } : {}),
      ...(world.experienced ? { stanceHistory: world.experienced.stanceHistory ?? [] } : {}) });
    inspection.emit(world.agentId, world.cycleId, 'self.arbitration_started', context);
    const choice = ChoiceSchema.parse(await decisions.choose(context));
    const selected = contributions.find(c => c.bid?.id === choice.choice)?.bid;
    if (!selfChoices(context).includes(choice.choice)) throw new InfrastructureError('self', 'Self selected an option not proposed by an available contribution');
    inspection.emit(world.agentId, world.cycleId, 'self.choice', choice);
    if (choice.choice === 'CONTINUE_EXECUTION') {
      if (choice.selectedBidIds?.length) throw new InfrastructureError('self', 'Continuation must exclusively retain the selected activity');
      input.onSelection?.(contributions); input.onContinue?.(); return null;
    }
    if (choice.choice === 'NOTHING') { input.onSelection?.(contributions); return null; }
    if (selected?.type === 'navigate') {
      if ((choice.selectedBidIds && (choice.selectedBidIds.length !== 1 || choice.selectedBidIds[0] !== selected.id))
        || !context.stanceHistory?.some(record => record.id === selected.stateId))
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
    if (round === input.maxDeliberationRounds || !contributions.length) { input.onSelection?.(contributions); return null; }
    inspection.emit(world.agentId, world.cycleId, 'self.deliberation_started', { round: round + 1, sourceBidId: selected?.id ?? null });
    let inquiry: { target_parts: string[]; question: string };
    if (selected?.type === 'deliberate') {
      inquiries.push({ question: selected.question, target_parts: [...selected.target_parts], sourceBidId: selected.id });
      inquiry = selected; // Preserve the proposing Part's intention; no Self reinterpretation.
    } else {
      const plan = DeliberationSchema.parse(await reasoning.question(context));
      validateTargets(plan.target_parts);
      inspection.emit(world.agentId, world.cycleId, 'self.deliberation_planned', plan);
      inquiries.push({ ...plan, sourceBidId: null });
      inquiry = plan;
    }
    // Validate every target before routing any question or mutating a current bid.
    validateTargets(inquiry.target_parts);
    for (const target of inquiry.target_parts) {
      const contribution = contributions.find(c => c.partId === target)!;
      const question = { partId: target, question: inquiry.question };
      inspection.emit(world.agentId, world.cycleId, 'self.question', question);
      const mediated = deliberation.map(message => ({ ...message }));
      let response;
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
        inspection.emit(world.agentId, world.cycleId, 'primitive.deliberation_response', { primitiveId: target, ...response });
      } else {
        const original = contexts.get(target)!;
        const part = input.answerContext ? await input.answerContext(original, inquiry.question) : original;
        response = DeliberationAnswerSchema.parse(await reasoning.answer(freeze({ ...part,
          currentBid: contribution.bid, deliberation: mediated, availableContributors: contributions.map(c => ({ partId: c.partId, name: c.name })) }), inquiry.question));
        if (response.new_bid?.type === 'deliberate') validateTargets(response.new_bid.target_parts);
        inspection.emit(world.agentId, world.cycleId, 'part.deliberation_response', { partId: target, ...response });
      }
      deliberation.push({ ...question, answer: response.response });
      const previous = contribution.bid;
      if (response.bid_disposition === 'replace') {
        contribution.bid = { ...ProposalSchema.parse(response.new_bid), id: id('bid'), partId: target,
          ...(contribution.sourceKind ? { sourceKind: contribution.sourceKind } : {}),
          ...(previous ? { replacesBidId: previous.id } : {}) } as Bid;
        if (contribution.sourceKind === 'primitive') inspection.emit(world.agentId, world.cycleId, 'primitive.bid_created', contribution.bid);
        else inspection.emit(world.agentId, world.cycleId, 'part.bid_created', contribution.bid);
      } else if (response.bid_disposition === 'withdraw') {
        contribution.bid = null;
        if (contribution.sourceKind === 'primitive') inspection.emit(world.agentId, world.cycleId, 'primitive.bid_withdrawn', { primitiveId: target, bidId: previous?.id ?? null });
        else inspection.emit(world.agentId, world.cycleId, 'part.bid_withdrawn', { partId: target, bidId: previous?.id ?? null });
      }
      contributionHistory.push(structuredClone(contribution));
      // retain preserves the original record and ID, including an absent bid.
    }
    const before = new Map(contributions.map(c => [c.partId, JSON.stringify(c)]));
    await input.afterDeliberation?.(contributions, deliberation);
    for (const contribution of contributions) if (before.get(contribution.partId) !== JSON.stringify(contribution)) contributionHistory.push(structuredClone(contribution));
  }
  return null;
}
