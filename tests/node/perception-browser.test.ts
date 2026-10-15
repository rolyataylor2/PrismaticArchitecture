import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { Application as ContinuousApplication } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Perception displays latest Agent snapshot and updates without a chat interface', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent('Perception test');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Perception', exact: true }).click();
    await page.getByText('No WorldState has been recorded for this Agent yet.', { exact: true }).waitFor();
    assert.equal(await page.locator('.chat-transcript, .chat-input-dock, .session-row').count(), 0);
    await app.message(agent.id, 'A bird is singing outside.', 'Sensor audio', 'perception-a');
    await page.locator('.perception-fact').filter({ hasText: 'A bird is singing outside.' }).first().waitFor();
    await app.message(agent.id, 'A red bicycle is beside the door.', 'Sensor visual', 'perception-b');
    await page.locator('.perception-fact').filter({ hasText: 'A red bicycle is beside the door.' }).first().waitFor();
    await page.getByRole('button', { name: 'Previous WorldState', exact: true }).click();
    await page.getByRole('heading', { name: 'Past WorldState', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Previous WorldState', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Play cognition', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.perception-fact').filter({ hasText: 'A red bicycle' }).count(), 0);
    await app.message(agent.id, 'Rain taps on the window.', 'Sensor audio', 'perception-c');
    await page.getByRole('status').filter({ hasText: '1 / 3' }).waitFor();
    await page.getByRole('button', { name: 'Next WorldState', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '2 / 3' }).waitFor();
    await page.getByRole('button', { name: 'Next WorldState', exact: true }).click();
    await page.getByRole('heading', { name: 'Current WorldState', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Next WorldState', exact: true }).isDisabled(), true);
    await page.locator('.perception-fact').filter({ hasText: 'Rain taps on the window.' }).first().waitFor();
    await page.screenshot({ path: '/tmp/prism-perception-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Inspect full WorldState', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-perception-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  } finally { await browser.close(); server.close(); store.close(); }
});

// Configured runtime with deterministic providers: verifies controls, not cognition quality.
test('Play resumes the current snapshot’s cognition stream through the normal runtime', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new ContinuousApplication(store); const agent = app.createAgent('Play cognition');
  await app.message(agent.id, 'A quiet room is visible.', 'Sensor visual', 'play-thread');
  await app.runtime.idle(agent.id);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const play = page.getByRole('button', { name: 'Play cognition', exact: true });
    await play.waitFor();
    assert.equal(await play.isEnabled(), true);
    const before = store.events(agent.id).filter(event => event.type === 'worldstate.frozen').length;
    const response = page.waitForResponse(response => response.url().endsWith('/cognition-control') && response.request().method() === 'POST');
    await play.click();
    const control = await response;
    assert.equal(control.ok(), true);
    assert.deepEqual(control.request().postDataJSON(), { threadId: 'play-thread', directive: 'resume' });
    await app.runtime.idle(agent.id);
    assert.ok(store.events(agent.id).filter(event => event.type === 'worldstate.frozen').length > before);
    await page.getByRole('status').filter({ hasText: 'Current' }).waitFor();
    await page.getByRole('button', { name: 'Previous WorldState', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Play cognition', exact: true }).isDisabled(), true);
  } finally { await browser.close(); await app.close(); server.close(); store.close(); }
});
