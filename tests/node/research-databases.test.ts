import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';

async function fixture() {
  const mainStore = new SqliteStore(':memory:');
  const researchStore = new SqliteStore(':memory:');
  const main = new Application(mainStore); const research = new Application(researchStore);
  const mainAgent = main.createAgent('Main bot');
  const bot = research.createAgent('Experimental bot');
  await research.message(bot.id, 'A saved experimental conversation.', 'Scenario observer', 'saved-run');
  const server = createResearchServer(main, process.cwd(), [{ id: 'saved-experiment', label: 'Saved experiment', app: research }]);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { mainStore, researchStore, mainAgent, bot, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); mainStore.close(); researchStore.close(); } };
}

test('research catalog and prefixed operations preserve original database ownership and event streams', async () => {
  const f = await fixture();
  try {
    const catalog = await (await fetch(`${f.base}/api/agent-catalog`)).json() as { id: string; databaseId: string }[];
    assert.deepEqual(catalog.map(agent => [agent.id, agent.databaseId]), [[f.mainAgent.id, ''], [f.bot.id, 'saved-experiment']]);
    const prefix = `${f.base}/api/research/saved-experiment`;
    const snapshot = await (await fetch(`${prefix}/agents/${f.bot.id}`)).json() as { cycles: { threadId: string }[] };
    assert.equal(snapshot.cycles[0]!.threadId, 'saved-run');
    const renamed = await fetch(`${prefix}/agents/${f.bot.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Inspected experimental bot' }) });
    assert.equal(renamed.status, 200);
    assert.equal(f.researchStore.get('agent', f.bot.id).name, 'Inspected experimental bot');
    assert.equal(f.mainStore.get('agent', f.mainAgent.id).name, 'Main bot');
    assert.equal(f.mainStore.cycles(f.mainAgent.id).length, 0);
    assert.equal((await fetch(`${f.base}/api/research/unknown/agents`)).status, 404);
    const stream = await fetch(`${prefix}/agents/${f.bot.id}/stream`);
    const reader = stream.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.ok(first.includes('cycle.completed'));
    await reader.cancel();
  } finally { await f.close(); }
});

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('normal Agent selector opens experimental chat, Brain and components and restores database selection', { skip: !existsSync(executable) }, async () => {
  const f = await fixture();
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(f.base);
    await page.getByRole('button', { name: /Select Agent/ }).click();
    await page.getByRole('option', { name: /Experimental bot/ }).click();
    await page.getByRole('heading', { name: 'Experimental bot', exact: true }).waitFor();
    await page.getByText('Scenario observer: A saved experimental conversation.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('ontoagentic-database')), 'saved-experiment');
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Part History', exact: true }).click();
    await page.locator('.part-list-item').first().waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Experimental bot', exact: true }).waitFor();
    await page.getByText('Scenario observer: A saved experimental conversation.', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Select Agent/ }).click();
    await page.getByRole('option', { name: /Main bot/ }).click();
    await page.getByRole('heading', { name: 'Main bot', exact: true }).waitFor();
    assert.equal(f.mainStore.cycles(f.mainAgent.id).length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await f.close(); }
});
