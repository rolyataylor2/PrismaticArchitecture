import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';

// Authored products exercise rendered provenance and omission judgments, not psychological validity.
class BrowserSynthesis extends MockReasoning {
  override async constructed(input: ConstructedInput): Promise<unknown> {
    if (input.task === 'memory_synthesis' && (input.memories?.length ?? 0) >= 2) return { reason: 'Authored browser synthesis fixture', synthesis: {
      sourceMemoryIds: input.memories!.map(memory => memory.id), replaceSourceMemoryIds: input.memories!.map(memory => memory.id),
      content: 'I used to assume helpful advice settled uncertainty; now I preserve its limits.', gist: 'Qualified remembered advice', context: ['advice'],
      detailDecisions: input.memories!.map(memory => ({ memoryId: memory.id, retainedMeaning: 'Helpful advice and continuing uncertainty',
        omittedDetails: ['Incidental wording'], reason: 'Peripheral wording is omitted only for this perspective.' })),
    } };
    return super.constructed(input);
  }
}
const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Agent Operations induces ordinary sleep and inspects preserved history on desktop and mobile', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store, { reasoning: new BrowserSynthesis(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() }); const agent = app.createAgent('Sleep dashboard source');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Sleep', exact: true }).click();
    const panel = page.locator('.sleep-dashboard'); await panel.getByRole('heading', { name: 'Sleep', exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).isDisabled(), true);
    for (const old of ['Experiments', 'Run', 'Dream', 'Part Formation', 'Part Split Evaluation', 'Part Merge Evaluation', 'Simulation Tests']) assert.equal(await page.getByRole('button', { name: old, exact: true }).count(), 0);
    store.save('disposition', { id: 'sleep-scope', agentId: agent.id, version: 1, schemaVersion: 1, name: 'Remember Helpful Advice', concern: 'Notice helpful advice', cues: ['conversation'], scope: 'conversation', prerequisites: [], threshold: 0, memoryIds: [], sourcePredictionId: null, temporary: false, active: true }, 0, { origin: 'seed', reason: 'Browser scope fixture', sourceIds: [] });
    await app.message(agent.id, 'A friend listened to my uncertainty and offered to meet again.', 'friend', 'sleep-source');
    const cyclesBefore = store.cycles(agent.id).length;
    await page.reload(); await page.getByRole('button', { name: 'Sleep', exact: true }).click();
    const interrupted = store.cycles(agent.id).at(-1)!;
    store.saveCycle({ ...interrupted, status: 'running' });
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.getByText('A cognitive cycle is recorded as running. Wait for it to finish; an interrupted cycle requires recovery before sleep.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).isDisabled(), true);
    app.recoverCycle(interrupted.id, 'Authored interrupted-cycle recovery fixture');
    store.saveCycle(interrupted);
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.sleep-dashboard .rd-primary')?.disabled);
    await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Induce sleep cycle', exact: true });
    await dialog.waitFor(); assert.equal(store.consolidations(agent.id).length, 0, 'Opening confirmation does not start sleep');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    assert.equal(store.consolidations(agent.id).length, 0, 'Canceling confirmation leaves no sleep run');
    await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).click();
    assert.equal(await dialog.evaluate(element => element.classList.contains('app-dialog')), true);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).waitFor();
    await dialog.getByLabel('From cognitive cycle').click();
    assert.equal(await dialog.isVisible(), true, 'Clicking inside preserves the popup');
    await page.mouse.click(5, 5); await dialog.waitFor({ state: 'detached' });
    assert.equal(store.consolidations(agent.id).length, 0, 'Backdrop dismissal leaves no sleep run');
    await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).click();
    const synthesis = dialog.getByLabel('Create consolidated memories per disposition');
    const detailPolicy = dialog.getByLabel('Memory detail policy');
    const guidance = dialog.getByLabel('Additional synthesis guidance (optional)');
    assert.equal(await detailPolicy.inputValue(), 'preserve_details'); assert.equal(await detailPolicy.isDisabled(), true);
    const replacement = dialog.getByLabel('Replace source memories in this disposition’s routine recall');
    assert.equal(await synthesis.isChecked(), false); assert.equal(await replacement.isChecked(), false);
    assert.equal(await replacement.isDisabled(), true);
    await synthesis.check(); await replacement.check(); await synthesis.uncheck();
    assert.equal(await replacement.isChecked(), false); assert.equal(await replacement.isDisabled(), true);
    await page.screenshot({ path: '/tmp/prism-sleep-options-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/prism-sleep-options-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.getByLabel('From cognitive cycle').fill('2'); await dialog.getByLabel('Through cognitive cycle').fill('1');
    await dialog.getByRole('button', { name: 'Induce sleep', exact: true }).click();
    await dialog.getByRole('status').getByText('Choose an ordered range containing a completed cognitive cycle.').waitFor();
    assert.equal(store.consolidations(agent.id).length, 0);
    await dialog.getByLabel('From cognitive cycle').fill('1'); await dialog.getByRole('button', { name: 'Induce sleep', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await panel.getByRole('heading', { name: 'Sleep cycle evidence', exact: true }).waitFor();
    const saved = store.consolidations(agent.id); assert.equal(saved.length, 1); assert.equal(saved[0]!.status, 'completed');
    assert.equal(store.cycles(agent.id).length, cyclesBefore, 'sleep does not add a waking cognitive cycle');
    assert.equal(saved[0]!.options?.synthesizeMemories, false);
    await app.message(agent.id, 'The friend listened again, but some of my uncertainty remains.', 'friend', 'sleep-source');
    await page.reload(); await page.getByRole('button', { name: 'Sleep', exact: true }).click();
    await panel.getByRole('button', { name: 'Induce sleep cycle', exact: true }).click();
    await synthesis.check(); await replacement.check();
    await detailPolicy.selectOption('trace_belief_changes'); await guidance.fill('Keep what changed my belief; omit irrelevant personal details.');
    await dialog.getByRole('button', { name: 'Induce sleep', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    await panel.getByRole('heading', { name: 'Disposition memory synthesis', exact: true }).waitFor();
    const synthesisRun = store.consolidations(agent.id).at(-1)!;
    assert.equal(synthesisRun.options?.synthesizeMemories, true); assert.equal(synthesisRun.options?.replaceSourceMemories, true);
    assert.equal(synthesisRun.options?.detailPolicy, 'trace_belief_changes');
    assert.equal(synthesisRun.options?.synthesisInstructions, 'Keep what changed my belief; omit irrelevant personal details.');
    await panel.getByText('Detail policy: Emphasize how beliefs changed', { exact: true }).waitFor();
    assert.equal(synthesisRun.synthesisReviews?.length, 1);
    assert.equal(synthesisRun.synthesisReviews![0]!.status, 'created');
    await panel.getByText('I used to assume helpful advice settled uncertainty; now I preserve its limits.', { exact: true }).waitFor();
    await panel.getByText('What was retained or left out', { exact: true }).click();
    assert.ok((await panel.innerText()).includes('Left out for this perspective: Incidental wording'));
    assert.ok((await panel.innerText()).includes('Remember Helpful Advice'));
    const evidence = JSON.stringify(store.consolidations(agent.id));
    await panel.getByRole('button', { name: 'Original sleep record', exact: true }).click();
    const original = page.getByRole('dialog', { name: 'Original sleep record', exact: true });
    assert.ok((await original.innerText()).includes(synthesisRun.id)); await original.getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByLabel('Sleep status').selectOption('failed'); await panel.getByText('No sleep cycles match this status.').waitFor();
    await panel.getByLabel('Sleep status').selectOption('all');
    await page.screenshot({ path: '/tmp/prism-sleep-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: '/tmp/prism-sleep-mobile.png', fullPage: true });
    await page.reload(); await page.getByRole('button', { name: 'Sleep', exact: true }).click();
    await panel.getByRole('heading', { name: 'Sleep cycle evidence', exact: true }).waitFor();
    assert.equal(JSON.stringify(store.consolidations(agent.id)), evidence, 'inspection preserves saved sleep evidence');
    // Authored infrastructure record tests historical failure presentation, not psychological outcomes.
    store.saveConsolidation({ id: 'authored-failed-sleep', agentId: agent.id, startedAt: new Date().toISOString(), status: 'failed', fromCycle: 1, toCycle: 1, provider: 'authored-browser-fixture', selections: [], changes: [], error: 'Authored provider interruption' });
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.getByLabel('Sleep status').selectOption('failed');
    await panel.getByText('Authored provider interruption', { exact: true }).waitFor();
    const failedRecord = store.consolidations(agent.id).find(cycle => cycle.id === 'authored-failed-sleep')!;
    assert.equal(failedRecord.status, 'failed');
    await page.getByRole('button', { name: 'Dreams', exact: true }).click();
    await page.locator('.research-dashboard').getByRole('heading', { name: 'Dreams', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
