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
test('browser sends sensor collections and restores their channel labels after reload', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Prismatic Agent name' }).fill('Sensors');
    await page.getByRole('button', { name: 'Create Prismatic Agent', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('/sensor audio "Bird chirps" /sensor visual "A coffee mug"');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cycle-status').length === 1);
    assert.match((await page.locator('.chat-message-row.user').allTextContents()).join('\n'), /Sensor audio: Bird chirps/);
    assert.match((await page.locator('.chat-message-row.user').allTextContents()).join('\n'), /Sensor visual: A coffee mug/);
    await page.reload();
    await page.getByText('Sensor visual: A coffee mug', { exact: true }).waitFor();
    assert.equal(store.cycles(store.list('agent')[0]!.id).length, 1);
  } finally {
    await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await app.close(); store.close();
  }
});
