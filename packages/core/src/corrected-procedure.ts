import { isDeepStrictEqual } from 'node:util';
import type { Store, CognitiveEvent } from './contracts.js';
import { OperationSchema, type Operation } from './operation.js';
import { executionProcedure } from './skill-invocation.js';
import { evaluateSkillEvidence } from './executive-skill-evidence.js';
import type { Execution } from './domain.js';

/** Fresh ordinary uses and historical corrected sources share exact evidence checking. */
export function evaluateRecordedProcedure(store: Store, procedure: Operation, execution: Execution) {
  const events = store.eventsByType(execution.agentId, ['execution.contract', 'execution.tool_trace']);
  const contract = events.find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
  if (contract?.type !== 'execution.contract' || !contract.payload.remainder)
    return evaluateSkillEvidence(procedure, execution, events);
  try {
    const chain = correctedProcedure(store, execution.agentId, execution.id);
    return { result: isDeepStrictEqual(chain.method, procedure) ? chain.evidence : 'inconclusive' as const, traceRefs: chain.traceRefs };
  } catch { return { result: 'inconclusive' as const, traceRefs: [] as string[] }; }
}

/** Read-only reconstruction. Never grants authority or replays a completed prefix. */
export function correctedProcedure(store: Store, agentId: string, executionId: string): {
  method: Operation; rootContractId: string; contractIds: string[]; executionIds: string[];
  evidence: 'passed' | 'failed' | 'inconclusive'; traceRefs: string[];
} {
  const executions = store.executions(agentId);
  const events = store.eventsByType(agentId, ['execution.contract', 'execution.tool_trace', 'execution.remainder_claim', 'execution.remainder_ready']);
  const contracts = events.filter((event): event is Extract<CognitiveEvent, { type: 'execution.contract' }> => event.type === 'execution.contract');
  const terminal = executions.find(item => item.id === executionId);
  if (!terminal) throw new Error('Corrected procedure requires a same-Agent execution');
  let execution = terminal;
  const initial = contracts.find(event => event.payload.id === execution.contractId);
  if (!initial) throw new Error('Corrected procedure has no recorded contract');
  let recorded: Extract<CognitiveEvent, { type: 'execution.contract' }> = initial;
  const finalMethod = executionProcedure(recorded.payload);
  if (!finalMethod) throw new Error('Corrected procedure has no operational method');
  const result = evaluateSkillEvidence(finalMethod, terminal, events);
  let method = structuredClone(finalMethod);
  const contractIds = [recorded.payload.id]; const executionIds = [execution.id];
  const traceRefs = [...result.traceRefs];
  while (recorded.payload.remainder) {
    const child = recorded; const authority = child.payload.remainder!;
    const parent = executions.find(item => item.id === authority.parentExecutionId);
    const parentEvent = contracts.find(event => event.payload.id === authority.parentContractId);
    const claims = events.filter(event => event.type === 'execution.remainder_claim' && event.payload.contractId === child.payload.id);
    const ready = events.filter(event => event.type === 'execution.remainder_ready' && event.payload.contractId === child.payload.id);
    if (!parent || !parentEvent || parentEvent.type !== 'execution.contract' || contractIds.includes(parentEvent.payload.id)
      || parent.contractId !== parentEvent.payload.id || parent.status !== 'continued' || parent.continuedByContractId !== child.payload.id
      || !parent.operational || parent.operational.verified || parent.operational.attempts !== authority.completedSteps
      || !isDeepStrictEqual(parent.operational.traceRefs, authority.completedTraceRefs)
      || claims.length !== 1 || claims[0]!.type !== 'execution.remainder_claim' || !isDeepStrictEqual(claims[0]!.payload.authority, authority)
      || ready.length !== 1 || ready[0]!.type !== 'execution.remainder_ready' || ready[0]!.payload.parentExecutionId !== parent.id
      || ready[0]!.sequence <= claims[0]!.sequence || parentEvent.sequence >= child.sequence)
      throw new Error('Corrected procedure has incomplete or cyclic handoff lineage');
    const source = executionProcedure(parentEvent.payload);
    const parentCycle = store.cycle(parent.cycleId); const childCycle = store.cycle(child.payload.cycleId);
    if (!source || parentEvent.payload.commands.length !== 1 || child.payload.commands.length !== 1
      || parentCycle.status !== 'completed' || childCycle.status !== 'completed'
      || parentCycle.threadId !== childCycle.threadId || parentCycle.sequence >= childCycle.sequence
      || !parentCycle.selectedBidIds?.includes(parentEvent.payload.commands[0]!.bidId)
      || !childCycle.selectedBidIds?.includes(child.payload.commands[0]!.bidId)
      || parent.action.text !== terminal.action.text || source.successCriteria !== finalMethod.successCriteria
      || source.constraints.some(constraint => !method.constraints.includes(constraint)))
      throw new Error('Corrected procedure must preserve selected intention and constraints');
    const ledger = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === parent.contractId);
    const submitted = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    const reservations = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorized');
    const settlements = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorization_finished');
    if (submitted.length !== authority.completedSteps || authority.completedSteps > source.steps.length)
      throw new Error('Corrected procedure prefix has unaccounted operations');
    if (reservations.length && (reservations.length !== submitted.length || settlements.length !== reservations.length
      || reservations.some(reservation => reservation.type === 'execution.tool_trace' && settlements.filter(settlement =>
        settlement.type === 'execution.tool_trace' && settlement.payload.traceId === reservation.payload.traceId
        && settlement.sequence > reservation.sequence && settlement.sequence < claims[0]!.sequence).length !== 1)))
      throw new Error('Corrected procedure prefix has pending or unmatched reservations');
    let previous = parentEvent.sequence;
    submitted.forEach((event, index) => {
      const step = source.steps[index]!;
      const responses = ledger.filter(item => item.type === 'execution.tool_trace' && event.type === 'execution.tool_trace'
        && item.payload.phase === 'finished' && item.payload.traceId === event.payload.traceId);
      const response = responses[0];
      if (event.type !== 'execution.tool_trace' || event.payload.traceId !== authority.completedTraceRefs[index]
        || event.agentId !== agentId || event.cycleId !== parent.cycleId
        || event.payload.serverId !== step.serverId || event.payload.toolName !== step.toolName
        || !isDeepStrictEqual(event.payload.arguments, JSON.parse(step.argumentsJson)) || event.sequence <= previous
        || responses.length !== 1 || !response || response.type !== 'execution.tool_trace'
        || response.agentId !== agentId || response.cycleId !== parent.cycleId
        || response.payload.serverId !== step.serverId || response.payload.toolName !== step.toolName
        || response.payload.outcome?.status !== 'succeeded' || response.sequence <= event.sequence || response.sequence >= claims[0]!.sequence)
        throw new Error('Corrected procedure prefix lacks independently settled evidence');
      previous = response.sequence;
    });
    method = OperationSchema.parse({ ...method, steps: [...source.steps.slice(0, authority.completedSteps), ...method.steps] });
    traceRefs.unshift(...authority.completedTraceRefs); contractIds.unshift(parentEvent.payload.id); executionIds.unshift(parent.id);
    execution = parent; recorded = parentEvent;
  }
  return { method, rootContractId: recorded.payload.id, contractIds, executionIds, evidence: result.result, traceRefs };
}
