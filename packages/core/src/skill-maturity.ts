import { isDeepStrictEqual } from 'node:util';
import type { Store } from './contracts.js';
import type { ExecutiveSkill } from './executive-skill.js';
import { evaluateSkillEvidence } from './executive-skill-evidence.js';
import { executionProcedure } from './skill-invocation.js';

/** Researcher assessment gates; no psychological judgment or application authority. */
export function verifySkillMaturity(store: Store, previous: ExecutiveSkill, next: ExecutiveSkill): void {
  const assessment = next.maturity;
  if (!assessment || assessment.assessedVersion !== previous.version || next.status !== previous.status
    || !isDeepStrictEqual(next.validations, previous.validations)) throw new Error('Maturity assessment must preserve application status and validation evidence');
  const successes = new Map<string, number>();
  for (const executionId of [...assessment.executionIds, ...assessment.counterevidenceIds]) {
    const execution = store.executions(next.agentId).find(item => item.id === executionId);
    if (!execution) throw new Error('Maturity evidence requires a same-Agent execution');
    const events = store.eventsByType(next.agentId, ['execution.contract', 'execution.tool_trace'], [execution.cycleId]);
    const contract = events.find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
    if (!contract || contract.type !== 'execution.contract' || (next.scope === 'thread' && contract.payload.threadId !== next.threadId))
      throw new Error('Maturity evidence is outside the recorded scope');
    const selected = contract.payload.selectedSkill;
    let procedure = next.procedure; let branchId = 'exact';
    if (next.conditional) {
      const branch = next.conditional.branches.find(branch => branch.id === selected?.branchId
        && branch.skillId === selected.memberSkillId && branch.version === selected.memberVersion);
      if (!branch || selected?.skillId !== next.id) throw new Error('Family maturity requires actual selected branch evidence');
      const member = store.executiveSkillHistory(next.agentId, branch.skillId).find(member => member.version === branch.version);
      if (!member) throw new Error('Maturity member evidence is missing');
      procedure = member.procedure; branchId = branch.id;
    }
    if (!isDeepStrictEqual(executionProcedure(contract.payload), procedure)) throw new Error('Maturity evidence belongs to a different method');
    const evidence = evaluateSkillEvidence(procedure, execution, events);
    if (assessment.executionIds.includes(executionId)) {
      if (evidence.result !== 'passed') throw new Error('Maturity support requires independently passed method evidence');
      successes.set(branchId, (successes.get(branchId) ?? 0) + 1);
    }
  }
  const required = assessment.stage === 'established' ? 2 : assessment.stage === 'tested' ? 1 : 0;
  for (const branch of next.conditional?.branches.map(branch => branch.id) ?? ['exact'])
    if ((successes.get(branch) ?? 0) < required) throw new Error('Maturity lacks distinct passed evidence for every assessed method branch');
}
