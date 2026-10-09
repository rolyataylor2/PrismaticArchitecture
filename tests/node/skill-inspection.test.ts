import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { buildAgentSkillPackage } from '../../packages/core/src/agent-skill-package.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { inspectExecutiveSkill, type ExecutiveSkillInspection } from '../../packages/sdk/src/skill-inspection.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { Operation } from '../../packages/core/src/operation.js';
import type { Store } from '../../packages/core/src/contracts.js';
import { publicSkills } from '../../packages/core/src/skill-invocation.js';
import { AgentSkillPackages } from '../../packages/sdk/src/agent-skill-packages.js';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { ExecutiveSkills } from '../../packages/sdk/src/executive-skills.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('read-only skill inspection reconstructs actual thoughts, activation, source bids, failures, revisions and recorded method relationships', async () => {
  const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
  let thought = 'Prescribed original fixture thought'; let argument = 'Prescribed original fixture reason';
  let operation: Operation = { successCriteria: 'The separate check returns 42', constraints: ['Preserve exact inputs'], steps: [echo],
    verification: { ...echo, path: ['value'], expectedJson: '42' },
    teachProcedure: { name: 'Inspectable fixture method', conditions: ['Original exact condition'], scope: 'thread' } };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input); if (input.task !== 'part_cognition') return result;
      const output = PartGenerationSchema.parse(result); output.cognition.thought = thought;
      output.cognition.proposal = { action: { kind: 'operate', text: 'Inspect the selected fixture method', operation: structuredClone(operation) },
        argument, identityFit: [], executionOrder: [] }; return output;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      return input.task === 'disposition_activation' ? input.candidates.map(candidate => ({ partId: candidate.id, score: 3 })) : super.judge(input);
    }
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Explicit fixture selection reason', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent(); const foreign = app.createAgent();
  try {
    await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Fixture concern', concern: 'Researcher-authored inspection fixture scope',
      cues: ['inspection fixture'], scope: 'fixture', threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false });
    store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, revision: 1, learningMode: 'validated_automatic' }, 0);
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: ['echo', 'error'].map(toolName => ({ serverId: 'local', toolName })) }, 0);
    const first = await app.message(agent.id, 'Ordinary inspection fixture experience.', 'user', 'origin');
    const initial = store.executiveSkills(agent.id)[0]!;
    thought = 'Prescribed revision fixture thought'; argument = 'Prescribed revision fixture reason';
    operation.teachProcedure = { ...operation.teachProcedure!, name: 'Revised fixture method', conditions: ['Changed declared condition'], skillId: initial.id, expectedVersion: initial.version };
    const revised = await app.message(agent.id, 'Another ordinary fixture experience.', 'user', 'origin');
    const active = store.executiveSkills(agent.id)[0]!;
    const sibling = app.executiveSkills.proposeSkill(agent.id, { name: 'Independent proposal from the same instruction', conditions: ['Separate declaration'],
      scope: 'thread', sourceContractId: revised.execution!.contractId! });
    operation = { ...operation, steps: [], verification: null, skillInvocation: { skillId: active.id, version: active.version },
      teachProcedure: { name: 'Method learned from a recorded invocation', conditions: ['Known exact input'], scope: 'thread' } };
    const application = await app.message(agent.id, 'Invoke and retain a separately named method.', 'user', 'origin');
    const derived = store.executiveSkills(agent.id).find(item => item.id !== active.id && item.id !== sibling.id)!;
    operation = { ...initial.procedure, steps: [{ serverId: 'local', toolName: 'error', argumentsJson: '{}' }],
      teachProcedure: { name: 'Unsuccessful fixture revision', conditions: ['Explicit negative example'], scope: 'thread', skillId: active.id, expectedVersion: active.version } };
    const failed = await app.message(agent.id, 'Preserve an unsuccessful selected correction.', 'user', 'origin'); assert.equal(failed.execution?.status, 'failed');
    const before = { skills: structuredClone(store.executiveSkills(agent.id)), identity: structuredClone(store.get('identity', agent.id)),
      cycles: store.cycles(agent.id).length, events: store.events(agent.id).length };
    const report = await api(app, 'GET', `/api/agents/${agent.id}/executive-skills/${initial.id}/inspect`) as ExecutiveSkillInspection;
    assert.equal(report.versions.length, 6); assert.equal(report.skill.status, 'proposed'); assert.equal(report.skill.validations.at(-1)?.result, 'failed');
    assert.ok(report.versions[2]!.changes.some(change => change.label === 'Declared conditions'));
    const originalEpisode = report.episodes.find(episode => episode.contractId === first.execution!.contractId)!;
    assert.equal(originalEpisode.thoughts[0]!.text, 'Prescribed original fixture thought');
    assert.equal(originalEpisode.bids.find(bid => bid.role === 'source')!.argument, 'Prescribed original fixture reason');
    assert.equal(originalEpisode.activations[0]!.score, 3); assert.equal(originalEpisode.activations[0]!.concern, 'Researcher-authored inspection fixture scope');
    assert.equal(originalEpisode.outcomes[0]!.execution.status, 'completed');
    assert.ok(report.episodes.some(episode => episode.outcomes.some(outcome => outcome.execution.status === 'failed')));
    const use = report.episodes.find(episode => episode.contractId === application.execution!.contractId)!;
    assert.equal(use.relationship, 'application');
    assert.deepEqual(use.usedMethod, { skillId: active.id, version: active.version,
      packageDigest: (await app.agentSkillPackages.resolveMethod(agent.id, active.id, active.version)).digest });
    assert.equal(use.outcomes[0]!.execution.status, 'completed');
    assert.equal(use.applicationEvidence?.[0]?.result, 'passed');
    assert.deepEqual(report.applicationSummary, { passed: 1, failed: 0, inconclusive: 0, pending: 0, rejected: 0 });
    assert.ok(report.related.some(item => item.id === sibling.id && item.relationship === 'same_instruction'));
    assert.ok(report.related.some(item => item.id === derived.id && item.relationship === 'derived_use'));
    const derivedReport = inspectExecutiveSkill(store, agent.id, derived.id);
    assert.ok(derivedReport.related.some(item => item.id === initial.id && item.relationship === 'derived_from'));
    assert.ok(derivedReport.episodes.some(episode => episode.relationship === 'ancestor' && episode.contractId === revised.execution!.contractId));
    assert.ok(report.limitations.some(text => text.includes('not proof')));
    assert.deepEqual(store.executiveSkills(agent.id), before.skills); assert.deepEqual(store.get('identity', agent.id), before.identity);
    assert.equal(store.cycles(agent.id).length, before.cycles); assert.equal(store.events(agent.id).length, before.events);
    const missingLedger = new Proxy(store, { get(target, key) {
      if (key === 'eventsByType') return ((...args: Parameters<Store['eventsByType']>) => target.eventsByType(...args).filter(event => event.type !== 'execution.tool_trace'));
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const unsupported = inspectExecutiveSkill(missingLedger, agent.id, initial.id);
    assert.equal(unsupported.applicationSummary.passed, 0);
    assert.equal(unsupported.applicationSummary.inconclusive, 1, 'A completed flag cannot replace independent tool evidence');
    await assert.rejects(api(app, 'GET', `/api/agents/${foreign.id}/executive-skills/${initial.id}/inspect`), /not found for this Agent/);
    const historicalView = new Proxy(store, { get(target, key) {
      if (key === 'eventsByType') return ((...args: Parameters<Store['eventsByType']>) => target.eventsByType(...args).filter(event => event.type !== 'part.thought'));
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    assert.ok(inspectExecutiveSkill(historicalView, agent.id, initial.id).episodes[0]!.limitations.some(text => text.includes('Current Part state is not substituted')));
    const assessment = { stage: 'tested', origin: 'researcher', assessedVersion: derived.version,
      reason: 'Explicit plumbing assessment', applicability: 'Only exact recorded fixture inputs and constraints',
      executionIds: [first.execution!.id], counterevidenceIds: [], limitations: ['No transfer or causal proof'], at: new Date().toISOString() };
    assert.throws(() => app.executiveSkills.assessMaturity(agent.id, derived.id, derived.version,
      { ...assessment, executionIds: [first.execution!.id, first.execution!.id] }), /distinct executions/);
    assert.throws(() => app.executiveSkills.assessMaturity(agent.id, derived.id, derived.version,
      { ...assessment, stage: 'established' }), /distinct passed evidence/);
    let assessed = app.executiveSkills.assessMaturity(agent.id, derived.id, derived.version, assessment);
    assert.equal(assessed.status, derived.status); assert.equal(assessed.maturity!.stage, 'tested');
    assessed = app.executiveSkills.assessMaturity(agent.id, derived.id, assessed.version,
      { ...assessment, stage: 'established', assessedVersion: assessed.version, executionIds: [first.execution!.id, revised.execution!.id] });
    assessed = app.executiveSkills.assessMaturity(agent.id, derived.id, assessed.version,
      { ...assessment, stage: 'deprecated', assessedVersion: assessed.version, executionIds: [], reason: 'Retire this exact fixture knowledge' });
    assert.equal(assessed.status, 'active', 'Maturity does not rewrite application administration');
    assert.equal(publicSkills(store, agent.id, 'origin', 20).find(skill => skill.id === derived.id)!.permitted, false);
    operation = { ...derived.procedure, steps: [], verification: null, skillInvocation: { skillId: derived.id, version: assessed.version } };
    const deprecated = await app.message(agent.id, 'Try deprecated fixture knowledge.', 'user', 'origin');
    assert.equal(deprecated.execution!.status, 'blocked');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [deprecated.cycle.id]).length, 0);
    assert.ok(store.executiveSkillHistory(agent.id, derived.id).some(skill => skill.maturity?.stage === 'established'));
    const packageRoot = await mkdtemp(join(tmpdir(), 'prism-skills-'));
    try {
      const automaticRoot = join(packageRoot, 'automatic');
      const automatic = new AgentSkillPackages(store, automaticRoot);
      const lifecycle = new ExecutiveSkills(store, skill => automatic.schedule(skill));
      const before = store.executiveSkills(agent.id).find(skill => skill.id === initial.id)!;
      assert.throws(() => store.transaction(() => {
        lifecycle.decide(agent.id, initial.id, before.version, 'archive', 'Rolled-back fixture change');
        throw new Error('Rollback fixture');
      }), /Rollback fixture/);
      await automatic.flush();
      await assert.rejects(readdir(automaticRoot), { code: 'ENOENT' });
      const committed = lifecycle.decide(agent.id, initial.id, before.version, 'archive', 'Committed fixture change');
      await automatic.flush();
      const automaticSaved = await automatic.persist(agent.id, initial.id, committed.version);
      assert.deepEqual((await automatic.load(agent.id, automaticSaved.digest)).method, committed);
      const failedRoot = join(packageRoot, 'file-instead-of-directory');
      await writeFile(failedRoot, 'Fixture storage failure');
      const failed = new AgentSkillPackages(store, failedRoot);
      failed.schedule(committed);
      await failed.flush(foreign.id);
      await assert.rejects(failed.flush(), /Automatic skill package storage failed/);
      assert.deepEqual(store.executiveSkills(agent.id).find(skill => skill.id === initial.id), committed);
      await rm(failedRoot);
      const retried = await failed.persist(agent.id, initial.id, committed.version);
      assert.deepEqual((await failed.load(agent.id, retried.digest)).method, committed);
      const reconciled = await automatic.reconcile(agent.id);
      assert.equal(reconciled.length, store.executiveSkills(agent.id).reduce((count, skill) =>
        count + store.executiveSkillHistory(agent.id, skill.id).length, 0));
      assert.deepEqual(await new AgentSkillPackages(store, automaticRoot).reconcile(agent.id), reconciled);
      const packages = new AgentSkillPackages(store, packageRoot);
      const snapshot = { events: store.events(agent.id).length, skills: structuredClone(store.executiveSkills(agent.id)) };
      const pack = packages.build(agent.id, initial.id);
      const preview = await api(app, 'POST', `/api/agents/${agent.id}/executive-skill-packages/preview`, {
        name: 'generic-example', files: { 'SKILL.md': '---\nname: generic-example\ndescription: Generic instructions\n---\n\nFollow the selected goal.\n',
          'scripts/example.sh': 'exit 99' },
      }) as { instructions: string; files: Record<string, string> };
      assert.match(preview.instructions, /selected goal/); assert.equal(preview.files['scripts/example.sh'], 'exit 99');
      assert.match(pack.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.ok(pack.name.length <= 64);
      assert.match(pack.files['SKILL.md']!, new RegExp(`^---\\nname: ${pack.name}\\ndescription:`));
      assert.match(pack.files['references/DEVELOPMENT.md']!, /Prescribed original fixture thought/);
      assert.match(pack.files['references/DEVELOPMENT.md']!, /Unsuccessful fixture revision|Prescribed revision fixture reason/);
      assert.deepEqual(JSON.parse(pack.files['assets/prism-method.json']!), store.executiveSkills(agent.id).find(skill => skill.id === initial.id));
      const legacy = buildAgentSkillPackage(JSON.parse(pack.files['assets/prism-method.json']!), pack.files['references/DEVELOPMENT.md']!, [], 'legacy');
      const legacyDirectory = join(packageRoot, createHash('sha256').update(agent.id).digest('hex'), legacy.digest, legacy.name);
      for (const [path, contents] of Object.entries(legacy.files)) {
        await mkdir(dirname(join(legacyDirectory, path)), { recursive: true });
        await writeFile(join(legacyDirectory, path), contents);
      }
      const oldSnapshot = await packages.load(agent.id, legacy.digest);
      assert.deepEqual(oldSnapshot.files, legacy.files);
      assert.equal(oldSnapshot.digest, legacy.digest, 'Legacy immutable snapshots retain their original digest');
      assert.deepEqual(oldSnapshot.method, JSON.parse(pack.files['assets/prism-method.json']!));
      await writeFile(join(legacyDirectory, 'SKILL.md'), `${legacy.files['SKILL.md']}\nChanged`);
      await assert.rejects(packages.load(agent.id, legacy.digest), /immutable snapshot/);
      const saved = await packages.persist(agent.id, initial.id);
      assert.equal(await readFile(join(saved.directory, 'SKILL.md'), 'utf8'), pack.files['SKILL.md']);
      assert.deepEqual(await packages.persist(agent.id, initial.id), saved, 'Repeated persistence preserves the immutable content snapshot');
      assert.deepEqual(await new AgentSkillPackages(store, packageRoot).persist(agent.id, initial.id), saved);
      const loaded = await new AgentSkillPackages(store, packageRoot).load(agent.id, saved.digest);
      assert.deepEqual(loaded.files, pack.files);
      assert.deepEqual(loaded.method, JSON.parse(pack.files['assets/prism-method.json']!));
      const bound = await new AgentSkillPackages(store, packageRoot).resolveMethod(agent.id, initial.id, loaded.method.version);
      assert.deepEqual(bound.files, pack.files); assert.equal(bound.digest, saved.digest);
      await assert.rejects(packages.resolveMethod(foreign.id, initial.id, loaded.method.version));
      await assert.rejects(packages.resolveMethod(agent.id, initial.id, 999999));
      const archived = await packages.persistHistory(agent.id, initial.id);
      const versions = store.executiveSkillHistory(agent.id, initial.id);
      assert.deepEqual(archived.map(item => item.version), versions.map(item => item.version));
      assert.equal(new Set(archived.map(item => item.digest)).size, versions.length);
      for (const [index, item] of archived.entries()) {
        const historical = await new AgentSkillPackages(store, packageRoot).load(agent.id, item.digest);
        assert.deepEqual(historical.method, versions[index]);
        assert.deepEqual((await packages.resolveMethod(agent.id, initial.id, item.version)).method, versions[index]);
        assert.match(historical.files['references/DEVELOPMENT.md']!, /including later outcomes/);
      }
      assert.throws(() => packages.build(agent.id, initial.id, 999999), /preserved version/);
      await assert.rejects(packages.load(agent.id, '../invalid'), /Invalid stored/);
      await assert.rejects(packages.load(foreign.id, saved.digest));
      await writeFile(join(saved.directory, 'SKILL.md'), `${pack.files['SKILL.md']}\nExternal edit`);
      await assert.rejects(packages.load(agent.id, saved.digest), /immutable snapshot/);
      await assert.rejects(packages.resolveMethod(agent.id, initial.id, loaded.method.version), /immutable snapshot/);
      await assert.rejects(packages.persist(agent.id, initial.id), /immutable snapshot/);
      await writeFile(join(saved.directory, 'SKILL.md'), pack.files['SKILL.md']!);
      await writeFile(join(saved.directory, 'assets/unrecorded.json'), '{}');
      await assert.rejects(packages.load(agent.id, saved.digest), /immutable snapshot/);
      assert.throws(() => packages.build(foreign.id, initial.id), /not found for this Agent/);
      assert.equal(store.events(agent.id).length, snapshot.events); assert.deepEqual(store.executiveSkills(agent.id), snapshot.skills);
    } finally { await rm(packageRoot, { recursive: true, force: true }); }
  } finally { await app.close(); store.close(); }
});
