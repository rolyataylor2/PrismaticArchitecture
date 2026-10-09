import { z } from 'zod';
import { Id, Text, PredictionDraftSchema, CognitionSchema } from './domain.js';

/** Expressed products, never private Part records or sovereign Self state. */
export const CoverageProductSchema = z.strictObject({ partId: Id,
  dispositionIds: z.array(Id), interpretation: Text, thought: Text,
  evidenceSummary: z.array(Text), prediction: Text.nullable(),
  proposal: CognitionSchema.shape.proposal,
});
export const HypothesisAdjustmentSchema = z.strictObject({ predictionId: Id,
  operation: z.enum(['revise', 'abandon', 'expire', 'invalidate']),
  revision: PredictionDraftSchema.nullable(), reason: Text,
}).refine(value => (value.operation === 'revise') === (value.revision !== null), 'Only revision supplies a replacement hypothesis');
const adjustments = z.array(HypothesisAdjustmentSchema).max(3).optional();
export const CognitionCoverageSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('SUFFICIENT'), adjustments, reason: Text }),
  z.strictObject({ operation: z.literal('INVESTIGATE'), adjustments, gap: Text, consequentialValue: Text,
    hypotheses: z.array(z.strictObject({ prediction: PredictionDraftSchema,
      futureInference: z.strictObject({ prediction: Text, retrieval: Text, causal: Text, action: Text, compression: Text }),
      existingStructureInsufficient: Text,
    })).min(1).max(3), reason: Text }),
]);
export type CognitionCoverage = z.infer<typeof CognitionCoverageSchema>;
