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
test('Identity popup creates, edits, searches, duplicates and deletes versioned traits', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const agent = app.createAgent('Trait Agent');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on('pageerror', cause => errors.push(cause.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Identity', exact: true }).click();
    await page.getByRole('button', { name: 'Add trait', exact: true }).click();
    const traitDialog = page.getByRole('dialog', { name: 'New Identity trait', exact: true });
    const beforeAutofill = store.get('identity', agent.id);
    await traitDialog.getByLabel('Answer', { exact: true }).fill('My existing answer draft.');
    const readGuidance = async (): Promise<string> => {
      const activeTrait = page.locator('#identity-trait-dialog');
      await activeTrait.getByRole('button', { name: 'Show answer guidance', exact: true }).click();
      const info = page.getByRole('dialog', { name: 'Identity answer guidance', exact: true });
      const text = info.locator('pre').filter({ hasText: 'General answer rules' });
      await text.waitFor();
      const guidance = await text.innerText();
      await info.getByRole('button', { name: 'Close answer guidance', exact: true }).click();
      await info.waitFor({ state: 'hidden' });
      return guidance;
    };
    const generalGuidance = await readGuidance();
    assert.match(generalGuidance, /Write it in the first person/);
    assert.match(generalGuidance, /environment and life as THEY view them/);
    assert.match(generalGuidance, /written dialog of the character vs spoken dialog/);

    await traitDialog.getByRole('button', { name: 'Autofill', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose an Identity question', exact: true });
    await picker.locator('.identity-question-option').last().waitFor();
    assert.equal(await picker.locator('.identity-question-option').count(), 112);
    assert.equal(await picker.getByRole('heading', { level: 4 }).count(), 5);
    await picker.getByRole('searchbox', { name: 'Search example questions' }).fill('implied-speech');
    const exampleQuestion = 'Am I able to understand and use implied or indirect speech effectively?';
    await picker.getByRole('button', { name: exampleQuestion, exact: true }).click();
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await traitDialog.getByLabel('Question', { exact: true }).inputValue(), exampleQuestion);
    assert.equal(await traitDialog.getByLabel('Keywords (one per line)', { exact: true }).inputValue(), 'implied-speech\nindirect-speech\npragmatics\nspeech');
    assert.equal(await traitDialog.getByLabel('Answer', { exact: true }).inputValue(), 'My existing answer draft.');
    assert.equal(await readGuidance(), generalGuidance);
    assert.equal(await traitDialog.locator('.identity-answer-guidance').count(), 0);
    assert.deepEqual(store.get('identity', agent.id), beforeAutofill);

    assert.equal(await traitDialog.getByLabel('Trait role', { exact: true }).inputValue(), 'self_definition');
    await traitDialog.getByRole('button', { name: 'Autofill', exact: true }).click();
    await picker.locator('.identity-question-option').last().waitFor();
    await picker.getByRole('searchbox', { name: 'Search example questions' }).fill('Family:');
    await picker.getByRole('button', { name: 'Family: Who are my family members, what are their names, ages, and relationships to me, and what opinions do I have of them?', exact: true }).click();
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await traitDialog.getByLabel('Trait role', { exact: true }).inputValue(), 'autobiographical');

    await traitDialog.getByLabel('Question', { exact: true }).fill('What keeps me curious?');
    await traitDialog.getByLabel('Answer', { exact: true }).fill('Learning with other people.');
    await traitDialog.getByLabel('Keywords (one per line)', { exact: true }).fill('discovery\nconnection');
    await traitDialog.getByRole('button', { name: 'Create trait', exact: true }).click();
    await page.getByRole('button', { name: 'What keeps me curious?', exact: true }).click();
    const editTraitDialog = page.getByRole('dialog', { name: 'Identity trait', exact: true });
    await editTraitDialog.locator('time').waitFor();
    assert.equal(await readGuidance(), generalGuidance);
    assert.equal(await editTraitDialog.getByRole('button', { name: 'Autofill', exact: true }).count(), 0);
    const originalTrait = store.get('identity', store.list('agent')[0]!.id).traits.at(-1)!;
    await editTraitDialog.getByLabel('Answer', { exact: true }).fill('Asking thoughtful questions.');
    await editTraitDialog.getByRole('button', { name: 'Save trait', exact: true }).click();
    await editTraitDialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'What keeps me curious?', exact: true }).click();
    await editTraitDialog.getByRole('button', { name: 'Duplicate trait', exact: true }).click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#identity-trait-dialog');
      return dialog?.querySelector('time') && !dialog.querySelector<HTMLButtonElement>('button')?.disabled;
    });
    // A duplicate opens for immediate editing and retains the saved content.
    await editTraitDialog.getByLabel('Question', { exact: true }).fill('What helps me discover?');
    await editTraitDialog.getByRole('button', { name: 'Save trait', exact: true }).click();
    await page.getByRole('button', { name: 'What helps me discover?', exact: true }).waitFor();
    const copiedTrait = store.get('identity', store.list('agent')[0]!.id).traits.at(-1)!;
    assert.notEqual(copiedTrait.id, originalTrait.id);
    assert.equal(copiedTrait.answer, 'Asking thoughtful questions.');
    assert.equal(copiedTrait.role, 'autobiographical');
    await page.getByRole('searchbox', { name: 'Search Identity traits', exact: true }).fill('discovery');
    assert.equal(await page.locator('.identity-trait').count(), 2);
    await page.getByRole('button', { name: 'What helps me discover?', exact: true }).click();
    await editTraitDialog.getByRole('button', { name: 'Delete trait', exact: true }).click();
    await editTraitDialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'What keeps me curious?', exact: true }).waitFor();
    assert.equal(store.get('identity', store.list('agent')[0]!.id).traits.some(trait => trait.id === copiedTrait.id), false);


    assert.equal(store.get('identity', agent.id).traits.find(trait => trait.id === originalTrait.id)!.createdAt, originalTrait.createdAt);
    await page.reload();
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Identity', exact: true }).click();
    await page.getByRole('button', { name: 'What keeps me curious?', exact: true }).click();
    assert.equal(await page.getByRole('dialog').getByLabel('Answer', { exact: true }).inputValue(), 'Asking thoughtful questions.');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('Identity auto-fill wizard explains replacement and offers clarification radios without generating answers', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const agent = app.createAgent('Authoring Agent');
  const before = store.get('identity', agent.id);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    // Fixture only: neither clarification nor answer generation calls an external model.
    await page.route('**/identity-authoring/clarify', async route => {
      assert.deepEqual(route.request().postDataJSON(), { name: 'Sherlock Holmes' });
      const result = { question: 'Which Sherlock Holmes?', options: [
        { label: 'Original books', description: 'Arthur Conan Doyle’s Victorian detective.' },
        { label: 'BBC series', description: 'The modern London detective portrayed by Benedict Cumberbatch.' },
      ] };
      app.store.saveIdentityAuthoringSettings(agent.id, { name: 'Sherlock Holmes', ...result, selectedVersion: result.options[0]!.description });
      await route.fulfill({ json: result });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Identity', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Inspect Identity history', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Model Identity on a person or character', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Identity auto-fill wizard', exact: true });
    await dialog.getByRole('button', { name: 'About Identity auto-fill', exact: true }).click();
    const info = page.getByRole('dialog', { name: 'About Identity auto-fill', exact: true });
    assert.match(await info.innerText(), /replaces all current Identity traits/);
    assert.match(await info.innerText(), /removing custom questions and edited answers/);
    assert.equal(await info.locator('pre').count(), 0);
    await info.getByRole('button', { name: 'Close auto-fill help', exact: true }).click();
    assert.equal(await dialog.getByLabel('Reference type', { exact: true }).count(), 0);
    await dialog.getByLabel('Person or character name', { exact: true }).fill('Sherlock Holmes');
    await dialog.getByLabel('Person or character name', { exact: true }).press('Enter');
    await dialog.getByRole('radio').last().waitFor();
    assert.equal(await dialog.getByRole('radio').count(), 2);
    assert.equal(await dialog.getByRole('radio').first().isChecked(), true);
    await dialog.getByRole('radio').last().check();
    await dialog.getByLabel('Additional details', { exact: true }).fill('Focus on his curiosity.');
    assert.equal(await dialog.getByRole('button', { name: 'Generate', exact: true }).isEnabled(), true);
    const checklist = dialog.getByRole('group', { name: 'Questions to answer', exact: true });
    await checklist.getByRole('checkbox').last().waitFor();
    assert.equal(await checklist.getByRole('checkbox').count(), 112);
    await dialog.getByRole('button', { name: 'Select none', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Generate', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Select all', exact: true }).click();
    assert.equal(await checklist.locator('input:checked').count(), 112);
    await dialog.getByRole('button', { name: 'Select none', exact: true }).click();
    await checklist.getByRole('checkbox').first().check();
    await page.route('**/identity-authoring/generate', async route => {
      assert.deepEqual(route.request().postDataJSON().questionIds, ['cognition-01']);
      assert.equal(route.request().postDataJSON().deleteExistingTraits, false);
      await route.fulfill({ json: before });
    });
    const deleteExisting = dialog.getByRole('checkbox', { name: 'Delete All Existing Traits — Warning Cannot Be Undone', exact: true });
    assert.equal(await deleteExisting.isChecked(), true);
    await deleteExisting.uncheck();
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Identity', exact: true }).click();
    await page.getByRole('button', { name: 'Model Identity on a person or character', exact: true }).click();
    assert.equal(await dialog.getByLabel('Person or character name', { exact: true }).inputValue(), 'Sherlock Holmes');
    assert.equal(await dialog.getByRole('radio').count(), 2);
    assert.equal(await dialog.getByRole('radio').last().isChecked(), true);
    assert.deepEqual(store.get('identity', agent.id), before);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
