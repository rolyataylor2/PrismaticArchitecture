import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../../packages/sdk/src/application.js';
import { api, snapshot } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { dispositionInterest, interestDisposition, defaultInterestSettings, reinforceDispositionInterests } from '../../packages/core/src/disposition-interest.js';
import { Inspection } from '../../packages/core/src/inspection.js';
import { PartGenerationSchema, type ConstructedInput, type JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import type { AffectSelectionContext, AffectChoice } from '../../packages/core/src/affect-domain.js';
import type { SelfContext, Disposition } from '../../packages/core/src/domain.js';
import { dispositionActivationHistory } from '../../packages/sdk/src/disposition-activation-history.js';
import { dispositionStatistics } from '../../packages/sdk/src/disposition-statistics.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

const at = '2026-10-17T12:00:00.000Z';
const later = '2026-10-17T12:30:00.000Z';
const draft = { name: 'Botanical Curiosity', concern: 'Notice plants', cues: ['plant'], scope: 'plants',
  prerequisites: [], memoryIds: [], sourcePredictionId: null, temporary: false };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('interest thresholds are bounded and neutral legacy values ignore former thresholds', () => {
  assert.equal(dispositionInterest({}, at).threshold, 2);
  close(dispositionInterest({ longTermInterest: 0.7, shortTermInterest: 0.5 }, at).threshold, 1.51);
  assert.equal(dispositionInterest({ longTermInterest: 1, shortTermInterest: 1 }, at).threshold, 1.4);
  assert.equal(dispositionInterest({ longTermInterest: 0, shortTermInterest: -1 }, at).threshold, 2.35);
  for (const long of [0, 0.5, 1]) for (const short of [-1, 0, 1]) {
    const threshold = dispositionInterest({ longTermInterest: long, shortTermInterest: short }, at,
      { ...defaultInterestSettings, longTermWeight: 1, shortTermWeight: 1 }).threshold;
    assert.ok(threshold >= 1.4 && threshold <= 2.35);
  }
});

test('elapsed experience time decays both signs, respects distinct half-lives and never moves backwards', () => {
  const trace = { longTermInterest: 1, shortTermInterest: -1, interestUpdatedAt: at };
  close(dispositionInterest(trace, later).shortTermInterest, -0.5);
  assert.ok(dispositionInterest(trace, later).longTermInterest > 0.999);
  assert.deepEqual(dispositionInterest(trace, '2026-10-17T11:00:00.000Z'), dispositionInterest(trace, at));
  const half = interestDisposition({ ...draft, ...trace, id: 'd', agentId: 'a', threshold: 2, active: true, version: 1, schemaVersion: 1 }, later);
  close(dispositionInterest(half, '2026-10-17T13:00:00.000Z').shortTermInterest, -0.25);
});

// Scores/choices below are explicit plumbing fixtures, never evidence of cognitive benefit.
class Decisions extends MockDecisions {
  inputs: JudgmentInput[] = [];
  selfInputs: SelfContext[] = [];
  select = true;
  override async judge(input: JudgmentInput) {
    this.inputs.push(input);
    return input.task === 'disposition_activation'
      ? input.candidates.map(candidate => ({ partId: candidate.id, score: 2 })) : super.judge(input);
  }
  override async choose(context: SelfContext) {
    this.selfInputs.push(context);
    const bid = context.contributions.find(contribution => contribution.bid)?.bid;
    return { choice: this.select && bid ? bid.id : 'DELIBERATE', selectedBidIds: this.select && bid ? [bid.id] : [],
      explanation: 'Deterministic plumbing choice', identityConflict: 'Not evaluated' };
  }
}

test('ordinary selection reinforces once, while activation and repeated scoring do not; policy stays outside provider inputs', async () => {
  const store = new SqliteStore(':memory:'); const decisions = new Decisions();
  const app = new Application(store, { decisions, reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    store.save('disposition', { ...draft, id: 'plants', agentId: agent.id, threshold: 0, version: 1, schemaVersion: 1, active: true }, 0,
      { origin: 'seed', reason: 'Legacy threshold fixture', sourceIds: [] });
    await app.message(agent.id, 'A plant is visible.', 'observer', 'interest');
    const selected = store.get('disposition', 'plants');
    close(selected.longTermInterest!, defaultInterestSettings.longTermSelectionGain);
    close(selected.shortTermInterest!, defaultInterestSettings.shortTermSelectionGain);
    assert.equal(store.versions('disposition', 'plants').length, 2);
    const event = store.eventsByType(agent.id, ['disposition.interest_updated'])[0]!;
    assert.equal(event.type, 'disposition.interest_updated');
    if (event.type !== 'disposition.interest_updated') return;
    const part = store.list('part', agent.id).find(part => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === 'plants'))!;
    const world = store.world(store.cycles(agent.id)[0]!.worldId);
    reinforceDispositionInterests(store, new Inspection(store), world, event.payload.selectionIds.map(id => ({ id, partId: part.id })));
    assert.equal(store.get('disposition', 'plants').version, 2, 'Replayed proposal cannot reinforce twice');
    await app.runtime.constructed.assess(world, 'interest');
    await app.runtime.constructed.assess(world, 'interest');
    assert.equal(store.get('disposition', 'plants').version, 2, 'Scoring does not write interest');
    assert.equal(decisions.inputs.filter(input => input.task === 'disposition_activation').length, 3, 'One ordinary scoring request per assessment without associations');
    for (const input of [...decisions.inputs, ...decisions.selfInputs]) {
      const text = JSON.stringify(input);
      assert.doesNotMatch(text, /longTermInterest|shortTermInterest|interestUpdatedAt|dispositionInterests/);
      if ('task' in input && input.task === 'disposition_activation') assert.doesNotMatch(text, /threshold/i);
    }
    const history = dispositionActivationHistory(store, 'plants');
    assert.equal(history[0]!.threshold, 2, 'Legacy manual threshold is ignored');
    assert.ok(history.at(-1)!.threshold < 2);
    assert.equal(dispositionStatistics(store, 'plants').activatedCycles, 1);
    assert.equal(store.versions('disposition', 'plants')[0]!.state.threshold, 0, 'Legacy history remains intact');
  } finally { await app.runtime.close(); store.close(); }
});

test('researcher interests and per-Agent settings persist, derive thresholds, and reject direct threshold edits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-interest-')); let store = new SqliteStore(join(directory, 'test.sqlite'));
  try {
    let app = new Application(store); const agent = app.createAgent(); const other = app.createAgent();
    const input = { ...draft, longTermInterest: 0.7, shortTermInterest: 0.5 };
    const disposition = await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, input) as Disposition;
    close(disposition.threshold, 1.51);
    await assert.rejects(api(app, 'PATCH', `/api/dispositions/${disposition.id}`, { expectedVersion: 1, patch: { threshold: 1 } }));
    await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/dispositions`, { ...input, threshold: 1 }));
    for (const patch of [{ longTermInterest: -0.1 }, { longTermInterest: 1.1 }, { shortTermInterest: -1.1 }, { shortTermInterest: 1.1 }])
      await assert.rejects(api(app, 'PATCH', `/api/dispositions/${disposition.id}`, { expectedVersion: 1, patch }));
    await api(app, 'PATCH', `/api/dispositions/${disposition.id}`, { expectedVersion: 1, patch: { shortTermInterest: -1 } });
    close(snapshot(app, agent.id).dispositions[0]!.threshold, 2.035);
    await api(app, 'PATCH', `/api/agents/${agent.id}/activation-settings`, { dispositionInterests: { shortTermSelectionGain: 0.1 } });
    await api(app, 'PATCH', `/api/agents/${agent.id}/activation-settings`, { dispositionInterests: { longTermWeight: 0.2 } });
    const settings = app.agentActivationSettings(agent.id).dispositionInterests!;
    assert.equal(settings.longTermWeight, 0.2);
    assert.equal(settings.shortTermSelectionGain, 0.1, 'Partial interest settings preserve other saved values');
    assert.deepEqual(app.agentActivationSettings(other.id).dispositionInterests, defaultInterestSettings);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/activation-settings`, { dispositionInterests: { shortTermHalfLifeMinutes: 0 } }));
    store.close(); store = new SqliteStore(join(directory, 'test.sqlite')); app = new Application(store);
    assert.deepEqual(app.agentActivationSettings(agent.id).dispositionInterests, settings);
    assert.equal(store.get('disposition', disposition.id).shortTermInterest, -1);
    close(snapshot(app, agent.id).dispositions[0]!.threshold, 2.21);
    assert.equal(store.versions('disposition', disposition.id).length, 2);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('passive activation without Self investment leaves interests neutral', async () => {
  const store = new SqliteStore(':memory:'); const decisions = new Decisions(); decisions.select = false;
  const app = new Application(store, { decisions, reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    const disposition = await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, draft) as Disposition;
    await app.message(agent.id, 'A plant is visible.', 'observer', 'passive');
    assert.equal(store.get('disposition', disposition.id).longTermInterest, 0);
    assert.equal(store.get('disposition', disposition.id).shortTermInterest, 0);
    assert.equal(store.eventsByType(agent.id, ['disposition.interest_updated']).length, 0);
    assert.equal(dispositionStatistics(store, disposition.id).activatedCycles, 1);
  } finally { await app.runtime.close(); store.close(); }
});

test('selected affect and behavior reinforce their shared disposition only once in a decision', async () => {
  class AffectDecisions extends Decisions {
    override async chooseAffect(input: AffectSelectionContext): Promise<AffectChoice> {
      return { mode: 'select', selectedProposalIds: [input.proposals[0]!.id], reason: 'Deterministic affect plumbing' };
    }
  }
  class AffectReasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const product = PartGenerationSchema.parse(output);
      return { ...product, cognition: { ...product.cognition, affectProposals: [{ orientation: 'Curiosity', motivation: 'Understand plants',
        reason: 'Explicit test proposal', expectedValue: 'Inspect details', supportingPredictionIds: [] }] } };
    }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, {
    decisions: new AffectDecisions(), reasoning: new AffectReasoning(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent();
    const disposition = await api(app, 'POST', `/api/agents/${agent.id}/dispositions`, draft) as Disposition;
    await app.message(agent.id, 'A plant is visible.', 'observer', 'affect');
    const events = store.eventsByType(agent.id, ['disposition.interest_updated']);
    assert.equal(events.length, 1);
    assert.ok(events[0]!.type === 'disposition.interest_updated' && events[0]!.payload.selectionIds.length === 2);
    close(store.get('disposition', disposition.id).longTermInterest!, defaultInterestSettings.longTermSelectionGain);
  } finally { await app.runtime.close(); store.close(); }
});

test('matched sourced interest hypotheses are registered with neutral-control settings', () => {
  const entries = simulationTests.filter(test => test.id.startsWith('interest-'));
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0]!.steps, entries[1]!.steps);
  assert.equal(entries[1]!.activationSettings?.dispositionInterests?.longTermSelectionGain, 0);
  assert.ok(entries.every(entry => entry.source.includes('6ad3c178') && entry.criteria.length >= 3 && entry.limitations.includes('Mock')));
});


test('paired interest protocols run ordinary isolated cognition and preserve the source Agent', { timeout: 30000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Interest protocol source');
  try {
    const before = snapshot(app, source.id);
    for (const definition of simulationTests.filter(test => test.id.startsWith('interest-'))) {
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      let run = listSimulationRuns(app).find(run => run.id === started.id)!;
      while (run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(run => run.id === started.id)!; }
      assert.equal(run.status, 'completed', run.error ?? '');
      assert.equal(run.evidenceBasis, 'fixture');
      assert.equal(run.stages.length, definition.steps.length);
      assert.notEqual(run.agentId, source.id);
      assert.ok(store.eventsByType(run.agentId, ['construction.judgment']).length > 0);
    }
    assert.deepEqual(snapshot(app, source.id), before);
  } finally { await app.close(); store.close(); }
});
