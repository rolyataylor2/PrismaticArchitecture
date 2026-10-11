import { suppressProviderObservation } from './provider-observation.js';
import { z } from 'zod';
import { cosine } from '../../core/src/activation.js';
import { freeze, id, now, WorldStateSchema, ActivationScoreSchema, ordinaryMemory, type Memory, type Part } from '../../core/src/domain.js';
import { memoryEntries, scoreMemoryEntries } from '../../core/src/memory-recall.js';
import type { Application } from './application.js';

export const MemorySearchSchema = z.strictObject({ query: z.string().trim().min(1).max(4000),
  mode: z.enum(['vector', 'jev']), partId: z.string().min(1).max(200).optional() });
export type MemorySearchResult = { memory: Memory; timestamp: string | null; activation: number;
  ownerName: string; mode: 'vector' | 'jev' };

/** Privileged researcher search only. Never commits a WorldState, runs cognition, or shares memory with a Part. */
export function searchMemories(app: Application, agentId: string, raw: unknown): Promise<MemorySearchResult[]> {
  return suppressProviderObservation.run(true, () => searchMemoriesUnobserved(app, agentId, raw));
}
async function searchMemoriesUnobserved(app: Application, agentId: string, raw: unknown): Promise<MemorySearchResult[]> {
  const input = MemorySearchSchema.parse(raw);
  app.store.get('agent', agentId);
  let parts: Part[] = app.store.list('part', agentId);
  if (input.partId) {
    const part = app.store.get('part', input.partId);
    if (part.agentId !== agentId) throw new Error('Memory search Part belongs to another Agent');
    parts = [part];
  }
  const world = freeze(WorldStateSchema.parse({ id: id('memory_search'), cycleId: id('researcher_search'), agentId,
    sequence: 1, capturedAt: now(), facts: [{ kind: 'observes', source: 'Researcher memory search',
      text: input.query, timestamp: now(), referenceId: null }], thoughtHistory: [] }));
  if (app.store.get('agent', agentId).architecture !== 'persistent' && !input.partId) {
    const memories = app.store.list('memory', agentId);
    const scores = new Map<string, number>();
    if (input.mode === 'jev') {
      if (!app.providers.decisions.judge) throw new Error('Memory accessibility scoring unavailable');
      for (let offset = 0; offset < memories.length; offset += 100) {
        const batch = memories.slice(offset, offset + 100);
        const result = ActivationScoreSchema.array().parse(await app.providers.decisions.judge({ task: 'memory_accessibility', agentId, world,
          candidates: batch.map(memory => ({ id: memory.id, question: 'How relevant is this subjective episode to the researcher query?', context: { memory: ordinaryMemory(memory) } })) }));
        const expected = new Set(batch.map(memory => memory.id));
        if (result.length !== batch.length || new Set(result.map(score => score.partId)).size !== batch.length
          || result.some(score => !expected.has(score.partId))) throw new Error('Memory search requires exactly one score per episode');
        result.forEach(score => scores.set(score.partId, score.score / 4));
      }
    } else {
      const query = await app.providers.embeddings.embed(input.query);
      for (const memory of memories) scores.set(memory.id, cosine(query,
        await app.providers.embeddings.embed([memory.gist, memory.content, ...memory.context].join('\n'))));
    }
    const available = new Map(app.store.list('memory', agentId).map(memory => [memory.id, memory.version]));
    const threshold = input.mode === 'jev' ? app.agentActivationSettings(agentId).memoryRelevanceThreshold ?? 0.5 : 0;
    return memories.filter(memory => available.get(memory.id) === memory.version && scores.get(memory.id)! >= threshold)
      .map(memory => ({ memory, timestamp: null, activation: scores.get(memory.id)!, ownerName: 'Subjective episode', mode: input.mode }))
      .sort((a, b) => b.activation - a.activation || a.memory.id.localeCompare(b.memory.id));
  }
  const entries = memoryEntries(app.store, world, parts);
  if (!entries.length) return [];
  const results: MemorySearchResult[] = [];
  if (input.mode === 'jev') {
    const scores = await scoreMemoryEntries(app.providers.decisions, { world, purpose: 'search', entries });
    const byId = new Map(scores.map(score => [score.partId, score.score / 4]));
    const threshold = app.agentActivationSettings(agentId).memoryRelevanceThreshold ?? 0.5;
    for (const entry of entries) {
      const activation = byId.get(entry.memory.id)!;
      if (activation >= threshold) results.push({ memory: entry.memory, timestamp: entry.timestamp, activation, ownerName: entry.part.name, mode: input.mode });
    }
  } else {
    const query = await app.providers.embeddings.embed(input.query);
    for (const entry of entries) {
      const vector = await app.providers.embeddings.embed([entry.memory.gist, entry.memory.content, ...entry.memory.context].join('\n'));
      const activation = cosine(query, vector);
      if (activation > 0) results.push({ memory: entry.memory, timestamp: entry.timestamp, activation, ownerName: entry.part.name, mode: input.mode });
    }
  }
  // A researcher may edit or remove a memory during inference. Do not return stale versions.
  const available = new Map(app.store.list('memory', agentId).map(memory => [memory.id, memory.version]));
  return results.filter(result => available.get(result.memory.id) === result.memory.version)
    .sort((a, b) => b.activation - a.activation || a.memory.id.localeCompare(b.memory.id));
}


export type MemoryOverviewEntry = { memory: Memory; timestamp: string | null; accessCount: number };
export type MemoryOverview = { mostAccessed: MemoryOverviewEntry[]; mostRecent: MemoryOverviewEntry[] };

/** Researcher-only rankings from recorded cognitive recall; searches and inspection do not count. */
export function memoryOverview(app: Application, agentId: string): MemoryOverview {
  app.store.get('agent', agentId);
  const counts = new Map<string, number>();
  for (const event of app.store.eventsByType(agentId, ['construction.inference_started', 'memory.relevance_scored'])) {
    const memoryIds = event.type === 'construction.inference_started'
      && ['part_cognition', 'perspective_construction'].includes(String(event.payload.task))
      ? (event.payload.memories ?? []).map(memory => memory.id)
      : event.type === 'memory.relevance_scored' && event.payload.purpose === 'recall' ? event.payload.selectedMemoryIds : [];
    for (const memoryId of new Set(memoryIds)) counts.set(memoryId, (counts.get(memoryId) ?? 0) + 1);
  }
  const entries = app.store.list('memory', agentId).map(memory => ({ memory,
    timestamp: app.store.versions('memory', memory.id)[0]?.at ?? null, accessCount: counts.get(memory.id) ?? 0 }));
  const recent = (a: MemoryOverviewEntry, b: MemoryOverviewEntry) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '') || a.memory.id.localeCompare(b.memory.id);
  return { mostAccessed: [...entries].sort((a, b) => b.accessCount - a.accessCount || recent(a, b)).slice(0, 10),
    mostRecent: [...entries].sort(recent).slice(0, 10) };
}
