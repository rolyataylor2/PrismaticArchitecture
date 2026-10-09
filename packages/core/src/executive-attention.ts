import { z } from 'zod';

export const ExecutiveCheckpointKindSchema = z.enum(['tool_result', 'environment']);
const Unit = z.number().finite().min(0).max(1);
export const ExecutiveAttentionSettingsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  reviewInterested: z.boolean().default(false),
  awaitCheckpointReview: z.boolean().default(false),
  relevanceThreshold: z.number().finite().min(0).max(4).default(3),
  competenceThreshold: Unit.default(0.6), coverageThreshold: Unit.default(0.5),
  hysteresis: z.number().finite().min(0).max(4).default(0.5),
  cooldownMs: z.number().int().min(0).max(86400000).default(3000),
  checkpoints: ExecutiveCheckpointKindSchema.array().min(1).max(2).refine(values => new Set(values).size === values.length).default(['tool_result', 'environment']),
}).refine(settings => settings.hysteresis <= settings.relevanceThreshold, 'Hysteresis cannot exceed the relevance threshold');
export type ExecutiveAttentionSettings = z.infer<typeof ExecutiveAttentionSettingsSchema>;
/** Attributed operational estimates, not activation, factual truth or psychological confidence. */
export const ExecutiveCompetenceSchema = z.strictObject({
  confidence: Unit.nullable(), coverage: Unit.nullable(), evidence: z.string().min(1).max(4000),
});
export type ExecutiveCompetence = z.infer<typeof ExecutiveCompetenceSchema>;
export type ExecutiveAttentionRecord = {
  executionId: string; contractId: string; checkpoint: z.infer<typeof ExecutiveCheckpointKindSchema>;
  state: 'background' | 'interested' | 'intervention'; relevance: number; competent: boolean | null; covered: boolean | null;
  competence: ExecutiveCompetence; reasons: string[]; changedEvidence: boolean; suppressed: boolean;
  evidenceKey: string; at: string; profileRevision: number;
};

/** Advisory attention only. Existing authorization gates never consult this function. */
export function evaluateExecutiveAttention(input: {
  settings: ExecutiveAttentionSettings; relevance: number; competence: ExecutiveCompetence;
  evidenceKey: string; at: string; previous?: ExecutiveAttentionRecord;
}): Pick<ExecutiveAttentionRecord, 'state' | 'competent' | 'covered' | 'reasons' | 'changedEvidence' | 'suppressed'> {
  const settings = ExecutiveAttentionSettingsSchema.parse(input.settings);
  const relevance = z.number().finite().min(0).max(4).parse(input.relevance);
  const competence = ExecutiveCompetenceSchema.parse(input.competence);
  const competent = competence.confidence === null ? null : competence.confidence >= settings.competenceThreshold;
  const covered = competence.coverage === null ? null : competence.coverage >= settings.coverageThreshold;
  const changedEvidence = !input.previous || input.previous.evidenceKey !== input.evidenceKey;
  const threshold = input.previous && input.previous.state !== 'background' ? settings.relevanceThreshold - settings.hysteresis : settings.relevanceThreshold;
  const reasons = [ ...(relevance >= threshold ? ['Relevant disposition activation warrants consideration.'] : []),
    ...(competent === false ? ['Operational competence is below its independent threshold.'] : []),
    ...(covered === false ? ['Procedure coverage is below its independent threshold.'] : []) ];
  const gap = competent === false || covered === false;
  const elapsed = input.previous ? Date.parse(input.at) - Date.parse(input.previous.at) : Infinity;
  // Repeated polling does not reset the cooldown: the host retains the last unsuppressed interested record.
  const suppressed = reasons.length > 0 && !changedEvidence && !gap && elapsed >= 0 && elapsed < settings.cooldownMs;
  if (suppressed) reasons.push('Unchanged advisory signal is within its review cooldown.');
  if (competent === null) reasons.push('Operational competence was not assessed; low activation does not establish competence.');
  if (covered === null) reasons.push('Procedure coverage was not assessed; absent activation does not establish coverage.');
  return { state: (relevance >= threshold || gap) && !suppressed ? 'interested' : 'background', competent, covered, reasons, changedEvidence, suppressed };
}
