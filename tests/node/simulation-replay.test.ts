import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { api } from '../../packages/sdk/src/api.js';
import { simulationTests, startSimulationTest, replaySimulation, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationConfiguration } from '../../packages/sdk/src/simulation-comparison.js';
async function finished(app: Application, id: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const run = listSimulationRuns(app).find(item => item.id === id)!;
    if (run.status !== 'running') { assert.equal(run.status, 'completed', run.error ?? ''); return run; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Replay fixture did not finish');
}
test('reruns preserve saved scenarios/configuration/prompts across restart while forks isolate explicit changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-replay-')); const path = join(dir, 'research.sqlite');
  let store = new SqliteStore(path); let app = new Application(store);
  try {
    const source = app.createAgent('Preserved source');
    const original = await finished(app, startSimulationTest(app, 'observatory-fresh-context-control', 'fixture', source.id).id);
    const originalBytes = JSON.stringify(original); const originalEvents = JSON.stringify(store.events(original.agentId));
    app.updateAgentActivationSettings(original.agentId, { vectorSearchEnabled: true, memorySearchEnabled: false });
    const originalPrompt = app.promptSettings(original.agentId)[0]!;
    const exact = `  ${originalPrompt.effective}\n `;
    app.editPrompt(source.id, originalPrompt.task, 'agent', exact);
    assert.equal(app.promptSettings(source.id)[0]!.effective, exact);
    assert.throws(() => app.editPrompt(source.id, originalPrompt.task, 'agent', ' \n '), /Prompt/);
    app.editPrompt(original.agentId, originalPrompt.task, 'agent', 'A later researcher prompt, not the preserved prompt.');
    const developed = store.get('identity', original.agentId);
    store.save('identity', { ...developed, version: developed.version + 1, traits: developed.traits.map((trait, index) => index ? trait : { ...trait, answer: 'A changed later Identity answer.' }) }, developed.version,
      { origin: 'researcher_edit', reason: 'Isolation test', sourceIds: [] });
    const sourceBefore = JSON.stringify(await api(app, 'GET', `/api/agents/${source.id}`));
    const originalAgentBefore = JSON.stringify(await api(app, 'GET', `/api/agents/${original.agentId}`));
    await app.close(); store.close(); store = new SqliteStore(path); app = new Application(store);
    const definition = simulationTests.find(item => item.id === original.testId)!; const oldText = definition.steps[0]!.text;
    definition.steps[0]!.text = 'Changed current registry text should not affect a saved scenario.';
    let rerun;
    try { rerun = await finished(app, replaySimulation(app, original.id, 'Repeat preserved baseline').id); }
    finally { if (oldText === undefined) delete definition.steps[0]!.text; else definition.steps[0]!.text = oldText; }
    assert.notEqual(rerun.agentId, original.agentId);
    assert.deepEqual(rerun.specification, original.specification);
    assert.deepEqual(rerun.prompts, original.prompts);
    assert.deepEqual(simulationConfiguration(rerun), simulationConfiguration(original));
    assert.equal(rerun.stages[0]!.text, original.stages[0]!.text);
    assert.deepEqual(rerun.lineage, { parentRunId: original.id, kind: 'rerun', reason: 'Repeat preserved baseline', activationChanges: {} });
    assert.equal(rerun.evaluator!.enabled, false);
    const forkStart = await api(app, 'POST', `/api/simulation-tests/${original.id}/fork`, {
      reason: 'Compare enabled memory retrieval', activationChanges: { memorySearchEnabled: true },
    }) as typeof original;
    const fork = await finished(app, forkStart.id);
    assert.equal(fork.lineage!.kind, 'fork'); assert.notEqual(fork.agentId, rerun.agentId);
    assert.equal(fork.startingConfiguration!.activationSettings.memorySearchEnabled, true);
    assert.deepEqual(fork.prompts, original.prompts);
    const fc = simulationConfiguration(fork); const oc = simulationConfiguration(original);
    assert.notEqual(fc.activationSettingsHash, oc.activationSettingsHash);
    assert.equal(fc.scenarioHash, oc.scenarioHash); assert.equal(fc.identityHash, oc.identityHash); assert.equal(fc.promptHash, oc.promptHash);
    assert.equal(JSON.stringify(listSimulationRuns(app).find(item => item.id === original.id)), originalBytes);
    assert.equal(JSON.stringify(store.events(original.agentId)), originalEvents, 'subsequent configuration edits emit no cognitive events');
    assert.equal(JSON.stringify(await api(app, 'GET', `/api/agents/${source.id}`)), sourceBefore);
    assert.equal(JSON.stringify(await api(app, 'GET', `/api/agents/${original.agentId}`)), originalAgentBefore);
    await assert.rejects(api(app, 'POST', `/api/simulation-tests/${original.id}/rerun`, { reason: 'Wrong route', activationChanges: { vectorSearchEnabled: true } }), /fork/);
    await assert.rejects(api(app, 'POST', `/api/simulation-tests/${original.id}/fork`, { reason: 'Missing change' }), /explicit/);
    await assert.rejects(api(app, 'POST', `/api/simulation-tests/${original.id}/fork`, { reason: 'Invalid', activationChanges: { memoryRelevanceThreshold: 5 } }));
    assert.throws(() => replaySimulation(app, original.id, ''), /reason/);
    store.saveExperiment({ ...original, id: 'historical-missing', startingConfiguration: undefined });
    assert.throws(() => replaySimulation(app, 'historical-missing', 'Missing'), /missing/);
    store.saveExperiment({ ...original, id: 'catalog-missing', prompts: [] });
    assert.throws(() => replaySimulation(app, 'catalog-missing', 'Missing catalog'), /catalog/);
    store.saveExperiment({ ...original, id: 'running-parent', status: 'running' });
    assert.throws(() => replaySimulation(app, 'running-parent', 'Not ended'), /end/);
  } finally { await app.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('configured reruns reject provider and runtime drift before creating an Agent', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent();
    const run = await finished(app, startSimulationTest(app, 'observatory-fresh-context-control', 'configured', source.id, { enabled: false }).id);
    const rerun = await finished(app, replaySimulation(app, run.id, 'Compatible configured adapters').id);
    assert.deepEqual(simulationConfiguration(rerun), simulationConfiguration(run));
    assert.equal(rerun.evidenceBasis, 'fixture', 'configured mode with mock adapters remains fixture evidence');
    const count = store.list('agent').length;
    store.saveExperiment({ ...run, id: 'changed-embedding', providers: { ...run.providers, embeddings: 'different-vector-provider' } });
    assert.throws(() => replaySimulation(app, 'changed-embedding', 'Changed embedding'), /embedding/);
    assert.equal(store.list('agent').length, count);
    store.saveAgentProviderSettings(run.agentId, { model: 'gpt-4.1-nano', encryptedApiKey: null });
    assert.throws(() => replaySimulation(app, run.id, 'Changed provider'), /provider/);
    assert.equal(store.list('agent').length, count);
    store.saveExperiment({ ...run, id: 'changed-runtime', startingConfiguration: { ...run.startingConfiguration!,
      runtime: { ...run.startingConfiguration!.runtime, maxDeliberationRounds: 99 } } });
    assert.throws(() => replaySimulation(app, 'changed-runtime', 'Changed runtime'), /runtime/);
    assert.equal(store.list('agent').length, count);
  } finally { await app.close(); store.close(); }
});
