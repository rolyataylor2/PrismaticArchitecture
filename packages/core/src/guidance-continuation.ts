import { isDeepStrictEqual } from 'node:util';
import type { ActionBid, Execution } from './domain.js';
import { now } from './domain.js';
import type { Store } from './contracts.js';
import type { ExecutionContract } from './execution-contract.js';
import type { GuidanceContinuation, ExternalExecutionRequest } from './execution-guidance.js';
import type { Inspection } from './inspection.js';

export class GuidanceResponseError extends Error {}
const requireResponse = (condition: unknown, message: string): void => { if (!condition) throw new GuidanceResponseError(message); };
type Instruction = Pick<ActionBid, 'action' | 'argument'>;

/** Exact public handoff context for all Parts, once in the same immutable snapshot. */
export function currentExecutionRequests(store: Store, agentId: string, threadId: string | null, limit: number): ExternalExecutionRequest[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('Invalid public execution request context limit');
  if (!limit) return [];
  return store.executions(agentId).filter(execution => execution.status === 'needs_guidance'
    && execution.guidance && store.cycle(execution.cycleId).status !== 'failed' && (store.cycle(execution.cycleId).threadId ?? null) === threadId)
    .slice(-limit).reverse().flatMap(execution => execution.action.kind !== 'operate' || !execution.guidance ? [] : [{
      requestId: execution.guidance.id, executionId: execution.id, contractId: execution.guidance.contractId,
      selectedGoal: execution.action.text, selectedConstraints: execution.action.operation.constraints,
      selectedSuccessCriteria: execution.action.operation.successCriteria, problem: execution.guidance.problem,
      requestedInstruction: execution.guidance.requestedInstruction, uncertainty: execution.guidance.uncertainty,
    }]);
}

/** Host-only validation of an expressed selected instruction; no psychological interpretation. */
export function prepareGuidanceContinuation(store: Store, agentId: string, cycleId: string, threadId: string | null,
  instruction: Instruction, acceptedContractId?: string): GuidanceContinuation | undefined {
  if (instruction.action.kind !== 'operate' || !instruction.action.operation.guidanceResponse) return undefined;
  const response = instruction.action.operation.guidanceResponse;
  const parent = store.executions(agentId).find(item => item.guidance?.id === response.requestId);
  requireResponse(parent?.status === 'needs_guidance', 'Guidance request is not open for this Agent');
  const source = parent!; const sourceCycle = store.cycle(source.cycleId);
  requireResponse((sourceCycle.threadId ?? null) === threadId, 'Guidance response belongs to a different thread');
  requireResponse(sourceCycle.status !== 'failed' && sourceCycle.sequence < store.cycle(cycleId).sequence,
    'Guidance requires an earlier nonfailed cognitive handoff');
  const events = store.eventsByType(agentId, ['execution.contract', 'execution.tool_trace', 'execution.guidance_instruction']);
  const recorded = events.find(event => event.type === 'execution.contract' && event.payload.id === source.contractId);
  requireResponse(recorded?.type === 'execution.contract', 'Guidance source contract is missing');
  if (!recorded || recorded.type !== 'execution.contract') throw new GuidanceResponseError('Guidance source contract is missing');
  const contract = recorded.payload;
  requireResponse(contract.cycleId === source.cycleId && contract.commands.length === 1
    && isDeepStrictEqual(contract.commands[0]!.action, source.action), 'Guidance source does not match its selected action');
  requireResponse(source.operational?.attempts === 0 && !source.operational.traceRefs.length
    && !events.some(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.id && event.payload.phase === 'submitted'),
  'Submitted effects cannot use no-submission guidance resume');
  requireResponse(source.action.kind === 'operate' && instruction.action.text === source.action.text, 'A changed goal must be selected as an independent action');
  if (source.action.kind !== 'operate') throw new GuidanceResponseError('Guidance source is not operational');
  requireResponse(source.action.operation.constraints.every(constraint => instruction.action.kind === 'operate'
    && instruction.action.operation.constraints.includes(constraint)), 'Guidance response cannot remove original constraints');
  const rootContractId = contract.continuation?.rootContractId ?? contract.id;
  const root = events.find(event => event.type === 'execution.contract' && event.payload.id === rootContractId);
  requireResponse(root?.type === 'execution.contract', 'Guidance root contract is missing');
  if (!root || root.type !== 'execution.contract') throw new GuidanceResponseError('Guidance root contract is missing');
  const previous = events.filter(event => event.type === 'execution.guidance_instruction'
    && event.payload.contractId !== acceptedContractId && event.payload.continuation.rootContractId === rootContractId);
  requireResponse(previous.length === (contract.continuation?.requestsUsed ?? 0), 'Guidance chain usage does not match recorded instructions');
  requireResponse(!previous.some(event => event.type === 'execution.guidance_instruction'
    && (event.payload.continuation.requestId === response.requestId || event.payload.continuation.newInformation === response.newInformation)),
  'Guidance requires an unconsumed request and a new recorded instruction or information');
  const requestsUsed = previous.length + 1; const maxRequests = root.payload.limits.maxGuidanceRequests;
  requireResponse(requestsUsed <= maxRequests && contract.limits.maxGuidanceRequests > 0, 'Guidance chain budget is exhausted');
  return { parentExecutionId: source.id, parentContractId: contract.id, requestId: response.requestId,
    rootContractId, requestsUsed, maxRequests, newInformation: response.newInformation };
}

/** Claim once before dispatch. Caller holds the same transaction as compilation/contract recording. */
export function acceptGuidanceContinuation(store: Store, inspection: Inspection, contract: ExecutionContract): void {
  if (!contract.continuation) return;
  const canonical = prepareGuidanceContinuation(store, contract.agentId, contract.cycleId, contract.threadId, contract.commands[0]!);
  requireResponse(isDeepStrictEqual(canonical, contract.continuation), 'Supplemental authority does not match recorded guidance');
  const parent = store.executions(contract.agentId).find(item => item.id === contract.continuation!.parentExecutionId)!;
  inspection.emit(contract.agentId, contract.cycleId, 'execution.guidance_instruction', { contractId: contract.id, continuation: contract.continuation });
  const continued: Execution = { ...parent, status: 'continued', continuedByContractId: contract.id,
    operational: { ...parent.operational!, reason: 'A fresh Self-selected instruction continues this goal under a supplemental contract; completion is not established.' },
    facts: [...parent.facts, { source: 'External execution', kind: 'observes', timestamp: now(), originCycleId: contract.cycleId,
      referenceId: parent.id, text: `Guidance request ${parent.guidance!.id} was answered by a Self-selected supplemental contract ${contract.id}. The original segment is continued; the goal has not been verified as completed.` }] };
  store.saveExecution(continued); inspection.emit(parent.agentId, parent.cycleId, 'execution.status', continued);
}

/** Shared host proof used by storage and tool gateways, independently of interchangeable runtimes. */
export function verifyGuidanceContinuation(store: Store, contract: ExecutionContract): void {
  if (!contract.continuation) return;
  const continuation = contract.continuation;
  const parent = store.executions(contract.agentId).find(item => item.id === continuation.parentExecutionId);
  const event = store.eventsByType(contract.agentId, ['execution.guidance_instruction'], [contract.cycleId])
    .find(item => item.type === 'execution.guidance_instruction' && item.payload.contractId === contract.id);
  requireResponse(event?.type === 'execution.guidance_instruction' && isDeepStrictEqual(event.payload.continuation, continuation)
    && parent?.status === 'continued' && parent.continuedByContractId === contract.id
    && parent.contractId === continuation.parentContractId && parent.guidance?.id === continuation.requestId,
  'Tool access requires recorded guidance consumption and preserved parent lineage');
  requireResponse((store.cycle(parent!.cycleId).threadId ?? null) === contract.threadId,
    'Supplemental contract belongs to a different thread');
}
