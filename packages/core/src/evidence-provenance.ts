import { createHash } from 'node:crypto';
import { MutationValidationError, type Store } from './contracts.js';
import { type Memory, type Prediction, type WorldState, type VersionRecord, type ExperienceSourceSchema, type EvidenceCitationSchema, now } from './domain.js';
import type { z } from 'zod';

type Source = z.infer<typeof ExperienceSourceSchema>;
type Citation = z.infer<typeof EvidenceCitationSchema>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Stable record identities across carried snapshots; never a claim of objective truth. */
export function evidenceCatalog(world: WorldState) {
  return world.facts.map(fact => ({
    sourceId: `evidence_${digest([fact.referenceId ?? null, fact.referenceId && fact.timestamp ? null : fact.originCycleId ?? null, fact.kind, fact.source, fact.text, fact.timestamp ?? null])}`,
    experienceId: fact.originCycleId ?? `unattributed_${digest([fact.source, fact.kind, fact.text, fact.timestamp ?? null])}`,
    cycleId: fact.originCycleId ?? world.cycleId, timestamp: fact.timestamp ?? null,
    referenceId: fact.referenceId, kind: fact.kind, source: fact.source, text: fact.text,
  }));
}

/** Persist only excerpts explicitly selected by cognition, not the complete observation. */
export function captureMemoryEvidence(store: Store, world: WorldState, citations: Citation[], parents: Memory[], dispositionIds: string[] = []): NonNullable<Memory['evidence']> {
  const catalog = new Map(evidenceCatalog(world).map(source => [source.sourceId, source]));
  const priorTimes = new Map<string, string>();
  const priorRecords = new Map<string, Source>();
  for (const memory of store.list('memory', world.agentId)) for (const source of memory.evidence?.sources ?? []) {
    if (!priorTimes.has(source.experienceId) || source.firstRecordedAt < priorTimes.get(source.experienceId)!) priorTimes.set(source.experienceId, source.firstRecordedAt);
    if (source.referenceId && source.timestamp) {
      const key = JSON.stringify([source.referenceId, source.timestamp, source.kind, source.source]);
      if (!priorRecords.has(key) || source.firstRecordedAt < priorRecords.get(key)!.firstRecordedAt) priorRecords.set(key, source);
    }
  }
  if (new Set(citations.map(citation => citation.sourceId)).size !== citations.length) throw new MutationValidationError('Duplicate external evidence citation');
  const sources = citations.map(citation => {
    const source = catalog.get(citation.sourceId);
    if (!source || !source.text.includes(citation.quote)) throw new MutationValidationError('Remembered evidence must quote a supplied external record exactly');
    const cycle = store.cycles(world.agentId).find(cycle => cycle.id === source.cycleId);
    const exposedAt = cycle?.startedAt ?? world.capturedAt;
    const prior = source.referenceId && source.timestamp ? priorRecords.get(JSON.stringify([source.referenceId, source.timestamp, source.kind, source.source])) : undefined;
    const experienceId = prior?.experienceId ?? source.experienceId;
    return { sourceId: source.sourceId, experienceId, cycleId: prior?.cycleId ?? source.cycleId,
      firstRecordedAt: priorTimes.get(experienceId) && priorTimes.get(experienceId)! < exposedAt ? priorTimes.get(experienceId)! : exposedAt,
      timestamp: source.timestamp, referenceId: source.referenceId, kind: source.kind, source: source.source, quote: citation.quote };
  });
  return { sources, parents: parents.map(memory => ({ memoryId: memory.id, version: memory.version })), dispositionIds: [...new Set(dispositionIds)] };
}

export function predictionEvidenceOrigin(store: Store, world: WorldState, memoryIds: string[]): NonNullable<Prediction['evidenceOrigin']> {
  const available = new Map(store.list('memory', world.agentId).map(memory => [memory.id, memory]));
  const catalog = evidenceCatalog(world);
  return { formedAt: now(), sequence: world.sequence, knownExperienceIds: [...new Set(catalog.map(source => source.experienceId))],
    sourceIds: catalog.map(source => source.sourceId), memories: [...new Set(memoryIds)].flatMap(memoryId => {
      const memory = available.get(memoryId); return memory ? [{ memoryId, version: memory.version }] : [];
    }) };
}

export type MemoryEvidenceLineage = { experienceIds: string[]; sources: (Source & { available: boolean })[]; legacyExperienceIds: string[]; memoryVersions: { memoryId: string; version: number }[] };
/** Traverse versioned memory ancestry only. Opaque WorldState IDs remain opaque. */
export function memoryEvidenceLineage(store: Store, memory: Memory): MemoryEvidenceLineage {
  const sources = new Map<string, Source & { available: boolean }>(); const legacy = new Set<string>();
  const visited = new Map<string, { memoryId: string; version: number }>(); const states = new Set<string>();
  const versions = new Map<string, VersionRecord<Memory>[]>();
  const history = (memoryId: string) => {
    if (!versions.has(memoryId)) versions.set(memoryId, store.versions('memory', memoryId));
    return versions.get(memoryId)!;
  };
  const stack = [{ memory, available: !memory.deleted }];
  while (stack.length) {
    const { memory: current, available } = stack.pop()!;
    const key = `${current.id}:${current.version}`; const state = `${key}:${available}`;
    if (states.has(state)) continue;
    states.add(state); visited.set(key, { memoryId: current.id, version: current.version });
    for (const source of current.evidence?.sources ?? []) {
      const sourceKey = `${source.sourceId}:${source.quote}`;
      if (!sources.get(sourceKey)?.available) sources.set(sourceKey, { ...source, available,
        quote: available ? source.quote : '[Cited parent memory is no longer available for recall.]' });
    }
    const parents = [...(current.evidence?.parents ?? []), ...(current.synthesis?.sources ?? [])];
    if (current.evidence && !current.evidence.sources.length && !parents.length) legacy.add(`untraced:${current.createdCycle}`);
    if (!current.evidence && !current.synthesis) {
      const original = history(current.id)[0]?.state ?? current;
      for (const ancestor of original.ancestorIds.length ? original.ancestorIds : [`cycle:${original.createdCycle}`]) legacy.add(ancestor);
    }
    for (const parent of parents) {
      const version = history(parent.memoryId).find(record => record.state.version === parent.version)?.state;
      if (!version || version.agentId !== memory.agentId) throw new MutationValidationError('Memory evidence ancestry must reference preserved same-Agent versions');
      stack.push({ memory: version, available: available && !store.get('memory', parent.memoryId).deleted });
    }
  }
  return { experienceIds: [...new Set([...sources.values()].map(source => source.experienceId))].sort(), sources: [...sources.values()],
    legacyExperienceIds: [...legacy].sort(), memoryVersions: [...visited.values()] };
}
