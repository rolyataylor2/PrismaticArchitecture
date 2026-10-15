import { ActivationScoreSchema, memoryPartIds, freeze, type Memory, type Part, type WorldState } from './domain.js';
import { InfrastructureError, type DecisionProvider, type MemoryRelevanceInput, type Store } from './contracts.js';
import type { Inspection } from './inspection.js';

export type RecallSettings = { memoryRelevanceThreshold?: number; memoryRecallLimit?: number | null };
/** Host-side scorer access. Never hand cross-owner entries to Part reasoning or Self. */
export function memoryEntries(store: Store, world: WorldState, parts: Part[]): MemoryRelevanceInput['entries'] {
  const owners = new Map(parts.map(part => [part.id, part]));
  return store.list('memory', world.agentId).flatMap(memory => {
    return memoryPartIds(memory).flatMap(partId => {
      const part = owners.get(partId);
      return part && part.agentId === world.agentId
        ? [{ part, memory, timestamp: store.versions('memory', memory.id)[0]?.at ?? null }] : [];
    });
  }).sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.memory.id.localeCompare(b.memory.id));
}
/** Shared validation/batching, without cognitive events or psychological effects. */
export async function scoreMemoryEntries(decisions: DecisionProvider, input: MemoryRelevanceInput): Promise<import('./domain.js').ActivationScore[]> {
  const entries = input.entries;
  const scores: import('./domain.js').ActivationScore[] = [];
  if (entries.length && !decisions.recall) throw new InfrastructureError('memory_recall', 'Decision provider does not support memory relevance');
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (!groups.has(entry.part.id)) groups.set(entry.part.id, []);
    groups.get(entry.part.id)!.push(entry);
  }
  for (const group of groups.values()) for (let offset = 0; offset < group.length; offset += 100) {
    const batch = group.slice(offset, offset + 100);
    let result: import('./domain.js').ActivationScore[];
    try { result = ActivationScoreSchema.array().parse(await decisions.recall!(freeze({ ...input, entries: batch }))); }
    catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('memory_recall', 'Memory relevance provider failed or returned invalid scores');
    }
    const expected = new Set(batch.map(entry => entry.memory.id));
    if (result.length !== batch.length || new Set(result.map(score => score.partId)).size !== batch.length
      || result.some(score => !expected.has(score.partId))) throw new InfrastructureError('memory_recall', 'Provider must score every memory exactly once');
    scores.push(...result);
  }
  const best = new Map<string, import('./domain.js').ActivationScore>();
  for (const score of scores) if (!best.has(score.partId) || best.get(score.partId)!.score < score.score) best.set(score.partId, score);
  return freeze([...best.values()]);
}
export async function relevantMemories(decisions: DecisionProvider, inspection: Inspection,
  input: MemoryRelevanceInput,
  settings: RecallSettings, limit: number | null = settings.memoryRecallLimit === undefined ? 12 : settings.memoryRecallLimit): Promise<Memory[]> {
  const entries = input.entries;
  const purpose = input.purpose;
  if (purpose === 'search') throw new InfrastructureError('memory_recall', 'Researcher search must use the stateless memory scorer');
  const scores = await scoreMemoryEntries(decisions, input);
  const byId = new Map(entries.map(entry => [entry.memory.id, entry]));
  const ranked = scores.filter(score => score.score / 4 >= (settings.memoryRelevanceThreshold ?? 0.5))
    .sort((a, b) => b.score - a.score || a.partId.localeCompare(b.partId));
  const selected = limit === null ? ranked : ranked.slice(0, limit);
  inspection.emit(input.world.agentId, input.world.cycleId, 'memory.relevance_scored', {
    worldId: input.world.id, purpose, provider: decisions.labelForAgent?.(input.world.agentId) ?? decisions.label,
    scores: scores.map(score => ({ memoryId: score.partId, partId: byId.get(score.partId)!.part.id,
      score: score.score, relevance: score.score / 4, ...(score.distribution ? { distribution: score.distribution } : {}) })),
    selectedMemoryIds: selected.map(score => score.partId),
  });
  return freeze(selected.map(score => byId.get(score.partId)!.memory));
}
