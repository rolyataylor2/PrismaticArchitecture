import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { OpenAIProvider } from '../../packages/providers/src/openai.js';
import { createResearchServer } from '../../apps/server/src/server.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('component menus create reviewed records and filter/sort lists through floating menus', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent();
  const part = store.list('part', agent.id)[0]!;
  const cycle = store.startCycle(agent.id); store.saveCycle({ ...cycle, status: 'completed' });
  class Author extends OpenAIProvider {
    override async author<T>(schema: z.ZodType<T>): Promise<T> {
      return schema.parse({ text: 'I felt encouraged to ask.', summary: 'Encouraged curiosity', context: ['My question was invited'], horizon: 'Next reply', confidence: 0.65 });
    }
  }
  app.researcherAuthoringProvider = () => new Author('fixture', 'fixture');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Disposition Lens', exact: true }).count(), 0);
    const navigate = async (name: string) => { await page.getByRole('button', { name, exact: true }).click(); };
    await navigate('Primitives');
    await page.getByRole('button', { name: 'Create primitive', exact: true }).waitFor();
    // Shared popup shell: padding is safe, outside clicks cancel, Escape removes drafts.
    await page.getByRole('button', { name: 'Create primitive', exact: true }).click();
    const primitiveDialog = page.locator('dialog.app-dialog');
    await primitiveDialog.waitFor();
    assert.equal(await primitiveDialog.locator(':scope > .modal-header').count(), 1);
    assert.equal(await primitiveDialog.locator(':scope > .modal-body').count(), 1);
    const bounds = await primitiveDialog.boundingBox();
    assert.ok(bounds);
    await page.mouse.click(bounds.x + 2, bounds.y + 2);
    assert.equal(await primitiveDialog.isVisible(), true);
    await page.mouse.click(2, 2);
    await primitiveDialog.waitFor({ state: 'detached' });
    await navigate('Identity');
    await page.getByRole('button', { name: 'Add trait', exact: true }).click();
    await page.locator('dialog.app-dialog').waitFor();
    await page.mouse.click(2, 2);
    await page.locator('dialog.app-dialog').waitFor({ state: 'detached' });
    await navigate('Part History');
    await page.getByRole('button', { name: 'Create Part', exact: true }).click();
    await page.getByRole('dialog', { name: 'Create a Part', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog.app-dialog').waitFor({ state: 'detached' });
    await navigate('Primitives');
    const dimensions = await page.locator('.component-header').evaluate(header => {
      const main = document.querySelector('main')!.getBoundingClientRect();
      const bounds = header.getBoundingClientRect();
      const controls = header.querySelector('.component-header-tools')!.getBoundingClientRect();
      const actions = header.querySelector('.component-header-actions')!.getBoundingClientRect();
      return { width: bounds.width, mainWidth: main.width, left: bounds.left, mainLeft: main.left, controlsTop: controls.top, actionsTop: actions.top };
    });
    assert.equal(dimensions.width, dimensions.mainWidth); assert.equal(dimensions.left, dimensions.mainLeft);
    assert.equal(dimensions.controlsTop, dimensions.actionsTop);
    const headerHeight = await page.locator('.component-header').evaluate(header => header.getBoundingClientRect().height);
    for (const menu of ['Identity', 'Dispositions', 'Memories', 'Part History', 'Predictions', 'Analytics', 'Logs']) {
      await navigate(menu);
      assert.equal(await page.locator('.component-header').evaluate(header => header.getBoundingClientRect().height), headerHeight);
    }
    const titleAlignment = await page.locator('.component-header h2').evaluate(title => ({ text: getComputedStyle(title).textAlign, vertical: getComputedStyle(title).alignSelf }));
    assert.equal(titleAlignment.text, 'left'); assert.equal(titleAlignment.vertical, 'center');
    await navigate('Primitives');
    await page.getByRole('button', { name: 'Create primitive', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Create primitive', exact: true }).textContent(), '+');
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const filter = page.getByRole('dialog', { name: 'Filter', exact: true });
    await filter.getByLabel('Family', { exact: true }).selectOption('action_tendency');
    assert.ok(await page.locator('.primitive-card').count() < 13);
    await page.keyboard.press('Escape'); assert.equal(await filter.isVisible(), false);
    await navigate('Dispositions');
    await page.getByRole('button', { name: 'Create disposition', exact: true }).click();
    const disposition = page.getByRole('dialog', { name: 'Create disposition', exact: true });
    await disposition.getByLabel('Name', { exact: true }).fill('Welcomed curiosity');
    await disposition.getByLabel('Concern', { exact: true }).fill('I want to explore safely');
    await disposition.getByLabel('Cues (one per line)', { exact: true }).fill('An invitation');
    await disposition.getByRole('button', { name: 'Create disposition', exact: true }).click();
    await disposition.waitFor({ state: 'hidden' }); assert.equal(store.list('disposition', agent.id).length, 1);
    // Long disposition text must shrink inside the panel at desktop and narrow widths.
    await page.locator('.disposition-name').evaluate(element => { element.textContent = 'Long disposition name '.repeat(40); });
    await page.locator('.disposition-cues').evaluate(element => { element.textContent = 'Long attention cue '.repeat(100); });
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Dispositions overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('searchbox', { name: 'Search dispositions' }).fill('no match');
    for (const name of ['Temporary Prediction-Bound Dispositions', 'Persistent dispositions']) {
      await page.getByRole('region', { name, exact: true }).getByText('No matching dispositions.', { exact: true }).waitFor();
    }
    await page.getByRole('region', { name: 'Temporary attention', exact: true }).getByText('No matching temporary attention.', { exact: true }).waitFor();
    await navigate('Part History');
    assert.equal(await page.getByRole('button', { name: 'Generate Parts', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Sort', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sort', exact: true }).getByLabel('Sort by', { exact: true }).selectOption('name');
    await page.keyboard.press('Escape');
    const names = await page.locator('.part-list-name').allTextContents();
    assert.ok(names.length > 0); assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
    for (const kind of ['memory', 'prediction'] as const) {
      await navigate(kind === 'memory' ? 'Memories' : 'Predictions');
      const smartCreate = page.getByRole('button', { name: `Smart create ${kind}`, exact: true });
      assert.equal(await smartCreate.textContent(), '🧠');
      assert.equal(await smartCreate.evaluate(button => getComputedStyle(button).filter), 'grayscale(1)');
      await smartCreate.click();
      const dialog = page.getByRole('dialog', { name: `Smart create ${kind}`, exact: true });
      await dialog.getByLabel('Describe what to create', { exact: true }).fill('Encouraged to ask');
      await dialog.getByRole('button', { name: 'Generate draft', exact: true }).click();
      await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('dialog[open] textarea')?.value === 'I felt encouraged to ask.');
      assert.equal(store.list(kind, agent.id).length, 0);
      await dialog.getByLabel('Owning Part', { exact: true }).selectOption(part.id);
      await dialog.getByLabel('Source cycle', { exact: true }).selectOption(cycle.id);
      await dialog.getByRole('button', { name: `Create ${kind}`, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(store.list(kind, agent.id).length, 1);
      await page.getByRole('button', { name: 'Filter', exact: true }).click();
      await page.getByRole('dialog', { name: 'Filter', exact: true }).getByLabel('Origin', { exact: true }).selectOption(part.id);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
