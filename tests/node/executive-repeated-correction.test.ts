import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { correctedProcedure } from '../../packages/core/src/corrected-procedure.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

test('two ordinary selected corrections retain every settled prefix and one original budget with real MCP', async () => {
  // Prescribed psychology validates operational lineage only, never learned applicability.
  let corrections = 0;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output); const activity = input.world!.selectedActivity;
      if (activity && corrections === 2) { generated.cognition.proposal = null; return generated; }
      const step = (value: number) => ({ serverId: 'local', toolName: 'echo', argumentsJson: JSON.stringify({ value }) });
      const checkpoint = input.world!.facts.findLast(fact => fact.text.startsWith('At this tool result,') && fact.referenceId)?.referenceId;
      const values = !activity ? [1, 2] : corrections === 0 ? [3, 4] : [5];
      if (activity) { assert.ok(checkpoint); corrections++; }
      generated.cognition.proposal = { action: { kind: 'operate', text: activity?.goal ?? 'Repeated correction fixture', operation: {
        successCriteria: activity?.successCriteria ?? 'Independent check equals 99', constraints: activity?.constraints ?? ['Preserve completed work'],
        steps: values.map(step), verification: { ...step(99), path: ['value'], expectedJson: '99' },
        ...(activity ? { remainderCorrection: { executionId: activity.executionId, checkpointTraceId: checkpoint! } } : {}),
      } }, argument: 'Prescribed repeated correction, not model learning', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.task === 'disposition_activation'
      ? input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })) : super.judge(input); }
    override async choose(input: SelfContext) {
      assert.equal('world' in input, false); const bid = input.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Fixture concern', concern: 'Notice repeated fixture results', cues: ['fixture'],
      scope: 'fixture', threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false });
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 5000 }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
    const profile = defaultExecutiveProfile();
    store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, revision: 1, executionMode: 'background', limits: { ...profile.limits, maxSteps: 4 },
      attention: { ...profile.attention, enabled: true, reviewInterested: true, awaitCheckpointReview: true } }, 0);
    const initial = await app.message(agent.id, 'Run the repeated correction fixture.', 'user', 'repeated');
    const deadline = Date.now() + 15000;
    while (!(store.executions(agent.id).length === 3 && store.executions(agent.id).every(item => item.status !== 'running' && item.status !== 'pending'))) {
      if (Date.now() >= deadline) throw new Error('Repeated correction fixture did not settle');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await app.waitForInference(agent.id);
    const executions = store.executions(agent.id); const terminal = executions.find(item => item.status === 'completed')!;
    assert.ok(terminal); assert.equal(executions.filter(item => item.status === 'continued').length, 2,
      JSON.stringify(executions.map(item => ({ status: item.status, reason: item.operational?.reason }))));
    const chain = correctedProcedure(store, agent.id, terminal.id);
    assert.equal(chain.evidence, 'passed'); assert.equal(chain.executionIds[0], initial.execution!.id);
    assert.equal(chain.contractIds.length, 3); assert.equal(chain.traceRefs.length, 4);
    assert.deepEqual(chain.method.steps.map(step => JSON.parse(step.argumentsJson).value), [1, 3, 5]);
    const events = store.eventsByType(agent.id, ['execution.contract', 'execution.tool_trace', 'execution.remainder_claim', 'execution.remainder_ready']);
    const contracts = chain.contractIds.map(id => events.find(event => event.type === 'execution.contract' && event.payload.id === id)!);
    const root = contracts[0]!; assert.ok(root.type === 'execution.contract');
    for (const [index, event] of contracts.entries()) {
      assert.ok(event.type === 'execution.contract'); assert.equal(event.payload.limits.maxSteps, 4 - index);
      if (index) assert.equal(event.payload.remainder!.deadlineAt, Date.parse(root.at) + root.payload.limits.maxDurationMs);
    }
    const submitted = events.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
    assert.deepEqual(submitted.map(event => event.type === 'execution.tool_trace' ? event.payload.arguments?.value : null), [1, 3, 5, 99]);
    assert.equal(events.filter(event => event.type === 'execution.remainder_claim').length, 2);
    assert.equal(events.filter(event => event.type === 'execution.remainder_ready').length, 2);
  } finally { await app.close(); store.close(); }
});
