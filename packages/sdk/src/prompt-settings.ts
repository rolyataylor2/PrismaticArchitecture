import type { Store } from '../../core/src/contracts.js';
import type { PromptTask } from '../../core/src/domain.js';
import { PromptOverrideSchema, PromptTaskSchema } from '../../core/src/domain.js';
import { promptCatalog, type PromptResolver } from '../../providers/src/prompts.js';
import { promptInspection } from '../../providers/src/prompt-inspection.js';
import { validatePromptTemplate } from '../../providers/src/prompts.js';

export const promptResolver = (store: Store): PromptResolver => (agentId, task) => {
  const agent = store.promptOverrides({ scope: 'agent', agentId, task })[0];
  if (agent) return agent.text;
  return store.promptOverrides({ scope: 'global', task })[0]?.text;
};

export function promptSettings(store: Store, agentId: string) {
  store.get('agent', agentId);
  const agentOverrides = new Map(store.promptOverrides({ scope: 'agent', agentId }).map(item => [item.task, item.text]));
  const globalOverrides = new Map(store.promptOverrides({ scope: 'global' }).map(item => [item.task, item.text]));
  return promptCatalog.map(definition => {
    const agent = agentOverrides.get(definition.task);
    const global = globalOverrides.get(definition.task);
    const effective = agent ?? global ?? definition.original;
    return { ...definition, effective, inspection: promptInspection[definition.task],
      source: agent !== undefined ? 'agent' : global !== undefined ? 'global' : 'original' };
  });
}

export function editPrompt(store: Store, agentId: string, task: PromptTask, scope: 'agent' | 'global', text: string) {
  store.get('agent', agentId); PromptTaskSchema.parse(task);
  if (!promptCatalog.some(definition => definition.task === task)) throw new Error('This inference task is not used by the application');
  if (!text.trim() || text.length > 32768) throw new Error('Prompt must contain 1–32,768 characters');
  validatePromptTemplate(text);
  store.savePromptOverride(PromptOverrideSchema.parse({ scope, agentId: scope === 'agent' ? agentId : null, task, text }));
  return { task, scope, saved: true };
}

export function resetPrompt(store: Store, agentId: string, task: PromptTask, scope: 'agent' | 'global') {
  store.get('agent', agentId); PromptTaskSchema.parse(task);
  if (!promptCatalog.some(definition => definition.task === task)) throw new Error('This inference task is not used by the application');
  store.deletePromptOverride(scope, scope === 'agent' ? agentId : null, task);
  return { task, scope, reset: true };
}

export function resetAllPrompts(store: Store) {
  const agentCount = store.list('agent').length;
  const promptCount = promptCatalog.length;
  store.clearPromptOverrides();
  return { promptCount, agentCount };
}
