import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, link } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Store } from '../../core/src/contracts.js';
import { buildAgentSkillPackage, type AgentSkillPackage } from '../../core/src/agent-skill-package.js';
import { inspectExecutiveSkill } from './skill-inspection.js';
import { ExecutiveSkillSchema } from '../../core/src/executive-skill.js';
import type { ExecutiveSkill } from '../../core/src/executive-skill.js';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

const Binding = z.strictObject({ agentId: z.string(), skillId: z.string(), version: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/) });

/** Privileged immutable package snapshots. Import/approval and canonical reconciliation are separate. */
export class AgentSkillPackages {
  readonly #pending = new Map<Promise<void>, string>();
  readonly #errors: { agentId: string; error: unknown }[] = [];
  constructor(private readonly store: Store, private readonly root: string) {}
  private bindingDirectory(agentId: string, skillId: string) {
    return join(resolve(this.root), createHash('sha256').update(agentId).digest('hex'), 'bindings', createHash('sha256').update(skillId).digest('hex'));
  }
  async resolveMethod(agentId: string, skillId: string, version: number) {
    this.store.get('agent', agentId); z.number().int().positive().parse(version);
    const file = join(this.bindingDirectory(agentId, skillId), `${version}.json`);
    if (!(await lstat(file)).isFile()) throw new Error('Skill package binding must be a regular file');
    const binding = Binding.parse(JSON.parse(await readFile(file, 'utf8')));
    if (binding.agentId !== agentId || binding.skillId !== skillId || binding.version !== version) throw new Error('Skill package binding attribution changed');
    const loaded = await this.load(agentId, binding.digest);
    if (loaded.method.id !== skillId || loaded.method.version !== version) throw new Error('Skill package binding references a different method');
    return loaded;
  }
  private async bind(agentId: string, pack: AgentSkillPackage) {
    const method = ExecutiveSkillSchema.parse(JSON.parse(pack.files['assets/ontoagentic-method.json']!));
    if (method.agentId !== agentId) throw new Error('Cannot bind a foreign skill package');
    const directory = this.bindingDirectory(agentId, method.id); await mkdir(directory, { recursive: true });
    const staging = await mkdtemp(join(directory, '.binding-'));
    try {
      const file = join(staging, 'binding.json');
      await writeFile(file, JSON.stringify(Binding.parse({ agentId, skillId: method.id, version: method.version, digest: pack.digest })), { flag: 'wx' });
      try { await link(file, join(directory, `${method.version}.json`)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const previous = await this.resolveMethod(agentId, method.id, method.version);
        if (!isDeepStrictEqual(previous.method, method)) throw new Error('Skill package binding conflicts with preserved method');
      }
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  schedule(skill: ExecutiveSkill): void {
    const saved = structuredClone(skill);
    // Storage transactions are synchronous. Recheck after the current stack so
    // enclosing rollback cannot publish an uncommitted procedure version.
    const pending = Promise.resolve().then(async () => {
      const committed = this.store.executiveSkillHistory(saved.agentId, saved.id).find(item => item.version === saved.version);
      if (!committed || !isDeepStrictEqual(committed, saved)) return;
      await this.persist(saved.agentId, saved.id, saved.version);
    }).catch(error => { this.#errors.push({ agentId: saved.agentId, error }); });
    this.#pending.set(pending, saved.agentId);
    void pending.then(() => { this.#pending.delete(pending); });
  }
  async flush(agentId?: string): Promise<void> {
    while (true) {
      const pending = [...this.#pending].filter(([, owner]) => agentId === undefined || owner === agentId).map(([job]) => job);
      if (!pending.length) break; await Promise.all(pending);
    }
    const failures = this.#errors.filter(item => agentId === undefined || item.agentId === agentId);
    if (failures.length) {
      for (const item of failures) this.#errors.splice(this.#errors.indexOf(item), 1);
      throw new AggregateError(failures.map(item => item.error), 'Automatic skill package storage failed; committed registry history remains available for retry');
    }
  }
  async load(agentId: string, digest: string) {
    this.store.get('agent', agentId);
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid stored skill package digest');
    const parent = join(resolve(this.root), createHash('sha256').update(agentId).digest('hex'));
    const target = join(parent, digest);
    for (const path of [parent, target]) if (!(await lstat(path)).isDirectory()) throw new Error('Stored package directory is invalid');
    const children = await readdir(target, { withFileTypes: true }); const entry = children[0];
    if (children.length !== 1 || !entry?.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || entry.name.length > 64)
      throw new Error('Stored skill package has an invalid directory name');
    const directory = join(target, entry.name);
    for (const path of ['assets', 'references']) if (!(await lstat(join(directory, path))).isDirectory())
      throw new Error('Stored package resource directory is invalid');
    const read = async (path: string) => {
      const file = join(directory, path); const stat = await lstat(file);
      if (!stat.isFile()) throw new Error('Stored package resources must be regular files');
      return readFile(file, 'utf8');
    };
    const method = ExecutiveSkillSchema.parse(JSON.parse(await read('assets/ontoagentic-method.json')));
    if (method.agentId !== agentId) throw new Error('Stored package belongs to a different Agent');
    const members = await Promise.all((method.conditional?.branches ?? []).map(async (_branch, index) =>
      ExecutiveSkillSchema.parse(JSON.parse(await read(`assets/branch-${index + 1}.json`)))));
    const pack = buildAgentSkillPackage(method, await read('references/DEVELOPMENT.md'), members);
    const expectedRoot = ['SKILL.md', 'assets', 'references'];
    const rootEntries = await readdir(directory);
    const assets = await readdir(join(directory, 'assets')); const references = await readdir(join(directory, 'references'));
    if (rootEntries.length !== expectedRoot.length || rootEntries.some(path => !expectedRoot.includes(path))
      || assets.length !== members.length + 1 || assets.some(path => !Object.hasOwn(pack.files, `assets/${path}`))
      || references.length !== 1 || references[0] !== 'DEVELOPMENT.md' || pack.name !== entry.name || pack.digest !== digest)
      throw new Error('Stored skill package differs from its immutable snapshot');
    for (const [path, contents] of Object.entries(pack.files))
      if (await read(path) !== contents) throw new Error('Stored skill package differs from its immutable snapshot');
    return { ...pack, method, members, directory };
  }
  build(agentId: string, skillId: string, version?: number) {
    const report = inspectExecutiveSkill(this.store, agentId, skillId);
    const skill = version === undefined ? report.skill : report.versions.find(item => item.skill.version === version)?.skill;
    if (!skill) throw new Error('Stored skill package requires a preserved version');
    const history = ['# Skill development', '', `Procedure version: ${skill.version}. Development evidence reflects records available at export time, including later outcomes.`, '',
      'This is recorded audit evidence, not private Part memory or proof of causal learning.', ''];
    for (const version of report.versions) history.push(`## Version ${version.skill.version}: ${version.skill.change.kind}`, '', version.skill.change.reason, '');
    for (const episode of report.episodes) {
      history.push(`## ${episode.relationship}: ${episode.goal}`, '', `Recorded contract: ${episode.contractId}`, '');
      if (episode.correction) {
        history.push('### Selected correction', '', `Previous contract: ${episode.correction.parentContractId}`,
          `Checkpoint: ${episode.correction.checkpointTraceId}`, `Ready handoff recorded: ${episode.correction.verifiedReady}`, '');
        for (const [label, steps] of [
          ['Completed steps preserved', episode.correction.completedPrefix],
          ['Previous future steps replaced', episode.correction.discardedFuture],
          ['New selected future steps', episode.correction.selectedFuture],
        ] as const) history.push(`#### ${label}`, '', ...steps.map((step, index) => `${index + 1}. ${step.serverId}/${step.toolName}: ${step.argumentsJson}`), '');
      }
      for (const thought of episode.thoughts) history.push(`### ${thought.name}: expressed ${thought.kind}`, '', thought.text, '');
      for (const bid of episode.bids) history.push(`### ${bid.selected ? 'Selected' : 'Unselected'} bid`, '', bid.text, '', `Reason: ${bid.argument}`, '');
      for (const decision of episode.decisions) history.push(`Self selection reason: ${decision.explanation}`, '');
      for (const activation of episode.activations) history.push(`Activation context: ${activation.name}, version ${activation.version}, ${activation.phase} score ${activation.score}. ${activation.concern}`, '');
      for (const review of episode.reviews ?? []) {
        history.push(`### ${review.consultations?.length ? 'Executive consultation' : 'Checkpoint review'}: cycle ${review.sequence}`, '');
        for (const request of review.consultations ?? []) history.push(`Consultation reason: ${request.reason}`, '',
          `Consultation outcome: ${request.outcome.replaceAll('_', ' ')}`, '');
        for (const thought of review.thoughts) history.push(`${thought.name}${thought.kind === 'answer' ? ' (deliberation answer)' : ''}: ${thought.text}`, '',
          ...(thought.at ? [`Expressed at: ${thought.at}`, ''] : []));
        for (const bid of review.bids) history.push(`${bid.selected ? 'Selected' : 'Unselected'} correction bid: ${bid.text}`, `Reason: ${bid.argument}`, '');
        for (const decision of review.decisions) history.push(`Self review reason: ${decision.explanation}`, '');
        for (const outcome of review.outcomes) history.push(`Review outcome: ${outcome.outcome}`, '');
      }
      for (const outcome of episode.outcomes) history.push(`Outcome: ${outcome.execution.status}. ${outcome.execution.operational?.reason ?? ''}`, '');
      history.push(...episode.limitations, '');
    }
    history.push('## Recorded variants', '', ...report.related.map(other => `${other.name}: ${other.relationship}. ${other.explanation}`), '',
      '## Limitations', '', ...report.limitations, '');
    const members = (skill.conditional?.branches ?? []).map(branch => {
      const member = this.store.executiveSkillHistory(agentId, branch.skillId).find(member => member.version === branch.version);
      if (!member) throw new Error('Conditional package member history is missing');
      history.push(`## Branch method: ${member.name}, preserved version ${member.version}`, '', member.source.instruction, '');
      const source = inspectExecutiveSkill(this.store, agentId, member.id).episodes.find(episode => episode.contractId === member.source.contractId);
      if (source) {
        for (const thought of source.thoughts) history.push(`${thought.name}: ${thought.text}`, '');
        for (const bid of source.bids) history.push(`${bid.selected ? 'Selected' : 'Unselected'} source bid: ${bid.text}`, `Reason: ${bid.argument}`, '');
        for (const decision of source.decisions) history.push(`Self selection reason: ${decision.explanation}`, '');
        for (const outcome of source.outcomes) history.push(`Outcome: ${outcome.execution.status}. ${outcome.execution.operational?.reason ?? ''}`, '');
      } else history.push('Source episode is missing; current private state is not substituted.', '');
      return member;
    });
    return buildAgentSkillPackage(skill, history.join('\n'), members);
  }
  async persist(agentId: string, skillId: string, version?: number) {
    return this.persistPackage(agentId, this.build(agentId, skillId, version));
  }
  async persistHistory(agentId: string, skillId: string) {
    const report = inspectExecutiveSkill(this.store, agentId, skillId);
    // Capture all packages before the first await: concurrent revisions cannot mix
    // procedure versions with a later registry view halfway through the export.
    const snapshots = report.versions.map(({ skill }) => ({ version: skill.version, pack: this.build(agentId, skillId, skill.version) }));
    const saved = [];
    for (const { version, pack } of snapshots) saved.push({ version, ...await this.persistPackage(agentId, pack) });
    return saved;
  }
  async reconcile(agentId: string) {
    this.store.get('agent', agentId);
    const snapshots = this.store.executiveSkills(agentId).flatMap(skill =>
      this.store.executiveSkillHistory(agentId, skill.id).map(version => ({ skillId: skill.id, version: version.version,
        pack: this.build(agentId, skill.id, version.version) })));
    const saved = [];
    for (const { skillId, version, pack } of snapshots) saved.push({ skillId, version, ...await this.persistPackage(agentId, pack) });
    return saved;
  }
  private async persistPackage(agentId: string, pack: AgentSkillPackage) {
    const parent = join(resolve(this.root), createHash('sha256').update(agentId).digest('hex'));
    await mkdir(parent, { recursive: true });
    const target = join(parent, pack.digest); const directory = join(target, pack.name);
    const staging = await mkdtemp(join(parent, '.package-'));
    try {
      for (const [path, contents] of Object.entries(pack.files)) {
        const file = join(staging, pack.name, path); await mkdir(dirname(file), { recursive: true });
        await writeFile(file, contents, { encoding: 'utf8', flag: 'wx' });
      }
      try { await rename(staging, target); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await this.load(agentId, pack.digest);
      }
      await this.bind(agentId, pack);
      return { name: pack.name, digest: pack.digest, directory };
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
}
