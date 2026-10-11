import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { engineProvenance } from '../../packages/sdk/src/engine-provenance.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { aggregateSimulations, compareSimulations } from '../../packages/sdk/src/simulation-comparison.js';
import { simulationCitation } from '../../packages/sdk/src/simulation-research.js';

test('engine snapshots preserve immutable bounded artifact provenance, separate changed/unknown architectures and never enter provider arguments', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const provenance = engineProvenance(); assert.equal(provenance.distribution, 'source'); assert.match(provenance.artifactHash!, /^[a-f0-9]{64}$/);
    assert.ok(provenance.fileCount > 0); assert.match(provenance.sourceRevision!, /^[a-f0-9]{40}$/);
    const changedCopy = engineProvenance(); changedCopy.artifactHash = 'authored'; assert.deepEqual(engineProvenance(), provenance);
    const compiled = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import { engineProvenance } from ${JSON.stringify(new URL('../../dist/packages/sdk/src/engine-provenance.js', import.meta.url).href)}; console.log(JSON.stringify(engineProvenance()));`], { encoding: 'utf8' })) as ReturnType<typeof engineProvenance>;
    assert.equal(compiled.distribution, 'compiled'); assert.match(compiled.artifactHash!, /^[a-f0-9]{64}$/); assert.notEqual(compiled.artifactHash, provenance.artifactHash);
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); assert.deepEqual(run.engine, provenance);
    assert.deepEqual(simulationCitation(store, run, '/engine').value, provenance);
    const altered = structuredClone(run); altered.id = 'authored-other-engine'; altered.engine!.artifactHash = 'a'.repeat(64);
    assert.ok(compareSimulations(run, altered).configurationDifferences.includes('engine'));
    assert.equal(aggregateSimulations([run, altered]).length, 2);
    const historical = structuredClone(run); historical.id = 'historical'; delete historical.engine;
    assert.equal(aggregateSimulations([historical, { ...historical, id: 'historical-other' }]).length, 2);
    assert.ok(compareSimulations(run, historical).limitations.some(item => item.includes('Engine provenance is missing')));
    const bytes = JSON.stringify(run); const audit = JSON.stringify(store.events(run.agentId));
    const operations = store.events(run.agentId).filter(event => event.type === 'provider.operation');
    assert.ok(operations.length > 0);
    for (const operation of operations) if (operation.type === 'provider.operation') assert.ok(!JSON.stringify(operation.payload.input).includes(provenance.artifactHash!));
    aggregateSimulations([run]); compareSimulations(run, altered);
    assert.equal(JSON.stringify(run), bytes); assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
