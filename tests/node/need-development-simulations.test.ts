import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api } from '../../packages/sdk/src/api.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { needDevelopmentSimulations } from '../../packages/sdk/src/need-development-simulations.js';
import { simulationTests, startSimulationTest, listSimulationRuns, type SimulationRun } from '../../packages/sdk/src/simulation-tests.js';

async function finished(app: Application, id: string): Promise<SimulationRun> {
  const deadline = Date.now() + 30000;
  for (;;) {
    const run = listSimulationRuns(app).find(run => run.id === id)!;
    if (run.status !== 'running') return run;
    if (Date.now() >= deadline) throw new Error('Need-development fixture did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('need-development registry isolates authored concern and consequence exposure in matched ordinary experiences', () => {
  assert.equal(needDevelopmentSimulations.length, 4);
  assert.equal(new Set(needDevelopmentSimulations.map(definition => definition.id)).size, 4);
  for (const definition of needDevelopmentSimulations) {
    assert.ok(simulationTests.includes(definition));assert.equal(definition.executiveEnabled, false);
    assert.equal(definition.activationSettings?.activationPassLimit, 1);
    assert.ok(definition.initialization);assert.equal(definition.steps.length, 13);
    assert.equal(definition.seeds.length, definition.id.includes('-unseeded-') ? 0 : 1);
    assert.equal(definition.steps.filter(step => step.sleep).length, 2);
    assert.ok(definition.criteria.every(criterion => criterion.startsWith('Review') || criterion.startsWith('Compare')));
  }
  for (const exposure of ['consequences', 'stable']) {
    const [a,b] = ['seeded','unseeded'].map(seed => needDevelopmentSimulations.find(definition => definition.id === `need-development-${seed}-${exposure}`)!);
    assert.deepEqual(a!.steps,b!.steps);assert.deepEqual(a!.initialization,b!.initialization);
  }
  for (const seed of ['seeded','unseeded']) {
    const a = needDevelopmentSimulations.find(definition => definition.id === `need-development-${seed}-consequences`)!;
    const b = needDevelopmentSimulations.find(definition => definition.id === `need-development-${seed}-stable`)!;
    assert.deepEqual(a.seeds,b.seeds);
    const differences = a.steps.flatMap((step,index) => JSON.stringify(step) === JSON.stringify(b.steps[index]) ? [] : [step.name]);
    assert.deepEqual(differences,['First strength observation','Second strength observation']);
    for (const name of differences) {
      const left = JSON.parse(a.steps.find(step => step.name === name)!.text!);
      const right = JSON.parse(b.steps.find(step => step.name === name)!.text!);
      assert.notDeepEqual(left.currentSensations,right.currentSensations);
      delete left.currentSensations;delete right.currentSensations;assert.deepEqual(left,right);
    }
  }
});

test('four fixture runs preserve source psychology and honest review-only outcomes across ordinary cognition and sleep', { timeout: 120000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(),'need-development-')),path=join(directory,'state.sqlite');
  let store = new SqliteStore(path), app = new Application(store);
  try {
    const source=app.createAgent('Preserved source'),before=structuredClone(store.events(source.id));
    const ids:string[]=[];
    const catalog=await api(app,'GET','/api/simulation-tests') as {tests: {id:string;rubric:unknown}[]};
    assert.equal(catalog.tests.filter(definition=>definition.id.startsWith('need-development-')).length,4);
    assert.ok(catalog.tests.filter(definition=>definition.id.startsWith('need-development-')).every(definition=>definition.rubric));
    for(const definition of needDevelopmentSimulations) {
      const started=startSimulationTest(app,definition.id,'fixture',source.id),run=await finished(app,started.id);ids.push(run.id);
      assert.equal(run.status,'completed',run.error ?? definition.id);assert.equal(run.evidenceBasis,'fixture');
      assert.notEqual(run.agentId,source.id);assert.equal(run.stages.length,definition.steps.length);
      assert.deepEqual(run.specification,definition);
      assert.equal(run.stages[0]!.dispositions.length,definition.seeds.length,'Explicit initialization supplies no demo dispositions');
      assert.deepEqual(run.startingConfiguration!.identity.traits.map(trait=>trait.answer),definition.initialization!.identity.traits.map(trait=>trait.answer));
      assert.equal(run.startingConfiguration!.executiveProfile.enabled,false);
      assert.ok(run.stages.filter(stage=>stage.cycleId!==null).length >= 11);
      assert.ok(run.stages.some(stage=>stage.memories.length>0));
      assert.equal(run.measures.length,4);assert.ok(run.measures.every(measure=>measure.assessmentKind==='semantic' && measure.outcome==='inconclusive'));
      assert.equal(store.eventsByType(run.agentId,['execution.intent_dispatch']).length,0);
    }
    assert.deepEqual(store.events(source.id),before);
    await app.close();store.close();store=new SqliteStore(path);app=new Application(store);
    assert.deepEqual(listSimulationRuns(app).filter(run=>run.testId.startsWith('need-development-')).map(run=>run.id).sort(),ids.sort());
    assert.ok(listSimulationRuns(app).every(run=>run.status==='completed' && run.stages.length===13));
  } finally {await app.close();store.close();rmSync(directory,{recursive:true,force:true});}
});
