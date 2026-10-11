import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SqliteStore } from '../packages/storage/src/sqlite.js';
import { Application } from '../packages/sdk/src/application.js';
import { affectSimulations } from '../packages/sdk/src/affect-simulations.js';
import { listSimulationRuns, startSimulationTest } from '../packages/sdk/src/simulation-tests.js';
import { configuredProviders } from '../packages/providers/src/config.js';
import { loadLocalEnvironment } from '../packages/providers/src/environment.js';
import { promptResolver } from '../packages/sdk/src/prompt-settings.js';

const [mode = 'fixture', suppliedDirectory, testId] = process.argv.slice(2);
if (mode !== 'fixture' && mode !== 'configured') throw new Error('Use fixture or configured mode');
const definitions = testId ? affectSimulations.filter(definition => definition.id === testId) : affectSimulations;
if (!definitions.length) throw new Error('Unknown affect experiment');
const directory = resolve(suppliedDirectory ?? `workspace/simulations/affect-${Date.now()}`);
await mkdir(directory, { recursive: true });
const store = new SqliteStore(join(directory, 'research.sqlite'));
if (mode === 'configured') loadLocalEnvironment();
const app = mode === 'configured' ? new Application(store, configuredProviders(process.env, undefined, promptResolver(store))) : new Application(store);
try {
  const source = app.createAgent(`Affect experiment routing source · ${mode}`);
  console.log(`Evidence directory: ${directory}`);
  for (const definition of definitions) {
    const started = startSimulationTest(app, definition.id, mode, source.id, { enabled: false });
    const deadline = Date.now() + 45 * 60 * 1000;
    let run = started;
    while (run.status === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      run = listSimulationRuns(app).find(item => item.id === started.id)!;
    }
    await writeFile(join(directory, `${definition.id}-${run.id}.json`), JSON.stringify(run, null, 2), { flag: 'wx' });
    console.log(`${run.testId}: ${run.status} · ${run.evidenceBasis} · ${run.measures.map(measure => measure.outcome).join(', ')}`);
    if (run.status === 'running') throw new Error(`Observation deadline reached for ${run.id}; preserved running evidence is not a terminal hypothesis verdict`);
    if (run.status === 'failed') process.exitCode = 1;
  }
} finally { await app.close(); store.close(); }
