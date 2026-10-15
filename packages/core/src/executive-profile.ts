import { z } from 'zod';
import { defaultExecutiveSensitivity, ExecutiveSensitivitySchema } from './executive-sensitivity.js';
import { ExecutiveAttentionSettingsSchema } from './executive-attention.js';

export const ExecutionLimitsSchema = z.strictObject({
  maxSteps: z.number().int().positive().max(1000), maxRetries: z.number().int().min(0).max(20),
  maxParallelJobs: z.number().int().positive().max(100), maxDurationMs: z.number().int().positive().max(86400000),
  maxGuidanceRequests: z.number().int().min(0).max(20),
});
/** External configuration. Unimplemented adapters cannot be selected. */
export const ExecutiveProfileSchema = z.strictObject({
  enabled: z.boolean().default(false),
  modules: z.strictObject({ speaking: z.boolean().default(true), tools: z.boolean().default(true) }).default(() => ({ speaking: true, tools: true })),
  revision: z.number().int().nonnegative(), runtime: z.literal('native'),
  executionMode: z.enum(['synchronous', 'background']).default('synchronous'),
  learningMode: z.enum(['disabled', 'supervised', 'validated_automatic']),
  skillReviewPolicy: z.enum(['researcher_only', 'self_selected']).default('researcher_only'),
  consolidation: z.strictObject({ mode: z.enum(['manual', 'after_verified_execution', 'after_repeated_success']).default('manual'),
    requiredSuccesses: z.number().int().min(2).max(50).default(2) }).default(() => ({ mode: 'manual' as const, requiredSuccesses: 2 })),
  allowEquivalentMethods: z.boolean(), limits: ExecutionLimitsSchema, sensitivity: ExecutiveSensitivitySchema,
  attention: ExecutiveAttentionSettingsSchema.default(() => ExecutiveAttentionSettingsSchema.parse({})),
});
export type ExecutiveProfile = z.infer<typeof ExecutiveProfileSchema>;
export function defaultExecutiveProfile(): ExecutiveProfile {
  return ExecutiveProfileSchema.parse({ revision: 0, runtime: 'native', learningMode: 'supervised',
    allowEquivalentMethods: true,
    limits: { maxSteps: 20, maxRetries: 2, maxParallelJobs: 1, maxDurationMs: 30000, maxGuidanceRequests: 2 },
    sensitivity: defaultExecutiveSensitivity() });
}

/** Permissions gate external dispatch; they never rewrite a selected cognitive proposal. */
export function executiveModuleEnabled(profile: ExecutiveProfile, module: keyof ExecutiveProfile['modules']): boolean {
  return profile.enabled && profile.modules[module];
}
export function executiveActionEnabled(profile: ExecutiveProfile, kind: 'say' | 'ask' | 'operate' | 'wait'): boolean {
  return kind === 'say' || kind === 'ask' ? executiveModuleEnabled(profile, 'speaking')
    : kind === 'operate' ? executiveModuleEnabled(profile, 'tools') : profile.enabled;
}
