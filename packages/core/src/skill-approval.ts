import type { Store } from './contracts.js';
import { freeze } from './domain.js';
import type { ExecutiveSkill } from './executive-skill.js';

/** Read-only host readiness. This neither records a decision nor confers authority. */
export function prepareSkillApproval(store: Store, agentId: string, threadId: string | null, skillId: string, version: number): ExecutiveSkill {
  if (store.executiveProfile(agentId).learningMode === 'disabled') throw new Error('Procedural learning is disabled');
  const skill = store.executiveSkills(agentId).find(item => item.id === skillId);
  if (!skill || skill.version !== version || skill.status !== 'proposed') throw new Error('Approval requires the exact current same-Agent proposed skill');
  if (skill.scope === 'thread' && skill.threadId !== threadId) throw new Error('Approval belongs to a different thread');
  if (!skill.validations.some(validation => validation.result === 'passed')) throw new Error('Approval requires independently passed validation');
  if (skill.maturity?.stage === 'deprecated') throw new Error('Deprecated knowledge requires a new maturity assessment');
  const grants = store.mcpPermissions(agentId).tools;
  const permitted = (method: ExecutiveSkill) => [...method.procedure.steps, ...(method.procedure.verification ? [method.procedure.verification] : [])]
    .every(tool => grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName));
  if (!permitted(skill)) throw new Error('Approval cannot expand current tool grants');
  for (const branch of skill.conditional?.branches ?? []) {
    const member = store.executiveSkills(agentId).find(item => item.id === branch.skillId);
    if (!member || member.version !== branch.version || member.status !== 'active' || member.conditional
      || member.maturity?.stage === 'deprecated' || !permitted(member)
      || (member.scope === 'thread' && (skill.scope !== 'thread' || member.threadId !== skill.threadId)))
      throw new Error('Conditional approval requires exact current approved permitted members');
  }
  return freeze(structuredClone(skill));
}
