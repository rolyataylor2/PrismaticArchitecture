import { isDeepStrictEqual } from 'node:util';
import type { Execution } from './domain.js';

/** Report integrity; this does not authorize resubmission, planning or psychological mutation. */
export function validateExecutionUpdate(previous: Execution, next: Execution): void {
  if (previous.id !== next.id || previous.agentId !== next.agentId || previous.cycleId !== next.cycleId
    || !isDeepStrictEqual(previous.action, next.action)) throw new Error('Execution identity or selected action mismatch');
  if (previous.contractId !== next.contractId) throw new Error('Execution contract reference mismatch');
  if (previous.guidance && !isDeepStrictEqual(previous.guidance, next.guidance))
    throw new Error('Execution report cannot change or discard its guidance request');
  if (previous.status === 'needs_guidance' && !['needs_guidance', 'blocked', 'continued'].includes(next.status))
    throw new Error('Guidance requires a separately authorized instruction; status reporting cannot resume execution');
  if (previous.continuedByContractId !== undefined && previous.continuedByContractId !== next.continuedByContractId)
    throw new Error('Execution cannot change its supplemental contract');
  if (['completed', 'failed', 'blocked', 'continued'].includes(previous.status)
    && !(previous.status === 'blocked' && next.status === 'continued' && next.continuedByContractId)) throw new Error('Execution is already terminal');
  if ((previous.status === 'running' && next.status === 'pending')
    || (previous.status === 'unverified' && ['pending', 'running'].includes(next.status)))
    throw new Error('Execution status cannot move backwards or restart an unverified submission');
  if (previous.operational) {
    const old = previous.operational; const updated = next.operational;
    if (!updated || updated.attempts < old.attempts || old.traceRefs.some((trace, index) => updated.traceRefs[index] !== trace))
      throw new Error('Execution report cannot discard operational attempts or trace lineage');
  }
  if ((next.action.kind === 'operate' || next.action.kind === 'act') && next.status === 'completed' && next.operational?.verified !== true)
    throw new Error('Operational completion requires recorded verification');
}
