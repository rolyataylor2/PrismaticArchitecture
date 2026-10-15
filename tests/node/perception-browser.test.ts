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
    await page.screenshot({ path: '/tmp/prism-perception-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Inspect full WorldState', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-perception-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  } finally { await browser.close(); server.close(); store.close(); }
});
