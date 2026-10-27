import { createInterface } from 'node:readline';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Application } from '../../../packages/sdk/src/application.js';
import { SqliteStore } from '../../../packages/storage/src/sqlite.js';
import { FactSchema } from '../../../packages/core/src/domain.js';
import { configuredProviders } from '../../../packages/providers/src/config.js';
import { promptResolver } from '../../../packages/sdk/src/prompt-settings.js';
import { loadLocalEnvironment } from '../../../packages/providers/src/environment.js';

const identity = z.string().min(1).max(16000);
const Config = z.strictObject({ databasePath: z.string().min(1), drainTimeoutMs: z.number().int().min(1).max(600000).default(120000),
  agents: z.record(identity, z.strictObject({ endpoint: z.string().url(), threadId: identity, expectedSnapshotId: identity.nullable() })) });
const Command = z.discriminatedUnion('method', [
  z.strictObject({ id: identity, method: z.literal('status') }),
  z.strictObject({ id: identity, method: z.literal('seal') }),
  z.strictObject({ id: identity, method: z.literal('observe'), agentId: identity, facts: z.array(FactSchema).max(1000) }),
]);
const [configPath, ...extra] = process.argv.slice(2);
if (!configPath || extra.length) throw new Error('Usage: tsx apps/cli/src/embodied-session.ts PRIVATE_CONFIG_JSON');
loadLocalEnvironment();
const config = Config.parse(JSON.parse(await readFile(configPath, 'utf8')));
if (!Object.keys(config.agents).length || !(await stat(config.databasePath)).isFile()) throw new Error('Existing owned Agent database and bindings required');
const store = new SqliteStore(resolve(config.databasePath));
for (const [agentId, binding] of Object.entries(config.agents)) {
  store.get('agent', agentId);
  const latest = store.eventsByType(agentId, ['worldstate.frozen']).at(-1);
  if ((latest?.type === 'worldstate.frozen' ? latest.payload.id : null) !== binding.expectedSnapshotId)
    throw new Error('Session cursor must match existing Agent history');
}
const providers = configuredProviders(process.env, undefined, promptResolver(store));
const app = new Application(store, providers, undefined, undefined, undefined,
  Object.fromEntries(Object.entries(config.agents).map(([id, binding]) => [id, binding.endpoint])));
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const active = new Set<Promise<unknown>>(), busyAgents = new Set<string>(), requestIds = new Set<string>();
let state: 'active' | 'sealing' | 'failed' = 'active';
let closing: Promise<void> | undefined;
const close = () => closing ??= app.close().finally(() => store.close());
const reply = (id: string, ok: boolean, result: unknown) => process.stdout.write(JSON.stringify({ id, ok, ...(ok ? { result } : { error: result }) }) + '\n');
const cursors = () => Object.fromEntries(Object.entries(config.agents).map(([agentId, binding]) => [agentId,
  { threadId: binding.threadId, expectedSnapshotId: binding.expectedSnapshotId }]));
const pause = () => { for (const [agentId, binding] of Object.entries(config.agents)) app.runtime.pauseThinking(agentId, binding.threadId); };
async function seal(id: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([(async () => {
      pause();
      await Promise.allSettled([...active]);
      pause();
      await Promise.all(Object.keys(config.agents).map(agentId => app.waitForInference(agentId)));
      for (const agentId of Object.keys(config.agents)) {
        if (store.cycles(agentId).some(cycle => cycle.status === 'running')
          || store.consolidations(agentId).some(run => run.status === 'running')
          || store.executions(agentId).some(execution => execution.status === 'running' || execution.status === 'pending'))
          throw new Error('Unfinished Agent work prevents sealing');
        const latest = store.eventsByType(agentId, ['worldstate.frozen']).at(-1);
        config.agents[agentId]!.expectedSnapshotId = latest?.type === 'worldstate.frozen' ? latest.payload.id : null;
      }
      await close();
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Drain timed out')), config.drainTimeoutMs); })]);
    if (state !== 'sealing') throw new Error('Session failed while draining');
    process.stdout.write(JSON.stringify({ id, ok: true, result: { status: 'sealed', agents: cursors(),
      providers: { reasoning: providers.reasoning.label, decisions: providers.decisions.label, embeddings: providers.embeddings.label } } }) + '\n', () => process.exit(0));
  } catch {
    state = 'failed'; reply(id, false, { message: 'Session did not seal; inspect preserved storage before further work' });
    process.exitCode = 1;
    void close().finally(() => process.exit(1));
  } finally { clearTimeout(timer); }
}
input.on('line', line => {
  let command: z.infer<typeof Command>;
  try {
    if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('Command exceeds budget');
    command = Command.parse(JSON.parse(line));
    if (requestIds.has(command.id)) throw new Error('Duplicate request identity');
    requestIds.add(command.id);
  } catch { state = 'failed'; reply('invalid', false, { message: 'Invalid or repeated session command; no retry authority' }); return; }
  if (state !== 'active') { reply(command.id, false, { message: 'Session admission is closed' }); return; }
  if (command.method === 'status') { reply(command.id, true, { status: 'active', agents: cursors() }); return; }
  if (command.method === 'seal') { state = 'sealing'; void seal(command.id); return; }
  const binding = config.agents[command.agentId];
  if (!Object.hasOwn(config.agents, command.agentId) || !binding || busyAgents.has(command.agentId)) { reply(command.id, false, { message: 'Agent is unbound or already receiving an observation' }); return; }
  busyAgents.add(command.agentId);
  const observation = app.message(command.agentId, '', 'external body', binding.threadId, [], undefined,
    { facts: command.facts, expectedSnapshotId: binding.expectedSnapshotId }).then(result => {
      binding.expectedSnapshotId = result.cycle.worldId;
      reply(command.id, true, result);
    }).catch(() => { state = 'failed'; reply(command.id, false, { message: 'Observation outcome is uncertain; no automatic retry' }); })
    .finally(() => { busyAgents.delete(command.agentId); active.delete(observation); });
  active.add(observation);
});
input.on('close', () => {
  if (state === 'sealing') return;
  state = 'failed'; void close().finally(() => process.exit(1));
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  state = 'failed'; void close().finally(() => process.exit(1));
});
