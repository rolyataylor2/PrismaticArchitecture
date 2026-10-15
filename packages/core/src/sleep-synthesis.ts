import { DispositionSchema, MemorySchema, freeze, id, memoryWithoutFormationAffect, type Disposition, type Memory, type Prediction } from './domain.js';
import { SynthesisPolicySchema, type SynthesisPolicy } from './sleep-policy.js';
import type { Store } from './contracts.js';
import { MutationValidationError } from './contracts.js';
import type { ConstructedCognition } from './constructed.js';
import type { Inspection } from './inspection.js';
import type { SleepSynthesisReview } from './consolidation-domain.js';

export type SynthesisScope = { disposition: Disposition; memories: Memory[]; predictions: Prediction[]; cycleIds: string[] };
/** Capture every independently activated scope, including scopes deferred by admission budgets. */
export function captureSynthesisScopes(store: Store, agentId: string, cycleIds: string[]): SynthesisScope[] {
  if (!cycleIds.length) return [];
  const events = store.eventsByType(agentId, ['construction.judgment', 'part.thought'], cycleIds);
  const scopes = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.type !== 'construction.judgment' || event.payload.input.task !== 'disposition_activation' || !event.cycleId) continue;
    for (const score of event.payload.scores) {
      const context = event.payload.input.candidates.find(candidate => candidate.id === score.partId)?.context as
        { activationPhase?: string; disposition?: Disposition } | undefined;
      if (!context?.disposition || context.activationPhase === 'baseline' || score.score < context.disposition.threshold) continue;
      const selected = scopes.get(score.partId) ?? new Set<string>(); selected.add(event.cycleId); scopes.set(score.partId, selected);
    }
  }
  const cycles = store.cycles(agentId);
  const cycleSequences = new Map(cycles.map(cycle => [cycle.id, cycle.sequence]));
  const period = cycles.filter(cycle => cycleIds.includes(cycle.id));
  const last = period.at(-1);
  const memories = store.list('memory', agentId).filter(memory => {
    if (memory.deleted) return false;
    if (!last) return true;
    const sequence = cycleSequences.get(memory.createdCycle);
    if (sequence !== undefined) return sequence <= last.sequence;
    // Legacy cutover can retain subjective memories after removing their cycles.
    // Use recorded creation time without reconstructing missing experience history.
    const createdAt = store.versions('memory', memory.id)[0]?.at;
    return createdAt !== undefined && createdAt <= last.startedAt;
  });
  const predictions = store.list('prediction', agentId);
  return freeze([...scopes].flatMap(([dispositionId, scopeCycles]) => {
    const disposition = store.list('disposition', agentId).find(item => item.id === dispositionId && !item.deleted);
    if (!disposition) return [];
    const thoughts = events.filter(event => event.type === 'part.thought' && event.cycleId && scopeCycles.has(event.cycleId)
      && event.payload.partSnapshot.instance?.dispositionBindings?.some(binding => binding.dispositionId === dispositionId));
    const relevant = new Set(disposition.memoryIds.filter(memoryId => {
      const memory = memories.find(memory => memory.id === memoryId);
      return memory && (!memory.synthesis || !last || (store.versions('memory', memory.id)[0]?.at ?? '') <= last.startedAt);
    }));
    for (const thought of thoughts) if (thought.type === 'part.thought') {
      for (const memoryId of thought.payload.recalledMemoryIds ?? []) relevant.add(memoryId);
      for (const memory of memories) if (memory.createdCycle === thought.cycleId && memory.partId === thought.payload.partId) relevant.add(memory.id);
    }
    for (const memory of memories) if (memory.predictionId === disposition.sourcePredictionId && memory.predictionId) relevant.add(memory.id);
    const selected = memories.filter(memory => relevant.has(memory.id)).map(memoryWithoutFormationAffect);
    return [{ disposition, memories: selected, predictions: predictions.filter(prediction => prediction.id === disposition.sourcePredictionId
      || selected.some(memory => memory.predictionId === prediction.id || prediction.memoryId === memory.id)), cycleIds: [...scopeCycles] }];
  }));
}

export async function synthesizeScope(store: Store, inspection: Inspection, constructed: ConstructedCognition,
  agentId: string, runId: string, scope: SynthesisScope, replaceSources: boolean, policy: SynthesisPolicy = SynthesisPolicySchema.parse({})): Promise<SleepSynthesisReview> {
  const review: SleepSynthesisReview = { dispositionId: scope.disposition.id, dispositionName: scope.disposition.name,
    dispositionVersion: scope.disposition.version, sourceMemoryIds: scope.memories.map(memory => memory.id),
    predictionIds: scope.predictions.map(prediction => prediction.id), cycleIds: scope.cycleIds,
    status: 'no_change', memoryId: null, replacedMemoryIds: [], reason: 'Fewer than two relevant source memories; preserved.' };
  if (scope.memories.length < 2) return review;
  const result = await constructed.infer('memory_synthesis', { agentId, dispositions: [scope.disposition], memories: scope.memories, predictions: scope.predictions, synthesisPolicy: policy });
  review.reason = result.reason;
  if (!result.synthesis) return review;
  const synthesis = result.synthesis;
  const sourceIds = new Set(synthesis.sourceMemoryIds);
  const replacements = new Set(synthesis.replaceSourceMemoryIds);
  if (sourceIds.size !== synthesis.sourceMemoryIds.length || replacements.size !== synthesis.replaceSourceMemoryIds.length
    || synthesis.sourceMemoryIds.some(source => !scope.memories.some(memory => memory.id === source))
    || synthesis.replaceSourceMemoryIds.some(source => !sourceIds.has(source))
    || new Set(synthesis.detailDecisions.map(decision => decision.memoryId)).size !== sourceIds.size
    || synthesis.detailDecisions.length !== sourceIds.size
    || synthesis.detailDecisions.some(decision => !sourceIds.has(decision.memoryId)))
    throw new MutationValidationError('Synthesis requires unique supplied sources, scoped replacement citations and one detail judgment per cited source');
  const sources = scope.memories.filter(memory => sourceIds.has(memory.id));
  return inspection.atomic(() => {
    const disposition = store.get('disposition', scope.disposition.id);
    if (disposition.agentId !== agentId || disposition.deleted || disposition.version !== scope.disposition.version
      || sources.some(memory => memory.agentId !== agentId || store.get('memory', memory.id).version !== memory.version || store.get('memory', memory.id).deleted)
      || scope.predictions.some(prediction => store.get('prediction', prediction.id).version !== prediction.version))
      throw new MutationValidationError('Synthesis scope or source evidence changed during inference');
    const lineage = sources.map(memory => ({ memoryId: memory.id, version: memory.version })).sort((a, b) => a.memoryId.localeCompare(b.memoryId));
    const duplicate = store.list('memory', agentId).find(memory => memory.synthesis?.dispositionId === disposition.id
      && JSON.stringify(memory.synthesis.sources) === JSON.stringify(lineage)
      && JSON.stringify(SynthesisPolicySchema.parse(memory.synthesis.policy ?? {})) === JSON.stringify(policy));
    const memory = duplicate ?? MemorySchema.parse({ id: id('memory'), agentId, version: 1, schemaVersion: 1, partId: null,
      content: synthesis.content, gist: synthesis.gist, context: synthesis.context,
      ancestorIds: [...new Set(sources.flatMap(source => source.ancestorIds))], predictionId: null,
      createdCycle: scope.cycleIds.at(-1)!, referencingPartIds: [],
      synthesis: { dispositionId: disposition.id, dispositionVersion: disposition.version, runId, sources: lineage, policy, detailDecisions: synthesis.detailDecisions, reason: result.reason } });
    const replacedMemoryIds = replaceSources ? synthesis.replaceSourceMemoryIds : [];
    const change = { origin: 'consolidation' as const, reason: result.reason, sourceIds: [runId, disposition.id, ...sourceIds] };
    const next = DispositionSchema.parse({ ...disposition, version: disposition.version + 1,
      memoryIds: [...new Set([...disposition.memoryIds, memory.id])],
      ...(disposition.development ? { development: { ...disposition.development, previousVersion: disposition.version } } : {}),
      suppressedMemoryIds: [...new Set([...(disposition.suppressedMemoryIds ?? []), ...replacedMemoryIds])] });
    if (!duplicate) store.save('memory', memory, 0, change);
    if (!duplicate || replacedMemoryIds.some(source => !disposition.suppressedMemoryIds?.includes(source)))
      store.save('disposition', next, disposition.version, change);
    if (!duplicate) inspection.emit(agentId, null, 'memory.reconsolidated', memory);
    return { ...review, status: duplicate ? 'duplicate' : 'created', memoryId: memory.id, replacedMemoryIds,
      reason: duplicate ? `Existing synthesis retained. ${result.reason}` : result.reason };
  });
}
