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
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Simulation Tests sidebar runs an honest fixture, displays progress/evidence and restores history', { skip: !existsSync(executable) }, async () => {
  class UnavailableReasoning extends MockReasoning {
    override async constructed(): Promise<never> { throw new Error('Browser fixture provider unavailable'); }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new UnavailableReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  const source = app.createAgent('Simulation source');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ executablePath: executable, headless: true });
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Simulation Tests', exact: true }).click();
    await page.getByRole('combobox', { name: 'Simulation hypothesis' }).selectOption('prediction-contradiction');
    await page.getByRole('heading', { name: 'Prediction contradiction and memory', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Simulation inference mode' }).selectOption('fixture');
    await page.getByRole('button', { name: 'Run simulation test', exact: true }).click();
    await page.getByRole('heading', { name: 'Prediction contradiction and memory · completed', exact: true }).waitFor();
    const run = listSimulationRuns(app)[0]!;
    assert.equal(run.sourceAgentId, source.id); assert.notEqual(run.agentId, source.id);
    assert.equal(await page.getByRole('progressbar', { name: 'Simulation progress' }).getAttribute('value'), '5');
    assert.ok((await page.locator('.simulation-tests').innerText()).includes('Fixture evidence only'));
    assert.ok((await page.locator('.simulation-tests').innerText()).includes('inconclusive'));
    await page.getByText('training · Prediction opportunity', { exact: true }).click();
    assert.ok((await page.locator('.simulation-tests').innerText()).includes('exactly one red token'));
    app.simulationEvaluatorProvider = () => ({ label: 'test/browser-evaluator', author: async schema => schema.parse({ measures: [{
      criterionId: 'criterion-3', outcome: 'inconclusive', evidenceReferences: ['/stages/0/predictions'],
      explanation: 'No specific prediction exists in this fixture.', counterevidence: 'The fixture abstains from forecast generation.', limitations: 'Harness test, not psychological validation.',
    }] }) });
    await page.getByRole('combobox', { name: 'Simulation evaluator model' }).selectOption('gpt-4.1-mini');
    await page.getByRole('button', { name: 'Assess saved run', exact: true }).click();
    await page.getByRole('heading', { name: 'Automated assessment 1 · completed', exact: true }).waitFor();
    assert.equal(listSimulationRuns(app)[0]!.assessments![0]!.model, 'test/browser-evaluator');
    assert.equal(listSimulationRuns(app)[0]!.assessments![0]!.evidenceBasis, 'fixture');
    await page.reload();
    await page.getByRole('button', { name: 'Simulation Tests', exact: true }).click();
    await page.getByRole('heading', { name: 'Prediction contradiction and memory · completed', exact: true }).waitFor();
    assert.equal(listSimulationRuns(app).length, 1);
    assert.equal(store.cycles(source.id).length, 0);
    await page.getByRole('combobox', { name: 'Simulation hypothesis' }).selectOption('executive-attention-review');
    await page.getByRole('combobox', { name: 'Simulation inference mode' }).selectOption('fixture');
    await page.getByRole('button', { name: 'Run simulation test', exact: true }).click();
    await page.getByRole('heading', { name: 'Interested attention, ordinary cognition and continuation · completed', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Relevant opportunity without task failure · Executive checkpoint', exact: true }).waitFor();
    assert.ok((await page.locator('.simulation-tests').innerText()).includes('No live Self-selected activity; this checkpoint was not delivered.'));
    const checkpointRun = listSimulationRuns(app).find(run => run.testId === 'executive-attention-review')!;
    assert.equal(checkpointRun.measures[0]!.outcome, 'not_observed');
    await page.getByText('Final execution evidence and researcher cleanup', { exact: true }).click();
    assert.ok((await page.locator('.simulation-tests').innerText()).includes('No local workers required researcher cleanup.'));
    await page.getByRole('combobox', { name: 'Simulation hypothesis' }).selectOption('general-attention');
    await page.getByRole('combobox', { name: 'Simulation inference mode' }).selectOption('configured');
    await page.getByRole('button', { name: 'Run simulation test', exact: true }).click();
    await page.getByRole('heading', { name: 'General and overlapping attention · failed', exact: true }).waitFor();
    assert.ok((await page.locator('.simulation-tests').getByRole('alert').innerText()).includes('Browser fixture provider unavailable'));
    assert.equal(listSimulationRuns(app).find(run => run.status === 'failed')!.measures.length, 0);
    assert.deepEqual(errors, []);
  } catch (error) {
    const reports = listSimulationRuns(app).map(run => ({ testId: run.testId, status: run.status, currentStep: run.currentStep, error: run.error }));
    throw new Error(`Simulation browser workflow failed. Recorded run states: ${JSON.stringify(reports)}`, { cause: error });
  } finally {
    await browser?.close(); server.closeAllConnections();
    await app.close();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
