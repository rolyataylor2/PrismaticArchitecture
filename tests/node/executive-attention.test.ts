import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import { ExecutiveAttentionSettingsSchema, evaluateExecutiveAttention, type ExecutiveAttentionRecord } from '../../packages/core/src/executive-attention.js';
import { freeze, now, WorldStateSchema, type SelfContext } from '../../packages/core/src/domain.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';

test('advisory attention separates relevance, competence and coverage, preserves hysteresis and bounds cooldown', () => {
  const settings = ExecutiveAttentionSettingsSchema.parse({});
  const competence = { confidence: 0.9, coverage: 1, evidence: 'Explicit operational fixture estimate' };
  const at = '2026-10-08T00:00:00.000Z';
  const evaluate = (relevance: number, overrides: Partial<Parameters<typeof evaluateExecutiveAttention>[0]> = {}) =>
    evaluateExecutiveAttention({ settings, relevance, competence, at, evidenceKey: 'unchanged', ...overrides });
  assert.equal(evaluate(0).state, 'background');
  assert.equal(evaluate(4).state, 'interested');
  assert.equal(evaluate(0, { competence: { ...competence, confidence: 0.1 } }).state, 'interested');
  assert.equal(evaluate(0, { competence: { ...competence, coverage: 0.1 } }).state, 'interested');
  assert.equal(evaluate(0, { competence: { ...competence, confidence: null, coverage: null } }).competent, null);
  const previous: ExecutiveAttentionRecord = { executionId: 'execution', contractId: 'contract', checkpoint: 'environment',
    relevance: 4, competence, state: 'interested', competent: true, covered: true, reasons: [], changedEvidence: true,
    suppressed: false, evidenceKey: 'unchanged', at, profileRevision: 1 };
  assert.equal(evaluate(2.7, { previous, at: '2026-10-08T00:00:01.000Z' }).suppressed, true);
  assert.equal(evaluate(2.7, { previous, at: '2026-10-08T00:00:04.000Z' }).state, 'interested');
  assert.equal(evaluate(2.4, { previous, at: '2026-10-08T00:00:04.000Z' }).state, 'background');
  assert.equal(evaluate(4, { previous, evidenceKey: 'new evidence' }).suppressed, false);
  assert.equal(evaluate(0, { previous, competence: { ...competence, confidence: 0 } }).suppressed, false);
  assert.throws(() => ExecutiveAttentionSettingsSchema.parse({ relevanceThreshold: 0.1, hysteresis: 2 }));
  assert.throws(() => ExecutiveAttentionSettingsSchema.parse({ checkpoints: ['environment', 'environment'] }));
});

test('ordinary activation can assess without psychology writes and reuse only its identical issued snapshot', async () => {
  const store = new SqliteStore(':memory:'); let generations = 0; let scored = 0;
  class Reasoning extends MockReasoning { override async constructed(input: ConstructedInput) { generations++; return super.constructed(input); } }
  class Decisions extends MockDecisions { override async judge(input: JudgmentInput) {
    if (input.task === 'disposition_activation') { scored++; return input.candidates.map(candidate => ({ partId: candidate.id, score: 3 })); }
    return super.judge(input);
  } }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Fixture scope', concern: 'Notice the explicitly authored fixture situation',
      cues: ['fixture situation'], scope: 'fixture', threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false });
    const cycle = store.startCycle(agent.id, 'origin');
    const world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId: agent.id, cycleId: cycle.id, sequence: cycle.sequence,
      capturedAt: cycle.startedAt, facts: [{ source: 'Fixture', kind: 'observes', text: 'Fixture situation', referenceId: null }] }));
    store.saveWorld(world);
    const before = { identity: store.get('identity', agent.id), parts: store.list('part', agent.id), memories: store.list('memory', agent.id), predictions: store.list('prediction', agent.id) };
    const assessment = await app.runtime.constructed.assess(world, 'origin');
    assert.equal(scored, 1); assert.equal(generations, 0); assert.equal(assessment.scores[0]!.score, 3);
    assert.deepEqual({ identity: store.get('identity', agent.id), parts: store.list('part', agent.id), memories: store.list('memory', agent.id), predictions: store.list('prediction', agent.id) }, before);
    await assert.rejects(app.runtime.constructed.prepare(world, 'origin', undefined, structuredClone(assessment)), /identical snapshot/);
    await assert.rejects(app.runtime.constructed.prepare(freeze(structuredClone(world)), 'origin', undefined, assessment), /identical snapshot/);
    await assert.rejects(app.runtime.constructed.prepare(world, 'other', undefined, assessment), /identical snapshot/);
    const assembled = await app.runtime.constructed.prepare(world, 'origin', undefined, assessment);
    assert.equal(scored, 1, 'Issued assessment is reused without scoring the same snapshot again');
    assert.equal(generations, 1); assert.equal(assembled.parts.length, 1); assert.equal(assembled.world, world);
    store.saveCycle({ ...cycle, status: 'completed' });
  } finally { await app.close(); store.close(); }
});

test('real background results trigger nonblocking read-only checkpoints and external observations remain scoped', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-attention-')); const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path); let generated = 0; let selected = 0; let relevance = 4;
  let entered!: () => void; const monitoring = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  class Reasoning extends MockReasoning { override async constructed(input: ConstructedInput): Promise<unknown> {
    generated++; const output = await super.constructed(input); if (input.task !== 'part_cognition') return output;
    const parsed = PartGenerationSchema.parse(output); const tool = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
    parsed.cognition.proposal = { action: { kind: 'operate', text: 'Perform the selected echo fixture', operation: {
      successCriteria: 'Separate check matches 42', constraints: [], steps: [tool], verification: { ...tool, path: ['value'], expectedJson: '42' },
    } }, argument: 'Prescribed transport fixture; not a learning observation', identityFit: [], executionOrder: [] }; return parsed;
  } }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      if (input.task !== 'disposition_activation') return super.judge(input);
      if (store.cycle(input.world.cycleId).kind === 'attention_monitor') { entered(); await gate; }
      return input.candidates.map(candidate => ({ partId: candidate.id, score: relevance }));
    }
    override async choose(context: SelfContext) {
      selected++; assert.equal('world' in context, false); const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection', identityConflict: '' };
    }
  }
  let app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent(); const foreign = app.createAgent();
    await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { name: 'Transport fixture attention', concern: 'Notice the transport fixture',
      cues: ['echo fixture'], scope: 'echo', threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false });
    store.saveMcpRegistry({ revision: 1, servers: [{ id: 'local', transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url))], envSecretRefs: {}, timeoutMs: 2000 }] }, 0);
    store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'local', toolName: 'echo' }] }, 0);
    const profile = defaultExecutiveProfile();
    store.saveExecutiveProfile(agent.id, { ...profile, revision: 1, executionMode: 'background', learningMode: 'disabled', attention: { ...profile.attention, enabled: true } }, 0);
    const first = await app.message(agent.id, 'Run the fixture.', 'user', 'origin'); const executionId = first.execution!.id;
    const initial = structuredClone(store.world(first.cycle.worldId));
    const before = { generated, selected, parts: store.list('part', agent.id), memories: store.list('memory', agent.id), identity: store.get('identity', agent.id) };
    await monitoring;
    await app.executiveWorkers.wait(agent.id, executionId);
    assert.equal(store.executions(agent.id)[0]!.status, 'completed', 'Tool execution finishes while relevance inference is still blocked');
    release(); await app.waitForInference(agent.id);
    const events = store.eventsByType(agent.id, ['execution.attention']); assert.equal(events.length, 2);
    assert.ok(events.every(event => event.type === 'execution.attention' && event.payload.state === 'interested' && event.payload.competent === null));
    assert.deepEqual({ generated, selected, parts: store.list('part', agent.id), memories: store.list('memory', agent.id), identity: store.get('identity', agent.id) }, before);
    assert.deepEqual(store.world(first.cycle.worldId), initial);
    assert.equal(store.eventsByType(foreign.id, ['execution.attention']).length, 0);
    for (const event of events) {
      const cycle = store.cycle(event.cycleId!); assert.equal(cycle.threadId, 'origin'); assert.equal(cycle.kind, 'attention_monitor');
      assert.equal(store.events(agent.id).some(item => item.cycleId === cycle.id && item.type === 'self.arbitration_started'), false);
      const world = store.world(cycle.worldId);
      assert.deepEqual(world.thoughtHistory?.map(thought => [thought.age, thought.retention]), [[1, 0.9]]);
      const transition = store.eventsByType(agent.id, ['self.experienced_transition'])[0]!;
      assert.ok(transition.type === 'self.experienced_transition');
      assert.deepEqual(world.experienced?.posture, transition.payload.resulting);
      assert.equal(world.facts.some(fact => fact.text.includes('structuredContent') || fact.text.includes('argumentsJson')), false);
    }
    const report = { confidence: 1, coverage: 1, evidence: 'Authored competence control' };
    const facts = [{ source: 'Fixture observer', kind: 'observes', text: 'An external opportunity appears.', referenceId: null, timestamp: now() }];
    const route = `/api/agents/${agent.id}/executions/${executionId}/checkpoint`;
    const a = await api(app, 'POST', route, { facts, competence: report }) as NonNullable<Awaited<ReturnType<Application['observeExecution']>>>;
    const b = await api(app, 'POST', route, { facts, competence: report }) as typeof a;
    assert.equal(a.attention.state, 'interested'); assert.equal(b.attention.suppressed, true);
    relevance = 0;
    const gap = await api(app, 'POST', route, { facts, competence: { ...report, confidence: 0 } }) as typeof a;
    assert.equal(gap.attention.state, 'interested'); assert.equal(gap.attention.relevance, 0); assert.equal(gap.attention.competent, false);
    await assert.rejects(api(app, 'POST', `/api/agents/${foreign.id}/executions/${executionId}/checkpoint`, { facts }), /attributed operational/);
    const current = store.executiveProfile(agent.id);
    store.saveExecutiveProfile(agent.id, { ...current, revision: current.revision + 1, attention: { ...current.attention, enabled: false } }, current.revision);
    const count = store.cycles(agent.id).length; assert.equal(await api(app, 'POST', route, { facts }), null);
    assert.equal(store.cycles(agent.id).length, count);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
    const preserved = await api(app, 'GET', `/api/agents/${agent.id}/executive-attention`);
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/executive-attention`), preserved);
    assert.deepEqual(store.world(first.cycle.worldId), initial);
    assert.equal(store.cycles(agent.id).length, count);
    assert.equal(store.executiveProfile(agent.id).attention.enabled, false);
    assert.throws(() => app.executiveWorkers.cancel(agent.id, executionId), /No active local/);
    assert.equal(store.eventsByType(agent.id, ['execution.tool_trace']).filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted').length, 2);
  } finally { release(); await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
