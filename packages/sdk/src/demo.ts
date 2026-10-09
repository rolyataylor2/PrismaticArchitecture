import { Application } from './application.js';
import { configuredProviders } from '../../providers/src/config.js';
import { TextEncounter } from '../../simulation/src/encounter.js';
import type { Store, CognitiveEvent } from '../../core/src/contracts.js';

export async function developmentDemo(store: Store, observe: (event: CognitiveEvent) => void = () => {}, architecture: 'constructed' | 'persistent' = 'constructed') {
  const encounter = new TextEncounter('Bill');
  const app = new Application(store, configuredProviders({ ONTOAGENTIC_PROVIDER: 'mock' }), encounter);
  const agent = app.createAgent('Development demo', architecture);
  const unsubscribe = app.inspection.subscribe(observe);
  try {
    for (let turn = 0; turn < 2; turn++) {
      const result = await app.runtime.run(agent.id, encounter.observe(turn === 0
        ? 'Bill makes a personal joke. I wonder whether you are afraid to share uncertainty or vulnerability.'
        : 'I have another personal question about uncertainty and vulnerability.'));
      const response = result.executions.flatMap(execution => execution.facts.filter(f => f.kind === 'says'));
      if (response.length) await app.runtime.run(agent.id, response);
    }
    const beforeSleep = store.list('part', agent.id);
    const sleep = await app.consolidation.run(agent.id);
    const alex = new TextEncounter('Alex');
    const laterApp = new Application(store, configuredProviders({ ONTOAGENTIC_PROVIDER: 'mock' }), alex);
    const stopLaterInspection = laterApp.inspection.subscribe(observe);
    try { await laterApp.runtime.run(agent.id, alex.observe('I have a personal question about uncertainty and vulnerability.')); }
    finally { stopLaterInspection(); }
    return { agent, beforeSleep, afterSleep: store.list('part', agent.id), sleep,
      cycles: store.cycles(agent.id), predictions: store.list('prediction', agent.id), memories: store.list('memory', agent.id) };
  } finally { unsubscribe(); }
}
