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
test('prompt editor keeps invalid Twig drafts and displays errors before any override is saved', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Prismatic Agent name' }).fill('Twig Agent');
    await page.getByRole('button', { name: 'Create Prismatic Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Prompts', exact: true }).click();
    await page.getByRole('button', { name: /Select prompt/ }).click();
    await page.getByRole('menuitemradio', { name: 'Cog · Part formation → reflection → cognition', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Cog · Part formation → reflection → cognition', exact: true });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const heights: number[] = [];
      const titlePositions: number[] = [];
      const tabPositions: number[] = [];
      for (const name of ['Model & key', 'Activation', 'Delete Agent', 'Prompts']) {
        await page.getByRole('tab', { name, exact: true }).click();
        heights.push(await page.locator('.settings-header').evaluate(header => header.getBoundingClientRect().height));
        titlePositions.push(await page.locator('.settings-header').evaluate(header => header.querySelector('h2')!.getBoundingClientRect().top - header.getBoundingClientRect().top));
        tabPositions.push(await page.locator('.settings-header').evaluate(header => header.querySelector('.settings-tabs')!.getBoundingClientRect().top - header.getBoundingClientRect().top));
      }
      assert.equal(new Set(tabPositions).size, 1, `Settings tabs stay aligned at ${width}px`);
      assert.equal(new Set(titlePositions).size, 1, `Settings title stays aligned at ${width}px`);
      assert.equal(new Set(heights).size, 1, `Settings header height stays consistent at ${width}px`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await page.locator('.component-header').getByRole('tablist', { name: 'Settings', exact: true }).count(), 1);
    const headerToolbar = page.locator('.prompt-settings-toolbar .prompt-toolbar');
    assert.equal(await headerToolbar.count(), 1);
    const labels = await headerToolbar.locator('.prompt-toolbar-right > button').allTextContents();
    assert.deepEqual(labels, ['data', 'output', 'preview', 'view default', '(?)']);
    assert.deepEqual(await headerToolbar.locator(':scope > *').evaluateAll(children => children.slice(0, 6).map(child => child.className)), ['prompt-provider', 'prompt-action-menu prompt-selector', 'prompt-action-menu', 'prompt-action-menu', 'prompt-source muted', 'prompt-scope muted']);
    const widths = await headerToolbar.evaluate(toolbar => ({ dropdown: toolbar.querySelector('.prompt-selector')!.getBoundingClientRect().width, call: toolbar.querySelector('.prompt-provider')!.getBoundingClientRect().width }));
    assert.equal(widths.dropdown, 300); assert.equal(widths.call, 132);
    assert.equal(await headerToolbar.locator('.prompt-source').innerText(), 'Orig');
    assert.equal(await headerToolbar.locator('.prompt-scope').innerText(), '[glob]');
    const editor = panel.getByRole('textbox', { name: 'Prompt text' });
    const bounds = await editor.evaluate(editor => {
      const rect = editor.getBoundingClientRect();
      const main = document.querySelector('main')!.getBoundingClientRect();
      const toolbar = document.querySelector('.prompt-settings-toolbar')!.getBoundingClientRect();
      const header = document.querySelector('.component-header')!.getBoundingClientRect();
      return { top: rect.top, toolbarBottom: toolbar.bottom, toolbarTop: toolbar.top, headerBottom: header.bottom, bottom: rect.bottom, mainBottom: main.bottom, width: rect.width, mainWidth: main.width };
    });
    assert.equal(bounds.toolbarTop, bounds.headerBottom); assert.equal(bounds.top, bounds.toolbarBottom); assert.equal(bounds.bottom, bounds.mainBottom); assert.equal(bounds.width, bounds.mainWidth);
    const draft = '# Draft\n{% if part.name %}Missing end tag';
    await editor.fill(draft);
    await page.getByRole('button', { name: /Select prompt/ }).click();
    const tasks = await page.getByRole('menuitemradio').allTextContents();
    for (const label of ['Cog · Part formation → reflection → cognition', 'Cog · Part formation → reflection → cognition', 'Mem · Memory accessibility', 'Slp · Disposition learning', 'Cog · Self bid scoring']) assert.ok(tasks.includes(label));
    assert.equal(new Set(tasks).size, tasks.length);
    await page.getByRole('menuitemradio', { name: 'Cog · Self bid scoring', exact: true }).click();
    assert.ok((await headerToolbar.innerText()).includes('JEV · Score'));
    assert.equal(await headerToolbar.locator('.prompt-selector').evaluate(element => element.getBoundingClientRect().width), widths.dropdown);
    assert.equal(await headerToolbar.locator('.prompt-provider').evaluate(element => element.getBoundingClientRect().width), widths.call);
    await page.getByRole('button', { name: /Select prompt/ }).click();
    await page.getByRole('menuitemradio', { name: 'Cog · Part formation → reflection → cognition', exact: true }).click();
    assert.equal(await editor.inputValue(), draft);
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'data', exact: true }).click();
    assert.ok((await panel.innerText()).includes('{{ world }}'));
    assert.ok((await headerToolbar.innerText()).includes('LLM · Generation'));
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Information', exact: true }).click();
    const information = page.getByRole('dialog', { name: 'Cog · Part formation → reflection → cognition information', exact: true });
    assert.ok((await information.innerText()).includes('Parallel LLM calls'));
    await information.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Reset', exact: true }).click();
    assert.deepEqual(await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('menuitem').allTextContents(), ['Reset Agent to defaults', 'Reset Global prompts to defaults', 'Reset Every prompt to defaults']);
    await page.keyboard.press('Escape');
    for (const label of ['To Agent', 'Globally']) {
      await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Save', exact: true }).click();
      await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('menuitem', { name: label, exact: true }).click();
      await page.locator('.error-toast').last().getByRole('alert').waitFor();
      assert.match(await page.locator('.error-toast').last().getByRole('alert').innerText(), /Prompt not saved\. Invalid Twig prompt template:.*end tag/s);
      assert.equal(await editor.inputValue(), draft);
      assert.equal(await editor.getAttribute('aria-invalid'), 'true');
      assert.deepEqual(store.promptOverrides(), []);
    }
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Preview', exact: true }).click();
    const previewError = page.locator('.error-toast').filter({ hasText: 'Preview unavailable' }).last();
    await previewError.getByRole('alert').waitFor();
    assert.match(await previewError.innerText(), /Preview unavailable/);
    assert.equal(await panel.locator('.prompt-error').count(), 0);
    assert.equal(await editor.inputValue(), draft);
    await previewError.getByRole('button', { name: 'Dismiss error notification' }).click();
    assert.equal(await page.locator('.error-toast').filter({ hasText: 'Preview unavailable' }).count(), 0);
    const corrected = '# Draft\n{% if part.name %}Hello {{ part.name }}{% endif %}';
    await editor.fill(corrected);
    assert.equal(await editor.getAttribute('aria-invalid'), null);
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('menuitem', { name: 'To Agent', exact: true }).click();
    await page.getByText('Cog · Part formation → reflection → cognition saved for this Agent.', { exact: true }).waitFor();
    assert.equal(store.promptOverrides().length, 1);
    assert.equal(store.promptOverrides()[0]!.text, corrected);
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});

test('Preview opens the rendered unsaved draft with saved WorldState data', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const agent = app.createAgent('Preview Agent');
  const sample = await app.message(agent.id, 'I feel uncertain about sharing my thoughts.');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Prompts', exact: true }).click();
    await page.getByRole('button', { name: /Select prompt/ }).click();
    await page.getByRole('menuitemradio', { name: 'Cog · Part formation → reflection → cognition', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Cog · Part formation → reflection → cognition', exact: true });
    await panel.getByRole('textbox', { name: 'Prompt text' }).fill('Sample: {{ world.id }} / {{ identity.agentId }}');
    await page.locator('.prompt-settings-toolbar .prompt-toolbar').getByRole('button', { name: 'Preview', exact: true }).click();
    const popup = page.getByRole('dialog', { name: 'Compiled prompt preview', exact: true });
    await popup.waitFor();
    assert.equal(await popup.locator('pre').innerText(), `Sample: ${sample.cycle.worldId} / ${agent.id}`);
    assert.deepEqual(store.promptOverrides(), []);
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
