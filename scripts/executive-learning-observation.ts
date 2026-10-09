import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Application } from '../packages/sdk/src/application.js';
import { startSimulationTest, listSimulationRuns } from '../packages/sdk/src/simulation-tests.js';
import { configuredProviders } from '../packages/providers/src/config.js';
import { loadLocalEnvironment } from '../packages/providers/src/environment.js';
import { promptResolver } from '../packages/sdk/src/prompt-settings.js';
import { SqliteStore } from '../packages/storage/src/sqlite.js';

// Explicitly invoked configured-provider observation. Never part of npm test; retains all evidence.
loadLocalEnvironment();
const directory = resolve('workspace/gauntlet', `executive-conditional-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const store = new SqliteStore(resolve(directory, 'research.sqlite'));
const providers = configuredProviders({ ...process.env, PRISM_PROVIDER: 'openai', PRISM_DECISIONS: 'jev' }, undefined, promptResolver(store));
const app = new Application(store, providers);
try {
  const source = app.createAgent('Conditional skill observation source');
  const started = startSimulationTest(app, process.argv[2] ?? 'executive-conditional-consolidation', 'configured', source.id, { enabled: false });
  console.log(JSON.stringify({ database: resolve(directory, 'research.sqlite'), runId: started.id, agentId: started.agentId,
    providers: started.providers, note: 'Real configured reasoning/decision observations with deterministic retrieval embeddings; no forced proposals or causal/psychological verdict.' }));
  let previous = '';
  for (;;) {
    const run = listSimulationRuns(app).find(run => run.id === started.id)!;
    if (`${run.status}:${run.currentStep}` !== previous) { previous = `${run.status}:${run.currentStep}`; console.log(JSON.stringify({ status: run.status, stage: run.currentStep, completedStages: run.stages.length })); }
    if (run.status !== 'running') {
      console.log(JSON.stringify({ status: run.status, error: run.error, measures: run.measures.map(measure => ({ criterion: measure.criterion, outcome: measure.outcome })),
        proceduralRuns: app.procedureConsolidation.records(run.agentId).map(record => ({ status: record.status, episodes: record.input.episodes.length,
          verifiedEpisodes: record.input.episodes.filter(episode => episode.evidence === 'passed').length, candidateIds: record.skillIds, error: record.error })) }));
      if (run.status === 'failed') process.exitCode = 1;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally { await app.close(); store.close(); }
