import { z } from 'zod';
import { Id, MemorySchema, PartDraftSchema, PartPatchSchema, Text, type Activation, type Memory, type Part, type Prediction } from './domain.js';

export const DevelopmentProposalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('update'), reason: Text, patch: PartPatchSchema }),
  z.strictObject({ kind: z.literal('memory_revision'), reason: Text, memoryId: Id, content: Text, gist: Text }),
  z.strictObject({ kind: z.literal('formation'), reason: Text, draft: PartDraftSchema, associationMeaning: Text }),
  z.strictObject({ kind: z.literal('no_change'), reason: Text }),
  z.strictObject({ kind: z.enum(['split', 'merge', 'specialize']), reason: Text, relatedPartIds: z.array(Id), description: Text }),
]);
export const DevelopmentResultSchema = z.strictObject({ proposals: z.array(DevelopmentProposalSchema).max(12) });
export type DevelopmentProposal = z.infer<typeof DevelopmentProposalSchema>;
export type ConsolidationContext = {
  part: Part; memories: Memory[]; predictions: Prediction[];
  activations: { cycleId: string; activation: Activation }[];
  thoughts: { cycleId: string; interpretation: string; thought: string }[];
  primitiveAppraisals?: { cycleId: string; primitiveId: string; name: string; score: number; active: boolean; thought: string | null; interpretation: string | null }[];
  coactivated: { partId: string; count: number }[]; repeatedReferents: { name: string; count: number }[];
  population: { id: string; name: string; mode: Part['mode']; triggers: string[] }[];
};
export const ReplayResultSchema = z.strictObject({ reason: Text, revision: MemorySchema.pick({ content: true, gist: true }).nullable() });
export type ConsolidationRun = {
  id: string; agentId: string; startedAt: string; status: 'running' | 'completed' | 'failed';
  fromCycle: number; toCycle: number; provider: string;
  selections: { partId: string; memoryIds: string[]; predictionIds: string[]; thoughtCycles: string[]; repeatedReferents: { name: string; count: number }[]; coactivated: { partId: string; count: number }[] }[];
  changes: { partId: string; proposal: DevelopmentProposal; accepted: boolean; explanation: string; beforeVersion: number; afterVersion: number; createdPartId: string | null }[];
  constructedLearning?: { dispositionIds: string[]; revisedMemoryIds: string[]; reason: string };
  error: string | null;
};
