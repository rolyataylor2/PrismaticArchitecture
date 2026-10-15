import { referencesMemory, ordinaryMemory } from './domain.js';
import { SelectedActivitySchema } from './execution-review.js';
import { SelectedAffectSchema } from './affect-domain.js';
import { freeze, ProposalSchema, type Cycle, type ThoughtHistory, type Activation, type Contribution, type DeliberationMessage, type Identity, type Part, type SelfContext, type WorldState } from './domain.js';
import type { PartContext, Store } from './contracts.js';

/** Explicit public projection: no Part snapshots, memories, beliefs, or raw audit payloads. */
export function thoughtHistory(store: Store, current: Cycle,
  decay = { ordinary: 0.2, selected: 0.1 }): ThoughtHistory[] {
  const prior = store.cycles(current.agentId).filter(c => c.kind !== 'attention_monitor' && c.sequence < current.sequence && c.threadId === current.threadId);
  // Age advances only when this thread takes another cognitive turn.
  const ages = new Map(prior.map((cycle, index) => [cycle.id, prior.length - index]));
  const eligible = prior.filter(c => ages.get(c.id)! * Math.min(decay.ordinary, decay.selected) < 1);
  const events = store.eventsByType(current.agentId, ['part.thought', 'part.bid_created', 'self.choice'], eligible.map(c => c.id));
  // Legacy thought events predate embedded Part snapshots. Names are display attribution only.
  const partNames = new Map(store.list('part', current.agentId).map(part => [part.id, part.name]));
  const bids = new Map(events.flatMap(e => e.type === 'part.bid_created' ? [[e.payload.id, e.payload.partId] as const] : []));
  const selected = new Set(events.flatMap(e => e.type === 'self.choice' && e.payload.choice !== 'DELIBERATE'
    ? (e.payload.selectedBidIds ?? [e.payload.choice]).map(bidId => `${e.cycleId}:${bids.get(bidId)}`) : []));
  return events.flatMap(event => {
    if (event.type !== 'part.thought' || !event.cycleId) return [];
    const selectedBySelf = selected.has(`${event.cycleId}:${event.payload.partId}`);
    const age = ages.get(event.cycleId)!;
    const retention = Math.max(0, Number((1 - age * (selectedBySelf ? decay.selected : decay.ordinary)).toFixed(10)));
    if (retention === 0) return [];
    return [{ id: event.id, cycleId: event.cycleId, partId: event.payload.partId,
      partName: event.payload.partSnapshot?.name ?? partNames.get(event.payload.partId) ?? event.payload.partId, thought: event.payload.output.thought, selectedBySelf, age, retention }];
  });
}

/** Host-side assembly only. Neither provider receives Store or an arbitrary lookup capability. */
export function partContext(store: Store, world: WorldState, part: Part, activation: Activation): PartContext {
  if (part.agentId !== world.agentId || part.id !== activation.partId) throw new Error('Cognitive context ownership mismatch');
  const memories = store.list('memory', part.agentId).filter(memory => referencesMemory(memory, part.id)).map(memory => part.instance ? ordinaryMemory(memory) : memory)
    .sort((a, b) => (store.versions('memory', a.id)[0]?.at ?? '').localeCompare(store.versions('memory', b.id)[0]?.at ?? ''));
  const prediction = store.list('prediction', part.agentId).find(p => p.partId === part.id && p.status === 'open') ?? null;
  const cycles = store.cycles(part.agentId);
  const threadId = cycles.find(cycle => cycle.id === world.cycleId)?.threadId;
  const cycleIds = cycles.filter(cycle => cycle.id !== world.cycleId && cycle.threadId === threadId).map(cycle => cycle.id);
  const retainedThoughts = store.eventsByType(part.agentId, ['part.thought'], cycleIds)
    .flatMap(event => event.type === 'part.thought' && event.payload.partId === part.id
      && (world.thoughtHistory === undefined || world.thoughtHistory.some(entry => entry.id === event.id))
      ? [{ cycleId: event.cycleId!, thought: event.payload.output.thought, interpretation: event.payload.output.interpretation }] : []);
  const recentThoughts = world.thoughtHistory === undefined ? retainedThoughts.slice(-3) : retainedThoughts;
  const currentPart = store.partForThread(part.id, threadId);
  return freeze({ world, part: { ...currentPart, beliefConfidence: currentPart.beliefConfidence ?? 1 }, memories, prediction, activation, recentThoughts });
}

/** Explicit projection prevents extra runtime properties from crossing into Self input. */
export function selfContext(identity: Identity, contributions: Contribution[], deliberation: DeliberationMessage[], history: Pick<SelfContext, 'commitments' | 'contributionHistory' | 'inquiries' | 'completedDeliberationRounds' | 'stanceHistory' | 'ongoingActivity' | 'selectedFocus'> = {}): SelfContext {
  if (history.selectedFocus && history.selectedFocus.agentId !== identity.agentId) throw new Error('Selected focus ownership mismatch');
  return freeze({
    identity: { ...structuredClone(identity), traits: structuredClone(identity.traits.filter(trait => trait.role !== 'autobiographical')) },
    contributions: contributions.map(c => ({ ...(c.sourceKind ? { sourceKind: c.sourceKind } : {}), ...(c.supportingBidId ? { supportingBidId: c.supportingBidId } : {}), partId: c.partId, name: c.name, thought: c.thought,
      interpretation: c.interpretation, ...(c.affect !== undefined ? { affect: c.affect } : {}), evidenceSummary: [...c.evidenceSummary], prediction: c.prediction,
      bid: c.bid ? { ...ProposalSchema.parse(Object.fromEntries(Object.entries(c.bid).filter(([key]) => !['id', 'partId', 'sourceKind', 'replacesBidId'].includes(key)))),
        ...(c.bid.sourceKind ? { sourceKind: c.bid.sourceKind } : {}), id: c.bid.id, partId: c.bid.partId,
        ...(c.bid.replacesBidId ? { replacesBidId: c.bid.replacesBidId } : {}) } : null })),
    ...(history.contributionHistory ? { contributionHistory: history.contributionHistory.map(c => selfContext(identity, [c], []).contributions[0]!) } : {}),
    ...(history.inquiries ? { inquiries: structuredClone(history.inquiries) } : {}),
    ...(history.completedDeliberationRounds !== undefined ? { completedDeliberationRounds: history.completedDeliberationRounds } : {}),
    ...(history.stanceHistory ? { stanceHistory: history.stanceHistory.map(record => ({ id: record.id, cycleId: record.cycleId,
      posture: record.posture.map(stance => ({ partId: stance.partId, name: stance.name, interpretation: stance.interpretation,
        affect: stance.affect, thought: stance.thought })) })) } : {}),
    deliberation: deliberation.map(d => ({ partId: d.partId, question: d.question, answer: d.answer })),
    ...(history.commitments?.length ? { commitments: history.commitments.map(record => ({ id: record.id, cycleId: record.cycleId,
      threadId: record.threadId, selectedAt: record.selectedAt, status: record.status,
      proposals: record.proposals.map(proposal => ({ bidId: proposal.bidId, partId: proposal.partId, kind: proposal.kind,
        text: proposal.text, argument: proposal.argument, executionOrder: [...proposal.executionOrder], validWhile: [...proposal.validWhile],
        constraints: [...proposal.constraints], successCriteria: proposal.successCriteria })) })) } : {}),
    ...(history.ongoingActivity ? { ongoingActivity: SelectedActivitySchema.parse(history.ongoingActivity) } : {}),
    ...(history.selectedFocus ? { selectedFocus: SelectedAffectSchema.parse(history.selectedFocus) } : {}),
  });
}

/** The no-action choice counts completed inquiries, never individual responses. */
export function selfChoices(context: SelfContext): string[] {
  return [...context.contributions.flatMap(c => c.bid ? [c.bid.id] : []), 'DELIBERATE',
    ...(context.ongoingActivity ? ['CONTINUE_EXECUTION'] : []),
    ...((context.completedDeliberationRounds ?? 0) >= 2 ? ['NOTHING'] : [])];
}
