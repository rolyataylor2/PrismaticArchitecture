import { DeliberationAnswerSchema, ProposalSchema, freeze, id, type Bid, type Contribution, type DeliberationMessage, type WorldState } from './domain.js';
import type { SelectedAffect } from './affect-domain.js';
import { InfrastructureError, type PartContext, type ReasoningProvider } from './contracts.js';
import type { Inspection } from './inspection.js';

/** Independent owning-Part revisions; validate the entire batch before publishing replacements. */
export async function reviseFocusedContributions(input: {
  world: WorldState; focus: SelectedAffect; contributions: Contribution[]; contexts: Map<string, PartContext>;
  reasoning: ReasoningProvider; inspection: Inspection; deliberation: DeliberationMessage[];
  history: Contribution[]; validateTargets: (targets: string[]) => void;
}) {
  const { world, focus, reasoning, inspection } = input;
  if (!reasoning.reviseFocusedBid) throw new InfrastructureError('focused_bid_revision', 'Reasoning provider lacks focused bid revision');
  const revise = reasoning.reviseFocusedBid.bind(reasoning);
  const availableContributors = input.contributions.map(c => ({ partId: c.partId, name: c.name }));
  const products = await Promise.all(input.contributions.filter(c => c.sourceKind !== 'primitive').map(async contribution => {
    const own = input.contexts.get(contribution.partId);
    if (!own || own.part.id !== contribution.partId || own.part.agentId !== world.agentId || own.world.id !== world.id)
      throw new InfrastructureError('focused_bid_revision', 'Missing owning-Part immutable context');
    const context = freeze({ ...own, world, currentBid: contribution.bid, selectedFocus: focus,
      availableContributors, expressed: { thought: contribution.thought, interpretation: contribution.interpretation,
        ...(contribution.affect !== undefined ? { affect: contribution.affect } : {}), evidenceSummary: [...contribution.evidenceSummary] } });
    inspection.emit(world.agentId, world.cycleId, 'part.focused_bid_revision_started', context);
    const response = DeliberationAnswerSchema.parse(await revise(context));
    if (response.new_bid?.type === 'deliberate') input.validateTargets(response.new_bid.target_parts);
    const navigationId = response.new_bid?.type === 'navigate' ? response.new_bid.stateId : null;
    if (navigationId && !world.experienced?.stanceHistory?.some(stance => stance.id === navigationId))
      throw new InfrastructureError('focused_bid_revision', 'Focused revision selected an unavailable stance');
    return { contribution, response };
  }));
  for (const { contribution, response } of products) {
    const previousBid = contribution.bid;
    if (response.bid_disposition === 'replace') {
      contribution.bid = { ...ProposalSchema.parse(response.new_bid), id: id('bid'), partId: contribution.partId,
        ...(previousBid ? { replacesBidId: previousBid.id } : {}) } as Bid;
      inspection.emit(world.agentId, world.cycleId, 'part.bid_created', contribution.bid);
    } else if (response.bid_disposition === 'withdraw') {
      contribution.bid = null;
      inspection.emit(world.agentId, world.cycleId, 'part.bid_withdrawn', { partId: contribution.partId, bidId: previousBid?.id ?? null });
    }
    inspection.emit(world.agentId, world.cycleId, 'part.focused_bid_revision', {
      partId: contribution.partId, focusId: focus.periodId, previousBid, resultingBid: contribution.bid, ...response });
    input.deliberation.push({ partId: contribution.partId,
      question: 'Reconsider my recommendation under the selected voluntary focus.', answer: response.response });
    input.history.push(structuredClone(contribution));
  }
}
