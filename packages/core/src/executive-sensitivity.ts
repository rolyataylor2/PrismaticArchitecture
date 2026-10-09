import { z } from 'zod';

export const OperationalSignalSchema = z.enum(['failure', 'drift', 'surprise', 'novelty', 'uncertainty']);
export type OperationalSignal = z.infer<typeof OperationalSignalSchema>;
const Unit = z.number().finite().min(0).max(1);
export const SensitivitySettingSchema = z.strictObject({
  threshold: Unit, minThreshold: Unit, maxThreshold: Unit,
  cooldownMs: z.number().int().min(0).max(86400000),
}).refine(setting => setting.minThreshold <= setting.threshold && setting.threshold <= setting.maxThreshold,
  'Threshold must remain within configured bounds');
export const ExecutiveSensitivitySchema = z.strictObject({
  failure: SensitivitySettingSchema, drift: SensitivitySettingSchema, surprise: SensitivitySettingSchema,
  novelty: SensitivitySettingSchema, uncertainty: SensitivitySettingSchema,
  consequentialRiskMultiplier: z.number().finite().min(1).max(10),
});
export type ExecutiveSensitivity = z.infer<typeof ExecutiveSensitivitySchema>;
export const OperationalObservationSchema = z.strictObject({
  signal: OperationalSignalSchema, intensity: Unit, evidence: z.string().trim().min(1).max(2000),
});
export const ExecutiveReactionSchema = z.strictObject({
  signal: OperationalSignalSchema,
  response: z.enum(['continue', 'inspect', 'request_guidance', 'stop']),
  reason: z.string().trim().min(1).max(2000), suppressedByCooldown: z.boolean(),
});
export const ExecutiveDiagnosticsSchema = z.strictObject({
  risk: z.enum(['harmless', 'consequential']),
  observations: z.array(OperationalObservationSchema).max(100),
  reactions: z.array(ExecutiveReactionSchema).max(100),
});

/** Engineering defaults; these numbers are not calibrated psychological measures. */
export function defaultExecutiveSensitivity(): ExecutiveSensitivity {
  const setting = () => ({ threshold: 0.5, minThreshold: 0.1, maxThreshold: 0.9, cooldownMs: 10000 });
  return ExecutiveSensitivitySchema.parse({ failure: setting(), drift: setting(), surprise: setting(),
    novelty: setting(), uncertainty: setting(), consequentialRiskMultiplier: 1.5 });
}

/** Only threshold proposals within existing host bounds; changing bounds is a configuration operation. */
export function reviseSensitivityThresholds(profile: ExecutiveSensitivity,
  proposals: Partial<Record<OperationalSignal, number>>): ExecutiveSensitivity {
  const current = ExecutiveSensitivitySchema.parse(profile);
  for (const signal of OperationalSignalSchema.options) {
    const threshold = proposals[signal];
    if (threshold !== undefined) current[signal] = SensitivitySettingSchema.parse({ ...current[signal], threshold });
  }
  return current;
}
