import { resolve } from 'node:path';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { SqliteStore } from '../../../packages/storage/src/sqlite.js';
import { Application } from '../../../packages/sdk/src/application.js';
import { configuredProviders } from '../../../packages/providers/src/config.js';
import { createResearchServer, type ResearchDatabase } from './server.js';
import { loadLocalEnvironment } from '../../../packages/providers/src/environment.js';
import { promptResolver } from '../../../packages/sdk/src/prompt-settings.js';

loadLocalEnvironment();
const primaryPath = resolve(process.env.ONTOAGENTIC_DB ?? 'workspace/agents/local.sqlite');
const store = new SqliteStore(primaryPath);
const providers = configuredProviders(process.env, undefined, promptResolver(store));
const app = new Application(store, providers);
const researchRoot = resolve(process.env.ONTOAGENTIC_RESEARCH_ROOT ?? 'workspace/gauntlet');
const databases: ResearchDatabase[] = [];
const openedPaths = new Set([realpathSync(primaryPath)]);
if (existsSync(researchRoot)) {
  for (const directory of readdirSync(researchRoot, { withFileTypes: true }).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(researchRoot, directory.name, 'research.sqlite');
    if (!existsSync(path) || openedPaths.has(realpathSync(path))) continue;
    const researchStore = new SqliteStore(path);
    openedPaths.add(realpathSync(path));
    databases.push({ id: directory.name, label: `Experiment · ${directory.name}`,
      app: new Application(researchStore, configuredProviders(process.env, undefined, promptResolver(researchStore))) });
  }
}
const server = createResearchServer(app, process.cwd(), databases);
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => console.log(`OntoAgentic at http://127.0.0.1:${port}\n${providers.reasoning.label}\n${providers.decisions.label}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close(async () => {
  await Promise.all([app, ...databases.map(database => database.app)].map(application => application.close()));
  for (const database of databases) database.app.store.close();
  store.close(); process.exit();
}));
