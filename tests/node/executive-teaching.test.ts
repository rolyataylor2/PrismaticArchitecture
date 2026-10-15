import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { Execution, SelfContext } from '../../packages/core/src/domain.js';
import type { Operation } from '../../packages/core/src/operation.js';
import type { Executor } from '../../packages/core/src/contracts.js';
import { factualWorld } from '../../packages/core/src/experienced.js';

const echo = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
const method = (): Operation => ({ successCriteria: 'An independent check returns 42', constraints: ['Keep the selected exact input'],
  steps: [echo], verification: { ...echo, path: ['value'], expectedJson: '42' } });
const lesson = (): Operation => ({ ...method(), teachProcedure: { name: 'Exact fixture method', conditions: ['Use the identical recorded input'], scope: 'thread' } });
function fixture(executor?: Executor, path = ':memory:') {
  const draft = { operation: lesson() };
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Return and independently check the fixture input', operation: structuredClone(draft.operation) },
        argument: 'Prescribed teaching plumbing fixture, not configured-model learning evidence', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      assert.equal('world' in context, false); assert.equal('externalSkills' in context, false);
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  const providers = {
    reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings(),
  }; const store = new SqliteStore(path); const app = new Application(store, providers, executor); const agent = app.createAgent();
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], timeoutMs: 5000, envSecretRefs: {} }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: ['echo', 'error'].map(toolName => ({ serverId: 'local', toolName })) }, 0);
  return { store, app, agent, draft, providers };
}
async function settled(app: Application, execution: Execution) {
  if (execution.status === 'running') await app.executiveWorkers.wait(execution.agentId, execution.id);
  return app.store.executions(execution.agentId).find(item => item.id === execution.id)!;
}

test('selected teaching and exact method invocation preserve recorded authority in synchronous and background native execution', async () => {
  for (const executionMode of ['synchronous', 'background'] as const) {
    const { store, app, agent, draft } = fixture();
    try {
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode, learningMode: 'validated_automatic' }, 0);
      const taught = await app.message(agent.id, 'Teach the prescribed method.', 'user', 'origin');
      const execution = await settled(app, taught.execution!); assert.equal(execution.status, 'completed');
      const skill = store.executiveSkills(agent.id)[0]!; assert.equal(skill.status, 'active'); assert.equal(skill.version, 2);
      assert.equal(skill.procedure.teachProcedure, undefined); assert.equal(skill.procedure.skillInvocation, undefined);
      assert.equal(skill.source.contractId, execution.contractId);
      const reports = store.eventsByType(agent.id, ['execution.procedure_teaching']); assert.equal(reports.length, 1);
      app.executiveTeaching.record(execution); assert.throws(() => app.reportExecution(execution), /terminal/);
      assert.equal(store.eventsByType(agent.id, ['execution.procedure_teaching']).length, 1); assert.equal(store.executiveSkills(agent.id)[0]!.version, 2);
      const original = structuredClone(store.world(taught.cycle.worldId));
      draft.operation = { ...method(), steps: [], verification: null, skillInvocation: { skillId: skill.id, version: skill.version } };
      const selected = structuredClone(draft.operation);
      const invoked = await app.message(agent.id, 'Use the known exact method.', 'user', 'origin');
      const result = await settled(app, invoked.execution!); assert.equal(result.status, 'completed'); assert.equal(result.operational?.verified, true);
      assert.equal(result.action.kind, 'operate'); if (result.action.kind === 'operate') assert.deepEqual(result.action.operation, selected);
      const event = store.eventsByType(agent.id, ['execution.contract'], [invoked.cycle.id])[0]!;
      assert.equal(event.type, 'execution.contract'); if (event.type === 'execution.contract') {
        assert.equal(event.payload.selectedSkill?.skillId, skill.id); assert.deepEqual(event.payload.selectedSkill?.procedure, skill.procedure);
        assert.equal(event.payload.authority.tools.length, 1);
      }
      const world = store.world(invoked.cycle.worldId); const publicSkill = world.externalSkills![0]!;
      assert.equal(publicSkill.id, skill.id); assert.equal(publicSkill.inputPolicy, 'exact_recorded_inputs');
      assert.equal(JSON.stringify(publicSkill).includes('argumentsJson'), false); assert.equal(JSON.stringify(publicSkill).includes('instruction'), false);
      assert.equal(factualWorld(world).externalSkills, undefined); assert.deepEqual(store.world(taught.cycle.worldId), original);
      const packageSnapshot = await app.agentSkillPackages.resolveMethod(agent.id, skill.id, skill.version);
      if (event.type === 'execution.contract') assert.equal(event.payload.selectedSkill?.packageDigest, packageSnapshot.digest);
      const instructionPath = join(packageSnapshot.directory, 'SKILL.md'); const instructions = readFileSync(instructionPath, 'utf8');
      try {
        writeFileSync(instructionPath, `${instructions}\nUnreviewed external edit`);
        const corrupt = await app.message(agent.id, 'Reject a corrupted stored package.', 'user', 'origin');
        assert.equal(corrupt.execution?.status, 'blocked');
        assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [corrupt.cycle.id]).length, 0);
      } finally { writeFileSync(instructionPath, instructions); }
      const foreign = await app.message(agent.id, 'Foreign thread must not reuse a thread method.', 'user', 'foreign');
      assert.equal(foreign.execution?.status, 'blocked'); assert.equal(store.world(foreign.cycle.worldId).externalSkills, undefined);
      assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [foreign.cycle.id]).length, 0);
      draft.operation.skillInvocation!.version = skill.version - 1;
      const stale = await app.message(agent.id, 'Reject stale version.', 'user', 'origin'); assert.equal(stale.execution?.status, 'blocked');
      draft.operation.skillInvocation!.version = skill.version;
      draft.operation.successCriteria = 'A different unsupported criterion';
      const changed = await app.message(agent.id, 'Reject incompatible criterion.', 'user', 'origin'); assert.equal(changed.execution?.status, 'blocked');
      draft.operation.successCriteria = method().successCriteria; draft.operation.steps = [echo];
      const competing = await app.message(agent.id, 'Reject a competing strategy.', 'user', 'origin'); assert.equal(competing.execution?.status, 'blocked');
      draft.operation.steps = [];
      store.saveMcpPermissions(agent.id, { revision: 2, tools: [] }, 1);
      const revoked = await app.message(agent.id, 'Do not expand revoked authority.', 'user', 'origin');
      assert.equal(revoked.execution?.status, 'blocked'); assert.equal(store.world(revoked.cycle.worldId).externalSkills![0]!.permitted, false);
      assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [revoked.cycle.id]).length, 0);
      assert.equal(store.executiveSkills(agent.id)[0]!.status, 'active', 'Permission loss does not erase recorded knowledge');
    } finally { await app.close(); store.close(); }
  }
});

test('background teaching cannot loosen captured modes and invalid revisions leave real tool outcomes intact', async () => {
  for (const [captured, current] of [['supervised', 'validated_automatic'], ['validated_automatic', 'supervised'],
    ['disabled', 'validated_automatic'], ['validated_automatic', 'disabled']] as const) {
    const { store, app, agent } = fixture();
    try {
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode: 'background', learningMode: captured }, 0);
      const run = await app.message(agent.id, 'Record the chosen lesson after completion.', 'user', 'origin'); assert.equal(run.execution?.status, 'running');
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 2, learningMode: current }, 1);
      const result = await settled(app, run.execution!); assert.equal(result.status, 'completed');
      const skills = store.executiveSkills(agent.id);
      if (captured === 'disabled' || current === 'disabled') assert.deepEqual(skills, []);
      else { assert.equal(skills.length, 1); assert.equal(skills[0]!.status, 'proposed'); assert.equal(skills[0]!.validations[0]!.result, 'passed'); }
      assert.equal(store.eventsByType(agent.id, ['execution.procedure_teaching']).length, 1);
    } finally { await app.close(); store.close(); }
  }
  const { store, app, agent, draft } = fixture();
  enableExecutive(app, agent.id);
  try {
    draft.operation.teachProcedure = { ...lesson().teachProcedure!, skillId: 'nonexistent_skill', expectedVersion: 1 };
    const run = await app.message(agent.id, 'Invalid retention reference with a valid operation.', 'user', 'origin');
    assert.equal(run.execution?.status, 'completed'); assert.equal(run.execution?.operational?.verified, true);
    assert.deepEqual(store.executiveSkills(agent.id), []);
    const event = store.eventsByType(agent.id, ['execution.procedure_teaching'])[0]!;
    assert.equal(event.type, 'execution.procedure_teaching'); if (event.type === 'execution.procedure_teaching') assert.equal(event.payload.status, 'rejected');
    const count = store.cycles(agent.id).length; draft.operation = method();
    const next = await app.message(agent.id, 'Inspect later factual feedback.', 'user', 'origin');
    assert.equal(store.cycles(agent.id).length, count + 1, 'Retention does not trigger an automatic cognitive cycle');
    assert.ok(store.world(next.cycle.worldId).facts.some(fact => fact.text.includes('procedure teaching') && fact.text.includes('rejected')));
  } finally { await app.close(); store.close(); }
});

test('selected procedure retention honors learning modes and independent evidence without rewriting actual outcomes', async () => {
  for (const kind of ['disabled', 'supervised', 'automatic', 'failed', 'fabricated'] as const) {
    const executor: Executor | undefined = kind === 'fabricated' ? { execute: async input => ({
      id: 'false_completion', agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action, status: 'completed', facts: [],
      operational: { attempts: 0, verified: true, reason: 'Deliberate unsupported completion fixture', traceRefs: [] },
    }) } : undefined;
    const { store, app, agent, draft } = fixture(executor);
    try {
      const learningMode = kind === 'disabled' ? 'disabled' : kind === 'supervised' ? 'supervised' : 'validated_automatic';
      store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 1, learningMode }, 0);
      if (kind === 'failed') draft.operation.steps = [{ serverId: 'local', toolName: 'error', argumentsJson: '{}' }];
      const run = await app.message(agent.id, 'Selected lesson fixture.', 'user', 'origin');
      const saved = structuredClone(run.execution); const skills = store.executiveSkills(agent.id);
      const event = store.eventsByType(agent.id, ['execution.procedure_teaching'])[0]!; assert.equal(event.type, 'execution.procedure_teaching');
      if (kind === 'disabled') { assert.equal(skills.length, 0); if (event.type === 'execution.procedure_teaching') assert.equal(event.payload.status, 'skipped'); }
      else {
        assert.equal(skills.length, 1); assert.equal(skills[0]!.status, kind === 'automatic' ? 'active' : 'proposed');
        assert.equal(skills[0]!.validations[0]!.result, kind === 'failed' ? 'failed' : kind === 'fabricated' ? 'inconclusive' : 'passed');
        if (kind === 'supervised') {
          store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 2, learningMode: 'validated_automatic' }, 1);
          draft.operation = method();
          const evidence = await app.message(agent.id, 'Another independently recorded exact execution.', 'user', 'origin');
          const again = app.executiveSkills.validate(agent.id, skills[0]!.id, 2, evidence.execution!.id);
          assert.equal(again.status, 'proposed', 'Captured supervised mode cannot be relaxed after execution');
          const approved = app.executiveSkills.decide(agent.id, again.id, again.version, 'approval', 'Explicit supervised approval'); assert.equal(approved.status, 'active');
        }
      }
      assert.deepEqual(store.executions(agent.id).find(item => item.id === run.execution!.id), saved);
    } finally { await app.close(); store.close(); }
  }
});

test('a retention reporting infrastructure failure cannot roll back a persisted background tool outcome', async () => {
  const { store, app, agent } = fixture();
  try {
    store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode: 'background' }, 0);
    const run = await app.message(agent.id, 'Complete a real operation before the injected retention failure.', 'user', 'origin');
    assert.equal(run.execution?.status, 'running');
    app.executiveTeaching.record = () => { throw new Error('Deliberately injected retention reporting infrastructure failure'); };
    await app.executiveWorkers.wait(agent.id, run.execution!.id);
    const saved = store.executions(agent.id).find(item => item.id === run.execution!.id)!;
    assert.equal(saved.status, 'completed'); assert.equal(saved.operational?.verified, true);
    assert.equal(saved.operational?.attempts, 2); assert.equal(store.executiveSkills(agent.id).length, 0);
  } finally {
    await app.close(); store.close();
  }
});

test('selected revisions and restart preserve source history, idempotent teaching and stored method limits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'executive-teaching-')); const path = join(directory, 'state.sqlite');
  const first = fixture(undefined, path); let { store, app } = first; const { agent, draft, providers } = first;
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: 1, learningMode: 'validated_automatic', limits: { ...profile.limits, maxSteps: 2 } }, 0);
    const initial = await app.message(agent.id, 'Teach the initial exact method.', 'user', 'origin');
    const original = structuredClone(store.executiveSkills(agent.id)[0]!); assert.equal(original.status, 'active');
    draft.operation = { ...lesson(), teachProcedure: { ...lesson().teachProcedure!, name: 'Revised exact fixture method', skillId: original.id, expectedVersion: original.version } };
    const revised = await app.message(agent.id, 'Select a versioned teaching revision.', 'user', 'origin');
    const skill = store.executiveSkills(agent.id)[0]!; assert.equal(skill.version, 4); assert.equal(skill.status, 'active');
    assert.equal(skill.source.contractId, revised.execution!.contractId); assert.equal(skill.validations.length, 1);
    assert.deepEqual(store.executiveSkillHistory(agent.id, skill.id)[1], original);
    app.executiveTeaching.record(initial.execution!); assert.equal(store.executiveSkills(agent.id)[0]!.version, 4);
    const savedWorld = structuredClone(store.world(initial.cycle.worldId));
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    app.executiveTeaching.record(initial.execution!); assert.deepEqual(store.executiveSkills(agent.id)[0], skill);
    assert.deepEqual(store.world(initial.cycle.worldId), savedWorld);
    store.saveExecutiveProfile(agent.id, { ...store.executiveProfile(agent.id), enabled: true, modules: { speaking: true, tools: true }, revision: 2, limits: { ...profile.limits, maxSteps: 20 } }, 1);
    draft.operation = { ...method(), steps: [], verification: null, skillInvocation: { skillId: skill.id, version: skill.version } };
    const reuse = await app.message(agent.id, 'Reuse the current exact method after restart.', 'user', 'origin');
    assert.equal(reuse.execution?.status, 'completed');
    const event = store.eventsByType(agent.id, ['execution.contract'], [reuse.cycle.id])[0]!;
    if (event.type === 'execution.contract') { assert.equal(event.payload.limits.maxSteps, 2); assert.equal(event.payload.selectedSkill?.version, 4); }
    else assert.fail('The selected method must have a preserved contract');
    assert.equal(store.executiveSkills(agent.id).length, 1, 'Invocation does not replay teaching bindings');
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
