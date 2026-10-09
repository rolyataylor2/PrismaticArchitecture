import { id, PartDraftSchema, PartPatchSchema, PartSchema, type Change, type Part, type PartDraft, type PartPatch } from './domain.js';
import { ConflictError, MutationValidationError, type Store } from './contracts.js';
import type { Inspection } from './inspection.js';

export class PartMutations {
  constructor(private readonly store: Store, private readonly inspection: Inspection) {}
  create(agentId: string, draft: PartDraft, change: Change): Part {
    const part = PartSchema.parse({ ...PartDraftSchema.parse(draft), beliefConfidence: 1, id: id('part'), agentId, version: 1, schemaVersion: 1 });
    this.validateRelations(part);
    this.inspection.atomic(() => {
      this.store.save('part', part, 0, change);
      this.inspection.emit(agentId, null, 'part.mutation_applied', { part, change });
    });
    return this.store.get('part', part.id);
  }
  patch(partId: string, expectedVersion: number, patch: PartPatch, change: Change, cycleId: string | null = null): Part {
    const threadId = cycleId ? this.store.cycle(cycleId).threadId : undefined;
    const old = this.store.partForThread(partId, threadId);
    if (old.version !== expectedVersion) throw new ConflictError('Part changed; reload before editing');
    let validated = PartPatchSchema.parse(patch);
    if (validated.beliefConfidence !== undefined && change.origin !== 'researcher_edit') {
      throw new MutationValidationError('Belief confidence changes belong to resolved prediction outcomes or explicit researcher edits');
    }
    if (change.origin === 'prediction_evaluation') {
      const fields = ['beliefs', 'strategies', 'cognitiveCharacteristics'] as const;
      if (Object.keys(validated).some(key => !fields.some(field => field === key))) {
        throw new MutationValidationError('Prediction learning may only append beliefs, strategies, and How I think; names and other state cannot change');
      }
      const additions = validated;
      const merged = PartPatchSchema.safeParse(Object.fromEntries(fields
        .filter(field => additions[field] !== undefined)
        .map(field => [field, [...new Set([...old[field], ...additions[field]!])]])));
      if (!merged.success) throw new MutationValidationError('Additive prediction learning exceeds Part storage limits');
      validated = merged.data;
      // Capacity is validated without pruning existing psychology.
      const result = PartSchema.safeParse({ ...old, ...validated });
      if (!result.success) throw new MutationValidationError('Additive prediction learning exceeds Part storage limits');
      if (fields.every(field => !validated[field] || JSON.stringify(validated[field]) === JSON.stringify(old[field]))) return old;
    }
    if (old.instance && validated.lifecycle === 'archived' && !old.instance.retirement && !validated.instance?.retirement) {
      validated = { ...validated, instance: { ...old.instance, retirement: {
        cycleId: cycleId ?? this.store.cycles(old.agentId).filter(cycle => (cycle.threadId ?? null) === old.instance!.threadId).at(-1)?.id ?? old.instance.createdCycle, reason: change.reason,
      } } };
    }
    if (old.instance?.retirement && (validated.lifecycle === 'active' || validated.instance?.retirement === null)) {
      throw new MutationValidationError('Retired constructed instances remain inspectable; recurrence must construct a new Part');
    }
    if (validated.instance && old.instance && (validated.instance.createdCycle !== old.instance.createdCycle || validated.instance.threadId !== old.instance.threadId)) {
      throw new MutationValidationError('Constructed instance origin and thread are immutable');
    }
    const next = PartSchema.parse({ ...old, ...validated, version: old.version + 1 });
    this.validateRelations(next);
    this.inspection.atomic(() => {
      this.inspection.emit(old.agentId, cycleId, 'part.mutation_proposed', { partId, patch: validated, change });
      if (threadId && !old.instance && validated.stickiness) this.store.saveThreadStickiness(partId, threadId, next.stickiness, cycleId!);
      this.store.save('part', threadId && !old.instance ? { ...next, stickiness: this.store.get('part', partId).stickiness } : next, old.version, change);
      this.inspection.emit(old.agentId, cycleId, 'part.mutation_applied', { part: next, change });
    });
    return this.store.partForThread(partId, threadId);
  }
  /** Optional model proposals may be rejected without discarding the cognitive result. */
  propose(partId: string, expectedVersion: number, patch: PartPatch, change: Change, cycleId: string): Part | null {
    try {
      return this.patch(partId, expectedVersion, patch, change, cycleId);
    } catch (error) {
      if (!(error instanceof MutationValidationError)) throw error;
      const part = this.store.get('part', partId);
      this.inspection.atomic(() => {
        this.inspection.emit(part.agentId, cycleId, 'part.mutation_proposed', { partId, patch, change });
        this.inspection.emit(part.agentId, cycleId, 'part.mutation_rejected', { partId, patch, change, reason: error.message });
      });
      return null;
    }
  }
  /** Explicit asymmetric reinforcement; model mutations cannot set this field. */
  recordPredictionConfidence(partId: string, outcome: 'correct' | 'incorrect', predictionId: string, worldId: string, cycleId: string): Part {
    const old = this.store.get('part', partId);
    const units = Math.round((old.beliefConfidence ?? 1) * 12000);
    const beliefConfidence = Math.max(0, Math.min(12000, units + (outcome === 'correct' ? 120 : -50))) / 12000;
    if (beliefConfidence === (old.beliefConfidence ?? 1)) return old;
    const patch = { beliefConfidence };
    const next = PartSchema.parse({ ...old, ...patch, version: old.version + 1 });
    const change: Change = { origin: 'prediction_evaluation', reason: `Prediction ${outcome}: asymmetric belief confidence adjustment`, sourceIds: [predictionId, worldId] };
    this.inspection.atomic(() => {
      this.inspection.emit(old.agentId, cycleId, 'part.mutation_proposed', { partId, patch, change });
      this.store.save('part', next, old.version, change);
      this.inspection.emit(old.agentId, cycleId, 'part.mutation_applied', { part: next, change });
    });
    return next;
  }
  restore(partId: string, targetVersion: number, expectedVersion: number): Part {
    const old = this.store.get('part', partId);
    const record = this.store.versions('part', partId).find(v => v.state.version === targetVersion);
    if (!record) throw new Error('Historical Part version not found');
    // Psychological restoration preserves the complete developmental provenance/lineage.
    const { provenance: _provenance, lineage: _lineage, ...patch } = PartDraftSchema.strip().parse(record.state);
    return this.patch(partId, expectedVersion, patch, { origin: 'researcher_edit',
      reason: `Restore psychology from version ${targetVersion}; preserve subsequent ancestry`, sourceIds: [old.id] });
  }
  private validateRelations(part: Part): void {
    for (const target of [...part.lineage, ...part.associations.map(a => a.targetPartId)]) {
      if (target === part.id || !this.store.list('part', part.agentId).some(p => p.id === target)) throw new MutationValidationError('Invalid Part relationship');
    }
  }
}
