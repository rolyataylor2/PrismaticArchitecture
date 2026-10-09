import { writeFileSync } from 'node:fs';
import { SqliteStore } from '../../../packages/storage/src/sqlite.js';
const root='workspace/gauntlet/2026-10-07'; const store=new SqliteStore(`${root}/research.sqlite`);
try {
 const agents=store.list('agent'); const versions=agents.flatMap(agent => (['agent','identity','part','disposition','memory','prediction'] as const).flatMap(kind => store.list(kind,agent.id).flatMap(entity => store.versions(kind,entity.id).map(version => ({kind,entityId:entity.id,record:version})))));
 writeFileSync(`${root}/version-history.json`,JSON.stringify(versions,null,2));
 for (const agent of agents) writeFileSync(`${root}/checkpoints/final-${agent.name.includes('comparison')?'comparison':'development'}-events.json`,JSON.stringify(store.events(agent.id),null,2));
} finally {store.close();}
