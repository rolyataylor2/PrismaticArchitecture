import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { ExecutionLimitsSchema } from './executive-profile.js';
import { ActionProposalSchema, Id, freeze, type ActionBid } from './domain.js';
import type { Store } from './contracts.js';
import { verifyCorrectionBoundary } from './correction-boundary.js';
import { executionProcedure } from './skill-invocation.js';
import { retainedProcedure } from './operation.js';

/** Preparation only: no durable consumption, successor authority or external effect. */
export function prepareRemainderInstruction(store: Store, input: {
  agentId: string; threadId: string | null; cycleId: string; bid: ActionBid;
  executionId: string; boundaryId?: string; checkpointTraceId?: string;
}, worker: {
  owns(agentId: string, executionId: string): boolean;
  atCheckpoint(agentId: string, executionId: string, completedSteps: number): boolean;
}) {
  const bid = ActionProposalSchema.extend({ id: Id, partId: Id, sourceKind: z.enum(['part', 'primitive']).optional(), replacesBidId: Id.optional() }).parse(input.bid);
  const cycle = store.cycle(input.cycleId);
  const expressed = store.eventsByType(input.agentId, ['part.bid_created', 'execution.handoff'], [input.cycleId])
    .some(event => event.agentId === input.agentId && event.cycleId === input.cycleId
      && isDeepStrictEqual(event.type === 'part.bid_created' ? event.payload : event.type === 'execution.handoff' ? event.payload.bid : null, bid));
  if (cycle.agentId !== input.agentId || cycle.status !== 'running' || (cycle.threadId ?? null) !== input.threadId
    || !cycle.selectedBidIds?.includes(bid.id) || !expressed)
    throw new Error('Remainder requires the recorded current Self-selected instruction');
  if (bid.action.kind !== 'operate' || bid.action.operation.intervention || bid.action.operation.guidanceResponse
    || bid.action.operation.skillInvocation || bid.action.operation.teachProcedure
    || (!bid.action.operation.steps.length && !bid.action.operation.verification))
    throw new Error('Remainder must contain an explicit independent future strategy');
  const request = bid.action.operation.remainderCorrection;
  if (request && (request.executionId !== input.executionId || request.checkpointTraceId !== input.checkpointTraceId || input.boundaryId))
    throw new Error('Remainder target must match the expressed correction reference');
  const evidence = verifyCorrectionBoundary(store, input,
    (agentId, executionId) => worker.owns(agentId, executionId),
    (agentId, executionId, count) => worker.atCheckpoint(agentId, executionId, count));
  const parentCycle = store.cycle(evidence.contract.cycleId);
  if (parentCycle.sequence >= cycle.sequence) throw new Error('Remainder must correct an earlier selected activity');
  const original = evidence.contract.commands[0]!.action;
  const originalProcedure = executionProcedure(evidence.contract)!;
  const procedure = retainedProcedure(bid.action.operation);
  if (original.kind !== 'operate' || bid.action.text !== original.text
    || procedure.successCriteria !== originalProcedure.successCriteria
    || originalProcedure.constraints.some(constraint => !procedure.constraints.includes(constraint)))
    throw new Error('Remainder cannot replace the original goal, criterion or constraints');
  // Invocation constraints can be stricter than the retained method itself.
  if (original.operation.constraints.some(constraint => !procedure.constraints.includes(constraint)))
    throw new Error('Remainder cannot remove current selected constraints');
  const current = store.executiveProfile(input.agentId);
  const limitValues = { ...Object.fromEntries(Object.entries(evidence.contract.limits).map(([key, value]) => [key,
    Math.min(value, current.limits[key as keyof typeof current.limits])])),
    maxSteps: Math.min(evidence.remainingSteps, current.limits.maxSteps),
    maxDurationMs: Math.min(Math.floor(evidence.remainingDurationMs), current.limits.maxDurationMs) };
  if (limitValues.maxDurationMs < 1 || procedure.steps.length + (procedure.verification ? 1 : 0) > limitValues.maxSteps)
    throw new Error('Remainder exceeds the remaining original or current execution budget');
  const limits = ExecutionLimitsSchema.parse(limitValues);
  const grants = store.mcpPermissions(input.agentId).tools;
  if ([...procedure.steps, ...(procedure.verification ? [procedure.verification] : [])].some(step =>
    !grants.some(grant => grant.serverId === step.serverId && grant.toolName === step.toolName)))
    throw new Error('Remainder requires current permission for every selected tool');
  return freeze({ parentExecutionId: input.executionId, parentContractId: evidence.contract.id,
    checkpointTraceId: evidence.boundary.traceRefs.at(-1)!, completedSteps: evidence.boundary.completedSteps,
    completedTraceRefs: [...evidence.boundary.traceRefs], deadlineAt: evidence.deadlineAt,
    correctionCycleId: cycle.id, correctionBid: bid, procedure, limits });
}
