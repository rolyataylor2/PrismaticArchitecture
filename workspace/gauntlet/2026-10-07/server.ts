import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { SqliteStore } from '../../../packages/storage/src/sqlite.js';
import { Application } from '../../../packages/sdk/src/application.js';
import { configuredProviders } from '../../../packages/providers/src/config.js';
import { loadLocalEnvironment } from '../../../packages/providers/src/environment.js';
import { promptResolver } from '../../../packages/sdk/src/prompt-settings.js';
import { createResearchServer } from '../../../apps/server/src/server.js';
import { defaultRuntimeOptions } from '../../../packages/core/src/runtime.js';
loadLocalEnvironment();
const dir = resolve('workspace/gauntlet/2026-10-07');
const store = new SqliteStore(resolve(dir, 'research.sqlite'));
const providers = configuredProviders(process.env, undefined, promptResolver(store));
const app = new Application(store, providers, undefined, { ...defaultRuntimeOptions, maxTemporaryParts: 8, coverage: { maxHypothesesPerCycle: 2, maxOpenHypotheses: 6 } });
const source = new SqliteStore(resolve('workspace/agents/local.sqlite'));
const sourceId = 'agent_f5b11c7f-4364-40be-927b-57a28facbc2f';
if (!store.list('agent').length) {
  const ids = [];
  for (const name of ['Gauntlet longitudinal branch', 'Gauntlet clean comparison']) {
    const agent = app.createAgent(name); ids.push(agent.id);
    const settings = source.agentProviderSettings(sourceId);
    if (settings) store.saveAgentProviderSettings(agent.id, settings);
    for (const prompt of source.list('agent').length ? new Application(source).promptSettings(sourceId) : []) app.editPrompt(agent.id, prompt.task, 'agent', prompt.effective);
  }
  writeFileSync(resolve(dir, 'run-manifest.json'), JSON.stringify({ run_id: 'gauntlet-2026-10-07', createdAt: new Date().toISOString(), sourceAgentId: sourceId, developmentalAgentId: ids[0], comparisonAgentId: ids[1], startingConditions: 'Fresh constructed demo Identity; no seeded Parts, dispositions, predictions or memories. Source effective prompts and model configuration copied; source psychology untouched.', providers: { reasoning: app.agentInferenceSettings(ids[0]!), decisions: providers.decisions.label, embeddings: providers.embeddings.label }, limits: { interactions: 16, consolidationPasses: 2, wallClockMinutes: 25, measuredGenerativeTokens: 250000, maxTemporaryParts: 8, maxNewGapHypotheses: 2, maxOpenGapHypotheses: 6, structuralPopulationStop: 60, recursion: 'No same-cycle recursive scope creation permitted by runtime; preserve and stop if violated' }, provenance: 'Configured live models, deterministic embeddings; no semantic fixtures. No provider seed setting exposed.' }, null, 2));
  writeFileSync(resolve(dir, 'prompts.json'), JSON.stringify(app.promptSettings(ids[0]!), null, 2));
}
source.close();
const server = createResearchServer(app); server.listen(3011, '127.0.0.1', () => console.log('Gauntlet inspector http://127.0.0.1:3011'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close(() => { store.close(); process.exit(); }));
