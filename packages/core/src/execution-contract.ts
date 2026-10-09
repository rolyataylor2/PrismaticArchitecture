import { z } from 'zod';
import { RemainderAuthoritySchema, type RemainderAuthority } from './remainder-authority.js';
import { ActionSchema, Id, Text, freeze, id, type ActionBid, type Prediction } from './domain.js';
import { defaultExecutiveProfile, ExecutiveProfileSchema, ExecutionLimitsSchema, type ExecutiveProfile } from './executive-profile.js';
import { ExecutiveSensitivitySchema } from './executive-sensitivity.js';
import { GuidanceContinuationSchema, type GuidanceContinuation } from './execution-guidance.js';
import { SelectedSkillMethodSchema, type SelectedSkillMethod } from './executive-skill.js';

/** Authority compiled by the host after selection, never by an Executive planner. */
export const ExecutionContractSchema = z.strictObject({
  id: Id, agentId: Id, cycleId: Id, decisionId: Id, threadId: Id.nullable(),
  commands: z.array(z.strictObject({
    bidId: Id, partId: Id, action: ActionSchema, argument: Text,
    executionOrder: z.array(Text).max(20),
  })).min(1).max(100).refine(commands => new Set(commands.map(command => command.bidId)).size === commands.length,
    'Selected bid references must be unique'),
  predictionReferences: z.array(z.strictObject({ id: Id, version: z.number().int().positive(), partId: Id })),
  profileRevision: z.number().int().nonnegative().optional(),
  executionMode: z.enum(['synchronous', 'background']).optional(),
  skillReviewPolicy: z.enum(['researcher_only', 'self_selected']).optional(),
  learningMode: z.enum(['disabled', 'supervised', 'validated_automatic']).optional(),
  sensitivity: ExecutiveSensitivitySchema.optional(),
  continuation: GuidanceContinuationSchema.optional(),
  guidanceRejection: Text.optional(), remainderRejection: Text.optional(), remainder: RemainderAuthoritySchema.optional(),
  selectedSkill: SelectedSkillMethodSchema.optional(), skillRejection: Text.optional(),
  successCriteria: z.enum(['selected_dialogue_emitted', 'selected_wait_acknowledged', 'operation_verified', 'selected_execution_stopped', 'selected_procedure_reviewed']),
  authority: z.strictObject({
    capabilities: z.array(z.enum(['chat_output', 'wait', 'tools', 'execution_control', 'procedure_review'])).min(1).max(2),
    tools: z.array(z.strictObject({ serverId: Id, toolName: Id })).max(100),
    allowEquivalentMethods: z.boolean(),
  }),
  limits: ExecutionLimitsSchema,
}).superRefine((contract, context) => {
  const dialogue = contract.commands.every(command => command.action.kind === 'say' || command.action.kind === 'ask');
  const wait = contract.commands.length === 1 && contract.commands[0]!.action.kind === 'wait';
  const action = contract.commands.length === 1 ? contract.commands[0]!.action : null;
  if (action?.kind === 'operate' && action.operation.skillReview) {
    if (contract.continuation || contract.guidanceRejection || contract.remainderRejection || contract.remainder || contract.selectedSkill || contract.skillRejection
      || contract.authority.tools.length || contract.authority.allowEquivalentMethods
      || contract.successCriteria !== 'selected_procedure_reviewed' || contract.authority.capabilities.length !== 1
      || contract.authority.capabilities[0] !== 'procedure_review')
      context.addIssue({ code: 'custom', message: 'Procedure review grants exclusively review authority without tools or supplemental methods' });
    return;
  }
  if (action?.kind === 'operate' && action.operation.intervention) {
    if (contract.continuation || contract.guidanceRejection || contract.remainderRejection || contract.remainder || contract.selectedSkill || contract.skillRejection
      || contract.authority.tools.length || contract.authority.allowEquivalentMethods
      || contract.successCriteria !== 'selected_execution_stopped' || contract.authority.capabilities.length !== 1
      || contract.authority.capabilities[0] !== 'execution_control')
      context.addIssue({ code: 'custom', message: 'Pause authority must exclusively control the selected execution without tools or supplemental methods' });
    return;
  }
  if (action?.kind === 'operate') {
    const operation = contract.selectedSkill?.procedure ?? action.operation;
    const rejected = contract.guidanceRejection || contract.skillRejection || contract.remainderRejection;
    const expected = [...operation.steps, ...(operation.verification ? [operation.verification] : [])]
      .map(step => JSON.stringify([step.serverId, step.toolName]));
    const actual = contract.authority.tools.map(tool => JSON.stringify([tool.serverId, tool.toolName]));
    const correction = action.operation.remainderCorrection;
    if (Boolean(correction) !== Boolean(contract.remainder || contract.remainderRejection)
      || (contract.remainder && (rejected || correction?.executionId !== contract.remainder.parentExecutionId
        || correction.checkpointTraceId !== contract.remainder.checkpointTraceId
        || Object.entries(contract.limits).some(([key, value]) => value > contract.remainder!.limits[key as keyof typeof contract.limits]))))
      context.addIssue({ code: 'custom', message: 'Remainder authority must match the selected correction and captured remaining limits' });
    const response = action.operation.guidanceResponse;
    if (response && (!contract.continuation && !rejected))
      context.addIssue({ code: 'custom', message: 'Guidance responses require recorded acceptance or rejection' });
    if ((contract.continuation || contract.guidanceRejection) && !response)
      context.addIssue({ code: 'custom', message: 'Supplemental authority requires a selected guidance response' });
    if (contract.continuation && (contract.guidanceRejection || response?.requestId !== contract.continuation.requestId
      || response.newInformation !== contract.continuation.newInformation
      || contract.limits.maxGuidanceRequests > contract.continuation.maxRequests - contract.continuation.requestsUsed))
      context.addIssue({ code: 'custom', message: 'Supplemental guidance authority must match the selected response and remaining budget' });
    const invocation = action.operation.skillInvocation;
    if (invocation && !contract.selectedSkill && !rejected) context.addIssue({ code: 'custom', message: 'Invocation needs accepted or rejected method resolution' });
    if ((contract.selectedSkill || contract.skillRejection) && !invocation) context.addIssue({ code: 'custom', message: 'Method resolution requires a selected invocation' });
    if (contract.selectedSkill && (rejected || invocation?.skillId !== contract.selectedSkill.skillId || invocation.version !== contract.selectedSkill.version
      || action.operation.steps.length || action.operation.verification || action.operation.successCriteria !== operation.successCriteria
      || operation.constraints.some(constraint => !action.operation.constraints.includes(constraint))
      || Object.entries(contract.limits).some(([key, limit]) => limit > contract.selectedSkill!.limits[key as keyof typeof contract.limits])))
      context.addIssue({ code: 'custom', message: 'Invocation authority must preserve its known method and limits' });
    if (contract.authority.capabilities.length !== 1 || contract.authority.capabilities[0] !== 'tools'
      || contract.successCriteria !== 'operation_verified' || contract.authority.allowEquivalentMethods
      || new Set(actual).size !== actual.length || (rejected ? actual.length > 0
        : actual.length !== new Set(expected).size || actual.some(key => !expected.includes(key))))
      context.addIssue({ code: 'custom', message: 'Tool contract authority must match the selected strategy exactly' });
  } else {
  if (contract.continuation || contract.guidanceRejection || contract.remainderRejection || contract.remainder || contract.selectedSkill || contract.skillRejection) context.addIssue({ code: 'custom', message: 'Only operational actions can use operational methods' });
  if (!dialogue && !wait) context.addIssue({ code: 'custom', message: 'A wait cannot be merged into a dialogue execution' });
  const capability = dialogue ? 'chat_output' : 'wait';
  if (contract.authority.capabilities.length !== 1 || contract.authority.capabilities[0] !== capability
    || contract.authority.tools.length || contract.authority.allowEquivalentMethods)
    context.addIssue({ code: 'custom', message: 'Chat contracts cannot grant tools or alternative actions' });
  if (contract.successCriteria !== (dialogue ? 'selected_dialogue_emitted' : 'selected_wait_acknowledged'))
    context.addIssue({ code: 'custom', message: 'Success criteria must match selected behavior' });
  }
  const owners = new Set(contract.commands.map(command => command.partId));
  if (contract.predictionReferences.some(reference => !owners.has(reference.partId))
    || new Set(contract.predictionReferences.map(reference => reference.id)).size !== contract.predictionReferences.length)
    context.addIssue({ code: 'custom', message: 'Prediction lineage must uniquely reference selected contributors' });
});
export type ExecutionContract = z.infer<typeof ExecutionContractSchema>;

export function compileExecutionContract(input: {
  agentId: string; cycleId: string; threadId?: string; bids: ActionBid[];
  predictions: Pick<Prediction, 'id' | 'agentId' | 'version' | 'partId' | 'status'>[];
  profile?: ExecutiveProfile;
  continuation?: GuidanceContinuation; guidanceRejection?: string; remainderRejection?: string; remainder?: RemainderAuthority;
  selectedSkill?: SelectedSkillMethod; skillRejection?: string;
}): ExecutionContract {
  const profile = ExecutiveProfileSchema.parse(input.profile ?? defaultExecutiveProfile());
  const owners = new Set(input.bids.map(bid => bid.partId));
  const dialogue = input.bids.every(bid => bid.action.kind === 'say' || bid.action.kind === 'ask');
  const action = input.bids.length === 1 ? input.bids[0]!.action : null;
  const operation = input.selectedSkill?.procedure ?? (action?.kind === 'operate' ? action.operation : undefined);
  const remainderRejection = action?.kind === 'operate' && action.operation.remainderCorrection
    ? input.remainder ? input.remainderRejection : input.remainderRejection ?? 'Selected remainder handoff is not yet available; the original activity remains authoritative' : input.remainderRejection;
  const tools = operation ? [...operation.steps, ...(operation.verification ? [operation.verification] : [])]
    .map(({ serverId, toolName }) => ({ serverId, toolName })) : [];
  const uniqueTools = tools.filter((tool, index) => tools.findIndex(other => other.serverId === tool.serverId && other.toolName === tool.toolName) === index);
  return freeze(ExecutionContractSchema.parse({
    id: id('contract'), agentId: input.agentId, cycleId: input.cycleId, decisionId: input.cycleId,
    threadId: input.threadId ?? null,
    profileRevision: profile.revision, sensitivity: profile.sensitivity, executionMode: profile.executionMode, learningMode: profile.learningMode, skillReviewPolicy: profile.skillReviewPolicy,
    ...(input.continuation ? { continuation: input.continuation } : {}),
    ...(input.remainder ? { remainder: input.remainder } : {}),
    ...(remainderRejection ? { remainderRejection } : {}),
    ...(input.guidanceRejection ? { guidanceRejection: input.guidanceRejection } : {}),
    ...(input.selectedSkill ? { selectedSkill: input.selectedSkill } : {}), ...(input.skillRejection ? { skillRejection: input.skillRejection } : {}),
    commands: input.bids.map(bid => ({ bidId: bid.id, partId: bid.partId, action: bid.action,
      argument: bid.argument, executionOrder: bid.executionOrder })),
    predictionReferences: input.predictions.filter(prediction => prediction.agentId === input.agentId
      && prediction.status === 'open' && prediction.partId && owners.has(prediction.partId))
      .map(prediction => ({ id: prediction.id, version: prediction.version, partId: prediction.partId! })),
    successCriteria: action?.kind === 'operate' ? action.operation.skillReview ? 'selected_procedure_reviewed' : action.operation.intervention ? 'selected_execution_stopped' : 'operation_verified' : dialogue ? 'selected_dialogue_emitted' : 'selected_wait_acknowledged',
    authority: { capabilities: [action?.kind === 'operate' ? action.operation.skillReview ? 'procedure_review' : action.operation.intervention ? 'execution_control' : 'tools' : dialogue ? 'chat_output' : 'wait'], tools: input.guidanceRejection || input.skillRejection || remainderRejection ? [] : uniqueTools, allowEquivalentMethods: false },
    limits: { ...Object.fromEntries(Object.entries(profile.limits).map(([key, value]) => [key,
      Math.min(value, input.selectedSkill?.limits[key as keyof typeof profile.limits] ?? value, input.remainder?.limits[key as keyof typeof profile.limits] ?? value)])), ...(input.continuation ? { maxGuidanceRequests: Math.min(profile.limits.maxGuidanceRequests,
      input.selectedSkill?.limits.maxGuidanceRequests ?? profile.limits.maxGuidanceRequests,
      input.continuation.maxRequests - input.continuation.requestsUsed) } : {}) },
  }));
}
/** Compatibility entry point for callers that only compile chat behavior. */
export function compileChatExecutionContract(input: Parameters<typeof compileExecutionContract>[0]): ExecutionContract {
  if (input.bids.some(bid => bid.action.kind === 'operate')) throw new Error('Chat contracts cannot select tools');
  return compileExecutionContract(input);
}
