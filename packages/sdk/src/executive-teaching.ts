import { isDeepStrictEqual } from 'node:util';
import type { Store } from '../../core/src/contracts.js';
import type { Inspection } from '../../core/src/inspection.js';
import type { Execution } from '../../core/src/domain.js';
import type { ProcedureTeachingReport } from '../../core/src/procedure-teaching.js';
import { executionProcedure } from '../../core/src/skill-invocation.js';
import { ExecutiveSkills } from './executive-skills.js';

/** Framework-owned external learning from explicitly selected instructions and recorded outcomes. */
export class ExecutiveTeaching {
  constructor(private readonly store: Store, private readonly skills: ExecutiveSkills, private readonly inspection: Inspection) {}
  record(execution: Execution): void {
    if (execution.action.kind !== 'operate' || !execution.action.operation.teachProcedure
      || execution.status === 'running' || execution.status === 'pending' || execution.status === 'continued') return;
    const stored = this.store.executions(execution.agentId).find(item => item.id === execution.id);
    if (!stored || stored.status !== execution.status || !isDeepStrictEqual(stored.action, execution.action) || stored.contractId !== execution.contractId)
      throw new Error('Procedure teaching requires the recorded same-Agent operational outcome');
    const reports = this.store.eventsByType(execution.agentId, ['execution.procedure_teaching'], [execution.cycleId])
      .filter(event => event.type === 'execution.procedure_teaching' && event.payload.executionId === execution.id);
    if (reports.some(event => event.type === 'execution.procedure_teaching' && event.payload.outcome === execution.status)) return;
    const contractEvent = this.store.eventsByType(execution.agentId, ['execution.contract'], [execution.cycleId])
      .find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
    if (!contractEvent || contractEvent.type !== 'execution.contract') throw new Error('Teaching source contract is missing');
    const contract = contractEvent.payload; const directive = execution.action.operation.teachProcedure;
    const report = (status: ProcedureTeachingReport['status'], reason: string, extra: Partial<ProcedureTeachingReport> = {}) => {
      this.inspection.emit(execution.agentId, execution.cycleId, 'execution.procedure_teaching', {
        executionId: execution.id, contractId: contract.id, outcome: execution.status as ProcedureTeachingReport['outcome'], status, reason, ...extra,
      });
    };
    const mode = this.store.executiveProfile(execution.agentId).learningMode;
    if (mode === 'disabled' || contract.learningMode === 'disabled') { report('skipped', 'Captured or current learning mode is disabled; no procedure changed.'); return; }
    if (!executionProcedure(contract)?.steps.length) { report('skipped', 'No executable selected method is available to retain.'); return; }
    try {
      const result = this.store.transaction(() => {
        const previous = reports.at(-1);
        const existing = previous?.type === 'execution.procedure_teaching' && previous.payload.skillId
          ? this.store.executiveSkills(execution.agentId).find(skill => skill.id === previous.payload.skillId)
          : this.store.executiveSkills(execution.agentId).find(skill => skill.source.contractId === contract.id);
        if (existing && (existing.source.contractId !== contract.id || existing.status !== 'proposed'))
          throw new Error('A newer or retired procedure cannot be rewritten by a late outcome');
        const proposal = { name: directive.name, conditions: directive.conditions, scope: directive.scope, sourceContractId: contract.id };
        let skill = existing;
        if (!skill && directive.skillId) {
          const target = this.store.executiveSkills(execution.agentId).find(item => item.id === directive.skillId);
          if (!target || (target.scope === 'thread' && target.threadId !== contract.threadId)) throw new Error('Teaching revision is outside its Agent/thread scope');
          skill = this.skills.revise(execution.agentId, directive.skillId, directive.expectedVersion!, proposal);
        }
        skill ??= this.skills.proposeSkill(execution.agentId, proposal);
        const grants = this.store.mcpPermissions(execution.agentId).tools;
        const permitted = [...skill.procedure.steps, ...(skill.procedure.verification ? [skill.procedure.verification] : [])]
          .every(tool => grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName));
        return this.skills.validate(execution.agentId, skill.id, skill.version, execution.id,
          permitted && mode === 'validated_automatic' && contract.learningMode === 'validated_automatic');
      });
      report(result.status === 'active' ? 'active' : 'proposed',
        result.status === 'active' ? 'The explicitly selected exact procedure passed recorded validation and is active.'
          : 'The explicitly selected exact procedure remains a proposal; validation is not approval or proof of transfer.',
        { skillId: result.id, skillVersion: result.version, validation: result.validations.at(-1)!.result });
    } catch (error) { report('rejected', error instanceof Error ? error.message.slice(0, 15000) : 'Procedure retention failed without changing the operational outcome.'); }
  }
}
