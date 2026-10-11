import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SqliteStore } from '../packages/storage/src/sqlite.js';
import { Application } from '../packages/sdk/src/application.js';
import { simulationTests, startSimulationTest, listSimulationRuns } from '../packages/sdk/src/simulation-tests.js';
import { simulationResearch } from '../packages/sdk/src/simulation-research.js';
import { analyzeSimulation } from '../packages/sdk/src/simulation-analysis.js';

// Explicit fixture observations; no environment providers, paid inference or source-Agent edits.
const root = resolve(process.argv[2] ?? `workspace/simulations/observatory-${new Date().toISOString().replaceAll(':', '-')}`);
mkdirSync(root, { recursive: true });
const path = join(root, 'research.sqlite');
if (existsSync(path)) throw new Error('Choose a fresh evidence directory; existing runs will not be overwritten');
const store = new SqliteStore(path); const app = new Application(store);
try {
  const source = app.createAgent('Untouched Observatory fixture source');
  for (const definition of simulationTests.filter(test => test.id.startsWith('observatory-'))) {
    const started = startSimulationTest(app, definition.id, 'fixture', source.id);
    let run = listSimulationRuns(app).find(item => item.id === started.id)!;
    while (run.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 20));
      run = listSimulationRuns(app).find(item => item.id === started.id)!;
    }
    writeFileSync(join(root, `${definition.id}.json`), JSON.stringify({ run, research: simulationResearch(store, run.id), analysis: analyzeSimulation(store, run) }, null, 2));
    console.log(`${definition.id}: ${run.status}; ${run.stages.length}/${run.totalSteps} stages; ${run.evidenceBasis}; ${run.measures.map(item => item.outcome).join(', ')}`);
    if (run.status !== 'completed' || run.researchAnalysisError) throw new Error(run.error ?? run.researchAnalysisError ?? 'Incomplete fixture run');
  }
  if (store.cycles(source.id).length) throw new Error('Fixture source Agent was unexpectedly changed');
  console.log(`Preserved evidence: ${root}`);
} finally { await app.close(); store.close(); }
