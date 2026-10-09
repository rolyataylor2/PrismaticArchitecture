import { z } from 'zod';
const Ref = z.string().min(1).max(200); const Text = z.string().trim().min(1).max(16000);
export const TeachProcedureSchema = z.strictObject({ name: Text, conditions: z.array(Text).min(1).max(30),
  scope: z.enum(['agent', 'thread']), skillId: Ref.optional(), expectedVersion: z.number().int().positive().optional(),
}).refine(value => Boolean(value.skillId) === (value.expectedVersion !== undefined), 'Revision requires both skill ID and expected version');
export const ProcedureTeachingReportSchema = z.strictObject({ executionId: Ref, contractId: Ref,
  outcome: z.enum(['needs_guidance', 'continued', 'completed', 'failed', 'blocked', 'unverified']),
  status: z.enum(['skipped', 'proposed', 'active', 'rejected']), reason: Text,
  skillId: Ref.optional(), skillVersion: z.number().int().positive().optional(),
  validation: z.enum(['passed', 'failed', 'inconclusive']).optional(),
});
export type ProcedureTeachingReport = z.infer<typeof ProcedureTeachingReportSchema>;
export function teachingFeedback(report: ProcedureTeachingReport): string {
  return `Executive procedure teaching for execution ${report.executionId}: ${report.status}. ${report.reason.slice(0, 2000)}`
    + (report.skillId ? ` Procedure ${report.skillId}, version ${report.skillVersion}; validation: ${report.validation ?? 'not recorded'}.` : '')
    + ' Recorded exact-input validation does not prove condition applicability or transfer.';
}
