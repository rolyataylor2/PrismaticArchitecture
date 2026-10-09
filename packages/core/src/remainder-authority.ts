import { z } from 'zod';
import { ExecutionLimitsSchema } from './executive-profile.js';

const Ref = z.string().min(1).max(200);
/** Captured host preparation, not an instruction or a consumption receipt. */
export const RemainderAuthoritySchema = z.strictObject({
  parentExecutionId: Ref, parentContractId: Ref, checkpointTraceId: Ref,
  completedSteps: z.number().int().positive().max(1000), completedTraceRefs: z.array(Ref).min(1).max(1000),
  deadlineAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), limits: ExecutionLimitsSchema,
}).superRefine((value, context) => {
  if (value.completedSteps !== value.completedTraceRefs.length || new Set(value.completedTraceRefs).size !== value.completedTraceRefs.length
    || value.completedTraceRefs.at(-1) !== value.checkpointTraceId)
    context.addIssue({ code: 'custom', message: 'Remainder authority must capture the exact distinct settled prefix' });
});
export type RemainderAuthority = z.infer<typeof RemainderAuthoritySchema>;
