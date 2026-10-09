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
test('Settings Activation exposes only constructed-loop controls and preserves settings', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const agent = app.createAgent('Activation Test');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Activation', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Use vector search before Jev' }).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Cognitive architecture' }).count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Re-evaluate activations after DELIBERATE' }).count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Primitives go first' }).count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Use relevant memories before Jev', exact: true }).count(), 0);
    const threshold = page.getByRole('slider', { name: 'Memory relevance threshold (0–1)' });
    await threshold.focus(); await threshold.press('Home');
    for (let index = 0; index < 15; index++) await threshold.press('ArrowRight');
    assert.equal(await threshold.inputValue(), '0.75');
    await page.getByLabel('Maximum accessible memories (blank for unlimited)').fill('');
    await page.getByRole('button', { name: 'Save activation settings', exact: true }).click();
    await page.getByText('Activation settings saved.', { exact: true }).waitFor();
    assert.equal(app.agentActivationSettings(agent.id).memoryRelevanceThreshold, 0.75);
    assert.equal(app.agentActivationSettings(agent.id).memoryRecallLimit, null);
    await page.getByRole('button', { name: 'Model & key', exact: true }).click();
    await page.getByRole('button', { name: 'Activation', exact: true }).click();
    await page.getByLabel('Memory relevance threshold (0–1)').waitFor();
    assert.equal(await page.getByLabel('Memory relevance threshold (0–1)').inputValue(), '0.75');
    assert.equal(await page.getByLabel('Maximum accessible memories (blank for unlimited)').inputValue(), '');
    await page.getByRole('button', { name: 'Save activation settings', exact: true }).click();
    await page.getByText('Activation settings saved.', { exact: true }).waitFor();
    assert.equal(app.agentActivationSettings(agent.id).vectorSearchEnabled, true);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
