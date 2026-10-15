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
test('sidebar square, profile persistence and Agent list work on desktop and mobile', { skip: !existsSync(executable) }, async () => {
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
    assert.equal(await page.getByRole('list', { name: 'Available Agents' }).count(), 1);
    const rows = await page.locator('.agent-picker-row').all();
    assert.ok((await rows[1]!.boundingBox())!.y > (await rows[0]!.boundingBox())!.y);
    assert.equal(await page.getByRole('button', { name: 'Delete Second Agent', exact: true }).count(), 1);
    await page.screenshot({ path: '/tmp/prism-agent-picker.png' });
    await page.locator('.agent-picker-item').filter({ hasText: 'Second Agent' }).click();
    await square.filter({ hasText: 'Second Agent' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-agent-sidebar-mobile.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('empty main database opens creation instead of loading research Agents or stale selections', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const researchStore = new SqliteStore(':memory:'); const research = new Application(researchStore);
  research.createAgent('Preserved research Agent');
  const server = createResearchServer(app, process.cwd(), [{ id: 'research', label: 'Research', app: research }]);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem('prism-agent', 'deleted-agent'); localStorage.setItem('prism-database', 'research');
    });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const creation = page.getByRole('dialog', { name: 'Create New Prismatic Agent', exact: true });
    await creation.waitFor();
    assert.equal(store.list('agent').length, 0, 'Opening the form does not silently create an Agent');
    assert.equal(await page.locator('#create-agent-dialog').count(), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('prism-database')), null);
    await page.screenshot({ path: '/tmp/prism-empty-agent-creation-mobile.png', fullPage: true });
    await creation.getByLabel('New Prismatic Agent name').fill('Fresh Agent');
    await creation.getByRole('button', { name: 'Create Prismatic Agent', exact: true }).click();
    await page.locator('.agent-square').filter({ hasText: 'Fresh Agent' }).waitFor();
    await page.locator('.perception-page').waitFor();
    assert.equal(store.list('agent').length, 1);
    assert.equal(researchStore.list('agent').length, 1, 'Creation belongs to the main database');
    await page.locator('.agent-square').hover();
    await page.getByRole('button', { name: 'Agent options', exact: true }).click();
    await page.getByRole('button', { name: 'Change Agent', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Change Agent', exact: true });
    await page.screenshot({ path: '/tmp/prism-agent-list-mobile.png', fullPage: true });
    page.once('dialog', dialog => dialog.dismiss());
    await picker.getByRole('button', { name: 'Delete Preserved research Agent', exact: true }).click();
    assert.equal(researchStore.list('agent').length, 1, 'Cancellation preserves the Agent');
    page.once('dialog', dialog => dialog.accept());
    await picker.getByRole('button', { name: 'Delete Preserved research Agent', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.agent-picker-row').length === 1);
    assert.equal(researchStore.list('agent').length, 0, 'Trash targets the item’s database');
    assert.equal(store.list('agent').length, 1, 'The selected main Agent survives deleting a research Agent');
    page.once('dialog', dialog => dialog.accept());
    await picker.getByRole('button', { name: 'Delete Fresh Agent', exact: true }).click();
    await creation.waitFor();
    assert.equal(store.list('agent').length, 0, 'Deleting the selected last Agent opens creation');
    await page.reload(); await creation.waitFor();
    await creation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: '+ Create Prismatic Agent', exact: true }).click();
    await creation.waitFor();
    assert.equal(await page.locator('#create-agent-dialog').count(), 1);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await app.close(); await research.close(); store.close(); researchStore.close();
  }
});
