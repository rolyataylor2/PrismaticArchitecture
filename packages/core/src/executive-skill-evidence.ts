import { isDeepStrictEqual } from 'node:util';
import type { Operation } from './operation.js';
import type { Execution } from './domain.js';
import type { CognitiveEvent } from './contracts.js';
import { executionProcedure } from './skill-invocation.js';

/** Validates one recorded exact strategy, not applicability, transfer or psychological meaning. */
export function evaluateSkillEvidence(procedure: Operation, execution: Execution, events: CognitiveEvent[]): {
  result: 'passed' | 'failed' | 'inconclusive'; traceRefs: string[];
} {
  const ledger = events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === execution.contractId);
  const submitted = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
  const traceRefs = submitted.map(event => event.type === 'execution.tool_trace' ? event.payload.traceId : '');
  const answer = (result: 'passed' | 'failed' | 'inconclusive') => ({ result, traceRefs });
  if (execution.action.kind !== 'operate') return answer('inconclusive');
  const contract = events.find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
  if (!contract || contract.type !== 'execution.contract' || contract.payload.agentId !== execution.agentId
    || contract.payload.cycleId !== execution.cycleId || contract.payload.commands.length !== 1
    || !isDeepStrictEqual(contract.payload.commands[0]!.action, execution.action)) return answer('inconclusive');
  if (!isDeepStrictEqual(executionProcedure(contract.payload), procedure)) return answer('inconclusive');
  if (!procedure.verification) return answer('inconclusive');
  const strategy = [...procedure.steps, procedure.verification];
  if (submitted.length > strategy.length || new Set(traceRefs).size !== traceRefs.length) return answer('inconclusive');
  let last: Record<string, unknown> | undefined;
  for (let index = 0; index < submitted.length; index++) {
    const event = submitted[index]!; if (event.type !== 'execution.tool_trace') return answer('inconclusive');
    const expected = strategy[index]!;
    if (event.agentId !== execution.agentId || event.cycleId !== execution.cycleId
      || event.payload.serverId !== expected.serverId || event.payload.toolName !== expected.toolName
      || !isDeepStrictEqual(event.payload.arguments, JSON.parse(expected.argumentsJson))) return answer('inconclusive');
    const responses = ledger.filter(item => item.type === 'execution.tool_trace' && item.payload.phase === 'finished'
      && item.payload.traceId === event.payload.traceId);
    if (responses.length !== 1) return answer('inconclusive');
    const response = responses[0]!;
    if (response.type !== 'execution.tool_trace' || response.agentId !== execution.agentId || response.cycleId !== execution.cycleId
      || response.sequence <= event.sequence || response.payload.serverId !== expected.serverId || response.payload.toolName !== expected.toolName)
      return answer('inconclusive');
    const outcome = response.payload.outcome;
    if (outcome?.status === 'reported_error') return answer('failed');
    if (outcome?.status !== 'succeeded' || !outcome.result || typeof outcome.result !== 'object') return answer('inconclusive');
    last = outcome.result as Record<string, unknown>;
  }
  if (submitted.length !== strategy.length || execution.status !== 'completed' || execution.operational?.verified !== true) return answer('inconclusive');
  let observed: unknown = last?.structuredContent;
  for (const segment of procedure.verification.path) {
    if (!observed || typeof observed !== 'object' || !Object.hasOwn(observed, segment)) return answer('inconclusive');
    observed = (observed as Record<string, unknown>)[segment];
  }
  return answer(isDeepStrictEqual(observed, JSON.parse(procedure.verification.expectedJson)) ? 'passed' : 'failed');
}
