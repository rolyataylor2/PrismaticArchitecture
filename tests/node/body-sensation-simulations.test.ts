import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('paired bodily-report vignettes run ordinary isolated cognition with no forced food choice or physical-success claim', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'body-sensation-vignettes-'));
  const store = new SqliteStore(join(directory, 'state.sqlite'));
  const app = new Application(store);
  try {
    const source = app.createAgent('Preserved source');
    const before = structuredClone(store.events(source.id));
    const definitions = simulationTests.filter(definition => definition.id.startsWith('body-sensation-'));
    assert.equal(definitions.length, 3);
    const paired = definitions.filter(definition => definition.id !== 'body-sensation-assigned-bite');
    const stimuli = paired.map(definition => JSON.parse(definition.steps[0]!.text!));
    const assigned = definitions.find(definition => definition.id === 'body-sensation-assigned-bite')!;
    assert.ok(assigned.steps[0]!.text!.startsWith(paired[0]!.steps[0]!.text!));
    assert.notDeepEqual(stimuli[0].currentSensations, stimuli[1].currentSensations);
    delete stimuli[0].currentSensations; delete stimuli[1].currentSensations;
    assert.deepEqual(stimuli[0], stimuli[1]);
    for (const definition of definitions) {
      assert.deepEqual(definition.seeds, []);
      assert.equal(definition.executiveSandbox, undefined);
      const started = startSimulationTest(app, definition.id, 'fixture', source.id);
      let run = started;
      for (let attempt = 0; attempt < 1000 && run.status === 'running'; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        run = listSimulationRuns(app).find(item => item.id === started.id)!;
      }
      assert.equal(run.status, 'completed', run.error ?? definition.id);
      assert.equal(run.evidenceBasis, 'fixture');
      assert.notEqual(run.agentId, source.id);
      assert.equal(run.startingConfiguration?.executiveProfile.enabled, false);
      assert.equal(run.stages.length, 1);
      assert.ok(run.prompts.some(prompt => prompt.task === 'part_cognition'));
      assert.ok(run.measures.every(measure => measure.outcome === 'inconclusive'));
    }
    assert.deepEqual(store.events(source.id), before);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
