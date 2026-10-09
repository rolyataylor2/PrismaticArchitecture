import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseDocument, isMap, isScalar } from 'yaml';

const Frontmatter = z.strictObject({
  name: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(1024),
  license: z.string().optional(), compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(), 'allowed-tools': z.string().optional(),
});

/** Format parsing only. Package prose, scripts and metadata confer no host authority. */
export function parseAgentSkillPackage(directoryName: string, files: Record<string, string>) {
  for (const path of Object.keys(files)) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..'))
      throw new Error('Skill resources require relative package paths');
  }
  const text = files['SKILL.md'];
  if (text === undefined) throw new Error('Agent Skills package requires SKILL.md');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Agent Skills requires YAML frontmatter');
  const document = parseDocument(match[1]!);
  if (document.errors.length) throw new Error(`Invalid skill YAML: ${document.errors[0]!.message}`);
  if (!isMap(document.contents)) throw new Error('Skill frontmatter must be a mapping');
  const metadata = document.get('metadata', true);
  if (metadata !== undefined && (!isMap(metadata) || metadata.items.some(({ key, value }) =>
    !isScalar(key) || typeof key.value !== 'string' || !isScalar(value) || typeof value.value !== 'string')))
    throw new Error('Skill metadata must map strings to strings');
  const frontmatter = Frontmatter.parse(document.toJS());
  if (frontmatter.name !== directoryName) throw new Error('Skill name must match its directory');
  const digest = createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  return { name: directoryName, frontmatter, instructions: text.slice(match[0].length), files: structuredClone(files), digest };
}
