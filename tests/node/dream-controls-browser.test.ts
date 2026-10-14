import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { startDream, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('dream controls, current task, console and consolidated filters work on desktop and mobile', { skip: !existsSync(executable), timeout: 90000 }, async () => {
  const store = new SqliteStore(':memory:'); let enter!: () => void; let release!: () => void; let first = true;
  const entered = new Promise<void>(resolve => { enter = resolve; }); const hold = new Promise<void>(resolve => { release = resolve; });
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      if (first && input.task === 'part_cognition') { first = false; enter(); await hold; }
      return super.constructed(input);
    }
  }
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  const source = app.createAgent('Dream controls source');
  const run = startDream(app, 'conversation-starters', 'configured', source.id, false, { enabled: false }); await entered;
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Dreams', exact: true }).click();
    const panel = page.locator('.research-dashboard');
    await panel.getByRole('button', { name: 'Pause dream', exact: true }).waitFor();
    await panel.locator('.rd-run-task').filter({ hasText: 'part cognition' }).waitFor();
    assert.equal(await panel.getByLabel('Experiment', { exact: true }).count(), 0);
    await panel.getByLabel('Find an experiment').fill('Starter dispositions in ordinary conversation');
    await panel.locator('[data-experiment-id="conversation-starters"]').click();
    await panel.getByRole('button', { name: 'Filter runs', exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Experiment overview', exact: true }).count(), 0);
    assert.equal(await panel.getByLabel('Run set', { exact: true }).count(), 0);
    await page.waitForTimeout(100);
    const desktopOffset = await panel.locator('.rd-directory').evaluate(nav => nav.querySelector('.rd-experiment.selected')!.getBoundingClientRect().top - nav.getBoundingClientRect().top);
    assert.ok(Math.abs(desktopOffset) <= 2, `Desktop selected experiment aligned at ${desktopOffset}px`);
    await page.screenshot({ path: '/tmp/prism-dream-controls-desktop.png', fullPage: true });
    await panel.getByRole('button', { name: 'Console', exact: true }).click();
    const console = page.getByRole('dialog', { name: 'Dream console', exact: true });
    await console.getByRole('log').getByText(/part cognition: started/).waitFor();
    assert.ok((await console.innerText()).includes('Stage 1: Simple greeting started'));
    await console.getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByRole('button', { name: 'Pause dream', exact: true }).click();
    assert.equal(listSimulationRuns(app).find(r => r.id === run.id)!.pauseRequested, true);
    release();
    await panel.getByRole('button', { name: 'Resume dream', exact: true }).waitFor();
    assert.equal(listSimulationRuns(app).find(r => r.id === run.id)!.status, 'paused');
    await page.screenshot({ path: '/tmp/prism-dream-controls-paused.png', fullPage: true });
    await panel.getByRole('button', { name: 'Resume dream', exact: true }).click();
    await panel.locator('.rd-run-state').filter({ hasText: 'completed' }).waitFor();
    assert.equal(listSimulationRuns(app).find(r => r.id === run.id)!.stages.length, 4);
    await panel.getByRole('button', { name: 'Filter runs', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Run filters', exact: true });
    await filters.getByLabel('Run set', { exact: true }).selectOption({ index: 1 });
    await filters.getByLabel('Run', { exact: true }).selectOption(run.id);
    await filters.getByLabel('Evidence basis', { exact: true }).selectOption('fixture');
    await filters.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await panel.getByText('INDIVIDUAL RUN', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Console', exact: true }).click();
    await console.getByRole('log').getByText('Stage 4 completed', { exact: true }).waitFor();
    await console.getByLabel('Search dream console').fill('continuation');
    await console.getByRole('log').getByText(/Explicit continuation/).waitFor();
    await console.getByLabel('Search dream console').fill('');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: '/tmp/prism-dream-console-mobile.png', fullPage: true });
    await console.getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByLabel('Find an experiment').fill('Longitudinal expectation, ambiguity and correction');
    await panel.locator('[data-experiment-id="gauntlet-longitudinal-evidence"]').click();
    await page.waitForTimeout(100);
    const offset = await panel.locator('.rd-directory').evaluate(nav => {
      const selected = nav.querySelector('.rd-experiment.selected')!;
      return selected.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    });
    assert.ok(Math.abs(offset) <= 2, `Selected experiment aligned at ${offset}px`);
    await page.screenshot({ path: '/tmp/prism-dream-sidebar-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { release(); await browser.close(); server.closeAllConnections(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
