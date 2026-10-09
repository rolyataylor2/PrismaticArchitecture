import { z } from 'zod';

const Ref = z.string().min(1).max(200);
const Text = z.string().trim().min(1).max(16000);
/** External operational question. No Part routing, psychological meaning or tool authority. */
export const ExecutionGuidanceSchema = z.strictObject({
  id: Ref, executionId: Ref, contractId: Ref, createdAt: z.iso.datetime(),
  goal: Text, problem: Text, attempted: z.array(Text).max(20),
  uncertainty: Text, requestedInstruction: Text, traceRefs: z.array(Ref).max(1000),
  state: z.literal('awaiting_instruction'),
});
export type ExecutionGuidance = z.infer<typeof ExecutionGuidanceSchema>;
/** Current public selected-intent observations, not psychological state or occurred outcomes. */
export const ExternalExecutionRequestSchema = z.strictObject({ requestId: Ref, executionId: Ref, contractId: Ref,
  selectedGoal: Text, selectedConstraints: z.array(Text).max(30), selectedSuccessCriteria: Text,
  problem: Text, requestedInstruction: Text, uncertainty: Text });
export type ExternalExecutionRequest = z.infer<typeof ExternalExecutionRequestSchema>;
export const GuidanceContinuationSchema = z.strictObject({
  parentExecutionId: Ref, parentContractId: Ref, requestId: Ref, rootContractId: Ref,
  requestsUsed: z.number().int().min(1).max(20), maxRequests: z.number().int().min(1).max(20), newInformation: Text,
}).refine(value => value.requestsUsed <= value.maxRequests, 'Guidance chain budget is exhausted');
export type GuidanceContinuation = z.infer<typeof GuidanceContinuationSchema>;

/** Bounded external report, not the full execution ledger. */
export function guidanceFeedback(request: ExecutionGuidance): string {
  return `Executive guidance request ${request.id} for execution ${request.executionId}: `
    + `Goal: ${request.goal.slice(0, 1000)}. Problem: ${request.problem.slice(0, 1000)}. `
    + `Attempted: ${request.attempted.map(item => item.slice(0, 150)).join('; ') || 'none; no tools submitted'}. `
    + `Uncertainty: ${request.uncertainty.slice(0, 500)}. Requested instruction: ${request.requestedInstruction.slice(0, 1000)}. `
    + 'Execution is awaiting instruction; this request grants no authority to resume or repeat tool calls.';
}
