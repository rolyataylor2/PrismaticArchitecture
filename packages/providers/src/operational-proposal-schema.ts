import { z } from 'zod';
import { ActionProposalSchema, ActionSchema, type WorldState } from '../../core/src/domain.js';
import { OperationSchema } from '../../core/src/operation.js';

/** Restrict references to supplied operational context; never prescribe bids or relax host authority. */
export function operationalProposalSchema(world?: WorldState) {
  const references = (world?.externalSkills ?? []).filter(skill => skill.status === 'active' && skill.permitted).flatMap(skill => {
    if (skill.conditional) return skill.conditional.filter(branch => branch.status === 'active' && branch.permitted)
      .map(branch => z.strictObject({ skillId: z.literal(skill.id), version: z.literal(skill.version), branchId: z.literal(branch.id) }));
    return [z.strictObject({ skillId: z.literal(skill.id), version: z.literal(skill.version) })];
  });
  // Contextual generation only. The full OperationSchema enforces cross-field restrictions after generation.
  const withoutBindings = z.strictObject(OperationSchema.shape).omit({ skillInvocation: true, intervention: true, remainderCorrection: true, skillReview: true });
  let base = world?.selectedActivity ? withoutBindings.extend({ intervention: z.strictObject({
    executionId: z.literal(world.selectedActivity.executionId), directive: z.literal('pause'),
  }).optional() }) : withoutBindings;
  const checkpoints = [...new Set((world?.facts ?? []).filter(fact => fact.source === 'External execution'
    && fact.text.startsWith('At this tool result,') && fact.referenceId).map(fact => fact.referenceId!))];
  if (world?.selectedActivity && checkpoints.length) base = base.extend({ remainderCorrection: z.strictObject({
    executionId: z.literal(world.selectedActivity.executionId), checkpointTraceId: z.enum(checkpoints as [string, ...string[]]),
  }).optional() });
  const reviews = (world?.externalSkills ?? []).filter(skill => skill.reviewDecisions?.length).map(skill => z.strictObject({
    skillId: z.literal(skill.id), version: z.literal(skill.version),
    decision: z.enum(skill.reviewDecisions! as ['approval' | 'rejection', ...('approval' | 'rejection')[]]), reason: z.string().trim().min(1).max(16000),
  }));
  if (reviews.length) base = base.extend({ skillReview: (reviews.length === 1 ? reviews[0]! : z.union([reviews[0]!, reviews[1]!, ...reviews.slice(2)])).optional() });
  const operation = references.length ? base.extend({ skillInvocation: (references.length === 1 ? references[0]!
    : z.union([references[0]!, references[1]!, ...references.slice(2)])).optional() }) : base;
  return ActionProposalSchema.extend({ action: z.union([ActionSchema.options[0], ActionSchema.options[1].extend({ operation })]) });
}
