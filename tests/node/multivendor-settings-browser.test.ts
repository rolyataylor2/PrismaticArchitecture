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
test('model dropdowns follow added provider keys and retain direct, OpenRouter and cross-provider resource choices', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-multivendor-browser-')); const store = new SqliteStore(':memory:');
  const app = new Application(store, undefined, undefined, undefined, new SecretVault(join(directory, 'vault')));
  const agent = app.createAgent('Available models'); const server = createResearchServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/agents/*/models/openrouter', route => route.fulfill({ json: [
      { id: 'openrouter:google/custom-flash-lite', label: 'Catalog Flash-Lite · OpenRouter', provider: 'openrouter' },
    ] }));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    const model = page.getByLabel('Model for this Agent', { exact: true });
    if (!process.env.GEMINI_API_KEY) assert.equal(await model.locator('option[value^="gemini:"]').count(), 0);
    for (const provider of ['gemini', 'qwen', 'openrouter']) {
      await page.getByLabel('Provider to add', { exact: true }).selectOption(provider);
      if (provider === 'qwen') await page.getByLabel('Qwen API base URL', { exact: true }).fill('https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1');
      await page.getByLabel('New provider API key', { exact: true }).fill(`${provider}-browser-test-key`);
      await page.locator('.provider-add-row').getByRole('button').click();
      await page.getByText('Provider key saved. Choose its model below.', { exact: true }).waitFor();
      await model.locator(`option[value^="${provider}:"]`).first().waitFor({ state: 'attached' });
    }
    await model.locator('option[value="openrouter:google/custom-flash-lite"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('input[type=password]').count(), 1);
    assert.equal(await page.getByLabel('Classifier model', { exact: true }).locator('option[value^="gemini:"]').count(), 0);
    assert.equal(await page.getByLabel('Image generator', { exact: true }).locator('option[value="gemini"]').count(), 0);
    for (const selected of ['gemini:gemini-2.5-flash-lite', 'qwen:qwen-flash', 'openrouter:google/custom-flash-lite']) {
      await model.selectOption(selected);
      await page.getByRole('button', { name: 'Save model settings', exact: true }).click();
      await page.getByText('Agent inference settings saved.', { exact: true }).waitFor();
      assert.equal(store.agentProviderSettings(agent.id)!.model, selected);
      await model.locator(`option[value="${selected}"]`).waitFor({ state: 'attached' });
    }
    await page.getByRole('checkbox', { name: 'Assess resources separately for each thought' }).check();
    await page.getByLabel('Intuitive thought model', { exact: true }).selectOption('gemini:gemini-2.5-flash-lite');
    await page.getByLabel('Deliberative thought model', { exact: true }).selectOption('qwen:qwen-flash');
    await page.getByRole('button', { name: 'Save model settings', exact: true }).click();
    await page.getByText('Agent inference settings saved.', { exact: true }).waitFor();
    assert.equal(store.agentProviderSettings(agent.id)!.thoughtRouting!.deliberativeModel, 'qwen:qwen-flash');
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    await model.locator('option[value="openrouter:google/custom-flash-lite"]').waitFor({ state: 'attached' });
    assert.equal(await model.inputValue(), 'openrouter:google/custom-flash-lite');
    assert.equal(await page.getByLabel('Intuitive thought model', { exact: true }).inputValue(), 'gemini:gemini-2.5-flash-lite');
    await page.screenshot({ path: '/tmp/prism-multivendor-model-settings.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Remove Google Gemini', exact: true }).click();
    await page.getByText('Google Gemini Agent key removed.', { exact: true }).waitFor();
    if (!process.env.GEMINI_API_KEY) assert.equal(await model.locator('option[value^="gemini:"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
