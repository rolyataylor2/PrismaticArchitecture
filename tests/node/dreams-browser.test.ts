import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { dreamState } from '../../packages/sdk/src/dream-state.js';
import { listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Dreams selects a developed base, defaults to isolation, compares frozen states and explicitly keeps later experiences', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const first = app.createAgent('First base'); const base = app.createAgent('Developed second base');
  await app.message(base.id, 'A friend invited me to share a concern, listened, and thanked me.', 'friend', 'before');
  const before = dreamState(store, base.id); const firstBefore = dreamState(store, first.id);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Dreams', exact: true }).click();
    await page.locator('.research-dashboard').getByRole('button', { name: 'New dream', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Launch dream', exact: true });
    await dialog.getByLabel('Base Agent', { exact: true }).selectOption(base.id);
    await dialog.getByLabel('Scenario', { exact: true }).selectOption('conversation-starters');
    assert.equal(await dialog.getByLabel('Keep dream changes in the base Agent', { exact: true }).isChecked(), false);
    await dialog.getByLabel('Simulation inference mode').selectOption('fixture');
    await dialog.getByRole('button', { name: 'Start experience', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    const panel = page.locator('.research-dashboard');
    await panel.getByRole('button', { name: 'Inspect Agent after dream', exact: true }).waitFor();
    const run = listSimulationRuns(app)[0]!; assert.equal(run.sourceAgentId, base.id); assert.notEqual(run.agentId, base.id);
    assert.deepEqual(dreamState(store, base.id), before); assert.deepEqual(dreamState(store, first.id), firstBefore);
    await panel.getByRole('button', { name: 'Inspect Agent after dream', exact: true }).click();
    const after = page.getByRole('dialog', { name: 'Agent after dream', exact: true }); assert.ok((await after.innerText()).includes(run.agentId));
    await after.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: '/tmp/prism-dreams-desktop.png', fullPage: true });
    await panel.getByRole('button', { name: 'New dream', exact: true }).click(); dialog = page.getByRole('dialog', { name: 'Launch dream', exact: true });
    await dialog.getByLabel('Base Agent', { exact: true }).selectOption(base.id);
    await dialog.getByLabel('Scenario', { exact: true }).selectOption('conversation-starters');
    await dialog.getByLabel('Keep dream changes in the base Agent', { exact: true }).check();
    await dialog.getByLabel('Simulation inference mode').selectOption('fixture');
    await dialog.getByRole('button', { name: 'Start experience', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(async () => {
      const data = await (await fetch('/api/simulation-tests')).json(); return data.runs.length === 2 && data.runs.every((run: { status: string }) => run.status !== 'running');
    });
    assert.equal(listSimulationRuns(app).find(item => item.dream?.keepChanges)!.agentId, base.id);
    assert.ok(store.cycles(base.id).length > before.cycles.length);
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.getByRole('table', { name: 'Dream state comparison', exact: true }).first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: '/tmp/prism-dreams-mobile.png', fullPage: true }); assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
