import { createHash } from 'node:crypto';
import { ExecutiveSkillSchema, type ExecutiveSkill } from './executive-skill.js';
import { parseAgentSkillPackage } from './agent-skill-format.js';

export type AgentSkillPackage = { name: string; files: Record<string, string>; digest: string };

/** Agent Skills instructions plus explicitly host-specific bindings, never a permission grant. */
export function buildAgentSkillPackage(input: ExecutiveSkill, development: string, members: ExecutiveSkill[] = [], format: 'prism' | 'legacy' = 'prism'): AgentSkillPackage {
  // Legacy mode validates existing immutable snapshots without rewriting their contents.
  const namespace = format === 'legacy' ? 'ontoagentic' : 'prism';
  const architecture = format === 'legacy' ? 'OntoAgentic' : 'The Prism Agent Architecture';
  const methodPath = `assets/${namespace}-method.json`;
  const skill = ExecutiveSkillSchema.parse(input);
  const resources: Record<string, string> = {};
  const name = `skill-${createHash('sha256').update(skill.id).digest('hex').slice(0, 40)}`;
  const description = `${skill.name}. Use when: ${skill.conditions.join('; ')}`.slice(0, 1024);
  const lines = ['---', `name: ${name}`, `description: ${JSON.stringify(description)}`,
    `compatibility: "Exact recorded ${architecture} MCP method bindings; requires compatible tools and current host approval."`,
    'metadata:', `  ${namespace}-skill-id: ${JSON.stringify(skill.id)}`, `  ${namespace}-version: ${JSON.stringify(String(skill.version))}`,
    '---', '', `# ${skill.name}`, '', '## When to use', '', ...skill.conditions.map(condition => `- ${condition}`), '',
    '## Procedure', '', 'Apply current preferences, constraints and host permissions before selecting this method.',
    'Historical approval and maturity in the accompanying records do not grant permission in another host.', ''];
  if (skill.conditional) {
    lines.push('Select an applicable branch explicitly. There is no default branch.', '');
    skill.conditional.branches.forEach((branch, index) => {
      const member = members.find(member => member.id === branch.skillId && member.version === branch.version);
      if (!member || member.agentId !== skill.agentId || member.conditional
        || (skill.scope === 'agent' && member.scope !== 'agent') || (member.scope === 'thread' && member.threadId !== skill.threadId))
        throw new Error('Conditional packages require exact same-Agent scope-compatible member versions');
      const parsed = ExecutiveSkillSchema.parse(member);
      const path = `assets/branch-${index + 1}.json`; resources[path] = `${JSON.stringify(parsed, null, 2)}\n`;
      lines.push(`- When ${branch.when.join('; ')}: use [${parsed.name}, version ${parsed.version}](${path}). ${branch.reason}`,
        `  Verify: ${parsed.procedure.successCriteria}`);
    });
    lines.push('', '## Escalation', '', ...skill.conditional.escalate.map(reason => `- ${reason}`));
  } else {
    skill.procedure.steps.forEach((step, index) => lines.push(`${index + 1}. Call ${step.serverId} / ${step.toolName} with the exact recorded inputs in the method asset.`));
    lines.push('', '## Verification', '', skill.procedure.successCriteria);
    if (skill.procedure.verification) lines.push(`Independently call ${skill.procedure.verification.serverId} / ${skill.procedure.verification.toolName} and compare the recorded structured criterion.`);
    else lines.push('No independent verification was recorded; tool success alone does not establish completion.');
  }
  lines.push('', '## Supporting records', '',
    `- [Recorded method and host metadata](${methodPath})`,
    '- [Development, bids, expressed thoughts and evidence](references/DEVELOPMENT.md)', '',
    'The method asset preserves exact bindings and provenance. Importing this package must not execute calls or adopt source-host approval automatically.', '');
  const files = { 'SKILL.md': lines.join('\n'), [methodPath]: `${JSON.stringify(skill, null, 2)}\n`,
    'references/DEVELOPMENT.md': development, ...resources };
  const { digest } = parseAgentSkillPackage(name, files);
  return { name, files, digest };
}
