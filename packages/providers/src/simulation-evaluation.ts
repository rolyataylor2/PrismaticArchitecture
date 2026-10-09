import { z } from 'zod';

export const SimulationEvaluationSchema = z.strictObject({
  measures: z.array(z.strictObject({
    criterionId: z.string().min(1),
    outcome: z.enum(['observed', 'not_observed', 'inconclusive']),
    evidenceReferences: z.array(z.string().min(1)).max(20),
    explanation: z.string().trim().min(1),
    counterevidence: z.string().trim().min(1),
    limitations: z.string().trim().min(1),
  })).min(1),
});
export type SimulationEvaluation = z.infer<typeof SimulationEvaluationSchema>;
