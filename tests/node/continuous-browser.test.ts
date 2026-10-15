import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('chat admits another observation during a thought and preserves a newer draft on late completion', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  let release!: () => void; let entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; }); const thinking = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (input.task === 'part_cognition' && ++calls === 1) { entered(); await blocked; }
      return super.constructed(input);
    }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent('Continuous browser');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A first observation while thinking begins.');
    await page.getByRole('button', { name: 'Send', exact: true }).click(); await thinking;
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('.send-btn')?.disabled === false);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A second observation before that thought finishes.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(async id => {
      const snapshot = await (await fetch(`/api/agents/${id}`)).json();
      return snapshot.cycles.some((cycle: { sequence: number; status: string }) => cycle.sequence === 2 && cycle.status === 'completed');
    }, agent.id);
    assert.equal(store.cycles(agent.id)[0]!.status, 'running');
    assert.ok(store.cycles(agent.id).every(cycle => cycle.clientMessageId));
    assert.equal(new Set(store.cycles(agent.id).map(cycle => cycle.clientMessageId)).size, 2);
    const draft = 'A newer unsent draft must remain here.';
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(draft);
    release();
    await page.waitForFunction(async id => {
      const snapshot = await (await fetch(`/api/agents/${id}`)).json();
      return snapshot.cycles.every((cycle: { status: string }) => cycle.status === 'completed');
    }, agent.id);
    await page.waitForFunction(() => document.querySelectorAll('.chat-thought-bubble').length === 2 && !document.querySelector('.chat-thought-bubble.thinking'));
    await page.getByRole('button', { name: 'Inspect cognitive activity', exact: true }).first().waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), draft);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: '/tmp/prism-continuous-chat.png', fullPage: true });
    await page.getByRole('button', { name: 'Inspect cognitive activity', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Asynchronous activity', exact: true }).waitFor();
    await page.getByRole('columnheader', { name: 'Meaning', exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/prism-continuous-inspector-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-continuous-inspector-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), draft);
  } finally { release(); await app.close(); await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('production activation settings expose busy policy, limits and live pause/resume on desktop and mobile', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent('Activation controls');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A quiet room is visible.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(async id => (await (await fetch(`/api/agents/${id}`)).json()).cycles.some((cycle: {status: string}) => cycle.status === 'completed'), agent.id);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Activation', exact: true }).click();
    const busy = page.getByRole('checkbox', { name: 'Evaluate activation of dispositions that are thinking' });
    assert.equal(await busy.isChecked(), false);
    assert.equal(await page.getByLabel('Maximum concurrent thoughts', { exact: true }).inputValue(), '4');
    assert.equal(await page.getByLabel('Activation passes per observation before pause (blank for unlimited)', { exact: true }).inputValue(), '1');
    await busy.check(); await page.getByLabel('Maximum concurrent thoughts', { exact: true }).fill('2');
    await page.getByLabel('Maximum queued thoughts', { exact: true }).fill('9');
    await page.getByRole('button', { name: 'Save activation settings', exact: true }).click();
    await page.getByText('Activation settings saved.', { exact: true }).waitFor();
    assert.equal(app.agentActivationSettings(agent.id).includeProcessingDispositions, true);
    assert.equal(app.agentActivationSettings(agent.id).maxConcurrentThoughts, 2);
    assert.equal(app.agentActivationSettings(agent.id).maxQueuedThoughts, 9);
    await page.getByRole('button', { name: 'Resume activation', exact: true }).click();
    await page.getByText(/paused · 2 activation passes/).waitFor();
    assert.equal(await busy.isChecked(), true, 'Live status updates must preserve the settings form');
    await page.screenshot({ path: '/tmp/prism-activation-controls-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.ok((await page.locator('main .component-header').boundingBox())!.height < 260, 'Activation header fits its actual content on mobile');
    await page.screenshot({ path: '/tmp/prism-activation-controls-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
