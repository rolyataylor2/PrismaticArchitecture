import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { constructedOutputSchema } from '../../packages/providers/src/constructed-schema.js';

class ProposedFocusReasoning extends MockReasoning {
  invalidReference = false;
  override async constructed(input: ConstructedInput) {
    const result = await super.constructed(input);
    if (input.task !== 'part_cognition') return result;
    const product = PartGenerationSchema.parse(result);
    product.cognition.affect = 'I feel sadness and uncertainty.';
    product.cognition.affectProposals = [{ orientation: 'Curious acknowledgment of loss',
      motivation: 'Preserve the significance of a relationship', reason: 'There may be meaning worth acknowledging',
      expectedValue: 'Express care even without further learning',
      supportingPredictionIds: this.invalidReference ? ['unavailable-prediction'] : [] }];
    return product;
  }
}

test('ordinary Part cognition persists attributed affect offers separately from experienced affect', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-affect-proposals-'));
  const path = join(directory, 'agent.sqlite');
  const store = new SqliteStore(path);
  let agentId = '';
  try {
    const app = new Application(store, { reasoning: new ProposedFocusReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    agentId = app.createAgent().id;
    await app.message(agentId, 'A valued relationship has changed.', 'host', 'affect-proposals');
    const offers = store.eventsByType(agentId, ['part.affect_proposals']);
    assert.equal(offers.length, 1);
    const offer = offers[0]!;
    assert.equal(offer.type, 'part.affect_proposals');
    if (offer.type !== 'part.affect_proposals') throw new Error('Missing affect offers');
    const proposal = offer.payload.proposals[0]!;
    assert.equal(proposal.partId, offer.payload.partId);
    assert.match(proposal.id, /^affect_bid_/);
    assert.equal(proposal.orientation, 'Curious acknowledgment of loss');
    const thought = store.eventsByType(agentId, ['part.thought']).find(event => event.cycleId === offer.cycleId);
    assert.equal(thought?.type, 'part.thought');
    if (thought?.type !== 'part.thought') throw new Error('Missing ordinary cognition');
    assert.equal(thought.payload.output.affect, 'I feel sadness and uncertainty.');
    assert.equal(thought.payload.output.affectProposals![0]!.orientation, proposal.orientation);
    assert.equal(store.get('part', proposal.partId).emotionalCharge, 'I feel sadness and uncertainty.');
    const decisions = store.eventsByType(agentId, ['self.affect_decision']);
    assert.equal(decisions.length, 1);
    if (decisions[0]!.type !== 'self.affect_decision') throw new Error('Missing affect decision');
    assert.equal(decisions[0]!.payload.selection.mode, 'no_change');
    assert.equal(decisions[0]!.payload.resultingFocus, null);
  } finally { store.close(); }
  try {
    const reopened = new SqliteStore(path);
    try { assert.equal(reopened.eventsByType(agentId, ['part.affect_proposals']).length, 1); }
    finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('unavailable affect prediction references fail before any Part formation commits', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const reasoning = new ProposedFocusReasoning(); reasoning.invalidReference = true;
    const app = new Application(store, { reasoning, decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
    const agent = app.createAgent();
    await assert.rejects(app.message(agent.id, 'Consider an uncertain change.', 'host', 'invalid-affect'), /unavailable owning-Part prediction/);
    assert.equal(store.list('part', agent.id).length, 0);
    assert.equal(store.list('memory', agent.id).length, 0);
    assert.equal(store.eventsByType(agent.id, ['part.affect_proposals']).length, 0);
  } finally { store.close(); }
});

test('provider wire schema rejects invented support IDs when no owning prediction is supplied', async () => {
  const input: ConstructedInput = { task: 'part_cognition', agentId: 'agent', memories: [], workingParts: [], predictions: [],
    world: { id: 'world', agentId: 'agent', cycleId: 'cycle', sequence: 1, capturedAt: '2026-10-10T00:00:00Z',
      facts: [{ text: 'An uncertain change.', source: 'host', kind: 'observes', timestamp: '2026-10-10T00:00:00Z', referenceId: null }] } };
  const result = await new MockReasoning().constructed(input);
  const product = PartGenerationSchema.parse(result);
  product.cognition.affectProposals = [{ orientation: 'Cautious exploration', motivation: 'Protection', reason: 'Examine a possible downside',
    expectedValue: 'Understand an uncertainty', supportingPredictionIds: ['invented'] }];
  assert.equal(constructedOutputSchema(input).safeParse(product).success, false);
  product.cognition.affectProposals[0]!.supportingPredictionIds = [];
  assert.equal(constructedOutputSchema(input).safeParse(product).success, true);
});
