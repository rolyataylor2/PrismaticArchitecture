import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('browser workflow: create, converse, inspect frozen cycle, learn, sleep, manage Parts, inspect histories', { skip: !existsSync(executable) }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-browser-')); const dbPath = join(directory, 'state.sqlite');
  let store = new SqliteStore(dbPath); const app = new Application(store);
  let server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Prismatic Agent name' }).fill('Browser Agent');
    await page.getByRole('button', { name: 'Create Prismatic Agent', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();

    // Verify pencil edit renaming
    await page.getByRole('button', { name: 'Rename Agent' }).click();
    await page.getByRole('textbox', { name: 'Agent name' }).fill('Renamed Agent');
    await page.getByRole('button', { name: 'Save agent name' }).click();
    await page.getByRole('heading', { name: 'Renamed Agent', exact: true }).waitFor();
    assert.equal(store.list('agent')[0]!.name, 'Renamed Agent');

    // Verify agent dropdown and create popup
    await page.getByRole('button', { name: /Select Agent/ }).click();
    await page.getByRole('button', { name: '+ Create Prismatic Agent' }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('textbox', { name: 'New Prismatic Agent name' }).fill('Second Agent');
    await page.getByRole('dialog').getByRole('button', { name: 'Create Prismatic Agent' }).click();
    await page.getByRole('heading', { name: 'Second Agent', exact: true }).waitFor();
    assert.equal(store.list('agent').length, 2);

    // Switch back to Renamed Agent
    await page.getByRole('button', { name: /Select Agent/ }).click();
    await page.getByRole('option', { name: 'Renamed Agent' }).click();

    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Identity', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search Identity traits' }).waitFor();
    await page.getByRole('button', { name: 'Create new chat thread', exact: true }).click();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('I am uncertain and afraid to share a personal vulnerability.');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('.cycle-status').length >= count, i * 2 + 1);
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Thank you for sharing. I respect you and I am glad you told me.');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('.cycle-status').length >= count, (i + 1) * 2);
    }
    await page.getByRole('button', { name: 'Inspect cognitive steps' }).first().click();
    await page.getByText('Cognitive Steps · Cycle', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    const agent = store.list('agent')[0]!;
    await page.getByRole('button', { name: 'Cycle 1 · Thought generation 1', exact: true }).click();
    await page.getByText('Exactly what Self receives', { exact: true }).click();
    assert.ok((await page.locator('#content').innerText()).includes('self.arbitration_started'));
    assert.ok((await page.locator('#content').innerText()).includes('Cycle 1 · Thought generation 1'));
    // Legacy consolidation is a retained experiment; the Sleep dashboard owns current-profile learning.
    assert.ok(store.list('memory', agent.id).length);
    const firstMemory = store.list('memory', agent.id)[0]!;
    assert.ok(store.versions('memory', firstMemory.id).length);
    await app.consolidation.run(agent.id, 1, 4);
    assert.equal(store.list('part', agent.id).length, 7);
    // Current Part inspector exposes immutable versions and explicit researcher edits.
    await page.getByRole('button', { name: 'Part History', exact: true }).click();
    await page.locator('.part-list-item').first().click();
    await page.getByRole('button', { name: 'Raw Part inspector data', exact: true }).click();
    await page.getByRole('dialog').getByText('All Part versions', { exact: true }).click();
    assert.ok((await page.getByRole('dialog').innerText()).includes('version'));
    await page.getByRole('button', { name: 'Close information', exact: true }).click();
    await page.getByRole('button', { name: 'Edit perspective', exact: true }).click();
    await page.getByLabel('Mission / concern', { exact: true }).fill('Researcher adjusted concern');
    await page.getByRole('button', { name: 'Save researcher change', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.ok(store.list('part', agent.id).some(part => part.mission === 'Researcher adjusted concern'));
    await page.getByRole('button', { name: 'Logs', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Logs filter' }).fill('part.mutation_applied');
    assert.ok((await page.locator('#content').innerText()).includes('part.mutation_applied'));
    await page.screenshot({ path: '/private/tmp/prism-browser-workflow.png', fullPage: true });
    const persistedParts = store.list('part', agent.id);
    const persistedMemories = store.list('memory', agent.id);
    const previousPort = (server.address() as AddressInfo).port;
    await page.goto('about:blank');
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    store = new SqliteStore(dbPath); server = createResearchServer(new Application(store));
    server.listen(previousPort, '127.0.0.1'); await once(server, 'listening');
    await page.goto(`http://127.0.0.1:${previousPort}`);
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
    assert.deepEqual(store.list('part', agent.id), persistedParts);
    assert.deepEqual(store.list('memory', agent.id), persistedMemories);
    assert.deepEqual(errors, []);
  } finally {
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousOpenAIKey;
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
