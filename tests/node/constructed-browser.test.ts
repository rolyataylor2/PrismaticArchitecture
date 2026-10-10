import { enableExecutive } from './executive-fixture.js';
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
test('constructed browser retains retired Parts, exposes evidence/history and consolidation, and lists new task prompts', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('textbox', { name: 'New Prismatic Agent name' }).fill('Constructed browser');
    assert.equal(await page.getByRole('combobox', { name: 'New Agent cognitive model' }).count(), 0);
    await page.getByRole('button', { name: 'Create Prismatic Agent', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
    const agent = store.list('agent')[0]!;
    enableExecutive(app, agent.id);
    assert.equal(agent.architecture, 'constructed'); assert.equal(store.list('part', agent.id).length, 0);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello, a calm ordinary conversation.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(async () => {
      const agents = await (await fetch('/api/agents')).json();
      const snapshot = await (await fetch(`/api/agents/${agents[0].id}`)).json();
      return snapshot.cycles.some((cycle: { status: string }) => cycle.status === 'completed');
    });
    await page.getByRole('button', { name: 'Inspect cognitive steps' }).first().click();
    await page.getByText('Experienced WorldState', { exact: true }).waitFor();
    await page.getByText('Self experienced transition', { exact: true }).waitFor();
    await page.getByText('Trajectory futures', { exact: true }).waitFor();
    await page.getByText('Action-conditioned futures', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close inspector' }).click();
    const active = store.list('part', agent.id)[0]!;
    const originWorld = store.world(store.cycle(active.instance!.createdCycle).worldId);
    app.runtime.predictions.formGap(originWorld, { expectation: 'The current source may recur', confidence: 0.4,
      capsule: { interpretation: 'Source continuity is unresolved', details: ['An ordinary conversation'], entities: [], activation: 0, spike: 0, sourceIds: [originWorld.id] },
      horizon: 'When source evidence arrives', evaluateAfterCycle: null, scaffolds: [{ name: 'Uncertain recurring source', target: 'interacting source', cues: ['Source identifying evidence'],
        retrievalIntent: 'Recall discriminating source experience', relevantMemoryIds: [], supportEvidence: ['Matching source identifier'],
        contradictEvidence: ['Distinct source identifier'], trackedDistinction: 'Continuing versus different source', futureValue: 'Connect appropriate episodes' }] },
      { threadId: store.cycle(originWorld.cycleId).threadId ?? null, gap: 'Source continuity missing', consequentialValue: 'Appropriate recall',
        futureInference: { prediction: 'Distinguish sources', retrieval: 'Connect episodes', causal: 'Attribute records', action: 'Ask for evidence', compression: 'Reuse distinctions' }, existingStructureInsufficient: 'Explicit inspector fixture; no resolver seeded' });
    app.runtime.mutations.patch(active.id, active.version, { lifecycle: 'archived', instance: { ...active.instance!, retirement: { cycleId: active.instance!.createdCycle, reason: 'Retired fixture' } } }, { origin: 'researcher_edit', reason: 'Inspect retirement', sourceIds: [] });
    const original = store.get('part', active.id);
    await page.reload();
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Part History', exact: true }).click();
    assert.equal(await page.locator('.part-list-item').count(), 1);
    assert.ok((await page.locator('.part-list-item').innerText()).includes('Retired'));
    await page.getByRole('button', { name: `Inspect ${original.name}`, exact: true }).click();
    await page.getByText('Retired instance', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reactivate', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Raw Part inspector data', exact: true }).click();
    await page.getByRole('dialog').getByText('All Part versions', { exact: true }).click();
    assert.ok((await page.getByRole('dialog').innerText()).includes(original.id));
    await page.getByRole('dialog').getByRole('button', { name: 'Close information', exact: true }).click();
    await page.getByRole('button', { name: 'Dispositions', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search dispositions', exact: true }).waitFor();
    store.save('disposition', { id: 'development-inspection', agentId: agent.id, version: 1, schemaVersion: 1,
      name: 'Contextual curiosity', concern: 'Recall my uncertain experiences', cues: ['uncertainty'], scope: 'uncertain invitation',
      prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false, active: true,
      development: { retrievalIntent: 'Recall lived uncertainty before interpreting an invitation', contextCues: ['invitation'],
        internalStateCues: ['uncertainty'], status: 'provisional', confidence: 'Tentative contextual hypothesis',
        lineage: [], previousVersion: null, evidence: [], createdAt: new Date().toISOString() } }, 0,
    { origin: 'seed', reason: 'Explicit inspector fixture', sourceIds: [] });
    await page.reload();
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Dispositions', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect Contextual curiosity', exact: true }).click();
    const dispositionInspector = page.getByRole('region', { name: 'Disposition inspector' });
    await dispositionInspector.getByText('Recall lived uncertainty before interpreting an invitation', { exact: true }).waitFor();
    await dispositionInspector.getByText('provisional · Tentative contextual hypothesis', { exact: true }).waitFor();
    await dispositionInspector.getByRole('heading', { name: 'Reconciliation evidence', exact: true }).waitFor();
    await dispositionInspector.getByRole('button', { name: 'Edit disposition', exact: true }).click();
    const editor = page.getByRole('dialog').last();
    assert.equal(await editor.getByLabel('Prerequisites', { exact: true }).count(), 0);
    await editor.getByLabel('Contributing keywords or phrases (one per line)', { exact: true }).fill('welcome\ninvitation');
    await editor.getByLabel('Inhibiting keywords or phrases (one per line)', { exact: true }).fill('leave me alone');
    const scaffold = store.list('disposition', agent.id).find(item => item.name === 'Uncertain recurring source')!;
    await editor.getByLabel('Contributing dispositions', { exact: true }).selectOption(scaffold.id);
    await editor.getByRole('button', { name: 'Save disposition', exact: true }).click();
    await page.waitForFunction(async () => {
      const result = await (await fetch('/api/dispositions/development-inspection')).json();
      return result.disposition.version === 2;
    });
    assert.deepEqual(store.get('disposition', 'development-inspection').activationAssociations, [
      { kind: 'keyword', keyword: 'welcome', effect: 'contribute' },
      { kind: 'keyword', keyword: 'invitation', effect: 'contribute' },
      { kind: 'disposition', dispositionId: scaffold.id, effect: 'contribute' },
      { kind: 'keyword', keyword: 'leave me alone', effect: 'inhibit' },
    ]);
    assert.deepEqual(store.get('disposition', 'development-inspection').prerequisites, []);
    await page.getByRole('button', { name: 'Inspect Contextual curiosity', exact: true }).click();
    await dispositionInspector.getByRole('heading', { name: 'Activation associations', exact: true }).last().waitFor();
    await dispositionInspector.getByText('Inhibits: leave me alone', { exact: true }).last().waitFor();
    await dispositionInspector.getByRole('button', { name: '← Back to dispositions', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect Uncertain recurring source', exact: true }).click();
    const scaffoldInspector = page.getByRole('region', { name: 'Disposition inspector' });
    await scaffoldInspector.getByRole('heading', { name: 'Temporary hypothesis relevance', exact: true }).waitFor();
    assert.ok((await scaffoldInspector.innerText()).includes('Continuing versus different source'));
    assert.ok((await scaffoldInspector.innerText()).includes('Matching source identifier'));
    await scaffoldInspector.getByRole('button', { name: '← Back to dispositions', exact: true }).click();
    await page.getByRole('button', { name: 'Experiments', exact: true }).click();
    await page.getByRole('button', { name: 'Dream', exact: true }).click();
    await page.getByRole('button', { name: 'Run consolidation', exact: true }).click();
    await page.waitForFunction(async () => {
      const agents = await (await fetch('/api/agents')).json();
      const snapshot = await (await fetch(`/api/agents/${agents[0].id}`)).json();
      return snapshot.consolidations.some((run: { status: string }) => run.status === 'completed');
    });
    assert.equal(store.get('part', original.id).lifecycle, 'archived');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Prompts', exact: true }).click();
    await page.locator('.component-header .prompt-selector > button').click();
    await page.getByRole('menuitemradio', { name: 'Cog · Part formation → reflection → cognition', exact: true }).click();
    await page.getByRole('region', { name: 'Cog · Part formation → reflection → cognition', exact: true }).waitFor();
    await page.locator('.component-header .prompt-selector > button').click();
    await page.getByRole('menuitemradio', { name: 'Mem · Memory accessibility', exact: true }).click();
    await page.getByRole('region', { name: 'Mem · Memory accessibility', exact: true }).waitFor();
    for (const title of ['Cog · Self affect scoring', 'Cog · Self affect inquiry', 'Cog · Focused Part bid revision',
      'Cog · Consequential coverage and hypotheses', 'Mem · Gap hypothesis outcome check', 'Mem · Gap hypothesis subjective reflection', 'Mem · Experience evidence attachment']) {
      await page.locator('.component-header .prompt-selector > button').click();
      await page.getByRole('menuitemradio', { name: title, exact: true }).click();
      await page.getByRole('region', { name: title, exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
