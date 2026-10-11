import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Chrome Simulation Tests runs sourced affect experiment and exposes honest preserved evidence', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Affect experiment source');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Simulation Tests', exact: true }).click();
    const hypothesis = page.getByRole('combobox', { name: 'Simulation hypothesis' });
    const options = await hypothesis.locator('option').evaluateAll(values => values.map(value => (value as HTMLOptionElement).value));
    assert.ok(options.includes('affect-instrumental-unpleasant')); assert.ok(options.includes('affect-relational-plurality'));
    await hypothesis.selectOption('affect-meaningful-retention');
    await page.getByRole('combobox', { name: 'Simulation inference mode' }).selectOption('fixture');
    await page.getByRole('button', { name: 'Run simulation test', exact: true }).click();
    await page.getByRole('heading', { name: 'Meaningful sadness without new learning · completed', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Affect exploration evidence', exact: true }).waitFor();
    await page.getByText('Known loss · affect offers, selection and revisions', { exact: true }).click();
    const panel = page.locator('.simulation-tests'); assert.ok((await panel.innerText()).includes('Fixture evidence only'));
    assert.ok((await panel.innerText()).includes('inconclusive'));
    await panel.getByRole('button', { name: 'Inspect affect source cycle', exact: true }).filter({ visible: true }).first().click();
    await page.getByText('Experienced WorldState', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Close inspector' }).click();
    const run = listSimulationRuns(app)[0]!; assert.notEqual(run.agentId, source.id);
    assert.equal(run.measures[0]!.outcome, 'inconclusive');
    await page.reload(); await page.getByRole('button', { name: 'Simulation Tests', exact: true }).click();
    await page.getByRole('heading', { name: 'Meaningful sadness without new learning · completed', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
