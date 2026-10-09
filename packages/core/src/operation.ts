import { z } from 'zod';
import { ToolPermissionSchema } from './mcp-configuration.js';
import { TeachProcedureSchema } from './procedure-teaching.js';

const Text = z.string().trim().min(1).max(16000);
const json = (text: string) => { try { JSON.parse(text); return true; } catch { return false; } };
export const ToolStepSchema = ToolPermissionSchema.extend({ argumentsJson: Text.refine(text => {
  if (!json(text)) return false;
  const value: unknown = JSON.parse(text);
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}, 'Tool arguments must encode a JSON object') });
/** Selected strategy and observable criterion, not a framework-authored psychological goal. */
export const OperationSchema = z.strictObject({
  successCriteria: Text, constraints: z.array(Text).max(30),
  skillReview: z.strictObject({ skillId: z.string().min(1).max(200), version: z.number().int().positive(),
    decision: z.enum(['approval', 'rejection']), reason: Text }).optional(),
  guidanceResponse: z.strictObject({ requestId: z.string().min(1).max(200), newInformation: Text }).optional(),
  remainderCorrection: z.strictObject({ executionId: z.string().min(1).max(200), checkpointTraceId: z.string().min(1).max(200) }).optional().describe('One-time correction of the future remainder at an exact checkpoint. This does not authorize replay or an independent task; unsupported handoff is rejected.'),
  teachProcedure: TeachProcedureSchema.optional(),
  skillInvocation: z.strictObject({ skillId: z.string().min(1).max(200), version: z.number().int().positive(), branchId: z.string().min(1).max(200).optional() }).optional(),
  intervention: z.strictObject({ executionId: z.string().min(1).max(200), directive: z.literal('pause') }).optional(),
  steps: z.array(ToolStepSchema).max(20),
  verification: ToolStepSchema.extend({ path: z.array(z.string().max(200)).max(20),
    expectedJson: Text.refine(json, 'Verification expectation must encode JSON') }).nullable().describe('A separately selected verification tool call, including serverId, toolName, argumentsJson, path relative to structuredContent, and expectedJson. Repeating a tool in steps does not select a criterion. Null leaves the outcome unverified.'),
}).superRefine((operation, context) => {
  if (operation.skillReview && (operation.steps.length || operation.verification || operation.intervention || operation.guidanceResponse
    || operation.teachProcedure || operation.skillInvocation || operation.remainderCorrection))
    context.addIssue({ code: 'custom', message: 'Skill review is exclusive and cannot carry tool or other execution bindings' });
  if (operation.remainderCorrection && (operation.intervention || operation.guidanceResponse || operation.teachProcedure || operation.skillInvocation))
    context.addIssue({ code: 'custom', message: 'Remainder correction is exclusive of other one-time execution bindings' });
  if (operation.intervention && (operation.steps.length || operation.verification || operation.guidanceResponse || operation.teachProcedure || operation.skillInvocation || operation.remainderCorrection))
    context.addIssue({ code: 'custom', message: 'A selected pause is exclusive and cannot carry tool, teaching, invocation or guidance authority' });
});
export type Operation = z.infer<typeof OperationSchema>;
/** One-time guidance attribution is preserved in contracts, not reusable procedural authority. */
export function retainedProcedure(operation: Operation): Operation {
  const { guidanceResponse: _response, teachProcedure: _teaching, skillInvocation: _invocation, intervention: _intervention, remainderCorrection: _correction, skillReview: _review, ...procedure } = operation;
  return procedure;
}
