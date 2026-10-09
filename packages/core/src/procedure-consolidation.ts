import { z } from 'zod';
import { FactSchema } from './domain.js';
import { OperationSchema } from './operation.js';
const Ref = z.string().min(1).max(200); const Text = z.string().trim().min(1).max(16000);
export const ProcedureEpisodeSchema = z.strictObject({ contractId: Ref, cycleId: Ref, threadId: Ref.nullable(),
  goal: Text, argument: Text, bidId: Ref, method: OperationSchema, outcome: z.string(),
  evidence: z.enum(['passed', 'failed', 'inconclusive']), limitations: z.array(Text),
  contextCoverage: z.strictObject({ observations: z.number().int().nonnegative(), activations: z.number().int().nonnegative(),
    expressedProducts: z.number().int().nonnegative(), omittedSelectedProducts: z.number().int().nonnegative() }).optional(),
  correctionChain: z.strictObject({ rootContractId: Ref, contractIds: z.array(Ref).min(2).max(200), executionIds: z.array(Ref).min(2).max(200) }).optional(),
  observations: z.array(FactSchema).max(20),
  activations: z.array(z.strictObject({ cycleId: Ref, phase: z.string(), dispositionId: Ref, version: z.number().int().positive(), concern: Text, cues: z.array(Text), score: z.number().min(0).max(4) })).max(100),
  expressedProducts: z.array(z.strictObject({ eventId: Ref, cycleId: Ref, kind: z.string(), partId: Ref.nullable(), bidId: Ref.nullable(), selected: z.boolean(), text: Text })).max(100) });
export const ProcedureConsolidationInputSchema = z.strictObject({ agentId: Ref, episodes: z.array(ProcedureEpisodeSchema).max(50) });
export type ProcedureConsolidationInput = z.infer<typeof ProcedureConsolidationInputSchema>;
export const ProcedureConsolidationSchema = z.strictObject({ candidates: z.array(z.strictObject({ name: Text,
  conditions: z.array(Text).min(1).max(30), reason: Text, escalate: z.array(Text).max(30),
  branches: z.array(z.strictObject({ sourceContractId: Ref, when: z.array(Text).min(1).max(30), reason: Text })).min(1).max(20),
})).max(10), reason: Text });
export type ProcedureConsolidation = z.infer<typeof ProcedureConsolidationSchema>;
