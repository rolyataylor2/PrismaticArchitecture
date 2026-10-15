import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SecretVault } from '../../packages/providers/src/secret-vault.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('thought routing settings save explicit models and show measured evidence on desktop and mobile', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-routing-browser-')); const store = new SqliteStore(':memory:');
  const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  const agent = app.createAgent('Routing browser'); await app.message(agent.id, 'A bird chirps.', 'observer', 'browser');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Assess resources separately for each thought' }).check();
    await page.getByLabel('Intuitive thought model', { exact: true }).selectOption('gpt-4.1-nano');
    await page.getByLabel('Deliberative thought model', { exact: true }).selectOption('gpt-4.1-mini');
    await page.getByLabel('Consecutive incorrect predictions before escalation').fill('3');
    await page.getByLabel('Provider API key (leave blank to keep the current key)').fill('sk-routing-browser-fixture-never-real');
    await page.getByRole('button', { name: 'Save Agent model and key', exact: true }).click();
    await page.getByText('Agent inference settings saved.', { exact: true }).waitFor();
    assert.deepEqual(store.agentProviderSettings(agent.id)!.thoughtRouting, { enabled: true, intuitiveModel: 'gpt-4.1-nano', deliberativeModel: 'gpt-4.1-mini', escalateAfterIncorrectPredictions: 3 });
    await page.getByRole('columnheader', { name: 'Actual provider / model', exact: true }).waitFor();
    assert.ok((await page.locator('main').innerText()).includes('deterministic/mock-reasoning-v1'));
    assert.ok((await page.locator('main').innerText()).includes('ms mean'));
    assert.equal(await page.getByText('ResizeObserver loop completed with undelivered notifications.', { exact: true }).count(), 0);
    await page.screenshot({ path: '/tmp/prism-thought-routing-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.ok((await page.locator('main .component-header').boundingBox())!.height < 220, 'Model settings header fits its actual content on mobile');
    assert.equal(await page.getByText('ResizeObserver loop completed with undelivered notifications.', { exact: true }).count(), 0);
    await page.screenshot({ path: '/tmp/prism-thought-routing-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
