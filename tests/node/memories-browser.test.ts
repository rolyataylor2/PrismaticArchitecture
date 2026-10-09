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
test('Memories defaults to access/recent rankings, restores them on clearing search, searches both ways, displays complete compact rows and supports versioned inspection/edit/delete', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent('Memory browser');
  const part = store.list('part', agent.id)[0]!;
  const text = ('I remember a warm welcome and a kind smile. ' + 'I felt safe enough to share my story and ask questions. '.repeat(12)).trim();
  store.save('memory', { id: 'browser_memory', agentId: agent.id, partId: part.id, version: 1, schemaVersion: 1,
    gist: 'A warm welcome', content: text, context: ['A sunny afternoon', 'I felt heard'], ancestorIds: [], predictionId: null, createdCycle: 'fixture' }, 0,
    { origin: 'researcher_edit', reason: 'Browser fixture', sourceIds: [] });
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    await page.getByRole('region', { name: 'Most accessed memories', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Most recent memories', exact: true }).waitFor();
    assert.equal(await page.locator('.memory-search-result').count(), 2);
    assert.equal(await page.getByText(text, { exact: true }).count(), 2);
    const query = page.getByRole('searchbox', { name: 'Search memories' });
    await query.fill('warm welcome');
    await page.getByRole('button', { name: 'Vector search', exact: true }).click();
    const row = page.locator('.memory-search-result'); await row.waitFor();
    assert.equal(await row.locator('.memory-result-text').textContent(), text);
    const dimensions = await row.evaluate(element => {
      const body = element.querySelector<HTMLElement>('.memory-result-text')!;
      const date = element.querySelector<HTMLElement>('time')!;
      return { height: body.getBoundingClientRect().height, padding: getComputedStyle(element).paddingTop,
        textColor: getComputedStyle(body).color, dateColor: getComputedStyle(date).color,
        clipped: body.scrollHeight > body.clientHeight, order: Array.from(element.children).map(child => child.className) };
    });
    assert.ok(dimensions.height > 24); assert.equal(dimensions.padding, '6px'); assert.equal(dimensions.clipped, false);
    assert.notEqual(dimensions.textColor, dimensions.dateColor);
    assert.deepEqual(dimensions.order, ['memory-result-date', 'memory-result-text', 'memory-result-activation', 'part-record-info']);
    await query.fill('');
    await page.getByRole('region', { name: 'Most recent memories', exact: true }).waitFor();
    assert.equal(await page.locator('.memory-search-result').count(), 2);
    await query.fill('warm welcome');
    await page.getByRole('button', { name: 'JEV search', exact: true }).click();
    await page.locator('.memory-result-activation[title="JEV memory relevance (0–1)"]').waitFor();
    assert.equal(await row.locator('.memory-result-activation').textContent(), '1.00');
    await page.screenshot({ path: '/tmp/prism-memories-page.png', fullPage: true });
    await page.setViewportSize({ width: 520, height: 900 });
    assert.equal(await row.locator('.memory-result-text').evaluate(element => element.scrollHeight > element.clientHeight), false);
    await row.getByRole('button', { name: 'Memory information: A warm welcome', exact: true }).click();
    let popup = page.getByRole('dialog', { name: 'Memory information', exact: true }); await popup.waitFor();
    await popup.getByText('All memory data', { exact: true }).click();
    assert.ok((await popup.locator('pre').last().textContent())?.includes('browser_memory'));
    await popup.getByRole('button', { name: 'Edit memory', exact: true }).click();
    await popup.getByLabel('Memory text', { exact: true }).fill('I remember a warm welcome differently now.');
    await popup.getByRole('button', { name: 'Save memory', exact: true }).click();
    popup = page.getByRole('dialog', { name: 'Memory information', exact: true });
    await popup.getByText('I remember a warm welcome differently now.', { exact: true }).waitFor();
    assert.equal(store.get('memory', 'browser_memory').version, 2);
    assert.equal(store.versions('memory', 'browser_memory')[0]!.state.content, text);
    await popup.getByRole('button', { name: 'Delete memory', exact: true }).click();
    await page.getByText('Memory deleted.', { exact: true }).waitFor();
    assert.equal(store.get('memory', 'browser_memory').deleted, true);
    assert.equal(store.versions('memory', 'browser_memory').length, 3);
    await page.getByRole('button', { name: 'JEV search', exact: true }).click();
    await page.getByText('No relevant memories found.', { exact: true }).waitFor();
    assert.equal(await page.locator('.memory-search-result').count(), 0);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
