import test from 'node:test';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Application } from './persistent-fixture.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { ChatExecutor } from '../../packages/sdk/src/chat-executor.js';
import { previewPrompt } from '../../packages/sdk/src/prompt-preview.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import { OllamaProvider } from '../../packages/providers/src/ollama.js';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { renderTaskPrompt, prompts } from '../../packages/providers/src/prompts.js';
import { promptResolver } from '../../packages/sdk/src/prompt-settings.js';
import { speechContext } from '../../packages/core/src/speech.js';
import { id, now, type SpeechContext, type ActionBid, type SelfContext } from '../../packages/core/src/domain.js';

const selectedBid = (kind: 'say' | 'ask' | 'wait', text = 'I need some space.'): ActionBid => ({ id: id('bid'), partId: 'part', action: { kind, text }, argument: 'Express a boundary.', identityFit: [], executionOrder: [] });
function setup(render: (context: SpeechContext) => Promise<{ text: string }>, kinds: ('say' | 'ask' | 'wait')[] = ['say', 'say']) {
  const store = new SqliteStore(':memory:');
  const partKinds = new Map<string, 'say' | 'ask' | 'wait'>();
  class Decisions extends MockDecisions {
    override async score(input: Parameters<MockDecisions['score']>[0]) {
      return [...input.candidates.map(p => ({ partId: p.id, score: 4 })), ...(input.primitives ?? []).map(p => ({ partId: p.id, score: 0 }))];
    }
    override async shouldPredict() { return false; }
    override async choose(context: SelfContext) {
      const ids = context.contributions.flatMap(c => c.bid ? [c.bid.id] : []).slice(0, kinds.length);
      return { choice: ids[0]!, selectedBidIds: ids, explanation: 'Fixture selection.', identityConflict: '' };
    }
  }
  class Reasoning extends MockReasoning {
    override async cognize(context: Parameters<MockReasoning['cognize']>[0]) {
      return { interpretation: 'PRIVATE_INTERPRETATION', thought: 'PRIVATE_THOUGHT', evidenceSummary: ['PRIVATE_EVIDENCE'],
        proposal: { action: { kind: partKinds.get(context.part.id) ?? 'say', text: `Intent from ${context.part.name}` },
          argument: 'Selected intention.', identityFit: [], executionOrder: [] } };
    }
    override renderSpeech = render;
  }
  const app = new Application(store, { decisions: new Decisions(), reasoning: new Reasoning(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent();
  store.list('part', agent.id).forEach((p, index) => partKinds.set(p.id, kinds[index] ?? 'say'));
  app.updateAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
  const identity = store.get('identity', agent.id);
  store.save('identity', { ...identity, version: identity.version + 1, traits: [
    { id: id('trait'), createdAt: now(), question: 'How do I speak?', answer: 'Clipped, wry phrasing.', keywords: [' Speech '], role: 'self_definition' },
    { id: id('trait'), createdAt: now(), question: 'Which dialect do I use?', answer: 'A familiar regional dialect.', keywords: ['speech'], role: 'autobiographical' },
    { id: id('trait'), createdAt: now(), question: 'Hidden background', answer: 'UNTAGGED_SECRET', keywords: ['biography'], role: 'autobiographical' },
    { id: id('trait'), createdAt: now(), question: 'Near match', answer: 'NEAR_MATCH_SECRET', keywords: ['speech_style'], role: 'self_definition' },
  ] }, identity.version, { origin: 'researcher_edit', reason: 'Speech test traits', sourceIds: [] });
  return { store, app, agent };
}

test('consecutive selected Say commands become one voiced utterance with exact tagged context and preserved provenance', async () => {
  const contexts: SpeechContext[] = [];
  const { store, app, agent } = setup(async context => { contexts.push(context); return { text: 'Right. Here is what I mean.' }; });
  try {
    const result = await app.message(agent.id, 'WORLD_SECRET');
    assert.equal(contexts.length, 1); assert.equal(contexts[0]!.commands.length, 2);
    assert.deepEqual(Object.keys(contexts[0]!).sort(), ['agentId', 'commands', 'speechTraits']);
    assert.equal(contexts[0]!.speechTraits.length, 2);
    for (const secret of ['UNTAGGED_SECRET', 'NEAR_MATCH_SECRET', 'WORLD_SECRET', 'PRIVATE_THOUGHT', 'PRIVATE_INTERPRETATION', 'PRIVATE_EVIDENCE']) assert.ok(!JSON.stringify(contexts[0]).includes(secret), secret);
    assert.ok(Object.isFrozen(contexts[0])); assert.ok(Object.isFrozen(contexts[0]!.speechTraits));
    assert.equal(result.executions.length, 1);
    assert.equal(result.execution!.speech!.text, 'Right. Here is what I mean.');
    assert.deepEqual(result.execution!.speech!.bidIds, result.cycle.selectedBidIds);
    assert.equal(result.execution!.action.text, contexts[0]!.commands[0]!.text);
    assert.equal(result.execution!.facts[0]!.text, `You said: ${result.execution!.speech!.text}`);
    assert.equal(result.execution!.facts[0]!.source, 'Sensor audio');
    const handoffs = store.events(agent.id).flatMap(e => e.type === 'execution.handoff' ? [e.payload.bid] : []);
    assert.equal(handoffs.length, 2);
    const next = await app.message(agent.id, 'Continue.');
    assert.ok(store.world(next.cycle.worldId).facts.some(fact => fact.text === 'You said: Right. Here is what I mean.' && fact.source === 'Sensor audio' && fact.originCycleId === result.cycle.id));
  } finally { store.close(); }
});

test('Say and Ask combine into one reply while Wait remains separate', async () => {
  const contexts: SpeechContext[] = [];
  const { store, app, agent } = setup(async context => { contexts.push(context); return { text: `Spoken ${contexts.length}` }; }, ['say', 'ask', 'say', 'wait']);
  try {
    const result = await app.message(agent.id, 'A message.');
    assert.deepEqual(result.executions.map(e => e.action.kind), ['say', 'wait']);
    assert.deepEqual(contexts.map(c => c.commands.length), [3]);
    assert.equal(result.executions[1]!.speech, undefined);
    assert.equal(result.executions[1]!.facts[0]!.text, result.executions[1]!.action.text);
    assert.equal(result.executions[1]!.facts[0]!.kind, 'does');
  } finally { store.close(); }
});

test('multiple Ask bids are voiced together as a single reply', async () => {
  const contexts: SpeechContext[] = [];
  const { store, app, agent } = setup(async context => { contexts.push(context); return { text: 'Two questions in one reply?' }; }, ['ask', 'ask']);
  try {
    const result = await app.message(agent.id, 'A message.');
    assert.equal(result.executions.length, 1);
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0]!.commands.length, 2);
    assert.deepEqual(result.executions[0]!.speech!.bidIds, result.cycle.selectedBidIds);
    assert.equal(store.events(agent.id).filter(event => event.type === 'execution.status').length, 1);
  } finally { store.close(); }
});

test('empty speech traits still invoke realization; invalid output and provider failure never post raw intentions', async () => {
  for (const failure of [false, 'invalid', 'provider'] as const) {
    const { store, app, agent } = setup(async context => {
      assert.deepEqual(context.speechTraits, []);
      if (failure === 'provider') throw new Error('Speech provider failed');
      return { text: failure === 'invalid' ? '   ' : 'Spoken without invented personality.' };
    });
    try {
      const identity = store.get('identity', agent.id);
      store.save('identity', { ...identity, traits: [], version: identity.version + 1 }, identity.version, { origin: 'researcher_edit', reason: 'No speech traits', sourceIds: [] });
      if (!failure) assert.equal((await app.message(agent.id, 'A message.')).execution!.speech!.text, 'Spoken without invented personality.');
      else {
        await assert.rejects(app.message(agent.id, 'A message.'));
        assert.equal(store.executions(agent.id).length, 0);
        assert.equal(store.events(agent.id).filter(e => e.type === 'execution.status').length, 0);
        assert.equal(store.cycles(agent.id)[0]!.status, 'failed');
      }
    } finally { store.close(); }
  }
});

test('speech prompt is catalogued, editable, resettable and previewable before and after execution without world access', async () => {
  const { store, app, agent } = setup(async () => ({ text: 'A voiced reply.' }));
  try {
    const row = app.promptSettings(agent.id).find(p => p.task === 'speech')!;
    assert.equal(row.title, 'Exec · Speech'); assert.ok(row.inspection);
    const preview = previewPrompt(store, agent.id, 'speech', row.effective);
    assert.equal(preview.worldId, null); assert.match(preview.text, /Clipped, wry phrasing/); assert.ok(!preview.text.includes('UNTAGGED_SECRET'));
    app.editPrompt(agent.id, 'speech', 'global', 'Global voice {{ commands[0].text }}');
    app.editPrompt(agent.id, 'speech', 'agent', 'Agent voice {{ speechTraits[0].answer }}');
    assert.equal(app.promptSettings(agent.id).find(p => p.task === 'speech')!.source, 'agent');
    assert.equal(previewPrompt(store, agent.id, 'speech', promptResolver(store)(agent.id, 'speech')!).text, 'Agent voice Clipped, wry phrasing.');
    app.resetPrompt(agent.id, 'speech', 'agent'); assert.equal(app.promptSettings(agent.id).find(p => p.task === 'speech')!.source, 'global');
    app.resetPrompt(agent.id, 'speech', 'global'); assert.equal(app.promptSettings(agent.id).find(p => p.task === 'speech')!.effective, prompts.speech.text);
    await app.message(agent.id, 'WORLD_SECRET');
    const recorded = previewPrompt(store, agent.id, 'speech', '{{ commands|length }} selected commands.');
    assert.equal(recorded.text, '2 selected commands.'); assert.ok(recorded.cycleId); assert.equal(recorded.worldId, null);
    assert.throws(() => previewPrompt(store, agent.id, 'speech', '{{ world.facts }}'), /Twig|render|variable|world/i);
  } finally { store.close(); }
});

test('OpenAI and Ollama realize the voice through the editable speech task with constrained output', async () => {
  const { store, app, agent } = setup(async () => ({ text: 'Unused.' }));
  try {
    const context = speechContext(store.get('identity', agent.id), [selectedBid('say')]);
    const custom = 'Selected: {{ commands[0].text }}. Voice: {{ speechTraits[0].answer }}';
    app.editPrompt(agent.id, 'speech', 'agent', custom);
    const expected = renderTaskPrompt(agent.id, 'speech', context, promptResolver(store));
    const openai = new OpenAIProvider('test-only', 'test-model', async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.input, expected); assert.equal(body.store, false); assert.equal(body.previous_response_id, undefined);
      assert.deepEqual(Object.keys(body.text.format.schema.properties.result.properties), ['text']);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: { text: 'Give me a moment, will you?' } }) }] }] });
    }, promptResolver(store));
    assert.deepEqual(await openai.renderSpeech(context), { text: 'Give me a moment, will you?' });
    const ollama = new OllamaProvider('test-model', undefined, async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.messages[1].content, expected); assert.deepEqual(Object.keys(body.format.properties), ['text']);
      return Response.json({ message: { content: JSON.stringify({ text: 'A moment, please.' }) } });
    }, promptResolver(store));
    assert.deepEqual(await ollama.renderSpeech(context), { text: 'A moment, please.' });
  } finally { store.close(); }
});

test('chat Executor rejects non-dialogue speech input before inference', async () => {
  const { store, app, agent } = setup(async () => { throw new Error('Should not run'); });
  try {
    const executor = new ChatExecutor(store, app.providers.reasoning, app.inspection);
    await assert.rejects(executor.executeSay({ agentId: agent.id, cycleId: 'cycle', bids: [selectedBid('wait')] }), /Say or Ask commands/);
  } finally { store.close(); }
});

test('cycle inspector displays the realized utterance and Settings exposes the editable Speech prompt', async t => {
  const { existsSync } = await import('node:fs');
  const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(executable)) { t.skip('Chrome is unavailable'); return; }
  const { chromium } = await import('@playwright/test');
  const { createResearchServer } = await import('../../apps/server/src/server.js');
  const { store, app, agent } = setup(async () => ({ text: 'All right. Let me put it my way.' }));
  await app.message(agent.id, 'A message.');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`);
    await page.getByRole('tab', { name: /^Audio/ }).click();
    const spoken = page.locator('.perception-fact-content > p:first-child');
    await page.getByRole('tabpanel').getByText('You said: All right. Let me put it my way.', { exact: true }).waitFor();
    assert.ok((await spoken.allTextContents()).includes('You said: All right. Let me put it my way.'));
    await page.getByRole('tab', { name: /^General world facts/ }).click();
    assert.ok((await page.locator('.perception-fact-content > p:first-child').allTextContents()).every(text => !text.startsWith('You said:')));
    const firstWorld = store.world(store.cycles(agent.id)[0]!.worldId); const frozen = JSON.stringify(firstWorld);
    await app.message(agent.id, 'Continue the exchange.', 'user', store.cycles(agent.id)[0]!.threadId);
    await page.getByText(/^Snapshot 2 ·/).waitFor();
    await page.getByRole('tab', { name: /^Audio/ }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.perception-fact-content > p:first-child')].filter(input => input.textContent === 'You said: All right. Let me put it my way.').length === 2);
    await page.screenshot({ path: '/tmp/prism-spoken-audio-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Previous WorldState', exact: true }).click();
    assert.equal(await page.getByRole('tabpanel').getByText('You said: All right. Let me put it my way.', { exact: true }).count(), 0);
    assert.equal(JSON.stringify(store.world(firstWorld.id)), frozen);
    await page.getByRole('button', { name: 'Next WorldState', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect source cycle', exact: true }).click();
    await page.getByRole('dialog').getByText('All right. Let me put it my way.', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Prompts', exact: true }).click();
    await page.getByRole('button', { name: /Select prompt/ }).click();
    await page.getByRole('menuitemradio', { name: 'Exec · Speech', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Exec · Speech', exact: true });
    await panel.getByRole('textbox', { name: 'Prompt text' }).fill('Voice: {{ speechTraits[0].answer }}. Say: {{ commands[0].text }}');
    await page.locator('.component-header').getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Compiled prompt preview', exact: true });
    await preview.waitFor(); assert.match(await preview.locator('pre').innerText(), /Voice: Clipped, wry phrasing\.\. Say: Intent from/);
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.component-header').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.component-header').getByRole('menuitem', { name: 'To Agent', exact: true }).click();
    await page.getByText('Exec · Speech saved for this Agent.', { exact: true }).waitFor();
    assert.equal(store.promptOverrides({ scope: 'agent', agentId: agent.id, task: 'speech' }).length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
