import { isDeepStrictEqual } from 'node:util';
import type { Store } from './contracts.js';
import type { ActionBid } from './domain.js';
import type { ExecutionContract } from './execution-contract.js';
import { prepareSkillApproval } from './skill-approval.js';
import { retainedProcedure, type Operation } from './operation.js';
import type { ExecutiveSkill, PublicExecutiveSkill, SelectedSkillMethod } from './executive-skill.js';

export class SkillInvocationError extends Error {}
export function publicSkills(store: Store, agentId: string, threadId: string | null, limit: number): PublicExecutiveSkill[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('Invalid skill context limit');
  const grants = store.mcpPermissions(agentId).tools;
  if (!limit) return [];
  return store.executiveSkills(agentId).filter(skill => skill.scope === 'agent' || skill.threadId === threadId).slice(-limit).reverse().map(skill => {
      const tools = [...skill.procedure.steps, ...(skill.procedure.verification ? [skill.procedure.verification] : [])];
      const requiredTools = tools.map(({ serverId, toolName }) => ({ serverId, toolName }))
        .filter((tool, index, all) => all.findIndex(item => item.serverId === tool.serverId && item.toolName === tool.toolName) === index);
      const validation = skill.validations.at(-1);
      const conditional = skill.conditional?.branches.flatMap(branch => {
        const current = store.executiveSkills(agentId).find(item => item.id === branch.skillId);
        const member = store.executiveSkillHistory(agentId, branch.skillId).find(item => item.version === branch.version);
        if (!member) return [];
        const permitted = member.maturity?.stage !== 'deprecated' && [...member.procedure.steps, ...(member.procedure.verification ? [member.procedure.verification] : [])]
          .every(tool => grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName));
        return [{ id: branch.id, when: branch.when, reason: branch.reason, skillId: member.id, version: member.version,
          successCriteria: member.procedure.successCriteria, constraints: member.procedure.constraints, permitted: permitted && current?.version === member.version && current.status === 'active', status: current?.version === member.version ? member.status : 'stale' }];
      });
      const reviewDecisions: ('approval' | 'rejection')[] = [];
      const profile = store.executiveProfile(agentId);
      if (profile.skillReviewPolicy === 'self_selected' && profile.learningMode !== 'disabled' && skill.status === 'proposed') {
        reviewDecisions.push('rejection');
        try { prepareSkillApproval(store, agentId, threadId, skill.id, skill.version); reviewDecisions.push('approval'); } catch { /* Public readiness grants no review authority. */ }
      }
      return { reviewDecisions, id: skill.id, version: skill.version, name: skill.name, conditions: skill.conditions, scope: skill.scope,
        status: skill.status, inputPolicy: 'exact_recorded_inputs', successCriteria: skill.procedure.successCriteria,
        constraints: skill.procedure.constraints, limits: skill.limits, requiredTools,
        permitted: skill.maturity?.stage !== 'deprecated' && (conditional ? conditional.some(branch => branch.permitted && branch.status === 'active') : requiredTools.every(tool => grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName))),
        ...(conditional ? { conditional } : {}),
        validation: validation?.result ?? null, limitations: validation?.limitations ?? [] };
    });
}
export function selectSkillMethod(store: Store, agentId: string, threadId: string | null, bid: ActionBid): SelectedSkillMethod | undefined {
  if (bid.action.kind !== 'operate' || !bid.action.operation.skillInvocation) return undefined;
  const operation = bid.action.operation; const invocation = operation.skillInvocation!;
  const skill = store.executiveSkills(agentId).find(item => item.id === invocation.skillId);
  const reject = (message: string): never => { throw new SkillInvocationError(message); };
  if (!skill || skill.status !== 'active' || skill.version !== invocation.version) return reject('Skill invocation requires the current active same-Agent version');
  if (skill.maturity?.stage === 'deprecated') return reject('Deprecated knowledge requires a new maturity assessment before fresh application');
  if (skill.scope === 'thread' && skill.threadId !== threadId) return reject('Skill invocation belongs to a different thread');
  let method = skill;
  if (skill.conditional) {
    const branch = skill.conditional.branches.find(branch => branch.id === invocation.branchId);
    if (!branch) return reject('Conditional invocation requires an explicitly selected available branch');
    const member = store.executiveSkills(agentId).find(item => item.id === branch.skillId);
    if (!member || member.version !== branch.version || member.status !== 'active' || member.conditional || member.maturity?.stage === 'deprecated'
      || (member.scope === 'thread' && member.threadId !== threadId)) return reject('Conditional branch requires its current active same-Agent scoped method');
    method = member;
  } else if (invocation.branchId) return reject('Exact methods have no conditional branch');
  if (operation.steps.length || operation.verification) return reject('Known-method invocation cannot supply competing steps or verification');
  if (operation.successCriteria !== method.procedure.successCriteria || method.procedure.constraints.some(constraint => !operation.constraints.includes(constraint)))
    return reject('Skill invocation must preserve the known criterion and constraint declarations');
  const grants = store.mcpPermissions(agentId).tools;
  if ([...method.procedure.steps, ...(method.procedure.verification ? [method.procedure.verification] : [])]
    .some(tool => !grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName))) return reject('Skill invocation cannot expand current tool permissions');
  return { skillId: skill.id, version: skill.version, procedure: method.procedure, limits: methodLimits(skill, method), sourceContractId: method.source.contractId,
    ...(skill.conditional ? { branchId: invocation.branchId!, memberSkillId: method.id, memberVersion: method.version } : {}) };
}
export function executionProcedure(contract: ExecutionContract): Operation | undefined {
  const action = contract.commands[0]?.action;
  return action?.kind === 'operate' ? contract.selectedSkill?.procedure ?? retainedProcedure(action.operation) : undefined;
}
export function verifySelectedSkill(store: Store, contract: ExecutionContract): void {
  if (!contract.selectedSkill) return;
  const selected = contract.selectedSkill;
  const recorded = store.executiveSkillHistory(contract.agentId, selected.skillId).find(skill => skill.version === selected.version);
  const branch = recorded?.conditional?.branches.find(branch => branch.id === selected.branchId);
  const member = branch ? store.executiveSkillHistory(contract.agentId, branch.skillId).find(member => member.version === branch.version) : recorded;
  if (!recorded || recorded.status !== 'active' || recorded.maturity?.stage === 'deprecated'
    || !member || member.status !== 'active' || member.maturity?.stage === 'deprecated'
    || Boolean(recorded.conditional) !== Boolean(branch) || (!recorded.conditional && (selected.branchId || selected.memberSkillId || selected.memberVersion))
    || (branch && (selected.memberSkillId !== branch.skillId || selected.memberVersion !== branch.version || member.conditional))
    || !isDeepStrictEqual(member.procedure, selected.procedure) || !isDeepStrictEqual(methodLimits(recorded, member), selected.limits)
    || member.source.contractId !== selected.sourceContractId || (recorded.scope === 'thread' && recorded.threadId !== contract.threadId)
    || (member.scope === 'thread' && member.threadId !== contract.threadId)) throw new Error('Selected skill method does not match preserved active knowledge');
}
function methodLimits(parent: ExecutiveSkill, member: ExecutiveSkill): ExecutiveSkill['limits'] {
  return Object.fromEntries(Object.entries(parent.limits).map(([key, value]) => [key, Math.min(value, member.limits[key as keyof ExecutiveSkill['limits']])])) as ExecutiveSkill['limits'];
}
