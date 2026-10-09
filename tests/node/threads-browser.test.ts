import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('browser resumes threads without mixing conversation facts or Brain keyframes', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Agent name' }).fill('Threads');
    await page.getByRole('button', { name: 'Create Agent', exact: true }).click();
    const agent = store.list('agent')[0]!;
    const send = async (text: string, count: number) => {
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.waitForFunction(expected => document.querySelectorAll('.cycle-status').length === expected, count);
    };
    await send('A_SENTINEL uncertain personal question', 1);
    await send('A continues with a personal question', 2);
    const threadA = store.cycles(agent.id)[0]!.threadId!;
    await page.getByRole('button', { name: 'Create new chat thread', exact: true }).click();
    await send('B_SENTINEL uncertain personal question', 1);
    const threadB = store.cycles(agent.id)[2]!.threadId!;
    assert.notEqual(threadA, threadB);
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    assert.equal(await page.locator('.brain-timeline-dot').count(), 1);
    assert.ok(!(await page.locator('.worldstate-thread:not(.brain-thought-conversation)').innerText()).includes('A_SENTINEL'));
    await page.getByRole('button', { name: 'A_SENTINEL uncertain persona', exact: false }).click();
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.brain-timeline-dot').length === 2);
    const aWorld = await page.locator('.worldstate-thread:not(.brain-thought-conversation)').innerText();
    assert.ok(aWorld.includes('A_SENTINEL')); assert.ok(!aWorld.includes('B_SENTINEL'));
    await page.getByRole('button', { name: 'Cycle 1 · Thought generation 1', exact: true }).click();
    assert.ok(!(await page.locator('.worldstate-thread:not(.brain-thought-conversation)').innerText()).includes('A continues'));
    await page.reload();
    await page.getByRole('button', { name: 'A_SENTINEL uncertain persona', exact: false }).click();
    await send('A resumes with a personal question', 3);
    assert.equal(store.cycles(agent.id)[3]!.threadId, threadA);
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    assert.equal(await page.locator('.brain-timeline-dot').count(), 3);
    assert.ok(!(await page.locator('.worldstate-thread:not(.brain-thought-conversation)').innerText()).includes('B_SENTINEL'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});

test('chat immediately displays submissions and preserves ordered collapsible thoughts', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Agent name' }).fill('Threads');
    await page.getByRole('button', { name: 'Create Agent', exact: true }).click();
    await page.route('**/api/agents/*/message', async route => {
      await new Promise(resolve => setTimeout(resolve, 700));
      await route.continue();
    });
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A_SENTINEL uncertain personal question');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    assert.ok((await page.locator('.chat-transcript').innerText()).includes('A_SENTINEL'));
    assert.ok((await page.locator('.chat-thought-bubble').innerText()).includes('Waiting for server confirmation'));
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), '');
    await page.waitForFunction(() => document.querySelectorAll('.cycle-status').length === 1);
    await page.getByRole('button', { name: 'Expand thought bubble', exact: true }).click();
    const steps = await page.locator('.chat-thought-steps').innerText();
    assert.ok(steps.includes('I received your message…'));
    assert.ok(steps.includes('part says,'));
    assert.ok(steps.includes('part suggests:'));
    const sequences = await page.locator('.chat-thought-steps .chat-inner-voice').evaluateAll(items => items.map(item => Number((item as HTMLElement).dataset.sequence)));
    assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b));
    await page.getByRole('button', { name: 'Collapse thought bubble', exact: true }).click();
    assert.equal(await page.locator('.chat-thought-steps').count(), 0);
    await page.unroute('**/api/agents/*/message');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});
