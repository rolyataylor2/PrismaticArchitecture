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
test('Classifier settings save an independent JEV model and private key and reset to server settings', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-classifier-browser-'));
  const store = new SqliteStore(':memory:');
  const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  const agent = app.createAgent('Classifier settings');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    const providers = page.getByRole('list', { name: 'Available model providers', exact: true });
    const addKey = page.getByLabel('New provider API key', { exact: true });
    assert.equal(await addKey.getAttribute('type'), 'password');
    for (const provider of ['openai', 'jev', 'cloudflare']) {
      await page.getByLabel('Provider to add', { exact: true }).selectOption(provider);
      if (provider === 'cloudflare') await page.getByLabel('New Cloudflare Account ID', { exact: true }).fill('b'.repeat(32));
      await addKey.fill(`test-only-${provider}-provider-private-key`);
      await page.locator('.provider-add-row').getByRole('button').click();
      await page.getByText('Provider key saved. Choose its model below.', { exact: true }).waitFor();
      await providers.getByText(provider === 'openai' ? 'OpenAI' : provider === 'jev' ? 'JEV' : 'Cloudflare', { exact: true }).waitFor();
      assert.equal(await addKey.inputValue(), '');
    }
    assert.equal(store.agentProviderConnections(agent.id).length, 3);
    assert.equal(await page.locator('#content > .card').first().locator('h3').textContent(), 'Model providers');
    const key = page.getByLabel('Classifier API key (leave blank to keep saved key)', { exact: true });
    await page.getByLabel('Classifier model (JEV)', { exact: true }).fill('jev-browser-model');
    // The saved JEV connection supplies the Classifier key without another paste.
    assert.equal(await key.getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Save Classifier model and key', exact: true }).click();
    await page.getByText('Classifier settings saved.', { exact: true }).waitFor();
    assert.equal(await key.inputValue(), '');
    assert.equal(store.agentClassifierSettings(agent.id)!.model, 'jev-browser-model');
    assert.equal(store.agentProviderSettings(agent.id), null);
    assert.equal(store.agentImageSettings(agent.id)!.accountId, 'b'.repeat(32));
    assert.equal(await page.getByLabel('Cloudflare Account ID', { exact: true }).inputValue(), 'b'.repeat(32));
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    assert.equal(await page.getByLabel('Classifier model (JEV)', { exact: true }).inputValue(), 'jev-browser-model');
    assert.equal(await key.inputValue(), '');
    await page.screenshot({ path: '/tmp/prism-classifier-settings.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Remove OpenAI', exact: true }).click();
    await page.getByText('OpenAI Agent key removed.', { exact: true }).waitFor();
    assert.equal(store.agentProviderConnections(agent.id).length, 2);
    assert.equal(store.agentClassifierSettings(agent.id)!.model, 'jev-browser-model');
    await page.getByRole('button', { name: 'Use server classifier settings', exact: true }).click();
    await page.getByText('Using server classifier settings.', { exact: true }).waitFor();
    assert.equal(store.agentClassifierSettings(agent.id), undefined);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await app.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
