import { DeliberationAnswerSchema, ProposalSchema, freeze, id, type Bid, type Contribution, type DeliberationMessage, type WorldState } from './domain.js';
import type { SelectedAffect } from './affect-domain.js';
import { InfrastructureError, type PartContext, type ReasoningProvider, type PartInferenceRunner } from './contracts.js';
import type { Inspection } from './inspection.js';
import { validateActionSpace } from './embodied-action.js';

/** Independent owning-Part revisions; validate the entire batch before publishing replacements. */
export async function reviseFocusedContributions(input: {
  runPartInference?: PartInferenceRunner; cycleId?: string; world: WorldState; focus: SelectedAffect; contributions: Contribution[]; contexts: Map<string, PartContext>;
  reasoning: ReasoningProvider; inspection: Inspection; deliberation: DeliberationMessage[];
  history: Contribution[]; validateTargets: (targets: string[]) => void;
}) {
  const { world, focus, reasoning, inspection } = input;
  const cycleId = input.cycleId ?? world.cycleId;
  if (!reasoning.reviseFocusedBid) throw new InfrastructureError('focused_bid_revision', 'Reasoning provider lacks focused bid revision');
  const revise = reasoning.reviseFocusedBid.bind(reasoning);
  const availableContributors = input.contributions.map(c => ({ partId: c.partId, name: c.name }));
  const products = await Promise.all(input.contributions.filter(c => c.sourceKind !== 'primitive' && input.contexts.get(c.partId)?.world.id === world.id).map(async contribution => {
    const own = input.contexts.get(contribution.partId);
    if (!own || own.part.id !== contribution.partId || own.part.agentId !== world.agentId || own.world.id !== world.id)
      throw new InfrastructureError('focused_bid_revision', 'Missing owning-Part immutable context');
    const context = freeze({ ...own, world, currentBid: contribution.bid, selectedFocus: focus,
      availableContributors, expressed: { thought: contribution.thought, interpretation: contribution.interpretation,
        ...(contribution.affect !== undefined ? { affect: contribution.affect } : {}), evidenceSummary: [...contribution.evidenceSummary] } });
    const run = async () => {
      inspection.emit(world.agentId, cycleId, 'part.focused_bid_revision_started', context);
      const raw = await revise(context);
      return { response: DeliberationAnswerSchema.parse(raw), source: reasoning.sourceFor?.(raw) };
    };
    const product = input.runPartInference ? await input.runPartInference(own, run) : await run();
    if (!product) return null;
    const { response, source } = product;
    validateActionSpace(world, response.new_bid);
    if (response.new_bid?.type === 'deliberate') input.validateTargets(response.new_bid.target_parts);
    const navigationId = response.new_bid?.type === 'navigate' ? response.new_bid.stateId : null;
    if (navigationId && !world.experienced?.stanceHistory?.some(stance => stance.id === navigationId))
      throw new InfrastructureError('focused_bid_revision', 'Focused revision selected an unavailable stance');
    return { contribution, response, source };
  }));
  for (const product of products) {
    if (!product) continue;
    const { contribution, response, source } = product;
    const previousBid = contribution.bid;
    if (response.bid_disposition === 'replace') {
      contribution.bid = { ...ProposalSchema.parse(response.new_bid), id: id('bid'), partId: contribution.partId,
        ...(previousBid ? { replacesBidId: previousBid.id } : {}) } as Bid;
      inspection.emit(world.agentId, cycleId, 'part.bid_created', contribution.bid);
      if (source) inspection.emit(world.agentId, cycleId, 'cognition.bid_source', { bidId: contribution.bid.id, partId: contribution.partId, inferenceSource: source });
    } else if (response.bid_disposition === 'withdraw') {
      contribution.bid = null;
      inspection.emit(world.agentId, cycleId, 'part.bid_withdrawn', { partId: contribution.partId, bidId: previousBid?.id ?? null });
    }
    inspection.emit(world.agentId, cycleId, 'part.focused_bid_revision', {
      partId: contribution.partId, focusId: focus.periodId, previousBid, resultingBid: contribution.bid, ...response });
    input.deliberation.push({ partId: contribution.partId,
      question: 'Reconsider my recommendation under the selected voluntary focus.', answer: response.response });
    input.history.push(structuredClone(contribution));
  }
}
