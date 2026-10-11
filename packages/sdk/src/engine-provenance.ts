import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EngineProvenance = { format: 1; distribution: 'source' | 'compiled'; artifactHash: string | null; fileCount: number;
  sourceRevision: string | null; sourceModified: boolean | null; limitation: string };
/** Research provenance only: bounded framework paths, hashes rather than file contents or credentials. */
function capture(): EngineProvenance {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const distribution = import.meta.url.endsWith('.ts') ? 'source' : 'compiled';
  const files: string[] = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && /\.(?:ts|js|md)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(path);
    }
  };
  try { for (const layer of ['core', 'sdk', 'storage', 'providers']) walk(join(root, 'packages', layer, 'src')); } catch { files.length = 0; }
  let artifactHash: string | null = null;
  try {
    const hash = createHash('sha256');
    for (const path of files.sort()) hash.update(JSON.stringify(relative(root, path))).update('\0').update(createHash('sha256').update(readFileSync(path)).digest('hex')).update('\n');
    if (files.length) artifactHash = hash.digest('hex');
  } catch { artifactHash = null; }
  let sourceRevision: string | null = null; let sourceModified: boolean | null = null;
  try {
    const checkout = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'packages/core', 'packages/sdk', 'packages/storage', 'packages/providers', 'package.json', 'package-lock.json'],
      { cwd: checkout, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
    sourceModified = !!status.trim();
  } catch { sourceRevision = null; sourceModified = null; }
  return { format: 1, distribution, artifactHash, fileCount: files.length, sourceRevision, sourceModified,
    limitation: 'Framework filesystem snapshot at SDK module initialization, not proof of identical loaded code, dependencies, external models or tools. Git metadata describes the containing checkout; compiled artifacts may come from another source revision.' };
}
const captured = capture();
export function engineProvenance(): EngineProvenance { return structuredClone(captured); }
