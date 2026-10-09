import { z } from 'zod';
import { DispositionDraftSchema, Id, Text } from './domain.js';

/** Cues require experiential citations. IDs, lifecycle and statistics remain runtime-owned. */
export const ExperiencedCueSchema = z.strictObject({ text: Text, memoryIds: z.array(Id).min(1).max(100) });
export const ProvisionalRelevanceSchema = z.strictObject({
  name: DispositionDraftSchema.shape.name,
  concern: DispositionDraftSchema.shape.concern,
  scope: DispositionDraftSchema.shape.scope,
  activationCues: z.array(ExperiencedCueSchema).min(1).max(30),
  contextCues: z.array(ExperiencedCueSchema).max(30),
  internalStateCues: z.array(ExperiencedCueSchema).max(30),
  retrievalIntent: Text,
  prerequisites: DispositionDraftSchema.shape.prerequisites,
  activationAssociations: DispositionDraftSchema.shape.activationAssociations,
  confidence: Text,
});

/** Online formation cannot propose semantic rewrites or structural consolidation. */
export const ExperientialFormationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('NO_CHANGE'), reason: Text }),
  z.strictObject({ operation: z.literal('ATTACH_TO_EXISTING'), dispositionId: Id,
    memoryIds: z.array(Id).min(1).max(100), reason: Text }),

]);
/** Current online authority: attach attributed evidence, never create persistent structure. */
export const ExperienceAttachmentSchema = ExperientialFormationSchema;
export type ExperientialFormation = z.infer<typeof ExperientialFormationSchema>;

export function cueEvidence(draft: z.infer<typeof ProvisionalRelevanceSchema>) {
  return [
    ...draft.activationCues.map(cue => ({ cue: cue.text, memoryIds: cue.memoryIds, kind: 'activation' as const })),
    ...draft.contextCues.map(cue => ({ cue: cue.text, memoryIds: cue.memoryIds, kind: 'context' as const })),
    ...draft.internalStateCues.map(cue => ({ cue: cue.text, memoryIds: cue.memoryIds, kind: 'internal' as const })),
  ];
}

/** Validate proposal citations before any state is committed; never infer their meaning. */
export function validateExperientialFormation(result: ExperientialFormation, availableMemoryIds: readonly string[],
  existingDispositionIds: readonly string[]): void {
  if (result.operation === 'NO_CHANGE') return;
  const memories = new Set(availableMemoryIds);
  const dispositions = new Set(existingDispositionIds);
  if (new Set(result.memoryIds).size !== result.memoryIds.length || result.memoryIds.some(memoryId => !memories.has(memoryId)))
    throw new Error('Experiential formation requires unique supplied subjective memory evidence');
  if (!dispositions.has(result.dispositionId)) throw new Error('Evidence attachment requires a supplied existing disposition');
}
