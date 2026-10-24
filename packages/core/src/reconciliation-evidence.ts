import type { Store } from './contracts.js';
import type { Disposition, Memory } from './domain.js';
import { memoryEvidenceLineage } from './evidence-provenance.js';
import { ReconciliationRejectedError, ReconciliationPolicySchema, type ReconciliationOperation, type ReconciliationObservations } from './disposition-reconciliation.js';

/** Restoring older psychology cannot erase already consumed evidence credit. */
export function consumedExperienceIds(store: Store, sources: Disposition[]): string[] {
  const roots = new Set<string>(); const seen = new Map<string, number>();
  const stack = sources.map(source => ({ id: source.id, version: source.version }));
  while (stack.length) {
    const source = stack.pop()!;
    if ((seen.get(source.id) ?? 0) >= source.version) continue;
    seen.set(source.id, source.version);
    for (const record of store.versions('disposition', source.id).filter(record => record.state.version <= source.version)) {
      record.state.development?.usedExperienceIds?.forEach(root => roots.add(root));
      for (const ancestor of record.state.development?.lineage ?? []) stack.push({ id: ancestor.dispositionId, version: ancestor.version });
    }
  }
  return [...roots];
}

/** Runtime counts source experiences, never reflections, recall repetitions or confidence adjectives. */
export function reconciliationOutcomeEvidence(store: Store, operation: ReconciliationOperation, sources: Disposition[], memories: Memory[], observations: ReconciliationObservations): string[] {
  if (operation.operation === 'NO_CHANGE' || operation.operation === 'INSUFFICIENT_EVIDENCE') return [];
  const prior = new Set(consumedExperienceIds(store, sources));
  const roots = new Set<string>();
  for (const judgment of operation.judgments) for (const outcome of judgment.outcomeEvidence ?? []) {
    const memory = memories.find(memory => memory.id === outcome.memoryId);
    if (!memory || !operation.memoryIds.includes(memory.id)) throw new ReconciliationRejectedError('Usefulness outcomes must cite selected experienced memories');
    const lineage = memoryEvidenceLineage(store, memory);
    const source = sources.find(source => source.id === judgment.dispositionId);
    if (!source) throw new ReconciliationRejectedError('Outcome evidence belongs to a supplied source disposition');
    const hypothesis = source.sourcePredictionId ? (source.scaffold
      ? store.versions('prediction', source.sourcePredictionId).find(record => record.state.version === source.scaffold!.hypothesisVersion)?.state
      : store.get('prediction', source.sourcePredictionId)) : null;
    const createdAt = source.development?.evidenceBoundaryAt ?? (source.temporary ? hypothesis?.evidenceOrigin?.formedAt : undefined) ?? source.development?.createdAt
      ?? (source.scaffold ? store.cycle(source.scaffold.createdCycle).startedAt : store.versions('disposition', source.id)[0]?.at);
    const known = new Set(hypothesis?.evidenceOrigin?.knownExperienceIds ?? []);
    const used = observations.coactivations.some(record => record.dispositionIds.includes(source.id)
      && [...(record.recalledMemoryIds[source.id] ?? []), ...(record.experiencedMemoryIds?.[source.id] ?? [])].includes(judgment.memoryId));
    for (const sourceId of outcome.sourceIds) {
      const record = lineage.sources.find(record => record.sourceId === sourceId);
      if (!record) throw new ReconciliationRejectedError('Outcome evidence must trace to a preserved selected external excerpt');
      if (record.available && used && outcome.conditionsMet && outcome.test === 'outcome' && outcome.occurrence === 'after_prediction' && outcome.stance === 'supports' && judgment.usefulness === 'appropriate'
        && (outcome.actionInfluence === 'observational' || (outcome.actionInfluence === 'action_conditioned' && hypothesis?.kind === 'action_conditioned'))
        && !known.has(record.experienceId) && !prior.has(record.experienceId) && !record.experienceId.startsWith('unattributed_')
        && createdAt && record.firstRecordedAt > createdAt && (!record.timestamp || record.timestamp > createdAt)
        && (record.source !== 'Agent' || (outcome.actionInfluence === 'action_conditioned' && hypothesis?.kind === 'action_conditioned'))) roots.add(record.experienceId);
    }
  }
  const alwaysStrengthens = operation.operation === 'INSTITUTIONALIZE' || (operation.operation === 'ASSESS_HYPOTHESIS' && operation.status === 'established' && sources[0]?.development?.status !== 'established');
  const effect = operation.confidenceEffect ?? 'strengthen';
  if (operation.operation === 'ASSESS_HYPOTHESIS' && ['retain', 'refine'].includes(effect) && operation.confidence !== sources[0]?.development?.confidence)
    throw new ReconciliationRejectedError('A confidence wording change must explicitly declare strengthening or weakening');
  const changesConfidence = ['ASSESS_HYPOTHESIS', 'SPECIALIZE', 'GENERALIZE', 'SPLIT', 'MERGE'].includes(operation.operation);
  const strengthens = alwaysStrengthens || (changesConfidence && effect === 'strengthen');
  if (strengthens && !roots.size) throw new ReconciliationRejectedError('Evidential confidence requires a new independent observable outcome, not repeated recall or rewritten memories');
  if (operation.operation === 'INSTITUTIONALIZE' && roots.size < ReconciliationPolicySchema.parse({}).institutionalizationUses)
    throw new ReconciliationRejectedError('Institutionalization requires independently evidenced repeated usefulness; one experience cannot become multiple confirmations');
  if (operation.operation === 'ASSESS_HYPOTHESIS' && operation.status === 'established'
    && new Set([...prior, ...roots]).size < ReconciliationPolicySchema.parse({}).specializationEpisodes)
    throw new ReconciliationRejectedError('Establishment requires repeated independent outcome evidence');
  return strengthens ? [...roots] : [];
}
