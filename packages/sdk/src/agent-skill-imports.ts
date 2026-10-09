import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { z } from 'zod';
import type { Store } from '../../core/src/contracts.js';
import { ConflictError } from '../../core/src/contracts.js';
import { parseAgentSkillPackage } from '../../core/src/agent-skill-format.js';

export const SkillImportInput = z.strictObject({ name: z.string(), files: z.record(z.string(), z.string()),
  source: z.string().trim().min(1).max(16000), reason: z.string().trim().min(1).max(16000), previousId: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const Manifest = z.strictObject({ agentId: z.string(), name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.string(), reason: z.string(), previousId: z.string().optional(), status: z.literal('proposed') });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const Review = z.strictObject({ agentId: z.string(), proposalId: z.string(), revision: z.number().int().positive(),
  decision: z.enum(['reviewed', 'rejected']), reason: z.string().trim().min(1).max(16000), at: z.string().datetime(), origin: z.literal('researcher') });
const ReviewInput = Review.pick({ decision: true, reason: true }).extend({ expectedRevision: z.number().int().nonnegative() });

/** Imported knowledge remains proposed; no source-host approval, scripts or tools are adopted. */
export class AgentSkillImports {
  constructor(private readonly store: Store, private readonly root: string) {}
  private parent(agentId: string) { this.store.get('agent', agentId); return join(resolve(this.root), 'imports', hash(agentId)); }
  private reviewParent(agentId: string, proposalId: string) { return join(resolve(this.root), 'import-reviews', hash(agentId), proposalId); }
  private async reviews(agentId: string, proposalId: string) {
    const parent = this.reviewParent(agentId, proposalId); let names: string[];
    try { names = await readdir(parent); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const versions = names.filter(name => !name.startsWith('.review-')).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
    const history: z.infer<typeof Review>[] = [];
    for (const [index, name] of versions.entries()) {
      if (name !== `version-${index + 1}`) throw new Error('Import review history has a missing or invalid version');
      const directory = join(parent, name);
      if (!(await lstat(directory)).isDirectory()) throw new Error('Invalid review directory');
      const entries = await readdir(directory); const file = entries[0];
      if (entries.length !== 1 || !file || !/^[a-f0-9]{64}\.json$/.test(file)) throw new Error('Invalid review record');
      const path = join(directory, file); if (!(await lstat(path)).isFile()) throw new Error('Invalid review resource');
      const contents = await readFile(path, 'utf8');
      if (`${hash(contents)}.json` !== file) throw new Error('Import review record changed');
      const review = Review.parse(JSON.parse(contents));
      if (review.agentId !== agentId || review.proposalId !== proposalId || review.revision !== index + 1) throw new Error('Import review attribution changed');
      history.push(review);
    }
    return history;
  }
  async review(agentId: string, proposalId: string, input: unknown) {
    const parsed = ReviewInput.parse(input); const proposal = await this.load(agentId, proposalId);
    if (proposal.reviews.length !== parsed.expectedRevision) throw new ConflictError('Import review changed; reload before reviewing');
    const record = Review.parse({ agentId, proposalId, revision: parsed.expectedRevision + 1, decision: parsed.decision,
      reason: parsed.reason, at: new Date().toISOString(), origin: 'researcher' });
    const parent = this.reviewParent(agentId, proposalId); await mkdir(parent, { recursive: true });
    const staging = await mkdtemp(join(parent, '.review-'));
    try {
      const contents = JSON.stringify(record); await writeFile(join(staging, `${hash(contents)}.json`), contents, { flag: 'wx' });
      try { await rename(staging, join(parent, `version-${record.revision}`)); }
      catch (error) {
        if (['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new ConflictError('Import review changed; reload before reviewing');
        throw error;
      }
      return record;
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  async list(agentId: string) {
    let names: string[];
    try { names = await readdir(this.parent(agentId)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const records = [];
    for (const name of names.filter(name => !name.startsWith('.import-')).sort()) records.push(await this.load(agentId, name));
    return records;
  }
  async load(agentId: string, proposalId: string) {
    if (!/^[a-f0-9]{64}$/.test(proposalId)) throw new Error('Invalid skill import ID');
    const target = join(this.parent(agentId), proposalId);
    if (!(await lstat(target)).isDirectory()) throw new Error('Invalid skill import directory');
    const manifestPath = join(target, 'proposal.json');
    if (!(await lstat(manifestPath)).isFile()) throw new Error('Invalid skill import manifest');
    const manifest = Manifest.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (manifest.agentId !== agentId || hash(JSON.stringify(manifest)) !== proposalId) throw new Error('Skill import attribution changed');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name)) throw new Error('Invalid skill import name');
    const directory = join(target, manifest.name); const files: Record<string, string> = Object.create(null);
    const read = async (path: string, prefix: string) => {
      if (!(await lstat(path)).isDirectory()) throw new Error('Imported resources must be regular directories');
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const relative = `${prefix}${entry.name}`; const file = join(path, entry.name);
        if (entry.isDirectory()) await read(file, `${relative}/`);
        else if (entry.isFile()) files[relative] = await readFile(file, 'utf8');
        else throw new Error('Imported resources must be regular files');
      }
    };
    await read(directory, '');
    const pack = parseAgentSkillPackage(manifest.name, files);
    if (pack.digest !== manifest.digest || (await readdir(target)).length !== 2) throw new Error('Imported package content changed');
    return { id: proposalId, ...manifest, package: pack, directory, reviews: await this.reviews(agentId, proposalId) };
  }
  async propose(agentId: string, input: unknown) {
    const parsed = SkillImportInput.parse(input); const parent = this.parent(agentId);
    const pack = parseAgentSkillPackage(parsed.name, parsed.files);
    if (parsed.previousId) await this.load(agentId, parsed.previousId);
    const manifest = Manifest.parse({ agentId, name: pack.name, digest: pack.digest, source: parsed.source, reason: parsed.reason,
      ...(parsed.previousId ? { previousId: parsed.previousId } : {}), status: 'proposed' });
    const proposalId = hash(JSON.stringify(manifest)); const target = join(parent, proposalId);
    await mkdir(parent, { recursive: true }); const staging = await mkdtemp(join(parent, '.import-'));
    try {
      for (const [path, contents] of Object.entries(pack.files)) {
        const file = join(staging, pack.name, path); await mkdir(dirname(file), { recursive: true });
        await writeFile(file, contents, { encoding: 'utf8', flag: 'wx' });
      }
      await writeFile(join(staging, 'proposal.json'), JSON.stringify(manifest), { flag: 'wx' });
      try { await rename(staging, target); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
      return await this.load(agentId, proposalId);
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
}
