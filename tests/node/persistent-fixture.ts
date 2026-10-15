import { now, type Fact } from '../../packages/core/src/domain.js';
import { CognitiveRuntime } from './historical/runtime.js';
import { defaultRuntimeOptions } from '../../packages/core/src/runtime.js';
import { ChatExecutor } from '../../packages/sdk/src/chat-executor.js';
import { Consolidation } from '../../packages/core/src/consolidation.js';
import { Application as ResearchApplication } from '../../packages/sdk/src/application.js';

/** Historical regression fixtures explicitly retain the persistent-Part experiment.
 * New constructed-cognition tests import the real Application and test its default. */
export class Application extends ResearchApplication {
  private readonly historicalMessages = new Map<string, Promise<void>>();
  override message(agentId: string, text: string, source = 'user', threadId?: string, skillDocumentIds: string[] = []) {
    const result = (this.historicalMessages.get(agentId) ?? Promise.resolve()).then(() =>
      super.message(agentId, text, source, threadId, skillDocumentIds));
    const tail = result.then(() => {}, () => {});
    this.historicalMessages.set(agentId, tail);
    void tail.then(() => { if (this.historicalMessages.get(agentId) === tail) this.historicalMessages.delete(agentId); });
    return result;
  }
  // Preserve the historical experiment's speech framing alongside its old runtime.
  protected override messageFacts(text: string, source: string): Fact[] {
    return [{ source, kind: 'says', text, referenceId: null, timestamp: now() }];
  }
  constructor(...args: ConstructorParameters<typeof ResearchApplication>) {
    super(...args);
    const runtime = new CognitiveRuntime(this.store, this.providers.decisions, this.providers.reasoning, this.providers.embeddings,
      args[2] ?? new ChatExecutor(this.store, this.providers.reasoning, this.inspection), this.inspection, args[3] ?? defaultRuntimeOptions);
    Object.assign(runtime, { idle: async () => {}, close: async () => {} });
    Object.defineProperty(this, 'runtime', { value: runtime });
    Object.defineProperty(this, 'consolidation', { value: new Consolidation(this.store, this.providers.reasoning, runtime.mutations, this.inspection, runtime.constructed) });
  }
  override createAgent(name = 'Demo Agent', architecture: 'constructed' | 'persistent' = 'persistent') {
    const agent = super.createAgent(name, architecture);
    const profile = this.store.executiveProfile(agent.id);
    this.store.saveExecutiveProfile(agent.id, { ...profile, enabled: true, modules: { speaking: true, tools: true }, revision: profile.revision + 1 }, profile.revision);
    if (architecture === 'persistent') this.store.saveAgentActivationSettings(agent.id, { vectorSearchEnabled: true, memoryRecallLimit: 12 });
    return agent;
  }
}
