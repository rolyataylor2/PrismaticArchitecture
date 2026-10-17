import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { correctedProcedure } from '../../packages/core/src/corrected-procedure.js';
import type { ProcedureConsolidationInput } from '../../packages/core/src/procedure-consolidation.js';
import { inspectExecutiveSkill } from '../../packages/sdk/src/skill-inspection.js';
import type { Operation } from '../../packages/core/src/operation.js';
import { prepareSkillApproval } from '../../packages/core/src/skill-approval.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

async function until(check: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Remainder fixture did not settle'); await new Promise(resolve => setTimeout(resolve, 5)); }
}

for (const mode of ['correct', 'stale', 'permission_revoked', 'over_budget'] as const) test(`ordinary prescribed Part→Self remainder ${mode} preserves prefix authority with real MCP`, async () => {
  let corrected = false; const selves: SelfContext[] = [];
  let freshOperation: Operation | undefined;
  class Reasoning extends MockReasoning {
    override async consolidateProcedures(input: ProcedureConsolidationInput) {
      const episode = input.episodes.find(item => item.correctionChain);
      assert.ok(episode); assert.equal(episode.evidence, 'passed');
      assert.deepEqual(episode.method.steps.map(step => JSON.parse(step.argumentsJson).value), [1, 3]);
      assert.equal(new Set(episode.expressedProducts.map(product => product.cycleId)).size >= 2, true);
      return { candidates: [{ name: 'Prescribed full corrected procedure', conditions: ['Exact fixture inputs'], reason: 'Prescribed conditional consolidation plumbing',
        escalate: ['Uncovered condition'], branches: [{ sourceContractId: episode.contractId, when: ['Exact fixture inputs'], reason: 'Prescribed correction interpretation' }] }], reason: 'Fixture, not learned generalization' };
    }
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      if (freshOperation) {
        generated.cognition.proposal = { action: { kind: 'operate', text: 'Fresh prescribed whole procedure use', operation: structuredClone(freshOperation) },
          argument: 'Explicit fresh method choice fixture; not configured-model transfer', identityFit: [], executionOrder: [] };
        return generated;
      }
      const activity = input.world!.selectedActivity;
      const step = (value: number) => ({ serverId: 'local', toolName: 'echo', argumentsJson: JSON.stringify({ value }) });
      if (activity && corrected) { generated.cognition.proposal = null; return generated; }
      const checkpoint = input.world!.facts.find(fact => fact.text.startsWith('At this tool result,') && fact.referenceId)?.referenceId;
      if (activity) {
        assert.ok(checkpoint); corrected = true;
        if (mode === 'permission_revoked') store.saveMcpPermissions(input.agentId, { revision: 2, tools: [] }, 1);
      }
      generated.cognition.thought = activity ? 'Prescribed fixture correction after the completed prefix' : 'Prescribed fixture initial procedure';
      generated.cognition.proposal = { action: { kind: 'operate', text: activity?.goal ?? 'Prescribed fixture goal', operation: {
        successCriteria: activity?.successCriteria ?? 'The separately selected check returns 99', constraints: activity?.constraints ?? ['Preserve completed operations'],
        steps: activity ? mode === 'over_budget' ? [step(3), step(4)] : [step(3)] : [step(1), step(2)], verification: { ...step(99), path: ['value'], expectedJson: '99' },
        ...(activity ? { remainderCorrection: { executionId: activity.executionId, checkpointTraceId: mode === 'stale' ? 'unrelated-result' : checkpoint! } } : {}),
      } }, argument: 'Prescribed control fixture, not configured-model learning', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.task === 'disposition_activation'
      ? input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })) : super.judge(input); }
    override async choose(input: SelfContext) {
      selves.push(input); assert.equal('world' in input, false);
      const bid = input.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Fixture concern', concern: 'Notice operational fixture results', cues: ['fixture'],
      scope: 'fixture', longTermInterest: 0, shortTermInterest: 0, memoryIds: [], sourcePredictionId: null, temporary: false });
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 5000 }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
    const profile = defaultExecutiveProfile();
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: 1, executionMode: 'background', limits: { ...profile.limits, maxSteps: 3 },
      attention: { ...profile.attention, enabled: true, reviewInterested: true, awaitCheckpointReview: true } }, 0);
    const first = await app.message(agent.id, 'Run the prescribed fixture.', 'user', 'origin');
    const originalWorld = structuredClone(store.world(first.cycle.worldId));
    await until(() => store.executions(agent.id).length === 2 && store.executions(agent.id).every(item => item.status !== 'running' && item.status !== 'pending')); 
    await app.waitForInference(agent.id);
    const parent = store.executions(agent.id).find(item => item.id === first.execution!.id)!;
    const successor = store.executions(agent.id).find(item => item.id !== parent.id)!;
    if (mode !== 'correct') {
      assert.equal(successor.status, 'blocked'); assert.equal(successor.operational?.attempts, 0);
      assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 0);
      assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 0);
      const submissions = store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
      assert.deepEqual(submissions.map(event => event.type === 'execution.tool_trace' ? event.payload.arguments?.value : null), mode === 'permission_revoked' ? [1] : [1, 2, 99]);
      assert.equal(parent.status, mode === 'permission_revoked' ? 'blocked' : 'completed');
      assert.deepEqual(store.world(first.cycle.worldId), originalWorld);
      return;
    }
    assert.equal(parent.status, 'continued'); assert.equal(parent.operational?.attempts, 1); assert.equal(parent.operational?.verified, false);
    assert.equal(successor.status, 'completed'); assert.equal(successor.operational?.verified, true); assert.equal(successor.operational?.attempts, 2);
    assert.equal(parent.continuedByContractId, successor.contractId);
    const submissions = store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    assert.deepEqual(submissions.map(event => event.type === 'execution.tool_trace' ? event.payload.arguments?.value : null), [1, 3, 99]);
    const contracts = store.eventsByType(agent.id, ['execution.contract']); const selected = contracts.find(event => event.type === 'execution.contract' && event.payload.id === successor.contractId)!;
    assert.ok(selected.type === 'execution.contract'); assert.equal(selected.payload.limits.maxSteps, 2);
    const initial = contracts.find(event => event.type === 'execution.contract' && event.payload.id === parent.contractId)!; assert.ok(initial.type === 'execution.contract');
    assert.equal(selected.payload.remainder?.deadlineAt, Date.parse(initial.at) + initial.payload.limits.maxDurationMs);
    assert.equal(selected.payload.remainder?.completedSteps, 1); assert.equal(selected.payload.remainder?.parentContractId, parent.contractId);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 1); assert.equal(store.eventsByType(agent.id, ['execution.remainder_ready']).length, 1);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_handoff_failed']).length, 0);
    const learned = correctedProcedure(store, agent.id, successor.id);
    assert.equal(learned.evidence, 'passed');
    assert.equal(learned.rootContractId, parent.contractId);
    assert.deepEqual(learned.contractIds, [parent.contractId, successor.contractId]);
    assert.deepEqual(learned.method.steps.map(step => JSON.parse(step.argumentsJson).value), [1, 3]);
    assert.equal(learned.method.remainderCorrection, undefined);
    assert.equal(learned.traceRefs.length, 3);
    const thought = store.eventsByType(agent.id, ['part.thought'], [successor.cycleId]).find(event => event.type === 'part.thought')!;
    assert.ok(thought.type === 'part.thought');
    for (let index = 0; index < 120; index++) app.inspection.emit(agent.id, successor.cycleId, 'part.thought', thought.payload);
    const run = await app.consolidateProcedures(agent.id);
    assert.equal(run.status, 'completed', run.error ?? '');
    const episode = run.input.episodes.find(item => item.contractId === successor.contractId)!;
    assert.ok(episode.contextCoverage!.expressedProducts > episode.expressedProducts.length);
    assert.equal(episode.contextCoverage!.omittedSelectedProducts, 0);
    assert.equal(episode.expressedProducts.some(product => product.bidId === initial.payload.commands[0]!.bidId && product.selected), true);
    assert.equal(episode.expressedProducts.some(product => product.bidId === selected.payload.commands[0]!.bidId && product.selected), true);
    const family = store.executiveSkills(agent.id).find(skill => skill.id === run.skillIds[0])!;
    const member = store.executiveSkills(agent.id).find(skill => skill.id === family.conditional!.branches[0]!.skillId)!;
    assert.deepEqual(member.procedure, learned.method);
    assert.equal(member.limits.maxSteps, 3, 'Fresh use retains the root task budget');
    assert.deepEqual(member.source.correctionChain?.contractIds, [parent.contractId, successor.contractId]);
    assert.equal(member.validations[0]!.result, 'passed');
    assert.equal(member.validations[0]!.traceRefs.length, 3);
    assert.equal(member.status, 'proposed');
    const beforeReadiness = store.events(agent.id).length;
    const readyCandidate = prepareSkillApproval(store, agent.id, null, member.id, member.version);
    assert.deepEqual(readyCandidate, member); assert.equal(Object.isFrozen(readyCandidate), true);
    assert.equal(store.events(agent.id).length, beforeReadiness, 'Readiness is not a selected approval or mutation');
    assert.throws(() => prepareSkillApproval(store, agent.id, null, member.id, member.version + 1), /exact current/);
    assert.throws(() => prepareSkillApproval(store, agent.id, null, family.id, family.version), /approved permitted members/);
    const inspection = inspectExecutiveSkill(store, agent.id, member.id);
    assert.equal(inspection.episodes.some(episode => episode.contractId === parent.contractId && episode.relationship === 'ancestor'), true);
    assert.equal(inspection.episodes.some(episode => episode.contractId === successor.contractId && episode.thoughts.length > 0), true);
    const change = inspection.episodes.find(episode => episode.contractId === successor.contractId)!.correction!;
    assert.deepEqual(change.completedPrefix.map(step => JSON.parse(step.argumentsJson).value), [1]);
    assert.deepEqual(change.discardedFuture.map(step => JSON.parse(step.argumentsJson).value), [2]);
    assert.deepEqual(change.selectedFuture.map(step => JSON.parse(step.argumentsJson).value), [3]);
    assert.equal(change.verifiedReady, true);
    const pack = app.agentSkillPackages.build(agent.id, member.id, member.version);
    assert.match(pack.files['references/DEVELOPMENT.md']!, /Completed steps preserved/);
    assert.match(pack.files['references/DEVELOPMENT.md']!, /Previous future steps replaced/);
    assert.match(pack.files['references/DEVELOPMENT.md']!, /New selected future steps/);
    assert.ok(pack.files['references/DEVELOPMENT.md']!.includes(parent.contractId!));
    const { correctionChain: _chain, ...fragmentSource } = member.source;
    assert.throws(() => store.saveExecutiveSkill({ ...member, id: 'forged-fragment', version: 1, source: fragmentSource, validations: [],
      change: { ...member.change, kind: 'proposal' }, procedure: { ...member.procedure, steps: member.procedure.steps.slice(1) }, limits: selected.payload.limits }, 0), /remainder fragment/);
    app.executiveSkills.decide(agent.id, member.id, member.version, 'approval', 'Explicit fixture approval of the evidenced whole procedure');
    let approvedFamily = app.executiveSkills.refreshBranches(agent.id, family.id, family.version);
    approvedFamily = app.executiveSkills.validate(agent.id, family.id, approvedFamily.version, successor.id, false);
    approvedFamily = app.executiveSkills.decide(agent.id, family.id, approvedFamily.version, 'approval', 'Explicit fixture approval of conditional applicability');
    freshOperation = { ...member.procedure, steps: [], verification: null,
      skillInvocation: { skillId: approvedFamily.id, version: approvedFamily.version, branchId: approvedFamily.conditional!.branches[0]!.id } };
    const currentProfile = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...currentProfile, enabled: true, modules: { speaking: true, tools: true }, revision: currentProfile.revision + 1, executionMode: 'synchronous',
      attention: { ...currentProfile.attention, enabled: false } }, currentProfile.revision);
    const fresh = await app.message(agent.id, 'Use the approved exact whole procedure on a fresh task.', 'user', 'fresh-use');
    assert.equal(fresh.execution!.status, 'completed');
    const freshContract = store.eventsByType(agent.id, ['execution.contract'], [fresh.cycle.id])[0]!;
    assert.ok(freshContract.type === 'execution.contract');
    assert.equal(freshContract.payload.remainder, undefined);
    assert.equal(freshContract.payload.selectedSkill?.memberSkillId, member.id);
    const freshCalls = store.eventsByType(agent.id, ['execution.tool_trace'], [fresh.cycle.id]).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    assert.deepEqual(freshCalls.map(event => event.type === 'execution.tool_trace' ? event.payload.arguments?.value : null), [1, 3, 99]);
    assert.equal(store.eventsByType(agent.id, ['execution.remainder_claim']).length, 1, 'Fresh reuse cannot consume the historical boundary again');
    const grants = store.mcpPermissions(agent.id);
    store.saveMcpPermissions(agent.id, { revision: grants.revision + 1, tools: [] }, grants.revision);
    const denied = await app.message(agent.id, 'Attempt the same exact method under revoked current authority.', 'user', 'fresh-denied');
    assert.equal(denied.execution!.status, 'blocked');
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace'], [denied.cycle.id]).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 0);
    assert.equal(selves.some(input => input.ongoingActivity?.executionId === parent.id), true);
    assert.deepEqual(store.world(first.cycle.worldId), originalWorld);
  } finally { await app.close(); store.close(); }
});
