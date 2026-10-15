import { z } from 'zod';

/** Operational configuration and workload estimates, never persistent psychology. */
export const ThoughtRoutingSettingsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  intuitiveModel: z.string().min(1).max(100),
  deliberativeModel: z.string().min(1).max(100),
  escalateAfterIncorrectPredictions: z.number().int().min(1).max(10).optional(),
});
export type ThoughtRoutingSettings = z.infer<typeof ThoughtRoutingSettingsSchema>;
export const ThoughtResourcesSchema = z.strictObject({
  difficulty: z.enum(['simple', 'complex']), uncertainty: z.enum(['low', 'high']),
  urgency: z.enum(['routine', 'urgent']), reason: z.string().min(1).max(4000),
});
export type ThoughtResources = z.infer<typeof ThoughtResourcesSchema>;
export function thoughtResourceModel(settings: ThoughtRoutingSettings, assessment: ThoughtResources): string {
  return assessment.difficulty === 'complex' || assessment.uncertainty === 'high'
    ? settings.deliberativeModel : settings.intuitiveModel;
}
