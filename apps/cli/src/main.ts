import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { SqliteStore } from '../../../packages/storage/src/sqlite.js';
import { Application } from '../../../packages/sdk/src/application.js';
import { PartDraftSchema, PartPatchSchema } from '../../../packages/core/src/domain.js';
import { configuredProviders } from '../../../packages/providers/src/config.js';
import { api } from '../../../packages/sdk/src/api.js';
import { experimentNames, runExperiment, type ExperimentName } from '../../../packages/sdk/src/experiments.js';
import { developmentDemo } from '../../../packages/sdk/src/demo.js';
import { loadLocalEnvironment, projectEnvironmentValue } from '../../../packages/providers/src/environment.js';
import { promptResolver } from '../../../packages/sdk/src/prompt-settings.js';

loadLocalEnvironment();
const help = `The Prism Agent Architecture — local research CLI (default inference: deterministic/mock, not Jev)
Usage: npm run cli -- <command>
  agent list | agent create [name]
  chat <agent-id> [message]              interactive when message omitted
  cycle show <cycle-id>
  cycle recover <cycle-id> <reason>      only after confirming old process stopped
  parts list <agent-id> | parts show <part-id> | parts history <part-id>
  parts create <agent-id> <json-file>
  parts edit <part-id> <patch-json-file>
  parts archive <part-id> | parts reactivate <part-id>
  parts restore <part-id> <version>
  memories list <part-id> | memories show <memory-id> | memories history <memory-id>
  predictions list <agent-id> | predictions show <prediction-id>
  predictions history <prediction-id>
  identity show <agent-id>
  identity edit <agent-id> <patch-json-file> | identity history <agent-id>
  sleep run <agent-id> | sleep history <agent-id>
  sleep recover <agent-id> <run-id> <reason>
  experiment run <name> | experiment list
  inspect live <agent-id> | inspect cycle <cycle-id> | inspect world <world-id>
  demo
Set PRISM_DB to any SQLite path (default workspace/agents/local.sqlite).
Researcher edits append immutable versions. Live inspection can run in a second terminal.`;
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(help); process.exit(0); }
const store = new SqliteStore(resolve(projectEnvironmentValue('DB') ?? 'workspace/agents/local.sqlite'));
const app = new Application(store, configuredProviders(args[0] === 'demo' ? { PRISM_PROVIDER: 'mock' } : process.env, undefined, promptResolver(store)));
const output = (value: unknown): void => { console.log(JSON.stringify(value, null, 2)); };
const required = (index: number): string => { const value = args[index]; if (!value) throw new Error(`Missing argument.\n${help}`); return value; };
function showEvent(event: ReturnType<SqliteStore['events']>[number]): void {
  console.log(`[${event.sequence}] ${event.type} ${JSON.stringify(event.payload)}`);
}
try {
  const command = `${args[0]} ${args[1] ?? ''}`;
  if (command === 'agent list') output(store.list('agent'));
  else if (command.startsWith('agent create')) output(app.createAgent(args.slice(2).join(' ') || undefined));
  else if (args[0] === 'chat') {
    const agentId = required(1);
    const unsubscribe = app.inspection.subscribe(showEvent);
    try {
      if (args[2]) output(await app.message(agentId, args.slice(2).join(' ')));
      else {
        const reader = createInterface({ input: stdin, output: stdout });
        try {
          while (true) { const text = await reader.question('You (/quit to exit)> '); if (text === '/quit') break; if (text.trim()) await app.message(agentId, text); }
        } finally { reader.close(); }
      }
    } finally { unsubscribe(); }
  } else if (command === 'cycle show' || command === 'inspect cycle') output(app.inspectCycle(required(2)));
  else if (command === 'cycle recover') { app.recoverCycle(required(2), args.slice(3).join(' ')); output({ recovered: required(2) }); }
  else if (command === 'parts list') output(store.list('part', required(2)));
  else if (command === 'parts show') output(store.get('part', required(2)));
  else if (command === 'parts history') output(store.versions('part', required(2)));
  else if (command === 'parts create') output(app.runtime.mutations.create(required(2), PartDraftSchema.parse(JSON.parse(readFileSync(required(3), 'utf8'))),
    { origin: 'researcher_edit', reason: 'Manual CLI creation', sourceIds: [] }));
  else if (['parts edit', 'parts archive', 'parts reactivate', 'parts restore'].includes(command)) {
    const part = store.get('part', required(2));
    if (command === 'parts restore') output(app.runtime.mutations.restore(part.id, Number(required(3)), part.version));
    else {
      const patch = command === 'parts edit' ? PartPatchSchema.parse(JSON.parse(readFileSync(required(3), 'utf8')))
        : { lifecycle: command === 'parts archive' ? 'archived' as const : 'active' as const };
      output(app.runtime.mutations.patch(part.id, part.version, patch, { origin: 'researcher_edit', reason: 'Manual CLI edit', sourceIds: [] }));
    }
  } else if (command === 'memories list') {
    const part = store.get('part', required(2)); output(store.list('memory', part.agentId).filter(m => m.partId === part.id));
  } else if (command === 'memories show') output(store.get('memory', required(2)));
  else if (command === 'memories history') output(store.versions('memory', required(2)));
  else if (command === 'predictions list') output(store.list('prediction', required(2)));
  else if (command === 'predictions show') output(store.get('prediction', required(2)));
  else if (command === 'predictions history') output(store.versions('prediction', required(2)));
  else if (command === 'inspect world') output({ label: 'Objective ancestor / audit record', world: store.world(required(2)) });
  else if (command === 'identity show') output(store.get('identity', required(2)));
  else if (command === 'identity history') output(store.versions('identity', required(2)));
  else if (command === 'identity edit') output(await api(app, 'PATCH', `/api/agents/${required(2)}/identity`, {
    expectedVersion: store.get('identity', required(2)).version, patch: JSON.parse(readFileSync(required(3), 'utf8')),
  }));
  else if (command === 'experiment list') output({ names: experimentNames, runs: store.experiments() });
  else if (command === 'experiment run') {
    const name = required(2); if (!experimentNames.includes(name as ExperimentName)) throw new Error(`Choose ${experimentNames.join(', ')}`);
    output(await runExperiment(app, name as ExperimentName));
  }
  else if (command === 'sleep run') output(await app.consolidation.run(required(2)));
  else if (command === 'sleep history') output(store.consolidations(required(2)));
  else if (command === 'sleep recover') { app.recoverConsolidation(required(2), required(3), args.slice(4).join(' ')); output({ recovered: required(3) }); }
  else if (command === 'inspect live') {
    const agentId = required(2); store.get('agent', agentId);
    let sequence = 0;
    const poll = (): void => { for (const event of store.events(agentId, sequence)) { showEvent(event); sequence = event.sequence; } };
    poll();
    await new Promise<void>(resolve => {
      const timer = setInterval(poll, 300);
      process.once('SIGINT', () => { clearInterval(timer); resolve(); });
    });
  } else if (args[0] === 'demo') {
    console.log('DETERMINISTIC MOCK DEMO — fixture inference, not Jev or evidence of therapeutic efficacy.');
    output(await developmentDemo(store, showEvent));
    console.log('Run npm run dev and select Development demo to inspect this same persisted state in the web application.');
  } else throw new Error(`Unknown command.\n${help}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally {
  try { await app.close(); }
  finally { store.close(); }
}
