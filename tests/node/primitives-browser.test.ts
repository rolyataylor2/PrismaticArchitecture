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
test('Primitives component edits prompts, creates items and resets individual and factory defaults', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent();
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Primitives', exact: true }).click();
    await page.getByRole('button', { name: 'Edit primitive', exact: true }).first().waitFor();
    assert.equal(await page.locator('.primitive-card').count(), 13);
    const search = page.getByRole('searchbox', { name: 'Filter primitives' });
    await search.fill('social contact');
    assert.equal(await page.locator('.primitive-card').count(), 1);
    await search.fill('');
    await page.getByRole('button', { name: 'Edit primitive', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.popup-header-actions').waitFor();
    const headerActions = await dialog.locator('.popup-header-actions > button').evaluateAll(buttons =>
      buttons.map(button => ({ label: button.getAttribute('aria-label'), title: button.getAttribute('title'), icon: Boolean(button.querySelector('svg')), text: button.textContent })));
    assert.deepEqual(headerActions.map(action => action.label), ['Reset options', 'Delete primitive', 'Close dialog']);
    for (const action of headerActions) {
      assert.equal(action.title, action.label); assert.equal(action.icon, true); assert.equal(action.text, '');
    }
    await dialog.getByRole('button', { name: 'Choose icon 🌱', exact: true }).click();
    const scale = dialog.getByRole('slider', { name: 'Surfacing threshold (0–4)', exact: true });
    await scale.focus(); await scale.press('End');
    for (let index = 0; index < 8; index++) await scale.press('ArrowLeft');
    assert.equal(await scale.inputValue(), '3.2');
    assert.equal(await dialog.locator('.form-scale-value').textContent(), '3.2');
    const positions = await scale.evaluate(input => {
      const element = input.closest('.form-setting')!;
      const copy = element.querySelector('.form-setting-copy')!.getBoundingClientRect();
      const control = element.querySelector('.form-setting-control')!.getBoundingClientRect();
      return { copy: copy.right, control: control.left, description: element.querySelector('.form-setting-description')?.textContent };
    });
    assert.ok(positions.control > positions.copy); assert.ok(positions.description);
    await dialog.getByRole('checkbox', { name: 'Allow this primitive to produce bids' }).uncheck();
    const bidPrompt = dialog.getByLabel('Bid production prompt', { exact: true });
    assert.equal(await bidPrompt.isVisible(), false);
    await dialog.getByRole('checkbox', { name: 'Allow this primitive to produce bids' }).check();
    assert.equal(await bidPrompt.isVisible(), true);
    await bidPrompt.fill('Preserve this draft across toggle changes.');
    await dialog.getByRole('checkbox', { name: 'Allow this primitive to produce bids' }).uncheck();
    assert.equal(await bidPrompt.isVisible(), false);
    assert.equal(await bidPrompt.inputValue(), 'Preserve this draft across toggle changes.');
    await dialog.getByLabel('Activation instructions', { exact: true }).fill('Appraise immediate novelty using supplied novelty sensitivity.');
    await dialog.getByLabel('Thought production prompt', { exact: true }).fill('A researcher edited thought instruction.');
    await dialog.getByRole('button', { name: 'Save primitive', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(store.primitiveSettings(agent.id).items[0]!.icon, '🌱');
    assert.equal(store.primitiveSettings(agent.id).items[0]!.bidsEnabled, false);
    assert.equal(store.primitiveSettings(agent.id).items[0]!.activationThreshold, 3.2);
    assert.equal(store.primitiveSettings(agent.id).items[0]!.activationPrompt, 'Appraise immediate novelty using supplied novelty sensitivity.');
    assert.equal(store.primitiveSettings(agent.id).items[0]!.thoughtPrompt, 'A researcher edited thought instruction.');
    assert.equal(await page.locator('.primitive-card').getByRole('button', { name: 'Delete primitive', exact: true }).count(), 0);
    assert.equal(await page.locator('.primitive-card').getByRole('button', { name: 'Reset primitive', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Edit primitive', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Reset options', exact: true }).click();
    await page.getByRole('dialog', { name: 'Reset options', exact: true }).getByRole('button', { name: 'Reset primitive', exact: true }).waitFor();
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/reset') && response.request().method() === 'POST'), page.getByRole('dialog', { name: 'Reset options', exact: true }).getByRole('button', { name: 'Reset primitive', exact: true }).click()]);
    await page.getByRole('button', { name: 'Create primitive', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create primitive', exact: true }).click();
    await dialog.getByLabel('Name', { exact: true }).fill('Simple comfort');
    await dialog.getByLabel('Aspects (one per line)', { exact: true }).fill('Notice gentle stimulation');
    await dialog.getByRole('button', { name: 'Save primitive', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(store.primitiveSettings(agent.id).items.length, 14);
    await page.getByRole('button', { name: 'Reset options', exact: true }).click();
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/reset-all') && response.request().method() === 'POST'), page.getByRole('button', { name: 'Reset primitives to defaults', exact: true }).click()]);
    await page.getByRole('button', { name: 'Edit primitive', exact: true }).nth(9).waitFor();
    assert.equal(store.primitiveSettings(agent.id).items.length, 13);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('Brain timeline shows implicit appraisals and mixed surfaced primitives alongside learned Parts', { skip: !existsSync(executable) }, async () => {
  const { MockDecisions, MockEmbeddings, MockReasoning } = await import('../../packages/providers/src/mock.js');
  class Decisions extends MockDecisions {
    mixed = false;
    override async score(input: Parameters<InstanceType<typeof MockDecisions>['score']>[0]) {
      return [...input.candidates.map(part => ({ partId: part.id, score: this.mixed ? 3 : 0 })),
        ...(input.primitives ?? []).map(primitive => ({ partId: primitive.id, score: this.mixed && ['primitive_2', 'primitive_4'].includes(primitive.id) ? 4 : 1 }))];
    }
    override async shouldPredict() { return false; }
  }
  const store = new SqliteStore(':memory:'); const decisions = new Decisions();
  const app = new Application(store, { decisions, reasoning: new MockReasoning(), embeddings: new MockEmbeddings() });
  const agent = app.createAgent(); store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: false });
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const send = async (text: string, count: number) => {
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.waitForFunction(expected => document.querySelectorAll('.cycle-status').length === expected, count);
    };
    await send('Quiet context.', 1);
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    await page.getByRole('heading', { name: 'Primitive appraisals · 0 surfaced', exact: true }).waitFor();
    assert.equal(await page.locator('.brain-timeline-dot').count(), 1);
    assert.equal(await page.locator('.brain-part').filter({ hasText: 'implicit · threshold' }).count(), 13);
    decisions.mixed = true;
    await page.getByRole('button', { name: 'Return to this chat thread', exact: true }).click();
    await send('Jenna suddenly screams and throws something.', 2);
    await page.getByRole('button', { name: 'View this thread’s Brain timeline', exact: true }).click();
    await page.getByRole('heading', { name: 'Primitive appraisals · 2 surfaced', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Activated Parts · thoughts (6)', exact: true }).waitFor();
    assert.equal(await page.locator('.brain-part').filter({ hasText: 'surfaced · threshold' }).count(), 2);
    assert.equal(await page.locator('.brain-timeline-dot').count(), 2);
    assert.equal(await page.getByRole('button', { name: 'Cycle 2 · Thought generation 1', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /Primitive thoughts/ }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
