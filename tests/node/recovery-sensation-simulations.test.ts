import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { recoverySensationSimulations } from '../../packages/sdk/src/recovery-sensation-simulations.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';

test('recovery comparison varies only the final current leg sensation with identical authored priors', () => {
  const [silent,explicit]=recoverySensationSimulations;
  assert.equal(recoverySensationSimulations.length,2);
  assert.deepEqual(silent!.initialization,explicit!.initialization);
  assert.deepEqual(silent!.steps.slice(0,2),explicit!.steps.slice(0,2));
  const a=JSON.parse(silent!.steps[2]!.text!),b=JSON.parse(explicit!.steps[2]!.text!);
  assert.deepEqual(a.currentSensations[1].sensations,[]);
  assert.deepEqual(b.currentSensations[1].sensations,['I feel strength in my legs for walking and jumping.']);
  b.currentSensations[1].sensations=[];assert.deepEqual(a,b);
  for(const definition of recoverySensationSimulations){assert.ok(simulationTests.includes(definition));assert.equal(definition.seeds.length,0);assert.equal(definition.executiveEnabled,false);assert.equal(definition.activationSettings?.activationPassLimit,1);}
});

test('both recovery vignettes use ordinary fixture cognition and preserve their source Agent', {timeout:60000}, async () => {
  const store=new SqliteStore(':memory:'),app=new Application(store);
  try {
    const source=app.createAgent('Preserved source'),before=structuredClone(store.events(source.id));
    for(const definition of recoverySensationSimulations){
      const start=startSimulationTest(app,definition.id,'fixture',source.id),deadline=Date.now()+25000;
      let run=listSimulationRuns(app).find(item=>item.id===start.id)!;
      while(run.status==='running' && Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,10));run=listSimulationRuns(app).find(item=>item.id===start.id)!;}
      assert.equal(run.status,'completed',run.error??definition.id);assert.equal(run.stages.length,3);
      assert.notEqual(run.agentId,source.id);assert.equal(run.evidenceBasis,'fixture');
      assert.ok(run.stages.every(stage=>stage.cycleId));assert.ok(run.measures.every(measure=>measure.outcome==='inconclusive'));
      assert.deepEqual(run.specification,definition);assert.equal(store.eventsByType(run.agentId,['execution.intent_dispatch']).length,0);
    }
    assert.deepEqual(store.events(source.id),before);
  } finally {await app.close();store.close();}
});
