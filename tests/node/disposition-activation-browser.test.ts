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
test('activation history renders exact source judgments, filters threads and opens evidence on desktop and mobile', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const agent = app.createAgent('Activation history research');
  store.save('disposition', { id: 'birds', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Delight In Birds',
    concern: 'Notice birdsong', scope: 'birdsong', cues: ['bird chirps'], prerequisites: [], threshold: 2,
    memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0,
  { origin: 'researcher_edit', reason: 'Explicit chart rendering starting condition', sourceIds: [] });
  await app.message(agent.id, 'A bird chirps.', 'observer', 'forest');
  await app.message(agent.id, 'A bird chirps nearby.', 'observer', 'garden');
  store.save('prediction', { id: 'attention-display', agentId: agent.id, partId: store.list('part', agent.id)[0]!.id,
    version: 1, schemaVersion: 1, expectation: 'A bird may return',
    capsule: { interpretation: 'A bird was heard.', details: [], entities: [], activation: 2, spike: 0, sourceIds: [] },
    confidence: .5, horizon: 'Later', evaluateAfterCycle: null, createdCycle: store.cycles(agent.id)[0]!.id,
    status: 'open', memoryId: null, evaluation: null, attention: [{ target: 'Returning birds', cues: ['More birdsong'] }] }, 0,
    { origin: 'researcher_edit', reason: 'Explicit temporary attention display fixture', sourceIds: [] });
  store.save('disposition', { ...store.get('disposition', 'birds'), id: 'quiet', name: 'Quiet Curiosity', temporary: true, sourcePredictionId: 'attention-display' }, 0,
    { origin: 'researcher_edit', reason: 'Empty chart condition without fabricated measurements', sourceIds: [] });
  store.save('disposition', { ...store.get('disposition', 'quiet'), id: 'returning-birds', name: 'Returning birds' }, 0,
    { origin: 'researcher_edit', reason: 'Second disposition with the same source prediction', sourceIds: [] });
  store.save('disposition', { ...store.get('disposition', 'quiet'), id: 'expired-birds', name: 'Expired bird concern', active: false }, 0,
    { origin: 'researcher_edit', reason: 'Ended temporary disposition visibility fixture', sourceIds: [] });
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Dispositions', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect Quiet Curiosity', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Inspect Expired bird concern', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const filterMenu = page.getByRole('dialog', { name: 'Filter', exact: true });
    const showExpired = filterMenu.getByRole('checkbox', { name: 'Show expired dispositions' });
    assert.equal(await showExpired.isChecked(), false);
    await showExpired.check();
    await page.getByRole('button', { name: 'Inspect Expired bird concern', exact: true }).waitFor();
    await filterMenu.getByRole('button', { name: 'Reset filters', exact: true }).click();
    assert.equal(await showExpired.isChecked(), false);
    assert.equal(await page.getByRole('button', { name: 'Inspect Expired bird concern', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    const rows = page.locator('.disposition-list > [data-kind]:not([data-kind="self"])');
    const kinds = await rows.evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.kind));
    assert.deepEqual(kinds, ['persistent', 'prediction', 'attention']);
    assert.equal(await rows.nth(0).evaluate(element => getComputedStyle(element).borderTopStyle), 'solid');
    const group = page.locator('.disposition-prediction-group');
    assert.equal(await group.count(), 1);
    assert.equal(await group.locator('.disposition-row').count(), 2);
    assert.equal(await group.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await group.evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(255, 255, 255)');
    assert.equal(await group.locator('.disposition-row').first().evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed');
    assert.match(await group.locator('.disposition-row').first().evaluate(element => getComputedStyle(element).borderTopColor), /0\.45/);
    assert.ok(Math.abs((await group.boundingBox())!.height - (await rows.nth(0).boundingBox())!.height) <= 1);
    await group.getByRole('button', { name: 'A bird may return', exact: true }).click();
    await page.getByRole('dialog').last().waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await rows.nth(2).evaluate(element => getComputedStyle(element).borderTopStyle), 'none');
    await page.screenshot({ path: '/tmp/prism-dispositions-unified-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '/tmp/prism-dispositions-unified-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Inspect Delight In Birds', exact: true }).click();
    const chart = page.getByRole('region', { name: 'Historical disposition activation' });
    await chart.getByRole('heading', { name: 'Activation history' }).waitFor();
    assert.equal(await chart.locator('svg circle').count(), 2);
    await chart.getByRole('combobox', { name: 'Activation history thread' }).selectOption(JSON.stringify('forest'));
    assert.equal(await chart.locator('svg circle').count(), 1);
    await chart.getByText('Exact judgments and source evidence', { exact: true }).click();
    assert.equal(await chart.locator('tbody tr').count(), 1);
    await page.screenshot({ path: '/tmp/prism-activation-history-desktop.png', fullPage: true });
    await chart.getByRole('button', { name: 'Cycle 1', exact: true }).click();
    await page.getByText('Experienced WorldState', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Asynchronous activity', exact: true }).waitFor();
    assert.ok(await page.getByText('Self choice', { exact: true }).count());
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-activation-history-mobile.png', fullPage: true });
    assert.equal(await chart.locator('svg').isVisible(), true);
    await page.getByRole('button', { name: 'Dispositions', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect Quiet Curiosity', exact: true }).click();
    await page.getByText('No recorded activation assessments for this disposition.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Perspective History', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Inspect disposition: Quiet Curiosity', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByText('No Part has formed yet.', { exact: true }).waitFor();
    assert.equal(await page.locator('.part-version-star[data-version]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Previous disposition version', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Next disposition version', exact: true }).isDisabled(), true);
    await page.screenshot({ path: '/tmp/prism-disposition-without-part-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); store.close(); }
});
