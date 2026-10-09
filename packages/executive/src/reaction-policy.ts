import { ExecutiveSensitivitySchema, OperationalObservationSchema, type ExecutiveSensitivity,
  type OperationalSignal } from '../../core/src/executive-sensitivity.js';
import type { z } from 'zod';
import type { ExecutiveReactionSchema, OperationalObservationSchema as ObservationSchema } from '../../core/src/executive-sensitivity.js';

type Reaction = z.infer<typeof ExecutiveReactionSchema>;
type Observation = z.infer<typeof ObservationSchema>;

/** External per-job policy state. This has no activation, memory or tool authority. */
export class ExecutiveReactionPolicy {
  private readonly lastResponse = new Map<OperationalSignal, number>();
  private readonly profile: ExecutiveSensitivity;
  private lastTimestamp = -1;
  constructor(profile: ExecutiveSensitivity) { this.profile = ExecutiveSensitivitySchema.parse(profile); }

  evaluate(observation: Observation, context: {
    risk: 'harmless' | 'consequential'; timestampMs: number;
    constraintViolated?: boolean; unresolvedSubmission?: boolean;
  }): Reaction {
    const observed = OperationalObservationSchema.parse(observation);
    if (!Number.isSafeInteger(context.timestampMs) || context.timestampMs < 0 || context.timestampMs < this.lastTimestamp)
      throw new Error('Reaction policy requires monotonic nonnegative timestamps');
    this.lastTimestamp = context.timestampMs;
    const result = (response: Reaction['response'], reason: string, suppressedByCooldown = false): Reaction =>
      ({ signal: observed.signal, response, reason, suppressedByCooldown });
    if (context.constraintViolated) return result('stop', 'An approved constraint was violated; policy cannot authorize continuation.');
    if (context.unresolvedSubmission) return result('stop', 'A submitted operation remains unresolved; repetition requires verified evidence and authority.');
    const setting = this.profile[observed.signal];
    const intensity = observed.intensity * (context.risk === 'consequential' ? this.profile.consequentialRiskMultiplier : 1);
    if (observed.intensity === 0 || intensity < setting.threshold) return result('continue', 'Observation is below the configured reaction threshold.');
    const previous = this.lastResponse.get(observed.signal);
    if (previous !== undefined && context.timestampMs - previous < setting.cooldownMs)
      return result('continue', 'Repeated advisory response suppressed during cooldown; authority and safety checks still apply.', true);
    this.lastResponse.set(observed.signal, context.timestampMs);
    if (observed.signal === 'novelty' || observed.signal === 'surprise')
      return result(context.risk === 'harmless' ? 'inspect' : 'request_guidance',
        context.risk === 'harmless' ? 'Inspect the unfamiliar or unexpected observation within existing authority.' : 'Resolve unfamiliar or unexpected conditions before consequential continuation.');
    if (observed.signal === 'uncertainty' && context.risk === 'harmless')
      return result('inspect', 'A harmless authorized inspection may reduce operational uncertainty.');
    return result('request_guidance', 'Operational difficulty meets the configured threshold; request instruction through ordinary cognition.');
  }
}
