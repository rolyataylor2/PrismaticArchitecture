import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { simulationEventFocus } from '../../packages/sdk/src/simulation-event-focus.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';

test('event navigation follows exact identifier fields and frozen ownership, ignores prose and preserves multiple owners', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const source = app.createAgent(); const started = startSimulationTest(app, 'conversation-starters', 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    for (let i = 0; run.status === 'running' && i < 1000; i++) { await new Promise(resolve => setTimeout(resolve, 10)); run = listSimulationRuns(app).find(item => item.id === started.id)!; }
    assert.equal(run.status, 'completed'); const bytes = JSON.stringify(run); const events = store.events(run.agentId); const audit = JSON.stringify(events);
    const owners = [...new Set(run.stages.flatMap(stage => stage.parts.map(part => part.id)))]; assert.ok(owners.length > 1);
    const direct = simulationEventFocus(run, events, { partId: owners[0], interpretation: owners[1] });
    assert.deepEqual(direct.directPartIds, [owners[0]]); assert.deepEqual(direct.owningPartIds, [owners[0]]);
    const multiple = simulationEventFocus(run, events, { sourceIds: owners.slice(0, 2) });
    assert.deepEqual(multiple.owningPartIds, owners.slice(0, 2));
    const bid = events.find(event => event.type === 'part.bid_created')!; assert.equal(bid.type, 'part.bid_created');
    if (bid.type === 'part.bid_created') {
      const choice = simulationEventFocus(run, events, { choice: bid.payload.id });
      assert.deepEqual(choice.bidIds, [bid.payload.id]); assert.deepEqual(choice.owningPartIds, [bid.payload.partId]);
    }
    const analysis = analyzeSimulation(store, run);
    for (const event of analysis.stages.flatMap(stage => stage.trace)) assert.deepEqual(event.references, simulationEventFocus(run, events, event.payload));
    assert.equal(JSON.stringify(run), bytes); assert.equal(JSON.stringify(store.events(run.agentId)), audit); assert.equal(store.events(source.id).length, 0);
  } finally { await app.close(); store.close(); }
});
