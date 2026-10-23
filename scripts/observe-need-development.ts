import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { SqliteStore } from '../packages/storage/src/sqlite.js';
import { Application } from '../packages/sdk/src/application.js';
import { needDevelopmentSimulations } from '../packages/sdk/src/need-development-simulations.js';
import { startSimulationTest, listSimulationRuns } from '../packages/sdk/src/simulation-tests.js';
import { simulationResearch, simulationCandidates, simulationCitation } from '../packages/sdk/src/simulation-research.js';
import { analyzeSimulation } from '../packages/sdk/src/simulation-analysis.js';
import { simulationReport } from '../packages/sdk/src/simulation-report.js';

// Explicit fixture evidence only; ordinary bundled mocks never validate learned psychology.
if (process.argv.length !== 3) throw new Error('Usage: tsx scripts/observe-need-development.ts NEW_PRIVATE_DIRECTORY');
const directory = resolve(process.argv[2]!);
await mkdir(directory, { mode: 0o700 });
await mkdir(join(directory, 'workspace'), { mode: 0o700 });
const originalCwd = process.cwd();process.chdir(join(directory, 'workspace'));
const store = new SqliteStore(join(directory, 'research.sqlite')), app = new Application(store);
await chmod(join(directory, 'research.sqlite'), 0o600);
const artifacts: Record<string, string> = {};
try {
  const source = app.createAgent('Preserved need-development fixture source');
  const before = JSON.stringify(store.events(source.id));
  for (const definition of needDevelopmentSimulations) {
    const started = startSimulationTest(app, definition.id, 'fixture', source.id, { enabled: false });
    let run = started;
    while (run.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 20));
      run = listSimulationRuns(app).find(item => item.id === started.id)!;
    }
    const research = simulationResearch(store, run.id), analysis = analyzeSimulation(store, run);
    const report = simulationReport(run, analysis, research, simulationCandidates(store, run), reference => simulationCitation(store, run, reference));
    const bytes = JSON.stringify({ run, research, analysis, report }, null, 2), name = `${definition.id}.json`;
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    artifacts[name] = createHash('sha256').update(bytes).digest('hex');
    console.log(`${definition.id}: ${run.status}; ${run.stages.length}/${run.totalSteps} stages; ${run.evidenceBasis}; ${run.measures.map(measure => measure.outcome).join(', ')}`);
    if (run.status !== 'completed' || run.researchAnalysisError) throw new Error(run.error ?? run.researchAnalysisError ?? 'Incomplete fixture run');
  }
  if (JSON.stringify(store.events(source.id)) !== before) throw new Error('Source Agent changed during fixture observation');
  await writeFile(join(directory, 'artifacts.json'), JSON.stringify({ evidenceBasis: 'fixture', sourceAgentPreserved: true, artifacts,
    limitations: 'No configured models, physical execution, empirical psychology or natural formation established.' }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Preserved fixture evidence: ${directory}`);
} finally { await app.close();store.close();process.chdir(originalCwd); }
