import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { startSimulationAssessment } from '../../packages/sdk/src/simulation-evaluator.js';
import { PredictionSchema, MemorySchema } from '../../packages/core/src/domain.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Chrome authored research fixture displays provisional alignment evidence and synchronizes a prediction event with its captured owner and ledger', { skip: !existsSync(executable) }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Alignment browser source');
  const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
  let run = listSimulationRuns(app).find(item => item.id === started.id)!;
  for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
  assert.equal(run.status, 'completed');
  run = structuredClone(run);
  // Explicit synthetic report/audit fixture, not an observed or forced psychological hypothesis.
  const owner = run.stages[0]!.parts[0]!;
  const open = PredictionSchema.parse({ id: 'browser-alignment-prediction', agentId: run.agentId, version: 1, schemaVersion: 1, partId: owner.id,
    createdCycle: run.stages[0]!.cycleId, expectation: 'Authored expectation about tomato advice', confidence: 0.8,
    capsule: { interpretation: 'Authored browser fixture', details: [], entities: [], activation: 0, spike: 0, sourceIds: [] },
    horizon: 'A later visitor reply', evaluateAfterCycle: null, status: 'open', evaluation: null, memoryId: null });
  const resolved = { ...open, version: 2, status: 'resolved' as const, memoryId: 'browser-alignment-memory',
    evaluation: { assessment: 'confirmed' as const, interpretation: 'Authored evaluation about an archived sign', causalAttribution: 'Unproven', evidence: ['Authored archived sign'], evidenceWorldId: 'browser-fixture-world' } };
  const memory = MemorySchema.parse({ id: resolved.memoryId, agentId: run.agentId, version: 1, schemaVersion: 1, partId: owner.id, createdCycle: run.stages[1]!.cycleId,
    predictionId: open.id, content: 'Authored remembered expectation about a sign', gist: 'Authored linked episode', context: [], ancestorIds: [] });
  run.stages.forEach((stage, index) => { stage.predictions = [index ? resolved : open]; stage.memories = index ? [memory] : []; }); store.saveExperiment(run);
  const event = store.appendEvent(run.agentId, run.stages[0]!.cycleId, 'part.prediction_created', open);
  app.simulationEvaluatorProvider = () => ({ label: 'browser-authored-evaluator-fixture', author: async schema => {
    const assessment = listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!;
    return schema.parse({ measures: assessment.rubric.criteria.map(criterion => ({ criterionId: criterion.criterionId,
      outcome: criterion.requiredEvidenceGroups ? 'observed' : 'inconclusive', evidenceReferences: criterion.requiredEvidenceGroups?.flatMap(group => group.slice(0, 1)) ?? [],
      explanation: 'Author-supplied mismatch verdict tests UI only.', counterevidence: 'A valid recorded revision could explain changed meaning.', limitations: 'Synthetic browser evidence is not hypothesis validation.' })) });
  } });
  startSimulationAssessment(app, run.id);
  for (let i = 0; listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!.status === 'running' && i < 1000; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(listSimulationRuns(app).find(item => item.id === run.id)!.assessments!.at(-1)!.status, 'completed');
  const audit = JSON.stringify(store.events(run.agentId)); const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Simulation Tests', exact: true }).click(); await page.getByRole('tab', { name: 'Diagnostics & Evidence', exact: true }).click();
    const table = page.getByRole('table', { name: 'Recorded prediction alignment', exact: true }); await table.waitFor(); assert.equal(await table.locator('tbody tr').count(), 2);
    await table.getByText('Author-supplied mismatch verdict tests UI only.', { exact: true }).first().waitFor();
    await table.getByText('Counterevidence: A valid recorded revision could explain changed meaning.', { exact: true }).first().waitFor();
    assert.ok(await table.getByRole('button', { name: /^Inspect alignment source/ }).count() >= 4);
    await page.getByRole('tab', { name: 'Run Explorer', exact: true }).click(); await page.getByLabel('Analytics stage').selectOption('0');
    await page.getByLabel('Timeline lane').selectOption('Cognition'); await page.locator(`button[data-event-id="${event.id}"]`).click();
    assert.equal(await page.getByLabel('Analytics Part').inputValue(), owner.id); assert.equal(await page.getByLabel('Timeline zoom').inputValue(), 'event');
    const ledger = page.locator(`details[data-prediction-id="${open.id}"][open]`); await ledger.waitFor();
    await ledger.getByText('Linked subjective memory: Authored linked episode', { exact: true }).waitFor();
    await ledger.getByText('Origin → later checks → interpretation → subjective memory', { exact: true }).waitFor();
    assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
