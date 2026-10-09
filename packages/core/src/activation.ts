import { z } from 'zod';
import { InfrastructureError } from './contracts.js';

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
