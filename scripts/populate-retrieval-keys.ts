/** Explicit researcher backfill for the existing seed Parts and the local dog perspective. */
import { SqliteStore } from '../packages/storage/src/sqlite.js';
import { Inspection } from '../packages/core/src/inspection.js';
import { PartMutations } from '../packages/core/src/mutations.js';
import { demoParts } from '../packages/sdk/src/seed.js';

const store = new SqliteStore(process.env.PRISM_DB ?? 'workspace/agents/local.sqlite');
try {
  const mutations = new PartMutations(store, new Inspection(store));
  const keys = new Map(demoParts.map(part => [part.name, part.retrievalKeys ?? []]));
  keys.set('Fear of dogs', ['Pet', 'Animal', 'Dog', 'Entity', 'Safety']);
  store.transaction(() => {
    for (const part of store.list('part')) {
      if (part.retrievalKeys?.length) continue;
      const retrievalKeys = keys.get(part.name);
      if (!retrievalKeys) { console.log(`No authored keys for ${part.name}; skipped`); continue; }
      if (store.cycles(part.agentId).some(cycle => cycle.status === 'running') || store.consolidations(part.agentId).some(run => run.status === 'running')) {
        throw new Error('Wait for active cognition or consolidation to finish before populating keys');
      }
      mutations.patch(part.id, part.version, { retrievalKeys }, {
        origin: 'researcher_edit', reason: 'Populate descriptive vector-only retrieval keys', sourceIds: [],
      });
      console.log(`${part.name}: ${retrievalKeys.join(', ')}`);
    }
  });
} finally { store.close(); }
