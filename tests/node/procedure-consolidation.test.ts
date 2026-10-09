import { enableExecutive } from './executive-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { ProcedureConsolidationInput } from '../../packages/core/src/procedure-consolidation.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { Operation } from '../../packages/core/src/operation.js';
import { inspectExecutiveSkill } from '../../packages/sdk/src/skill-inspection.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { AgentSkillPackages } from '../../packages/sdk/src/agent-skill-packages.js';
import { buildAgentSkillPackage } from '../../packages/core/src/agent-skill-package.js';

function method(value: number, preference: string): Operation {
  const echo = { serverId: 'local', toolName: 'echo', argumentsJson: JSON.stringify({ value }) };
  return { successCriteria: `Independent value ${value}`, constraints: [preference], steps: [echo], verification: { ...echo, path: ['value'], expectedJson: String(value) } };
}
function fixture(path = ':memory:') {
  const draft = { operation: method(42, 'Preserve information') }; const inputs: ProcedureConsolidationInput[] = []; let badSource = false; let gate: Promise<void> | undefined; let release: (() => void) | undefined;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.thought = 'Prescribed procedural plumbing thought; not cognitive hypothesis evidence.';
      generated.cognition.proposal = { action: { kind: 'operate', text: 'Prescribed conditional fixture', operation: structuredClone(draft.operation) },
        argument: 'Prescribed reason with the current situational preference', identityFit: [], executionOrder: [] };
      return generated;
    }
    override async consolidateProcedures(input: ProcedureConsolidationInput): Promise<unknown> {
      inputs.push(structuredClone(input)); if (gate) await gate;
      const passed = input.episodes.filter(episode => episode.evidence === 'passed');
      return { candidates: [{ name: 'Prescribed conditional fixture policy', conditions: ['Current explicit preference and exact recorded input'], reason: 'Prescribed inferred conditions for plumbing only',
        escalate: ['Unknown input or incompatible current permission'], branches: passed.slice(0, 2).map((episode, index) => ({
          sourceContractId: badSource ? 'unrecorded-contract' : episode.contractId, when: [index === 0 ? 'Current preference is preservation' : 'Current preference is storage'], reason: 'Prescribed interpretation of the selected bid and outcome',
        })) }], reason: 'This is a prescribed infrastructure fixture, not model-generated conditional learning.' };
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid); assert.equal('world' in context, false);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(path); const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent();
  enableExecutive(app, agent.id);
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 5000 }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: ['echo', 'error'].map(toolName => ({ serverId: 'local', toolName })) }, 0);
  return { store, app, agent, draft, inputs, badSource: () => { badSource = true; }, hold: () => { gate = new Promise<void>(resolve => { release = resolve; }); }, release: () => release?.() };
}

test('automatic consolidation waits for repeated exact evidence, keeps candidates unapproved and consumes each trigger once', async () => {
  const { store, app, agent, draft, inputs } = fixture();
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1,
      consolidation: { mode: 'after_repeated_success', requiredSuccesses: 2 } }, profile.revision);
    const first = await app.message(agent.id, 'First prescribed exact method.', 'user', 'automatic');
    assert.equal(first.execution!.status, 'completed'); await app.waitForInference(agent.id);
    assert.equal(inputs.length, 0); assert.equal(app.procedureConsolidation.records(agent.id).length, 0);
    const second = await app.message(agent.id, 'Repeat the same prescribed exact method.', 'user', 'automatic');
    await app.waitForInference(agent.id);
    const run = app.procedureConsolidation.records(agent.id)[0]!;
    assert.equal(run.status, 'completed', run.error ?? ''); assert.equal(inputs.length, 1);
    assert.equal(run.trigger!.executionId, second.execution!.id); assert.equal(run.trigger!.mode, 'after_repeated_success');
    assert.equal(run.input.episodes.filter(episode => episode.evidence === 'passed').length, 2);
    assert.equal(store.executiveSkills(agent.id).every(skill => skill.status === 'proposed'), true);
    assert.throws(() => app.reportExecution(second.execution!), /already terminal/);
    assert.equal(await app.procedureConsolidation.automatically(agent.id, second.execution!.id), null);
    assert.equal(inputs.length, 1, 'Repeated status reports cannot repeat automatic inference');
    draft.operation = { ...method(44, 'Actual failure'), steps: [{ serverId: 'local', toolName: 'error', argumentsJson: '{}' }] };
    await app.message(agent.id, 'Prescribed failed method.', 'user', 'automatic'); await app.waitForInference(agent.id);
    assert.equal(inputs.length, 1, 'A failed execution cannot trigger candidate inference');
    const current = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...current, enabled: true, revision: current.revision + 1, learningMode: 'disabled',
      consolidation: { mode: 'after_verified_execution', requiredSuccesses: 2 } }, current.revision);
    draft.operation = method(42, 'Preserve information');
    await app.message(agent.id, 'Verified work with learning disabled.', 'user', 'automatic'); await app.waitForInference(agent.id);
    assert.equal(inputs.length, 1);
  } finally { await app.close(); store.close(); }
});

test('automatic single verified episode policy schedules external inference after the selecting cycle ends', async () => {
  const { store, app, agent, inputs } = fixture();
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1,
      consolidation: { mode: 'after_verified_execution', requiredSuccesses: 2 } }, profile.revision);
    const selected = await app.message(agent.id, 'Prescribed verified automatic candidate.', 'user', 'automatic');
    await app.waitForInference(agent.id);
    const run = app.procedureConsolidation.records(agent.id)[0]!;
    assert.equal(run.status, 'completed', run.error ?? ''); assert.equal(inputs.length, 1);
    assert.equal(store.cycle(selected.cycle.id).status, 'completed');
    assert.equal(run.trigger!.executionId, selected.execution!.id);
    assert.ok(run.skillIds.length); assert.equal(store.executiveSkills(agent.id).some(skill => skill.status === 'active'), false);
  } finally { await app.close(); store.close(); }
});

test('automatic inference policy changes preserve failed learning evidence without changing verified execution or retrying', async () => {
  const { store, app, agent, inputs, hold, release } = fixture();
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1,
      consolidation: { mode: 'after_verified_execution', requiredSuccesses: 2 } }, profile.revision);
    hold(); const selected = await app.message(agent.id, 'Prescribed verified task with held learning inference.', 'user', 'automatic');
    while (!app.procedureConsolidation.records(agent.id).some(record => record.status === 'running')) await new Promise(resolve => setTimeout(resolve, 5));
    const current = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...current, enabled: true, revision: current.revision + 1,
      consolidation: { mode: 'manual', requiredSuccesses: 2 } }, current.revision);
    release(); await app.waitForInference(agent.id);
    const run = app.procedureConsolidation.records(agent.id)[0]!;
    assert.equal(run.status, 'failed'); assert.match(run.error!, /policy changed/);
    assert.ok(run.output?.candidates.length); assert.ok(run.input.episodes.some(episode => episode.evidence === 'passed'));
    assert.equal(store.executiveSkills(agent.id).length, 0);
    assert.equal(store.executions(agent.id).find(execution => execution.id === selected.execution!.id)!.status, 'completed');
    const manual = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...manual, enabled: true, revision: manual.revision + 1,
      consolidation: { mode: 'after_verified_execution', requiredSuccesses: 2 } }, manual.revision);
    assert.equal(await app.procedureConsolidation.automatically(agent.id, selected.execution!.id), null);
    assert.equal(inputs.length, 1, 'Policy toggles cannot silently retry a consumed execution trigger');
  } finally { release(); await app.close(); store.close(); }
});

test('automatic pre-inference failures remain inspectable and consumed without inventing evidence or changing execution', async () => {
  const { store, app, agent, inputs } = fixture();
  const original = app.procedureConsolidation.automatically.bind(app.procedureConsolidation);
  try {
    const profile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1,
      consolidation: { mode: 'after_verified_execution', requiredSuccesses: 2 } }, profile.revision);
    app.procedureConsolidation.automatically = async () => { throw new Error('Prescribed automatic trigger assessment failure'); };
    const selected = await app.message(agent.id, 'Prescribed completed task with an assessment outage.', 'user', 'automatic');
    await app.waitForInference(agent.id);
    const report = app.procedureConsolidation.records(agent.id)[0]!;
    assert.equal(report.status, 'failed'); assert.equal(report.triggerFailure!.executionId, selected.execution!.id);
    assert.match(report.error!, /assessment failure/); assert.match(report.limitation, /Empty episodes do not establish absence/);
    assert.equal(report.output, null); assert.deepEqual(report.input.episodes, []); assert.equal(report.trigger, undefined);
    assert.equal(inputs.length, 0); assert.equal(store.executiveSkills(agent.id).length, 0);
    assert.equal(store.executions(agent.id).find(item => item.id === selected.execution!.id)!.status, 'completed');
    app.procedureConsolidation.automatically = original;
    assert.equal(await app.procedureConsolidation.automatically(agent.id, selected.execution!.id), null);
    const manual = await app.consolidateProcedures(agent.id);
    assert.equal(manual.status, 'completed'); assert.equal(inputs.length, 1);
    assert.deepEqual(app.procedureConsolidation.records(agent.id).find(item => item.id === report.id), report);
  } finally { app.procedureConsolidation.automatically = original; await app.close(); store.close(); }
});

test('offline conditional candidates derive from ended ordinary selected episodes without teaching, retain failure evidence, and enact an explicitly chosen current-preference branch', async () => {
  const { store, app, agent, draft, inputs } = fixture();
  try {
    store.save('disposition', { id: 'source-context', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Need for competence',
      concern: 'Notice requested verifiable work', cues: ['Preserve information'], scope: 'requested work', prerequisites: [], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
      { origin: 'researcher_edit', reason: 'Explicit plumbing starting condition', sourceIds: [] });
    const first = await app.message(agent.id, 'Preserve information in the prescribed example.', 'user', 'source');
    draft.operation = method(43, 'Minimize storage');
    await app.message(agent.id, 'The current preference is now storage.', 'user', 'source');
    draft.operation = { ...method(44, 'Avoid guessing'), steps: [{ serverId: 'local', toolName: 'error', argumentsJson: '{}' }] };
    await app.message(agent.id, 'An attempted method encounters an actual tool error.', 'user', 'source');
    assert.equal(store.executiveSkills(agent.id).length, 0, 'No teach directive or online durable formation');
    const before = structuredClone({ parts: store.list('part', agent.id), memories: store.list('memory', agent.id), identity: store.get('identity', agent.id), cycles: store.cycles(agent.id) });
    const report = await app.consolidateProcedures(agent.id);
    assert.equal(report.status, 'completed', report.error ?? undefined); assert.equal(report.skillIds.length, 1);
    assert.equal(inputs[0]!.episodes.length, 3); assert.ok(inputs[0]!.episodes.some(episode => episode.evidence === 'failed'));
    assert.ok(inputs[0]!.episodes.some(episode => episode.activations.some(activation => activation.cycleId && activation.phase && activation.dispositionId === 'source-context')));
    assert.equal('world' in inputs[0]!, false); assert.equal('identity' in inputs[0]!, false);
    assert.ok(inputs[0]!.episodes.every(episode => episode.expressedProducts.some(product => product.kind === 'part.bid_created' && product.selected)));
    assert.deepEqual({ parts: store.list('part', agent.id), memories: store.list('memory', agent.id), identity: store.get('identity', agent.id), cycles: store.cycles(agent.id) }, before);
    let family = store.executiveSkills(agent.id).find(skill => skill.id === report.skillIds[0])!;
    assert.equal(family.status, 'proposed'); assert.equal(family.conditional!.branches.length, 2);
    for (const branch of family.conditional!.branches) app.executiveSkills.decide(agent.id, branch.skillId, branch.version, 'approval', 'Explicit fixture approval');
    assert.throws(() => app.executiveSkills.decide(agent.id, family.id, family.version, 'approval', 'Do not silently rebind'), /current active permitted/);
    family = app.executiveSkills.refreshBranches(agent.id, family.id, family.version);
    family = app.executiveSkills.validate(agent.id, family.id, family.version, first.execution!.id, false);
    family = app.executiveSkills.decide(agent.id, family.id, family.version, 'approval', 'Explicit fixture family approval');
    const branch = family.conditional!.branches[1]!;
    draft.operation = { ...method(43, 'Minimize storage'), steps: [], verification: null, skillInvocation: { skillId: family.id, version: family.version, branchId: branch.id } };
    const selected = await app.message(agent.id, 'Select the storage branch under the current preference.', 'user', 'new-context');
    assert.equal(selected.execution!.status, 'completed');
    const contract = store.eventsByType(agent.id, ['execution.contract'], [selected.cycle.id])[0]!;
    assert.equal(contract.type, 'execution.contract');
    if (contract.type === 'execution.contract') {
      assert.equal(contract.payload.selectedSkill!.memberSkillId, branch.skillId); assert.equal(contract.payload.selectedSkill!.branchId, branch.id);
      assert.equal(contract.payload.selectedSkill!.packageDigest, (await app.agentSkillPackages.resolveMethod(agent.id, family.id, family.version)).digest);
      assert.equal(contract.payload.selectedSkill!.memberPackageDigest, (await app.agentSkillPackages.resolveMethod(agent.id, branch.skillId, branch.version)).digest);
    }
    const manifest = store.world(selected.cycle.worldId).externalSkills!.find(skill => skill.id === family.id)!;
    assert.equal(manifest.conditional!.length, 2); assert.equal(JSON.stringify(manifest).includes('argumentsJson'), false);
    assert.equal(manifest.conditional![1]!.constraints.includes('Preserve information'), false, 'Historical preference from a different branch does not become global');
    const inspection = inspectExecutiveSkill(store, agent.id, family.id);
    assert.equal(inspection.related.filter(item => item.relationship === 'conditional_branch').length, 2);
    const packageRoot = mkdtempSync(join(tmpdir(), 'conditional-package-'));
    try {
      const packages = new AgentSkillPackages(store, packageRoot); const pack = packages.build(agent.id, family.id);
      assert.throws(() => buildAgentSkillPackage(family, 'Missing dependency fixture'), /exact same-Agent/);
      assert.match(pack.files['SKILL.md']!, /assets\/branch-1.json/); assert.match(pack.files['SKILL.md']!, /assets\/branch-2.json/);
      assert.match(pack.files['references/DEVELOPMENT.md']!, /Prescribed procedural plumbing thought/);
      for (const [index, branch] of family.conditional!.branches.entries()) {
        const member = store.executiveSkillHistory(agent.id, branch.skillId).find(member => member.version === branch.version)!;
        assert.deepEqual(JSON.parse(pack.files[`assets/branch-${index + 1}.json`]!), member);
      }
      const saved = await packages.persist(agent.id, family.id);
      assert.equal(readFileSync(join(saved.directory, 'assets/branch-2.json'), 'utf8'), pack.files['assets/branch-2.json']);
      assert.deepEqual(await packages.persist(agent.id, family.id), saved);
      const loaded = await packages.load(agent.id, saved.digest);
      assert.deepEqual((await packages.resolveMethod(agent.id, family.id, family.version)).members, loaded.members);
      assert.deepEqual(loaded.files, pack.files);
      assert.deepEqual(loaded.members, family.conditional!.branches.map(branch =>
        store.executiveSkillHistory(agent.id, branch.skillId).find(member => member.version === branch.version)));
    } finally { rmSync(packageRoot, { recursive: true, force: true }); }
    for (const inspectedId of [family.id, branch.skillId]) {
      const use = inspectExecutiveSkill(store, agent.id, inspectedId).episodes.find(episode => episode.contractId === selected.execution!.contractId);
      assert.equal(use?.relationship, 'application');
      assert.equal(use?.outcomes[0]?.execution.operational?.verified, true);
      assert.equal(use?.applicationEvidence?.[0]?.result, 'passed');
    }
    const preview = previewPrompt(store, agent.id, 'executive_skill_consolidation', app.promptSettings(agent.id).find(prompt => prompt.task === 'executive_skill_consolidation')!.effective);
    assert.equal(preview.worldId, null); assert.match(preview.text, /Prescribed procedural plumbing thought/);
    delete draft.operation.skillInvocation!.branchId;
    const missing = await app.message(agent.id, 'Never default a branch.', 'user', 'new-context'); assert.equal(missing.execution!.status, 'blocked');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [missing.cycle.id]).length, 0);
    const rejected = inspectExecutiveSkill(store, agent.id, family.id).episodes.find(episode => episode.contractId === missing.execution!.contractId);
    assert.equal(rejected?.relationship, 'rejected_application');
    assert.ok(rejected?.methodRejection); assert.equal(rejected?.usedMethod, null);
    assert.equal(inspectExecutiveSkill(store, agent.id, family.id).applicationSummary.rejected, 1);
    assert.equal(inspectExecutiveSkill(store, agent.id, branch.skillId).episodes.some(episode => episode.contractId === missing.execution!.contractId), false);
    draft.operation.skillInvocation!.branchId = branch.id; draft.operation.constraints = [];
    assert.equal((await app.message(agent.id, 'Do not remove current branch constraints.', 'user', 'new-context')).execution!.status, 'blocked');
    store.saveMcpPermissions(agent.id, { revision: 2, tools: [] }, 1); draft.operation.constraints = ['Minimize storage'];
    assert.equal((await app.message(agent.id, 'Do not reuse revoked permissions.', 'user', 'new-context')).execution!.status, 'blocked');
  } finally { await app.close(); store.close(); }
});

test('foreign/generated source references reject the whole consolidation atomically; disabled learning makes no inference', async () => {
  const { store, app, agent, inputs, badSource } = fixture();
  try {
    await app.message(agent.id, 'Create one recorded source.', 'user', 'source'); badSource();
    const rejected = await app.consolidateProcedures(agent.id); assert.equal(rejected.status, 'failed'); assert.match(rejected.error!, /supplied independently passed/);
    assert.equal(store.executiveSkills(agent.id).length, 0);
    const profile = store.executiveProfile(agent.id); store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: profile.revision + 1, learningMode: 'disabled' }, profile.revision);
    assert.equal((await app.consolidateProcedures(agent.id)).status, 'skipped'); assert.equal(inputs.length, 1);
  } finally { await app.close(); store.close(); }
});

test('conditional proposals and inference evidence survive restart without a model call or worker replay', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-conditional-')); const path = join(directory, 'state.sqlite');
  const { store, app, agent } = fixture(path); let closed = false;
  try {
    await app.message(agent.id, 'Create a retained source.', 'user', 'source');
    const report = await app.consolidateProcedures(agent.id); const family = store.executiveSkills(agent.id).find(skill => skill.id === report.skillIds[0])!;
    await app.close(); store.close(); closed = true; const reopened = new SqliteStore(path); const next = new Application(reopened);
    try { assert.deepEqual(next.procedureConsolidation.records(agent.id)[0], report); assert.deepEqual(reopened.executiveSkills(agent.id).find(skill => skill.id === family.id), family);
      assert.equal(next.executiveWorkers.owns(agent.id, reopened.executions(agent.id)[0]!.id), false); } finally { await next.close(); reopened.close(); }
  } finally { if (!closed) { await app.close(); store.close(); } rmSync(directory, { recursive: true, force: true }); }
});


test('explicit closure preserves an incomplete inference after restart and discards a still-live late result without retention or replay', async () => {
  const { store, app, agent, hold, release } = fixture(); const other = new Application(store);
  try {
    await app.message(agent.id, 'Create an ended source.', 'user', 'source'); hold();
    const pending = app.consolidateProcedures(agent.id);
    while (!app.procedureConsolidation.records(agent.id).some(record => record.status === 'running')) await new Promise(resolve => setTimeout(resolve, 5));
    const record = other.procedureConsolidation.records(agent.id)[0]!;
    assert.equal(record.status, 'running');
    const closed = other.procedureConsolidation.abandon(agent.id, record.id, 'Explicit recovery comparison');
    release(); const discarded = await pending;
    assert.deepEqual(discarded, closed); assert.equal(store.executiveSkills(agent.id).length, 0);
    assert.deepEqual(other.procedureConsolidation.records(agent.id)[0]!.input, record.input);
    assert.throws(() => other.procedureConsolidation.abandon(agent.id, record.id, 'Already closed'), /incomplete/);
  } finally { release(); await other.close(); await app.close(); store.close(); }
});
