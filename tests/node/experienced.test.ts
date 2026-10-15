import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { PredictionEvidenceContext } from '../../packages/core/src/contracts.js';
import type { SelfContext } from '../../packages/core/src/domain.js';

test('anticipated alternatives activate later scopes; shared experienced state never becomes outcome evidence or raw Self input', async () => {
  const store = new SqliteStore(':memory:');
  const requests: ConstructedInput[] = []; const outcomes: PredictionEvidenceContext[] = []; const selves: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      product.cognition.affect = 'I feel cautiously hopeful; old experiences make rejection feel possible, but I want to listen.';
      if (!input.predictions?.length) product.cognition.prediction = {
        expectation: input.dispositions?.[0]?.id === 'weather' ? 'Rain may disrupt the gathering.' : 'Guests may enjoy the future BBQ.',
        confidence: 0.65, horizon: 'tomorrow', evaluateAfterCycle: null, kind: 'trajectory', conditions: ['If the gathering occurs'], conditionedAction: null,
        capsule: { interpretation: 'Past gatherings color my expectation.', details: ['This is anticipation, not a known event.'],
          entities: ['guests'], activation: 2, spike: 0, sourceIds: input.memories?.map(memory => memory.id).slice(0, 12) ?? [] },
      };
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      return input.candidates.map(candidate => ({ partId: candidate.id, score: input.task === 'memory_accessibility' || candidate.id === 'social'
        || input.world.experienced?.prospective.some(entry => entry.expectation.includes('BBQ')) ? 4 : 0 }));
    }
    override async checkPrediction(context: PredictionEvidenceContext): Promise<'incomplete'> { outcomes.push(context); return 'incomplete'; }
    override async choose(context: SelfContext) {
      selves.push(context);
      const bid = context.contributions[0]?.bid;
      return bid ? { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture selection for carryover verification', identityConflict: '' }
        : super.choose(context);
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    for (const id of ['social', 'weather']) store.save('disposition', { id, agentId: agent.id, version: 1, schemaVersion: 1,
      name: id, concern: 'Attend to gathering possibilities', cues: [id], scope: id, prerequisites: [], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Anticipation plumbing fixture', sourceIds: [] });
    await app.message(agent.id, 'We are discussing an invitation.', 'host', 'a');
    assert.deepEqual(requests.map(request => request.dispositions?.[0]?.id), ['social']);
    const firstPrediction = store.list('prediction', agent.id)[0]!;
    requests.length = 0;
    await app.message(agent.id, 'Please continue thinking.', 'host', 'a');
    assert.deepEqual(requests.map(request => request.dispositions?.[0]?.id).sort(), ['social', 'weather']);
    assert.equal(requests[0]!.world, requests[1]!.world);
    assert.ok(Object.isFrozen(requests[0]!.world!.experienced!.prospective));
    assert.equal(requests[0]!.world!.experienced!.prospective[0]!.predictionId, firstPrediction.id);
    assert.equal(requests[0]!.world!.experienced!.prospective[0]!.kind, 'trajectory');
    assert.ok(requests[0]!.world!.experienced!.posture[0]!.affect.includes('cautiously hopeful'));
    assert.ok(outcomes.length);
    for (const context of outcomes) {
      assert.equal(context.world.experienced, undefined);
      assert.equal(context.world.thoughtHistory, undefined);
      assert.deepEqual(context.recentThoughts, []);
      assert.ok(context.laterEvidence.every(fact => !fact.text.includes('future BBQ')));
    }
    assert.ok(selves.some(context => context.contributions.some(contribution => contribution.affect?.includes('cautiously hopeful'))));
    for (const context of selves) {
      assert.equal('world' in context, false);
      assert.equal('experienced' in context, false);
      assert.equal('prospective' in context, false);
      assert.equal('forecastReports' in context, false);
    }
    const transitions = store.eventsByType(agent.id, ['self.experienced_transition']);
    assert.equal(transitions.length, 2);
    const lastTransition = transitions.at(-1)!;
    assert.equal(lastTransition.type, 'self.experienced_transition');
    if (lastTransition.type === 'self.experienced_transition') assert.ok(lastTransition.payload.before.length);
    requests.length = 0;
    await app.message(agent.id, 'Another conversation.', 'host', 'b');
    assert.deepEqual(requests[0]!.world!.experienced, { prospective: [], rememberedInterpretations: [], posture: [], stanceHistory: [] });
    assert.deepEqual(requests.map(request => request.dispositions?.[0]?.id), ['social']);
    assert.equal(store.get('prediction', firstPrediction.id).status, 'open');
  } finally { store.close(); }
});

test('Self revisits a mediated stance after restart with current experiences retained and no external handoff', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const directory = mkdtempSync(join(tmpdir(), 'onto-stance-'));
  const path = join(directory, 'state.sqlite');
  let store = new SqliteStore(path);
  const requests: ConstructedInput[] = []; const selves: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      const sequence = input.world!.sequence;
      product.cognition.prediction = null;
      product.cognition.affect = sequence === 1 ? 'I am calm and interested.' : 'I am guarded and suspicious.';
      product.cognition.interpretation = sequence === 1 ? 'There is room to understand this person.' : 'I am attending to inconsistencies.';
      product.cognition.proposal = sequence === 3 ? { type: 'navigate', action: null,
        stateId: input.world!.experienced!.stanceHistory![0]!.id,
        argument: 'I have become narrow; revisit curiosity with the information learned since.', identityFit: ['curiosity'], executionOrder: [] }
        : { action: { kind: 'wait', text: 'Take a moment to consider.' }, argument: 'Consider another possibility.', identityFit: ['curiosity'], executionOrder: [],
          ...(sequence === 1 ? { resultingPosture: { interpretation: 'I remain uncertain and receptive.', affect: 'I feel open to learning, with caution still available.' } } : {}) };
      return product;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      selves.push(context);
      const bid = context.contributions[0]!.bid!;
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Deterministic navigation plumbing', identityConflict: '' };
    }
  }
  const providers = { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() };
  try {
    let app = new Application(store, providers); const agent = app.createAgent();
    await app.message(agent.id, 'An unfamiliar person explains what happened.', 'observer', 'a');
    await app.message(agent.id, 'A discrepancy appears, but no deception is established.', 'observer', 'a');
    const originalMemories = store.list('memory', agent.id).map(memory => ({ id: memory.id, content: memory.content }));
    const originalWorld = store.world(store.cycles(agent.id)[0]!.worldId);
    const executionsBefore = store.executions(agent.id).length;
    store.close(); store = new SqliteStore(path); app = new Application(store, providers);
    await app.message(agent.id, 'New information: the discrepancy was a transcription error.', 'observer', 'a');
    assert.equal(store.executions(agent.id).length, executionsBefore, 'Navigation never reaches the external executor');
    const transitions = store.eventsByType(agent.id, ['self.experienced_transition']).flatMap(event => event.type === 'self.experienced_transition' ? [event.payload] : []);
    const navigation = transitions.at(-1)!;
    assert.equal(navigation.revisitedStateId, transitions[0]!.id);
    assert.deepEqual(navigation.resulting, transitions[0]!.resulting);
    assert.ok(navigation.before[0]!.affect.includes('suspicious'));
    assert.ok(navigation.resulting[0]!.affect.includes('open to learning'));
    assert.ok(store.cycles(agent.id).at(-1)!.selectedBidId);
    for (const memory of originalMemories) assert.equal(store.get('memory', memory.id).content, memory.content);
    assert.deepEqual(store.world(originalWorld.id), originalWorld);
    await app.message(agent.id, 'Reconsider the explanation in light of that new information.', 'observer', 'a');
    const world = requests.at(-1)!.world!;
    assert.deepEqual(world.experienced!.posture, transitions[0]!.resulting);
    assert.ok(world.facts.some(fact => fact.text.includes('transcription error')));
    assert.equal(world.experienced!.stanceHistory!.length, 3);
    assert.ok(selves.every(context => !('world' in context) && !('memories' in context)));
    assert.ok(selves.at(-1)!.stanceHistory!.length);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('invented navigation states fail generation before psychology is committed', async () => {
  const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      const product = PartGenerationSchema.parse(result);
      product.cognition.proposal = { type: 'navigate', action: null, stateId: 'invented', argument: 'Return to a state never supplied.', identityFit: [], executionOrder: [] };
      return product;
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'Hello.', 'observer', 'a'), /available mediated stance/);
    assert.equal(store.list('part', agent.id).length, 0);
    assert.equal(store.list('memory', agent.id).length, 0);
    assert.equal(store.executions(agent.id).length, 0);
  } finally { store.close(); }
});

test('stance navigation stays exclusive and cannot hitchhike in an external bid set', async () => {
  const { scoreSelf } = await import('../../packages/core/src/self-scoring.js');
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    const context: SelfContext = { identity: store.get('identity', agent.id), deliberation: [],
      stanceHistory: [{ id: 'earlier', cycleId: 'cycle_before', posture: [] }],
      contributions: [
        { partId: 'curiosity', name: 'Curiosity', thought: 'I want a fresh look.', interpretation: 'A stance may obscure something.', evidenceSummary: [], prediction: null,
          bid: { id: 'nav', partId: 'curiosity', type: 'navigate', action: null, stateId: 'earlier', argument: 'Revisit openness.', identityFit: [], executionOrder: [] } },
        { partId: 'caution', name: 'Caution', thought: 'I want to wait.', interpretation: 'Uncertainty remains.', evidenceSummary: [], prediction: null,
          bid: { id: 'external', partId: 'caution', action: { kind: 'wait', text: 'Wait.' }, argument: 'Take time.', identityFit: [], executionOrder: [] } },
      ] };
    const navigation = await scoreSelf(context, async options => options.map(option => ({ partId: option, score: option === 'nav' ? 4 : option === 'external' ? 3 : 0 })));
    assert.deepEqual(navigation.selectedBidIds, ['nav']);
    const external = await scoreSelf(context, async options => options.map(option => ({ partId: option, score: option === 'external' ? 4 : option === 'nav' ? 3 : 0 })));
    assert.deepEqual(external.selectedBidIds, ['external']);
  } finally { store.close(); }
});

test('conflicting and action-conditioned imagined futures preserve their own branches and lived capsules', async () => {
  const store = new SqliteStore(':memory:'); const requests: ConstructedInput[] = [];
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) { return input.candidates.map(candidate => ({ partId: candidate.id, score: 4 })); }
    override async checkPrediction(): Promise<'incomplete'> { return 'incomplete'; }
  }
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      const name = input.dispositions![0]!.name;
      if (!input.predictions?.length) product.cognition.prediction = {
        expectation: name === 'confront' ? 'Paul will become defensive if I confront him.' : name === 'reassure' ? 'Paul will cooperate if I reassure him.' : 'Paul will leave before we can explain.',
        confidence: 0.95, horizon: 'during this conversation', evaluateAfterCycle: null,
        ...(name === 'legacy' ? {} : { kind: 'action_conditioned' as const,
          conditions: [name === 'confront' ? 'I confront him' : 'I reassure him'],
          conditionedAction: { kind: 'say' as const, text: name === 'confront' ? 'Explain the inconsistency.' : 'I want to understand you.' } }),
        capsule: { interpretation: 'My lived memories make this future feel inevitable.', details: ['A subjective past experience, not a verified external claim.'],
          entities: ['Paul'], activation: 2, spike: 0, sourceIds: [] },
      };
      return product;
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }); const agent = app.createAgent();
    for (const name of ['confront', 'reassure', 'legacy']) store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1,
      name, concern: 'Understand the conversation', cues: ['Paul'], scope: name, prerequisites: [], threshold: 2, memoryIds: [],
      sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Branch isolation fixture', sourceIds: [] });
    await app.message(agent.id, 'Paul offers an ambiguous explanation.', 'observer', 'a');
    const before = store.list('prediction', agent.id);
    requests.length = 0;
    await app.message(agent.id, 'No response to our question is known yet.', 'observer', 'a');
    const world = requests[0]!.world!;
    const futures = world.experienced!.prospective;
    const { renderTaskPrompt } = await import('../../packages/providers/src/prompts.js');
    assert.equal(futures.length, 3);
    assert.deepEqual(futures.map(entry => entry.kind).sort(), ['action_conditioned', 'action_conditioned', 'unclassified']);
    assert.equal(new Set(futures.filter(entry => entry.kind === 'action_conditioned').map(entry => entry.conditionedAction!.text)).size, 2);
    for (const entry of futures) {
      const prediction = before.find(prediction => prediction.id === entry.predictionId)!;
      assert.deepEqual(entry.capsule, prediction.capsule);
      assert.equal(entry.version, prediction.version);
      assert.equal(entry.confidence, 0.95, 'Runtime does not weaken subjective inevitability');
      assert.equal(entry.expectation, prediction.expectation);
      assert.equal(world.facts.some(fact => fact.text === prediction.expectation), false);
      for (const task of ['prediction_outcome', 'evaluation'] as const) {
        const rendered = renderTaskPrompt(agent.id, task, { prediction, world, part: store.get('part', prediction.partId!),
          memories: [], activation: { score: 2, delta: 0 }, laterEvidence: [], outcome: 'incorrect' });
        if (prediction.conditionedAction) assert.ok(rendered.includes(prediction.conditionedAction.text));
        if (prediction.conditions?.length) assert.ok(rendered.includes(prediction.conditions[0]!));
        else assert.ok(rendered.includes('Kind unspecified in this historical prediction'));
      }
    }
    assert.ok(requests.every(request => request.world === world));
  } finally { store.close(); }
});

test('deliberation recruitment uses immutable assessment snapshots and only prior-snapshot prediction-bound dispositions', async () => {
  const store = new SqliteStore(':memory:'); let testApp: Application | undefined; const requests: ConstructedInput[] = []; const judgments: JudgmentInput[] = []; const selves: SelfContext[] = [];
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const result = await super.constructed(input);
      if (input.task !== 'part_cognition') return result;
      requests.push(input);
      const product = PartGenerationSchema.parse(result);
      if (product.cognition.prediction) product.cognition.prediction.scaffolds = [{ name: 'Further interpretation', target: 'imagined new branch',
        cues: ['a further imagined perspective'], retrievalIntent: 'Recall alternatives', relevantMemoryIds: [],
        supportEvidence: ['A different interpretation fits'], contradictEvidence: ['The interpretation conflicts with later evidence'],
        trackedDistinction: 'Whether another interpretation helps', futureValue: 'Understand the uncertainty' }];
      return product;
    }
    override async question(context: SelfContext) {
      return { why_deliberate: 'Only one interpretation is represented.', primary_c: 'curiosity' as const, secondary_c: null,
        missing_information: 'A different interpretation', target_parts: [context.contributions[0]!.partId], question: 'What other interpretation might be missing?' };
    }
  }
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      judgments.push(input);
      return input.candidates.map(candidate => ({ partId: candidate.id, score: input.task === 'memory_accessibility' || candidate.id === 'initial'
        || Boolean((candidate.context as { inquiry?: string }).inquiry) ? 4 : 0 }));
    }
    override async choose(context: SelfContext) {
      selves.push(context);
      const missing = context.contributions.find(contribution => contribution.name === 'missing');
      return missing?.bid && (context.completedDeliberationRounds ?? 0) >= 2 ? { choice: missing.bid.id, selectedBidIds: [missing.bid.id], explanation: 'Select recruited fixture perspective', identityConflict: '' }
        : { choice: 'DELIBERATE', explanation: 'Ask for a missing perspective', identityConflict: '' };
    }
  }
  try {
    const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }); const agent = app.createAgent(); testApp = app;
    app.updateAgentActivationSettings(agent.id, { activationPassLimit: 8 });
    for (const [name, prerequisites] of [['initial', []], ['missing', []], ['child', ['missing']]] as const) store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1,
      name, concern: 'Understand the situation', cues: ['personal uncertainty'], scope: name, prerequisites: [...prerequisites], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Recruitment plumbing fixture', sourceIds: [] });
    await app.message(agent.id, 'I am uncertain about a personal question.', 'observer', 'a');
    await app.runtime.idle(agent.id);
    await app.close();
    const recruited = requests.filter(request => request.question === 'What other interpretation might be missing?');
    assert.ok(recruited.some(request => request.dispositions?.[0]?.id === 'missing'));
    assert.ok(recruited.some(request => request.dispositions?.[0]?.id === 'child'));
    for (const worldId of new Set(requests.map(request => request.world!.id))) {
      const batch = requests.filter(request => request.world!.id === worldId);
      assert.ok(batch.every(request => request.world === batch[0]!.world));
      assert.equal(new Set(batch.map(request => request.dispositions?.[0]?.id)).size, batch.length, 'A scope is not generated twice for the same immutable snapshot');
    }
    for (const judgment of judgments.filter(judgment => judgment.task === 'disposition_activation')) {
      for (const candidate of judgment.candidates) {
        const disposition = (candidate.context as { disposition: import('../../packages/core/src/domain.js').Disposition }).disposition;
        if (disposition.sourcePredictionId) assert.notEqual(store.get('prediction', disposition.sourcePredictionId).createdCycle, judgment.world.cycleId);
      }
    }
    const recruitmentScores = judgments.filter(judgment => judgment.task === 'disposition_activation'
      && judgment.candidates.some(candidate => Boolean((candidate.context as { inquiry?: string }).inquiry)));
    assert.ok(recruitmentScores.some(judgment => judgment.candidates.some(candidate => candidate.id === 'missing')));
    assert.ok(selves.every(context => (context.completedDeliberationRounds ?? 0) <= 2));
    assert.ok(selves.every(context => !('world' in context) && !('prospective' in context) && !('forecastReports' in context)));
    assert.ok(selves.some(context => context.contributionHistory?.some(contribution => contribution.name === 'missing')));
    assert.equal(store.cycles(agent.id)[0]!.status, 'completed');
  } finally { await testApp?.close(); store.close(); }
});

test('recruitment provider failure is infrastructure failure, never an invented alternative or action', async () => {
  const store = new SqliteStore(':memory:'); let testApp: Application | undefined;
  class Decisions extends MockDecisions {
    override async judge(input: JudgmentInput) {
      if (input.candidates.some(candidate => (candidate.context as { inquiry?: string }).inquiry)) throw new Error('Recruitment transport unavailable');
      return input.candidates.map(candidate => ({ partId: candidate.id, score: candidate.id === 'initial' ? 4 : 0 }));
    }
    override async choose() { return { choice: 'DELIBERATE', explanation: 'Seek another perspective.', identityConflict: '' }; }
  }
  try {
    const app = new Application(store, { reasoning: new MockReasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }); const agent = app.createAgent(); testApp = app;
    app.updateAgentActivationSettings(agent.id, { activationPassLimit: 8 });
    for (const name of ['initial', 'missing']) store.save('disposition', { id: name, agentId: agent.id, version: 1, schemaVersion: 1,
      name, concern: 'Interpret this situation', cues: ['uncertainty'], scope: name, prerequisites: [], threshold: 2,
      memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Transport failure fixture', sourceIds: [] });
    await app.message(agent.id, 'An ambiguous explanation.', 'observer', 'a');
    await app.runtime.idle(agent.id);
    assert.ok(store.cycles(agent.id).some(cycle => cycle.status === 'failed' && cycle.error?.includes('Recruitment transport unavailable')), 'A failed asynchronous recruitment remains an infrastructure failure on its actual source cycle');
    assert.ok(store.list('part', agent.id).some(part => part.name === 'initial'));
    assert.ok(store.list('part', agent.id).every(part => part.name !== 'missing'), 'Failed recruitment cannot invent the missing perspective; ordinary fallback cognition remains permitted');
    assert.equal(store.executions(agent.id).length, 0);
    assert.ok(store.eventsByType(agent.id, ['infrastructure.error']).length);
  } finally { await testApp?.close(); store.close(); }
});
