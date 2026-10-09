import { z } from 'zod';
import { PredictionUpdateSchema } from '../../core/src/domain.js';

/** Runtime-owned evidence identity must not be invented by outcome reflection. */
export function predictionEvaluationSchema(worldId: string) {
  return PredictionUpdateSchema.extend({ operation: z.literal('resolve'), revision: z.null(),
    evaluation: PredictionUpdateSchema.shape.evaluation.unwrap().extend({ evidenceWorldId: z.literal(worldId) }),
  });
}
