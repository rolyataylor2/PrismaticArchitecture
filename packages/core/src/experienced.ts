import { ExperiencedStateSchema, StanceRecordSchema, WorldStateSchema, freeze, type Cycle, type WorldState } from './domain.js';
import type { Store } from './contracts.js';
import { isLegacyCapabilityFact } from './mcp-configuration.js';

/** Assemble attributed subjective layers without merging alternatives or authoring meaning. */
export function experiencedState(store: Store, current: Cycle): NonNullable<WorldState['experienced']> {
  const prior = store.cycles(current.agentId).filter(cycle => cycle.kind !== 'attention_monitor' && cycle.status === 'completed'
    && cycle.sequence < current.sequence && cycle.threadId === current.threadId);
  const allowed = new Set(prior.map(cycle => cycle.id));
  const prospective = store.list('prediction', current.agentId).filter(prediction => prediction.status === 'open'
    && allowed.has(prediction.createdCycle) && (prediction.gapOrigin || (prediction.partId && store.get('part', prediction.partId).instance)))
    .map(prediction => ({ predictionId: prediction.id, version: prediction.version, partId: prediction.partId,
      createdCycle: prediction.createdCycle, kind: prediction.kind ?? 'unclassified', expectation: prediction.expectation,
      confidence: prediction.confidence, horizon: prediction.horizon, conditions: [...(prediction.conditions ?? [])],
      conditionedAction: prediction.conditionedAction ?? null, capsule: structuredClone(prediction.capsule) }));
  const last = prior.at(-1);
  const events = last ? store.eventsByType(current.agentId, ['part.thought', 'part.bid_created', 'self.choice'], [last.id]) : [];
  const selectedBids = new Set(events.flatMap(event => event.type === 'self.choice'
    ? event.payload.selectedBidIds ?? [event.payload.choice] : []));
  const selectedParts = new Set(events.flatMap(event => event.type === 'part.bid_created' && selectedBids.has(event.payload.id)
    ? [event.payload.partId] : []));
  const expressed = events.flatMap(event => event.type === 'part.thought' ? [event] : []);
  const transitions = store.eventsByType(current.agentId, ['self.experienced_transition'], prior.map(cycle => cycle.id));
  const latestTransition = transitions.at(-1);
  return freeze(ExperiencedStateSchema.parse({ prospective,
    stanceHistory: transitions.flatMap(event => event.type === 'self.experienced_transition'
      ? [StanceRecordSchema.parse({ id: event.payload.id, cycleId: event.payload.cycleId, posture: event.payload.resulting })] : []),
    rememberedInterpretations: expressed.filter(event => event.payload.output.evidenceSummary.length).map(event => ({
      cycleId: event.cycleId!, partId: event.payload.partId, interpretation: event.payload.output.interpretation,
      evidenceSummary: [...event.payload.output.evidenceSummary] })),
    posture: latestTransition?.type === 'self.experienced_transition' ? latestTransition.payload.resulting
      : expressed.filter(event => selectedParts.has(event.payload.partId)).map(event => ({
      partId: event.payload.partId, name: event.payload.partSnapshot.name, interpretation: event.payload.output.interpretation,
      affect: event.payload.output.affect ?? '', thought: event.payload.output.thought })),
  }));
}

/** Prediction checks cannot observe anticipation, thought carryover or selected affect as evidence. */
export function factualWorld(world: WorldState): WorldState {
  return freeze(WorldStateSchema.parse({ id: world.id, agentId: world.agentId, cycleId: world.cycleId,
    sequence: world.sequence, capturedAt: world.capturedAt, facts: world.facts.filter(fact => !isLegacyCapabilityFact(fact)) }));
}
