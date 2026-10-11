import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput, JudgmentInput } from '../../packages/core/src/constructed-domain.js';
import { startSimulationTest, listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
import { analyzeSimulation } from '../../packages/sdk/src/simulation-analysis.js';
async function finished(app: Application, id: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const run = listSimulationRuns(app).find(item => item.id === id)!;
    if (run.status !== 'running') return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Validation plumbing run did not settle');
}
test('adapter return and runtime rejection stay distinct; provider failure does not fabricate validation', async () => {
  class Invalid extends MockReasoning { override async constructed(_input: ConstructedInput) { return {}; } }
  class Outage extends MockReasoning { override async constructed(_input: ConstructedInput): Promise<never> { throw new Error('Explicit fixture outage'); } }
  class MissingCandidate extends MockDecisions { override async judge(_input: JudgmentInput) { return []; } }
  for (const [reasoning, decisions, expected] of [
    [new Invalid(), new MockDecisions(), 'schema'], [new Outage(), new MockDecisions(), 'provider'],
    [new MockReasoning(), new MissingCandidate(), 'coverage'],
  ] as const) {
    const store = new SqliteStore(':memory:'); const app = new Application(store, { reasoning, decisions, embeddings: new MockEmbeddings() });
    try {
      const source = app.createAgent(); const run = await finished(app, startSimulationTest(app, 'observatory-fresh-context-control', 'configured', source.id, { enabled: false }).id);
      assert.equal(run.status, 'failed'); assert.deepEqual(run.measures, []); assert.equal(run.evidenceBasis, 'fixture');
      const analysis = analyzeSimulation(store, run); const rejected = analysis.validations.filter(item => item.status === 'rejected');
      if (expected === 'provider') { assert.equal(rejected.length, 0); assert.ok(analysis.providerOperations.some(item => item.phase === 'failed')); }
      else {
        assert.equal(rejected.length, 1); assert.ok(rejected[0]!.issues.length > 0);
        assert.ok(store.events(run.agentId).some(event => event.id === rejected[0]!.inputEventId));
        assert.ok(analysis.providerOperations.some(item => item.phase === 'returned'));
        if (expected === 'coverage') assert.deepEqual(rejected[0]!.issues, [{ path: 'candidates', code: 'each_supplied_id_exactly_once' }]);
      }
      assert.equal(store.events(source.id).length, 0);
    } finally { await app.close(); store.close(); }
  }
});
