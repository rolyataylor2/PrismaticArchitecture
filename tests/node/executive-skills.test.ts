import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { Executor } from '../../packages/core/src/contracts.js';
import type { ExecutiveSkill } from '../../packages/core/src/executive-skill.js';

function fixture(path = ':memory:', failed = false, executor?: Executor) {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input); if (input.task !== 'part_cognition') return result;
      const output = PartGenerationSchema.parse(result);
      const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
      output.cognition.proposal = { action: { kind: 'operate', text: 'Selected procedure fixture', operation: {
        successCriteria: 'A separate check returns 42', constraints: ['Keep exact selected arguments'],
        steps: failed ? [{ serverId: 'local', toolName: 'error', argumentsJson: '{}' }] : [echo],
        verification: { ...echo, path: ['value'], expectedJson: '42' },
      } }, argument: 'Prescribed instruction fixture, not a model observation', identityFit: [], executionOrder: [] };
      return output;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(path); const app = new Application(store, {
    reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings(),
  }, executor);
  const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }, { serverId: 'local', toolName: 'error' }] }, 0);
  return { store, app, agent };
}
const proposal = (sourceContractId: string) => ({ sourceContractId, name: 'Exact fixture procedure', conditions: ['Exact recorded fixture inputs and criterion'], scope: 'thread' as const });

test('cross-Agent package copy preserves exact provenance as reviewed knowledge without transferring approval or permissions', async () => {
  const { store, app, agent } = fixture();
  try {
    const run = await app.message(agent.id, 'Execute the authored source procedure.', 'user', 'origin');
    let skill = app.executiveSkills.proposeSkill(agent.id, proposal(run.execution!.contractId!));
    skill = app.executiveSkills.validate(agent.id, skill.id, skill.version, run.execution!.id, false);
    skill = app.executiveSkills.decide(agent.id, skill.id, skill.version, 'approval', 'Source-host approval only');
    const target = app.createAgent('Package recipient'); const identity = structuredClone(store.get('identity', target.id));
    const path = `/api/agents/${target.id}/executive-skill-imports/copy`;
    const input = { sourceAgentId: agent.id, skillId: skill.id, version: skill.version, reason: 'Inspect an exact portable source method' };
    const copied = await api(app, 'POST', path, input) as Awaited<ReturnType<Application['agentSkillImports']['load']>>;
    const pack = await app.agentSkillPackages.resolveMethod(agent.id, skill.id, skill.version);
    assert.equal(copied.digest, pack.digest); assert.deepEqual(copied.package.files, pack.files);
    assert.match(copied.source, new RegExp(skill.id)); assert.ok(copied.source.includes(pack.digest));
    assert.equal(copied.status, 'proposed'); assert.deepEqual(copied.reviews, []);
    assert.deepEqual(store.executiveSkills(target.id), []); assert.deepEqual(store.mcpPermissions(target.id).tools, []);
    assert.deepEqual(store.get('identity', target.id), identity); assert.equal(store.cycles(target.id).length, 0);
    const receipt = store.eventsByType(target.id, ['executive.skill_package_copied']); assert.equal(receipt.length, 1);
    assert.ok(receipt[0]!.type === 'executive.skill_package_copied'); assert.equal(receipt[0]!.payload.version, skill.version);
    await app.agentSkillImports.review(target.id, copied.id, { expectedRevision: 0, decision: 'reviewed', reason: 'Review imported knowledge; not executable approval' });
    const repeated = await api(app, 'POST', path, input) as typeof copied;
    assert.equal(repeated.id, copied.id); assert.equal(repeated.reviews.length, 1);
    assert.equal(store.eventsByType(target.id, ['executive.skill_package_copied']).length, 1);
    assert.deepEqual(store.executiveSkills(target.id), []);
    await assert.rejects(api(app, 'POST', path, { ...input, version: skill.version + 1 }));
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/executive-skill-imports/copy`, input), /different Agents/);
  } finally { await app.close(); store.close(); }
});

test('supervised procedural skills preserve source, real validation, revisions, rollback and restart without psychological mutation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-skills-')); const path = join(directory, 'state.sqlite');
  const first = fixture(path); let store = first.store; let app = first.app;
  try {
    const run = await app.message(first.agent.id, 'Execute the fixture.', 'user', 'origin');
    assert.equal(run.execution?.status, 'completed');
    const identity = structuredClone(store.get('identity', first.agent.id)); const cycleCount = store.cycles(first.agent.id).length;
    const base = `agents/${first.agent.id}/executive-skills`;
    let skill = await api(app, 'POST', `/api/${base}`, proposal(run.execution!.contractId!)) as ExecutiveSkill;
    assert.equal(skill.status, 'proposed'); assert.equal(skill.source.instruction, 'Prescribed instruction fixture, not a model observation');
    await assert.rejects(api(app, 'POST', `/api/${base}/${skill.id}/approve`, { expectedVersion: 1, reason: 'Cannot approve without evidence' }), /validated/);
    skill = await api(app, 'POST', `/api/${base}/${skill.id}/validate`, { expectedVersion: 1, executionId: run.execution!.id }) as ExecutiveSkill;
    assert.equal(skill.status, 'proposed'); assert.equal(skill.validations[0]!.result, 'passed'); assert.equal(skill.validations[0]!.traceRefs.length, 2);
    skill = await api(app, 'POST', `/api/${base}/${skill.id}/approve`, { expectedVersion: 2, reason: 'Approve exact recorded procedure' }) as ExecutiveSkill;
    assert.equal(skill.status, 'active');
    assert.throws(() => store.saveExecutiveSkill({ ...skill, version: 4,
      change: { ...skill.change, kind: 'archive' } }, 3), /lifecycle transition/);
    assert.throws(() => app.executiveSkills.rollback(first.agent.id, skill.id, 2, 1, 'Stale administrative edit'), /changed/);
    skill = await api(app, 'PUT', `/api/${base}/${skill.id}`, { ...proposal(run.execution!.contractId!), name: 'Revised exact fixture', expectedVersion: 3 }) as ExecutiveSkill;
    assert.equal(skill.status, 'proposed'); assert.deepEqual(skill.validations, []);
    skill = await api(app, 'POST', `/api/${base}/${skill.id}/rollback`, { expectedVersion: 4, restoredVersion: 3, reason: 'Restore validated exact procedure' }) as ExecutiveSkill;
    assert.equal(skill.status, 'active'); assert.equal(skill.version, 5);
    assert.equal(store.executiveSkillHistory(first.agent.id, skill.id)[3]!.name, 'Revised exact fixture');
    assert.deepEqual(store.get('identity', first.agent.id), identity); assert.equal(store.cycles(first.agent.id).length, cycleCount);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(store.executiveSkills(first.agent.id)[0], skill);
    const db = new DatabaseSync(path);
    try { assert.throws(() => db.exec('UPDATE executive_skill_history SET version=99'), /immutable/); assert.throws(() => db.exec('DELETE FROM executive_skill_history'), /immutable/); }
    finally { db.close(); }
    const other = app.createAgent();
    assert.throws(() => app.executiveSkills.proposeSkill(other.id, proposal(run.execution!.contractId!)), /same-Agent/);
    store.saveMcpPermissions(first.agent.id, { revision: 2, tools: [] }, 1);
    assert.throws(() => app.executiveSkills.rollback(first.agent.id, skill.id, 5, 3, 'Restore after revocation'), /permissions/);
    assert.equal(store.executiveSkills(first.agent.id)[0]!.version, 5);
    store.deleteAgent(first.agent.id); assert.deepEqual(store.executiveSkills(other.id), []);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('automatic learning requires real successful evidence; failure and adapter completion claims cannot activate procedures', async () => {
  for (const kind of ['success', 'failure', 'fabricated'] as const) {
    const executor: Executor | undefined = kind === 'fabricated' ? { execute: async input => ({
      id: 'fabricated_execution', agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action, status: 'completed', facts: [],
      operational: { attempts: 0, verified: true, reason: 'Deliberately false plumbing fixture assertion', traceRefs: [] },
    }) } : undefined;
    const { store, app, agent } = fixture(':memory:', kind === 'failure', executor);
    try {
      const profile = store.executiveProfile(agent.id); store.saveExecutiveProfile(agent.id, { ...profile, revision: 1, learningMode: 'validated_automatic' }, 0);
      const run = await app.message(agent.id, 'Run the selected fixture.', 'user', 'origin');
      const skill = app.executiveSkills.proposeSkill(agent.id, proposal(run.execution!.contractId!));
      const validated = app.executiveSkills.validate(agent.id, skill.id, 1, run.execution!.id);
      assert.equal(validated.status, kind === 'success' ? 'active' : 'proposed');
      assert.equal(validated.validations[0]!.result, kind === 'success' ? 'passed' : kind === 'failure' ? 'failed' : 'inconclusive');
      if (kind !== 'success') assert.throws(() => app.executiveSkills.decide(agent.id, skill.id, 2, 'approval', 'Unsupported approval'), /validated/);
      const forged: ExecutiveSkill = { ...validated, version: 3, status: 'active', validations: [...validated.validations, {
        executionId: run.execution!.id, at: new Date().toISOString(), result: 'passed', traceRefs: ['forged_trace'], limitations: ['Explicit forgery fixture'],
      }] };
      assert.throws(() => store.saveExecutiveSkill(forged, 2), kind === 'success' ? /proposed procedure/ : /recorded tool evidence/);
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), revision: 2, learningMode: 'disabled' }, 1);
      assert.throws(() => app.executiveSkills.proposeSkill(agent.id, proposal(run.execution!.contractId!)), /disabled/);
    } finally { await app.close(); store.close(); }
  }
});
