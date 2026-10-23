import test from 'node:test';
import assert from 'node:assert/strict';
import { demoIdentity, demoParts } from '../../packages/sdk/src/seed.js';
import { affectSelectionContext, decideAffect } from '../../packages/core/src/affect.js';
import { affectChoices, scoreAffect } from '../../packages/core/src/affect-scoring.js';
import { selfContext } from '../../packages/core/src/context.js';
import { JevDecisions } from '../../packages/providers/src/jev.js';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { XaiProvider } from '../../packages/providers/src/xai.js';
import { OllamaProvider } from '../../packages/providers/src/ollama.js';
import { MockReasoning } from '../../packages/providers/src/mock.js';
import { AgentReasoningProvider } from '../../packages/providers/src/agent-reasoning.js';
import { affectInquirySchema, focusedBidSchema } from '../../packages/providers/src/affect-schema.js';
import { promptCatalog, renderTaskPrompt } from '../../packages/providers/src/prompts.js';
import { promptInspection } from '../../packages/providers/src/prompt-inspection.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import type { FocusedBidContext } from '../../packages/core/src/contracts.js';

const identity = { ...demoIdentity, id: 'identity', agentId: 'agent', version: 1, schemaVersion: 2 as const };
const proposals = ['Acknowledging grief', 'Exploring a boundary'].map((orientation, index) => ({
  id: `affect-${index}`, partId: `part-${index}`, name: `Perspective ${index}`, orientation,
  motivation: 'Care for something meaningful', reason: 'Examine a neglected concern',
  expectedValue: 'Meaningful action without a demand for more learning', supportingPredictionIds: [],
}));
const context = affectSelectionContext({ identity, proposals,
  contributions: proposals.map(proposal => ({ partId: proposal.partId, name: proposal.name,
    thought: 'raw-expressed-thought', interpretation: 'original appraisal', affect: 'naturally occurring affect',
    evidenceSummary: [], prediction: null, bid: null })) });

test('affect scoring considers every proposal independently then requires complementary value for a second lens', async () => {
  const calls: { options: string[]; selected: string[] }[] = [];
  const choice = await scoreAffect(context, async (options, selected) => {
    calls.push({ options, selected });
    return options.map(partId => ({ partId, score: partId === 'affect-0' ? 4 : partId === 'affect-1' ? selected.length ? 2 : 3 : 0 }));
  });
  assert.deepEqual(calls[0]!.options, affectChoices(context));
  assert.deepEqual(calls[0]!.selected, []);
  assert.deepEqual(calls[1]!, { options: ['affect-1'], selected: ['affect-0'] });
  assert.deepEqual(choice.selectedProposalIds, ['affect-0']);
  assert.equal(choice.scores!.length, affectChoices(context).length + 1);
  const complementary = await scoreAffect(context, async (options, selected) => options.map(partId => ({ partId,
    score: partId === 'affect-0' && !selected.length ? 4 : partId === 'affect-1' ? 3 : 0 })));
  assert.deepEqual(complementary.selectedProposalIds, ['affect-0', 'affect-1']);
  const unchanged = await scoreAffect(context, async options => options.map(partId => ({ partId, score: 2 })));
  assert.equal(unchanged.mode, 'no_change');
  assert.deepEqual(unchanged.selectedProposalIds, []);
  const inquiry = await scoreAffect(context, async options => options.map(partId => ({ partId, score: partId === 'DELIBERATE_AFFECT' ? 4 : 0 })));
  assert.equal(inquiry.mode, 'deliberate');
});

test('malformed bounded results and reserved IDs are failures, never affect choices', async () => {
  for (const values of [[], [{ partId: 'foreign', score: 4 }], affectChoices(context).map(() => ({ partId: 'affect-0', score: 4 })),
    affectChoices(context).map(partId => ({ partId, score: 5 }))]) await assert.rejects(scoreAffect(context, async () => values));
  await assert.rejects(scoreAffect({ ...context, proposals: [{ ...proposals[0]!, id: 'MAINTAIN_AFFECT' }] }, async () => []), /reserved/);
});

test('Ollama affect scoring honors editable prompts and never shares a behavioral inference session', async () => {
  const requests: Record<string, any>[] = [];
  const provider = new OllamaProvider('fixture-model', undefined, async (_url, init) => {
    const body = JSON.parse(init!.body as string); requests.push(body);
    return Response.json({ message: { content: JSON.stringify(affectChoices(context).map(partId => ({ partId,
      score: partId === 'NO_AFFECT_CHANGE' ? 4 : 0 }))) } });
  }, (_agentId, task) => task === 'affect_selection' ? 'Edited affect rubric for {{ identity.agentId }}.' : undefined);
  const choice = await provider.chooseAffect(context);
  assert.equal(choice.mode, 'no_change'); assert.equal(requests.length, 1);
  assert.match(requests[0]!.messages[1].content, /^Edited affect rubric for agent\./);
  assert.equal(requests[0]!.messages.length, 2);
  assert.equal(requests[0]!.stream, false);
  assert.equal(requests[0]!.format.type, 'array');
});

test('Jev first-pass requests reproject wider inputs and expose no WorldState or experienced affect', async () => {
  const states: string[] = [];
  const provider = new JevDecisions({ choice: async () => { throw new Error('No behavioral Choice call'); },
    scores: async request => {
      states.push(request.state);
      return request.questions.map(question => ({ partId: question.id, score: question.id === 'affect-0' ? 4 : 0 }));
    } });
  const result = await provider.chooseAffect({ ...context, world: 'raw-world-sentinel', activation: 'raw-activation-sentinel' } as typeof context);
  assert.equal(result.mode, 'select');
  assert.equal(states.length, 2);
  assert.match(states[0]!, /Acknowledging grief/);
  for (const state of states) for (const secret of ['raw-world-sentinel', 'raw-activation-sentinel', 'raw-expressed-thought', 'naturally occurring affect'])
    assert.equal(state.includes(secret), false);
});

const focus = decideAffect({ context, cycleId: 'cycle', threadId: null, sequence: 1, periodId: 'period',
  selection: { mode: 'select', selectedProposalIds: ['affect-0'], reason: 'Acknowledge what matters', explorationRequest: null } }).resultingFocus!;
const focused: FocusedBidContext = { world: { id: 'world', agentId: 'agent', cycleId: 'cycle', sequence: 1,
  capturedAt: '2026-10-10T00:00:00Z', facts: [] },
  part: { ...demoParts[0]!, id: 'part-0', agentId: 'agent', version: 1, schemaVersion: 1 }, memories: [], prediction: null,
  activation: { partId: 'part-0', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true },
  currentBid: null, selectedFocus: focus, expressed: { thought: 'I might express care', interpretation: 'There may be a loss', affect: 'Uncertainty', evidenceSummary: [] },
  availableContributors: context.availableContributors };

test('bid Self receives the chosen orientation separately and may reject its favored action', () => {
  const input = selfContext(identity, [], [], { selectedFocus: focus });
  assert.deepEqual(input.selectedFocus, focus);
  const prompt = renderTaskPrompt('agent', 'arbitration', { ...input, choices: ['DELIBERATE'] });
  assert.match(prompt, /You may reject its favored action/);
  assert.match(prompt, /Acknowledging grief/);
  assert.equal('world' in input, false);
  assert.equal('activation' in input, false);
  assert.throws(() => selfContext(identity, [], [], { selectedFocus: { ...focus, agentId: 'foreign' } }), /ownership/);
});

test('failed affect decisions and inquiry requests remain infrastructure errors', async () => {
  const decisions = new JevDecisions({ choice: async () => { throw new Error('unused'); },
    scores: async () => { throw new Error('transport unavailable'); } });
  await assert.rejects(decisions.chooseAffect(context), /transport unavailable/);
  const provider = new OllamaProvider('fixture-model', undefined, async () => Response.json({}, { status: 503 }));
  await assert.rejects(provider.chooseAffect(context), /Ollama request failed/);
  await assert.rejects(provider.affectInquiry(context), /Ollama request failed/);
});

test('OpenAI, xAI and Ollama separately dispatch restricted inquiry and owning-Part focused revision', async () => {
  const fixture = new MockReasoning(); const inquiry = await fixture.affectInquiry(context);
  const revision = { response: 'I can express care without agreeing with this focus.', bid_disposition: 'retain', new_bid: null };
  for (const vendor of ['openai', 'xai', 'ollama']) {
    const requests: Record<string, any>[] = [];
    const transport: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string); requests.push(body);
      const output = requests.length === 1 ? inquiry : revision;
      return vendor === 'ollama' ? Response.json({ message: { content: JSON.stringify(output) } })
        : Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: output }) }] }] });
    };
    const provider = vendor === 'ollama' ? new OllamaProvider('fixture-model', undefined, transport)
      : vendor === 'xai' ? new XaiProvider('fixture-key', undefined, transport) : new OpenAIProvider('fixture-key', undefined, transport);
    assert.deepEqual(await provider.affectInquiry({ ...context, world: 'raw-world-sentinel' } as typeof context), inquiry);
    assert.deepEqual(await provider.reviseFocusedBid(focused), revision);
    assert.equal(requests.length, 2);
    const prompt = (body: Record<string, any>) => vendor === 'ollama' ? body.messages[1].content : body.input;
    assert.match(prompt(requests[0]!), /Task: affect_inquiry/);
    assert.doesNotMatch(prompt(requests[0]!), /raw-world-sentinel|naturally occurring affect/);
    assert.match(prompt(requests[1]!), /Task: focused_bid_revision/);
    assert.match(prompt(requests[1]!), /"id":"world"/);
    const schema = vendor === 'ollama' ? requests[1]!.format : requests[1]!.text.format.schema.properties.result;
    assert.equal(schema.anyOf.length, 3);
    for (const branch of schema.anyOf) {
      assert.deepEqual(Object.keys(branch.properties).sort(), ['bid_disposition', 'new_bid', 'response']);
      if (branch.properties.bid_disposition.const !== 'replace') assert.equal(branch.properties.new_bid.type, 'null');
    }
  }
});

test('focused revision cannot create cognitive state and inquiry targets are restricted', async () => {
  const inquiry = await new MockReasoning().affectInquiry(context);
  assert.equal(affectInquirySchema(context).safeParse({ ...inquiry, target_parts: ['invented'] }).success, false);
  assert.equal(affectInquirySchema(context).safeParse({ ...inquiry, target_parts: ['part-0', 'part-0'] }).success, false);
  const revision = { response: 'Keep this recommendation', bid_disposition: 'retain', new_bid: null };
  assert.equal(focusedBidSchema(focused).safeParse({ ...revision, prediction: {} }).success, false);
  assert.equal(focusedBidSchema(focused).safeParse({ ...revision, affect: 'erase sadness' }).success, false);
  assert.throws(() => focusedBidSchema({ ...focused, selectedFocus: { ...focus, agentId: 'foreign' } }), /ownership/);
  assert.throws(() => focusedBidSchema({ ...focused, activation: { ...focused.activation, partId: 'foreign' } }), /owning Part/);
  assert.throws(() => focusedBidSchema({ ...focused, currentBid: { id: 'foreign-bid', partId: 'foreign', action: { kind: 'wait', text: 'Wait' },
    argument: 'Pause', identityFit: [], executionOrder: [] } }), /owning Part/);
  assert.throws(() => affectInquirySchema({ ...context, availableContributors: [] }), /without contributors/);
});

test('Agent routing dispatches the new methods to the requesting Agent provider', async () => {
  const routed: string[] = [];
  const provider = new AgentReasoningProvider(new MockReasoning(), agentId => { routed.push(agentId); return new MockReasoning(); });
  await provider.affectInquiry(context); await provider.reviseFocusedBid(focused);
  assert.deepEqual(routed, ['agent', 'agent']);
});

test('new editable prompt tasks have synchronized inspection and world-blind empty previews', () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    for (const task of ['affect_selection', 'affect_inquiry', 'focused_bid_revision'] as const) {
      const row = promptCatalog.find(row => row.task === task)!;
      assert.ok(row); assert.ok(promptInspection[task]);
      const input = task === 'focused_bid_revision' ? focused
        : task === 'affect_selection' ? { ...context, choices: affectChoices(context), selectedBefore: [] } : context;
      assert.doesNotMatch(renderTaskPrompt('agent', task, input), /{{|{%/);
      if (task === 'focused_bid_revision') assert.throws(() => previewPrompt(store, agent.id, task, row.original), /No recorded focused/);
      else {
        const preview = previewPrompt(store, agent.id, task, row.original);
        assert.equal(preview.worldId, null); assert.equal(preview.cycleId, null);
        assert.match(preview.note, /no proposal or focus is fabricated/);
      }
    }
    assert.equal(store.cycles(agent.id).length, 0);
  } finally { store.close(); }
});
