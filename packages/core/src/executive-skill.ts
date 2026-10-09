import { z } from 'zod';
import { OperationSchema } from './operation.js';
import { ExecutionLimitsSchema } from './executive-profile.js';

const Ref = z.string().min(1).max(200); const Text = z.string().trim().min(1).max(16000);
export const SkillProposalSchema = z.strictObject({ name: Text, conditions: z.array(Text).min(1).max(30),
  scope: z.enum(['agent', 'thread']), sourceContractId: Ref });
export type SkillProposal = z.infer<typeof SkillProposalSchema>;
export const SkillMaturityAssessmentSchema = z.strictObject({
  stage: z.enum(['candidate', 'tested', 'established', 'deprecated']), origin: z.literal('researcher'),
  assessedVersion: z.number().int().positive(), reason: Text, applicability: Text,
  executionIds: z.array(Ref).max(100), counterevidenceIds: z.array(Ref).max(100),
  limitations: z.array(Text).min(1).max(30), at: z.iso.datetime(),
}).superRefine((assessment, context) => {
  if (new Set(assessment.executionIds).size !== assessment.executionIds.length
    || new Set(assessment.counterevidenceIds).size !== assessment.counterevidenceIds.length)
    context.addIssue({ code: 'custom', message: 'Maturity evidence must name distinct executions' });
});
export const SkillValidationSchema = z.strictObject({ executionId: Ref, at: z.iso.datetime(),
  result: z.enum(['passed', 'failed', 'inconclusive']), traceRefs: z.array(Ref).max(1000), limitations: z.array(Text).min(1).max(20) });
export const ConditionalProcedureSchema = z.strictObject({ runId: Ref, reason: Text, escalate: z.array(Text).max(30),
  branches: z.array(z.strictObject({ id: Ref, when: z.array(Text).min(1).max(30), reason: Text, skillId: Ref,
    version: z.number().int().positive() })).min(1).max(20) }).refine(value => new Set(value.branches.map(branch => branch.id)).size === value.branches.length, 'Conditional branch IDs must be unique');
export const ExecutiveSkillSchema = z.strictObject({ id: Ref, agentId: Ref, version: z.number().int().positive(),
  name: Text, conditions: z.array(Text).min(1).max(30), scope: z.enum(['agent', 'thread']), threadId: Ref.nullable(),
  status: z.enum(['proposed', 'active', 'rejected', 'archived']), procedure: OperationSchema, limits: ExecutionLimitsSchema,
  conditional: ConditionalProcedureSchema.optional(),
  maturity: SkillMaturityAssessmentSchema.optional(),
  source: z.strictObject({ contractId: Ref, cycleId: Ref, bidId: Ref, partId: Ref, instruction: Text,
    correctionChain: z.strictObject({ executionId: Ref, rootContractId: Ref, contractIds: z.array(Ref).min(2).max(200), executionIds: z.array(Ref).min(2).max(200) }).optional() }),
  validations: z.array(SkillValidationSchema).max(1000),
    change: z.strictObject({ kind: z.enum(['proposal', 'revision', 'validation', 'approval', 'rejection', 'archive', 'rollback', 'maturity']),
    reviewContractId: Ref.optional(), reason: Text, restoredVersion: z.number().int().positive().nullable(), at: z.iso.datetime() }),
}).superRefine((skill, context) => {
  if (skill.procedure.guidanceResponse || skill.procedure.teachProcedure || skill.procedure.skillInvocation || skill.procedure.remainderCorrection || skill.procedure.skillReview)
    context.addIssue({ code: 'custom', message: 'Retained procedures cannot carry one-time instruction bindings' });
  if ((skill.scope === 'agent' && skill.threadId !== null) || (skill.scope === 'thread' && !skill.threadId))
    context.addIssue({ code: 'custom', message: 'Skill scope must match its thread attribution' });
  if (skill.status === 'active' && !skill.validations.some(validation => validation.result === 'passed'))
    context.addIssue({ code: 'custom', message: 'Active skills require validation evidence' });
  if ((skill.change.kind === 'rollback') !== (skill.change.restoredVersion !== null))
    context.addIssue({ code: 'custom', message: 'Rollback must identify its preserved source version' });
});
export type ExecutiveSkill = z.infer<typeof ExecutiveSkillSchema>;
export const PublicExecutiveSkillSchema = z.strictObject({ id: Ref, version: z.number().int().positive(), name: Text,
  conditions: z.array(Text).min(1).max(30), scope: z.enum(['agent', 'thread']), status: z.enum(['proposed', 'active', 'rejected', 'archived']),
  inputPolicy: z.literal('exact_recorded_inputs'), successCriteria: Text, constraints: z.array(Text).max(30), limits: ExecutionLimitsSchema,
  conditional: z.array(z.strictObject({ id: Ref, when: z.array(Text), reason: Text, skillId: Ref, version: z.number().int().positive(), successCriteria: Text, constraints: z.array(Text), permitted: z.boolean(), status: z.string() })).optional(),
  reviewDecisions: z.array(z.enum(['approval', 'rejection'])).max(2).optional(),
  requiredTools: z.array(z.strictObject({ serverId: Ref, toolName: Ref })).max(100), permitted: z.boolean(),
  validation: z.enum(['passed', 'failed', 'inconclusive']).nullable(), limitations: z.array(Text).max(20),
});
export type PublicExecutiveSkill = z.infer<typeof PublicExecutiveSkillSchema>;
export const SelectedSkillMethodSchema = z.strictObject({ skillId: Ref, version: z.number().int().positive(),
  procedure: OperationSchema, limits: ExecutionLimitsSchema, sourceContractId: Ref,
  branchId: Ref.optional(), memberSkillId: Ref.optional(), memberVersion: z.number().int().positive().optional(),
  packageDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), memberPackageDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine(value => !value.procedure.guidanceResponse && !value.procedure.teachProcedure && !value.procedure.skillInvocation && !value.procedure.remainderCorrection && !value.procedure.skillReview,
  'Selected methods cannot carry one-time instruction bindings');
export type SelectedSkillMethod = z.infer<typeof SelectedSkillMethodSchema>;
