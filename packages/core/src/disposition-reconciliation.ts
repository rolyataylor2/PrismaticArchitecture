import { z } from 'zod';
import { Id, Text, ActivationAssociationSchema } from './domain.js';
import { ProvisionalRelevanceSchema } from './experiential-formation.js';

export const RetrievalJudgmentSchema = z.strictObject({ memoryId: Id, dispositionId: Id,
  usefulness: z.enum(['appropriate', 'misleading', 'unknown']), experiencedContext: Text,
  reason: Text });
const StructuralEvidence = {
  sourceDispositionIds: z.array(Id).min(1).max(12),
  memoryIds: z.array(Id).min(1).max(100),
  judgments: z.array(RetrievalJudgmentSchema).min(1).max(100),
  discriminatingFeatures: z.array(Text).max(30),
  alternativeExplanations: z.array(Text).max(30),
  evidencePreserved: Text, continuityReason: Text, reason: Text,
};
export const ReconciliationOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('NO_CHANGE'), reason: Text }),
  z.strictObject({ operation: z.literal('INSUFFICIENT_EVIDENCE'), reason: Text }),
  z.strictObject({ operation: z.literal('INSTITUTIONALIZE'), ...StructuralEvidence, draft: ProvisionalRelevanceSchema }),
  z.strictObject({ operation: z.literal('ASSESS_HYPOTHESIS'), ...StructuralEvidence,
    status: z.enum(['provisional', 'established']), confidence: Text }),
  z.strictObject({ operation: z.enum(['SPECIALIZE', 'GENERALIZE']), ...StructuralEvidence, draft: ProvisionalRelevanceSchema }),
  z.strictObject({ operation: z.literal('SPLIT'), ...StructuralEvidence, children: z.array(ProvisionalRelevanceSchema).min(2).max(12) }),
  z.strictObject({ operation: z.literal('MERGE'), ...StructuralEvidence, draft: ProvisionalRelevanceSchema }),
  z.strictObject({ operation: z.enum(['ADD_ASSOCIATION', 'REMOVE_ASSOCIATION']), ...StructuralEvidence, association: ActivationAssociationSchema }),
  z.strictObject({ operation: z.enum(['ADD_DEPENDENCY', 'REMOVE_DEPENDENCY']), ...StructuralEvidence, dependencyId: Id }),
  z.strictObject({ operation: z.literal('ARCHIVE'), ...StructuralEvidence, scopeCoverage: Text }),
]);
export const DispositionReconciliationSchema = z.strictObject({ operations: z.array(ReconciliationOperationSchema).max(30), reason: Text });
export type ReconciliationOperation = z.infer<typeof ReconciliationOperationSchema>;

/** Experimental operation-specific minimums, supplied by code rather than invented by inference. */
export const ReconciliationPolicySchema = z.strictObject({
  institutionalizationUses: z.number().int().min(2).default(2),
  specializationEpisodes: z.number().int().min(2).default(2),
  generalizationEpisodes: z.number().int().min(3).default(3),
  splitEpisodesPerCluster: z.number().int().min(2).default(2),
  mergeCoactivations: z.number().int().min(3).default(3),
  archiveEpisodes: z.number().int().min(3).default(3),
});

export type ReconciliationObservations = {
  episodes: { memoryId: string; cycleId: string; context: string[] }[];
  coactivations: { cycleId: string; dispositionIds: string[]; recalledMemoryIds: Record<string, string[]>; experiencedMemoryIds?: Record<string, string[]> }[];
};

/** Counts come from recorded cycles; semantic judgments remain explicit model proposals. */
export function validateReconciliationEvidence(operation: ReconciliationOperation, observations: ReconciliationObservations,
  policy = ReconciliationPolicySchema.parse({})) {
  if (operation.operation === 'NO_CHANGE' || operation.operation === 'INSUFFICIENT_EVIDENCE') return;
  const episodes = observations.episodes.filter(episode => operation.memoryIds.includes(episode.memoryId));
  const count = new Set(episodes.map(episode => episode.cycleId)).size;
  if (episodes.length !== operation.memoryIds.length) throw new Error('Missing recorded reconciliation episodes');
  if (operation.operation === 'INSTITUTIONALIZE') {
    const appropriate = operation.judgments.filter(judgment => judgment.usefulness === 'appropriate');
    const uses = observations.coactivations.filter(record => appropriate.some(judgment => record.dispositionIds.includes(judgment.dispositionId)
      && [...(record.recalledMemoryIds[judgment.dispositionId] ?? []), ...(record.experiencedMemoryIds?.[judgment.dispositionId] ?? [])].includes(judgment.memoryId)));
    if (new Set(uses.map(record => record.cycleId)).size < policy.institutionalizationUses
      || operation.sourceDispositionIds.some(source => !appropriate.some(judgment => judgment.dispositionId === source && uses.some(record =>
        record.dispositionIds.includes(source) && [...(record.recalledMemoryIds[source] ?? []), ...(record.experiencedMemoryIds?.[source] ?? [])].includes(judgment.memoryId)))))
      throw new Error('Institutionalization requires repeated recorded ordinary-use evidence, not prediction correctness alone');
  }
  if (operation.operation === 'ASSESS_HYPOTHESIS' && (count < policy.specializationEpisodes
    || (operation.status === 'established' && operation.judgments.some(judgment => judgment.usefulness !== 'appropriate'))))
    throw new Error('Hypothesis assessment requires repeated retrieval evidence; establishment requires appropriate recall');
  if (operation.operation === 'SPECIALIZE' && count < policy.specializationEpisodes) throw new Error('Specialization requires repeated experience');
  if (operation.operation === 'GENERALIZE') {
    const contexts = new Set(episodes.map(episode => JSON.stringify(episode.context)));
    if (count < policy.generalizationEpisodes || contexts.size < 2
      || operation.judgments.some(judgment => judgment.usefulness !== 'appropriate'))
      throw new Error('Generalization requires appropriate retrieval across distinct repeated experienced contexts');
  }
  if (operation.operation === 'SPLIT') {
    for (const usefulness of ['appropriate', 'misleading']) {
      const ids = new Set(operation.judgments.filter(judgment => judgment.usefulness === usefulness).map(judgment => judgment.memoryId));
      if (new Set(episodes.filter(episode => ids.has(episode.memoryId)).map(episode => episode.cycleId)).size < policy.splitEpisodesPerCluster)
        throw new Error('Split requires repeated appropriate and misleading retrieval clusters');
    }
    if (!operation.discriminatingFeatures.length) throw new Error('Split requires an experienced contextual distinction');
  }
  if (operation.operation === 'MERGE') {
    const overlapping = observations.coactivations.filter(record => operation.sourceDispositionIds.every(source => record.dispositionIds.includes(source))
      && operation.sourceDispositionIds.every(source => operation.sourceDispositionIds.every(other => source === other
        || (record.recalledMemoryIds[source] ?? []).some(memoryId => (record.recalledMemoryIds[other] ?? []).includes(memoryId)))));
    if (new Set(overlapping.map(record => record.cycleId)).size < policy.mergeCoactivations)
      throw new Error('Merge requires repeated recorded coactivation with overlapping recall');
  }
  if (operation.operation === 'ARCHIVE') {
    if (count < policy.archiveEpisodes) throw new Error('Archival requires repeated lived evidence');
    const misleading = operation.judgments.every(judgment => judgment.usefulness === 'misleading');
    const source = operation.sourceDispositionIds[0]!;
    const redundancy = observations.coactivations.filter(record => record.dispositionIds.includes(source)
      && record.dispositionIds.some(other => other !== source
        && (record.recalledMemoryIds[source] ?? []).length > 0
        && (record.recalledMemoryIds[source] ?? []).every(memoryId => (record.recalledMemoryIds[other] ?? []).includes(memoryId))));
    if (!misleading && new Set(redundancy.map(record => record.cycleId)).size < policy.mergeCoactivations)
      throw new Error('Archival requires repeated misleading retrieval or recorded redundancy, not mere prediction failure');
  }
}

/** Verify selected citations and structural authority before interpreting evidence in commits. */
export function validateReconciliationCitations(operation: ReconciliationOperation, memoryIds: readonly string[], dispositionIds: readonly string[]) {
  if (operation.operation === 'NO_CHANGE' || operation.operation === 'INSUFFICIENT_EVIDENCE') return;
  const selected = new Set(memoryIds); const existing = new Set(dispositionIds);
  if (new Set(operation.memoryIds).size !== operation.memoryIds.length || operation.memoryIds.some(memoryId => !selected.has(memoryId))
    || new Set(operation.sourceDispositionIds).size !== operation.sourceDispositionIds.length
    || operation.sourceDispositionIds.some(dispositionId => !existing.has(dispositionId)))
    throw new Error('Reconciliation requires unique selected memories and existing source dispositions');
  for (const judgment of operation.judgments) {
    if (!operation.memoryIds.includes(judgment.memoryId) || !operation.sourceDispositionIds.includes(judgment.dispositionId))
      throw new Error('Retrieval judgments must cite the operation evidence and sources');
  }
  const judgmentKeys = operation.judgments.map(judgment => JSON.stringify([judgment.dispositionId, judgment.memoryId]));
  if (new Set(judgmentKeys).size !== judgmentKeys.length)
    throw new Error('An episode cannot receive conflicting retrieval judgments for the same disposition');
  if (operation.operation === 'MERGE' && operation.sourceDispositionIds.length < 2)
    throw new Error('Merge requires multiple preserved source lineages');
  if (operation.operation !== 'MERGE' && operation.operation !== 'INSTITUTIONALIZE' && operation.sourceDispositionIds.length !== 1)
    throw new Error('This operation requires one source disposition');
  if ('dependencyId' in operation && (!existing.has(operation.dependencyId) || operation.sourceDispositionIds.includes(operation.dependencyId)))
    throw new Error('Dependency operations require another existing disposition');
  if ('association' in operation && operation.association.kind === 'disposition'
    && (!existing.has(operation.association.dispositionId) || operation.sourceDispositionIds.includes(operation.association.dispositionId)))
    throw new Error('Association operations require another existing disposition');
  const drafts = 'children' in operation ? operation.children : 'draft' in operation ? [operation.draft] : [];
  for (const draft of drafts) {
    if (draft.prerequisites.some(parent => !existing.has(parent))) throw new Error('Structural prerequisites require existing dispositions');
    if (draft.activationAssociations?.some(association => association.kind === 'disposition' && !existing.has(association.dispositionId)))
      throw new Error('Structural associations require existing dispositions');
    for (const cue of [...draft.activationCues, ...draft.contextCues, ...draft.internalStateCues])
      if (cue.memoryIds.some(memoryId => !operation.memoryIds.includes(memoryId))) throw new Error('Structural cues require selected operation evidence');
  }
}
