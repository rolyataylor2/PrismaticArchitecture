import { z } from 'zod';

export const SynthesisPolicySchema = z.strictObject({
  detailPolicy: z.enum(['preserve_details', 'trace_belief_changes', 'compact_current_view']).default('preserve_details'),
  synthesisInstructions: z.string().max(4000).default(''),
});
export type SynthesisPolicy = z.infer<typeof SynthesisPolicySchema>;
