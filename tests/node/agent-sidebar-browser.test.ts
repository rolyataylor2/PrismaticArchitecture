import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('sidebar square, profile persistence and Agent grid work on desktop and mobile', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const first = app.createAgent('First Agent'); app.createAgent('Second Agent');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const square = page.locator('.agent-square'); await square.waitFor();
    await page.mouse.move(1000, 700);
    assert.equal(await page.locator('.agent-pencil-btn').evaluate(el => getComputedStyle(el).opacity), '0');
    const bounds = await square.boundingBox(); assert.ok(bounds && Math.abs(bounds.width - bounds.height) < 1);
    await square.click(); await page.locator('.perception-page').waitFor();
    await square.hover(); await page.getByRole('button', { name: 'Agent options', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Agent', exact: true }).click();
    await page.getByLabel('Agent name', { exact: true }).fill('Updated Agent');
    await page.getByLabel('Agent avatar', { exact: true }).fill('🌿');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await square.filter({ hasText: 'Updated Agent' }).waitFor();
    assert.equal(store.get('agent', first.id).avatar, '🌿');
    await page.reload(); await square.filter({ hasText: '🌿' }).waitFor();
    await square.hover(); await page.getByRole('button', { name: 'Agent options', exact: true }).click();
    await page.getByRole('button', { name: 'Change Agent', exact: true }).click();
    assert.equal(await page.locator('.agent-picker-item').count(), 2);
    await page.screenshot({ path: '/tmp/prism-agent-picker.png' });
    await page.locator('.agent-picker-item').filter({ hasText: 'Second Agent' }).click();
    await square.filter({ hasText: 'Second Agent' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-agent-sidebar-mobile.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
