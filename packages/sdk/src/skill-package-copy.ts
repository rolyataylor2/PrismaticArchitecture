import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Application } from './application.js';

const Input = z.strictObject({ sourceAgentId: z.string().min(1).max(200), skillId: z.string().min(1).max(200),
  version: z.number().int().positive(), reason: z.string().trim().min(1).max(16000) });

/** Copy knowledge and provenance, never source-host execution authority. */
export async function copySkillPackage(app: Application, targetAgentId: string, value: unknown) {
  const input = Input.parse(value);
  app.store.get('agent', targetAgentId); app.store.get('agent', input.sourceAgentId);
  if (targetAgentId === input.sourceAgentId) throw new Error('Cross-Agent package copy requires different Agents');
  await app.agentSkillPackages.flush(input.sourceAgentId);
  const pack = await app.agentSkillPackages.resolveMethod(input.sourceAgentId, input.skillId, input.version);
  const preserved = app.store.executiveSkillHistory(input.sourceAgentId, input.skillId).find(skill => skill.version === input.version);
  if (!preserved || !isDeepStrictEqual(preserved, pack.method)) throw new Error('Package copy requires its exact preserved source version');
  const source = `Copied immutable skill package from Agent ${input.sourceAgentId}, skill ${input.skillId}, version ${input.version}, digest ${pack.digest}. Source-host approval and maturity confer no target authority.`;
  const proposal = await app.agentSkillImports.propose(targetAgentId, { name: pack.name, files: pack.files, source, reason: input.reason });
  const recorded = app.store.eventsByType(targetAgentId, ['executive.skill_package_copied']).some(event =>
    event.type === 'executive.skill_package_copied' && event.payload.proposalId === proposal.id);
  if (!recorded) app.store.appendEvent(targetAgentId, null, 'executive.skill_package_copied', {
    sourceAgentId: input.sourceAgentId, skillId: input.skillId, version: input.version,
    packageDigest: pack.digest, proposalId: proposal.id, reason: input.reason,
  });
  return proposal;
}
