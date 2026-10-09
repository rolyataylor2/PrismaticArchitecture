// Historical test fixture only. Never imported by application code.
import { memoryPartIds, referencesMemory } from '../../../packages/core/src/domain.js';
import { memoryEntries, relevantMemories, type RecallSettings } from '../../../packages/core/src/memory-recall.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ActivationScoreSchema, freeze, type Activation, type Part, type WorldState } from '../../../packages/core/src/domain.js';
import { InfrastructureError, type DecisionProvider, type EmbeddingProvider, type Store } from '../../../packages/core/src/contracts.js';
import { effectivePrimitive, primitiveSensitivities, type Primitive, type PrimitiveActivation } from '../../../packages/core/src/primitives.js';
import type { Identity } from '../../../packages/core/src/domain.js';
import type { Inspection } from '../../../packages/core/src/inspection.js';

export const ActivationPolicySchema = z.strictObject({
  vectorThreshold: z.number().min(-1).max(1), activationThreshold: z.number().min(0).max(4),
  spikeThreshold: z.number().min(0).max(4),
});
export type ActivationPolicy = z.infer<typeof ActivationPolicySchema>;
export const defaultActivationPolicy: ActivationPolicy = { vectorThreshold: 0.05, activationThreshold: 2, spikeThreshold: 1.5 };
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || [...a, ...b].some(n => !Number.isFinite(n))) throw new InfrastructureError('embedding', 'Invalid embedding dimensions or values');
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? a.reduce((sum, n, i) => sum + n * b[i]!, 0) / norm : 0;
}
export class Activator {
  constructor(private readonly store: Store, private readonly decisions: DecisionProvider,
    private readonly embeddings: EmbeddingProvider, private readonly inspection: Inspection,
    private readonly policy = defaultActivationPolicy) { ActivationPolicySchema.parse(policy); }
  async run(world: WorldState, parts: Part[], vectorSearchEnabled = true, primitives: Primitive[] = [], identity?: Identity, memorySettings: RecallSettings & { memorySearchEnabled?: boolean } = {}): Promise<{ parts: Activation[]; primitives: PrimitiveActivation[] }> {
    const relevantOwners = memorySettings.memorySearchEnabled ? new Set((await relevantMemories(this.decisions, this.inspection,
      { world, purpose: 'candidates', entries: memoryEntries(this.store, world, parts.filter(part => part.lifecycle === 'active')) }, memorySettings, null)).flatMap(memoryPartIds)) : null;
    const partsWithMemories = new Set(this.store.list('memory', world.agentId).flatMap(memoryPartIds));
    const query = vectorSearchEnabled && !relevantOwners ? await this.embeddings.embed([...world.facts.map(f => `${f.source}: ${f.text}`), ...(world.thoughtHistory ?? []).map(thought => `Subjective thought by ${thought.partName}: ${thought.thought}`)].join('\n')) : null;
    const candidates: { partId: string; similarity: number; reasons: string[] }[] = [];
    for (const part of parts.filter(p => p.lifecycle === 'active')) {
      let similarity = 0;
      const reasons = [];
      if (relevantOwners) {
        if (relevantOwners.has(part.id)) reasons.push('relevant_memory');
        if (!partsWithMemories.has(part.id)) reasons.push('no_memories');
      } else if (query) {
        // Retrieval metadata supplements triggers; provenance remains excluded.
        const text = [...part.triggers, ...(part.retrievalKeys ?? [])].join('\n');
        const key = `${this.embeddings.label}:${createHash('sha256').update(text).digest('hex')}`;
        let vector = this.store.embedding(part.id, key);
        if (!vector) { vector = await this.embeddings.embed(text); this.store.saveEmbedding(part.id, key, vector); }
        similarity = cosine(query, vector);
        if (similarity >= this.policy.vectorThreshold) reasons.push('vector');
      } else reasons.push('vector_disabled');
      if (part.stickiness.retained && part.stickiness.unresolved) reasons.push('sticky_unresolved');
      if (reasons.length) candidates.push({ partId: part.id, similarity, reasons });
    }
    this.inspection.emit(world.agentId, world.cycleId, 'activation.vector_candidates', { candidates, population: parts.length });
    const previous = new Map<string, number>();
    const threadId = this.store.cycles(world.agentId).find(cycle => cycle.id === world.cycleId)?.threadId;
    const cycleIds = this.store.cycles(world.agentId).filter(cycle => cycle.threadId === threadId).map(cycle => cycle.id);
    for (const event of this.store.eventsByType(world.agentId, ['activation.scored'], cycleIds)) {
      if (event.type === 'activation.scored') for (const result of event.payload.results) previous.set(result.partId, result.score);
    }
    const primitivePrevious = new Map<string, number>();
    for (const event of this.store.eventsByType(world.agentId, ['activation.scored'], cycleIds)) {
      if (event.type === 'activation.scored') for (const result of event.payload.primitives ?? []) primitivePrevious.set(result.primitiveId, result.score);
    }
    const definitions = primitives.map(effectivePrimitive);
    const memories = this.store.list('memory', world.agentId);
    const predictions = this.store.list('prediction', world.agentId);
    const input = freeze({ world, candidates: candidates.map(candidate => {
      const { retrievalKeys: _retrievalKeys, ...scoringPart } = parts.find(part => part.id === candidate.partId)!;
      return structuredClone(scoringPart);
    }),
      primitives: definitions, primitiveSensitivities: identity ? primitiveSensitivities(identity) : [],
      partActivationContext: candidates.map(candidate => ({ partId: candidate.partId, previous: previous.get(candidate.partId) ?? 0,
        memories: memories.filter(memory => referencesMemory(memory, candidate.partId)).map(memory => ({
          timestamp: this.store.versions('memory', memory.id)[0]?.at ?? null, gist: memory.gist })),
        prediction: predictions.find(prediction => prediction.partId === candidate.partId && prediction.status === 'open') ?? null })) });
    this.inspection.emit(world.agentId, world.cycleId, 'activation.scoring_started', input);
    const expected = [...candidates.map(candidate => candidate.partId), ...definitions.map(primitive => primitive.id)];
    if (new Set(expected).size !== expected.length) throw new InfrastructureError('activation', 'Part and primitive IDs must be distinct');
    const scores = ActivationScoreSchema.array().parse(await this.decisions.score(input));
    if (scores.length !== expected.length || new Set(scores.map(score => score.partId)).size !== expected.length
      || scores.some(score => !expected.includes(score.partId))) throw new InfrastructureError('activation', 'Provider must score every Part and primitive candidate exactly once');
    const results = candidates.map(candidate => {
      const judgment = scores.find(s => s.partId === candidate.partId)!;
      const score = judgment.score;
      const prior = previous.get(candidate.partId) ?? 0;
      return { ...candidate, ...judgment, previous: prior, delta: score - prior, active: score >= this.policy.activationThreshold };
    });
    const primitiveResults = definitions.map(primitive => {
      const judgment = scores.find(score => score.partId === primitive.id)!;
      const prior = primitivePrevious.get(primitive.id) ?? 0;
      return { primitiveId: primitive.id, name: primitive.name, score: judgment.score, ...(judgment.distribution ? { distribution: judgment.distribution } : {}),
        previous: prior, delta: judgment.score - prior, threshold: primitive.activationThreshold, active: judgment.score >= primitive.activationThreshold };
    });
    this.inspection.emit(world.agentId, world.cycleId, 'activation.scored', { results, primitives: primitiveResults, provider: this.decisions.label });
    for (const result of results) {
      if (Math.abs(result.delta) >= this.policy.spikeThreshold) this.inspection.emit(world.agentId, world.cycleId, 'activation.spike', result);
      if (result.active) this.inspection.emit(world.agentId, world.cycleId, 'activation.part_activated', result);
    }
    return freeze({ parts: results, primitives: primitiveResults });
  }
}
