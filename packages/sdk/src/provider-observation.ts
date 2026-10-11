import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { InfrastructureError, type Store } from '../../core/src/contracts.js';
import { id, now } from '../../core/src/domain.js';
import type { ProviderOperation } from '../../core/src/provider-operation.js';
import { promptSettings } from './prompt-settings.js';
export const providerOperationContext = new AsyncLocalStorage<string>();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex');
const tasks: Record<string, string[]> = {
  cognize: ['cognition'], predict: ['prediction'], evaluate: ['evaluation'], question: ['deliberation'], answer: ['answer'],
  score: ['activation'], recall: ['memory_relevance'], choose: ['arbitration'], chooseAffect: ['affect_selection'],
  shouldPredict: ['prediction_gate'], checkPrediction: ['prediction_outcome'], checkHypothesis: ['hypothesis_outcome'],
  affectInquiry: ['affect_inquiry'], reviseFocusedBid: ['focused_bid_revision'], renderSpeech: ['speech'],
  consolidate: ['consolidation', 'reconsolidation', 'formation'], reinterpret: ['replay'], consolidateProcedures: ['executive_skill_consolidation'],
};
type Context = { agentId?: string; task?: string; world?: { agentId: string; cycleId: string; id: string };
  identity?: { agentId: string }; part?: { agentId: string; id: string }; prediction?: { id: string } | null };
/** Observe existing calls without injecting audit metadata into domain inputs or provider prompts. */
export function observeProvider<T extends { label: string }>(store: Store, provider: T, component: ProviderOperation['component']): T {
  const functions = new Map<PropertyKey, unknown>();
  return new Proxy(provider, { get(target, property) {
    const value = Reflect.get(target, property, target) as unknown;
    if (typeof value !== 'function') return value;
    if (property === 'labelForAgent' || property === 'close') return value.bind(target);
    if (functions.has(property)) return functions.get(property);
    const method = String(property);
    const observed = async (...args: unknown[]) => {
      const context = args[0] as Context | undefined;
      const agentId = context?.agentId ?? context?.world?.agentId ?? context?.part?.agentId ?? context?.identity?.agentId;
      if (!agentId) return value.apply(target, args);
      const taskNames = context?.task ? [context.task] : tasks[method] ?? [];
      const selectedModel = component === 'reasoning' ? store.agentProviderSettings(agentId)?.model : null;
      const providerLabel = selectedModel ? `${selectedModel === 'grok-4.3' ? 'xai' : 'openai'}/${selectedModel}` : provider.label;
      const catalog = promptSettings(store, agentId);
      const startedAt = now(); const started = performance.now();
      const inputArguments = structuredClone(args);
      const operation: ProviderOperation = { operationId: id('operation'), parentOperationId: providerOperationContext.getStore() ?? null, component, method,
        task: taskNames.join(' + ') || method, provider: providerLabel, phase: 'started', startedAt, finishedAt: null, elapsedMs: null,
        input: { id: id('provider_input'), hash: hash(inputArguments), arguments: inputArguments, worldId: context?.world?.id ?? null,
          partId: context?.part?.id ?? null, predictionId: context?.prediction?.id ?? null }, output: null,
        prompts: catalog.filter(prompt => taskNames.includes(prompt.task)).map(prompt => ({ task: prompt.task, version: prompt.version,
          hash: hash(prompt.effective), text: prompt.effective })), validation: 'not_reported', usage: null, cost: null, error: null };
      const cycleId = context?.world?.cycleId ?? null;
      store.appendEvent(agentId, cycleId, 'provider.operation', operation);
      const recordedUsage = (): ProviderOperation['usage'] => {
        const records = store.eventsByType(agentId, ['provider.usage']).flatMap(event => event.type === 'provider.usage' && event.payload.operationId === operation.operationId ? [event] : []);
        return records.length ? { eventIds: records.map(event => event.id), inputTokens: records.reduce((sum, event) => sum + event.payload.inputTokens, 0),
          outputTokens: records.reduce((sum, event) => sum + event.payload.outputTokens, 0),
          cachedInputTokens: records.every(event => event.payload.cacheReported === true) ? records.reduce((sum, event) => sum + event.payload.cachedInputTokens, 0) : null } : null;
      };
      try {
        const result = await providerOperationContext.run(operation.operationId, () => value.apply(target, args));
        store.appendEvent(agentId, cycleId, 'provider.operation', { ...operation, phase: 'returned', usage: recordedUsage(), finishedAt: now(), elapsedMs: performance.now() - started,
          output: { id: id('provider_output'), hash: hash(result), value: structuredClone(result) } });
        return result;
      } catch (error) {
        // Raw arbitrary vendor messages/response bodies may contain secrets. Retain safe contract locations and sanitized infrastructure messages only.
        const validation = error instanceof z.ZodError;
        const infrastructure = error instanceof InfrastructureError;
        store.appendEvent(agentId, cycleId, 'provider.operation', { ...operation, phase: 'failed', usage: recordedUsage(), finishedAt: now(), elapsedMs: performance.now() - started,
          error: { category: validation || (infrastructure && error.diagnostics?.issues?.length) ? 'validation' : infrastructure ? 'infrastructure' : 'unclassified',
            stage: infrastructure ? error.stage : null, name: validation ? 'ZodError' : infrastructure ? 'InfrastructureError' : 'Error',
            message: validation ? 'Provider adapter rejected a structured output contract.' : infrastructure ? error.message : 'Provider adapter failed; raw exception text is excluded.',
            httpStatus: infrastructure ? error.diagnostics?.httpStatus ?? null : null, retryable: infrastructure ? error.diagnostics?.retryable ?? null : null, issues: validation ? error.issues.slice(0, 40).map(issue => ({ path: issue.path.join('.'), code: issue.code })) : infrastructure ? error.diagnostics?.issues ?? [] : [] } });
        throw error;
      }
    };
    functions.set(property, observed); return observed;
  } });
}
