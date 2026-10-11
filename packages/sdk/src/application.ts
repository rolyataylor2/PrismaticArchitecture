import { observeProvider, providerOperationContext, researchStageContext, suppressProviderObservation } from './provider-observation.js';
import { projectEnvironmentValue } from '../../providers/src/environment.js';
import { SelectedSkillReview } from './selected-skill-review.js';
import { ProcedureConsolidator } from './procedure-consolidation.js';
import { AgentSkillPackages } from './agent-skill-packages.js';
import { AgentSkillImports } from './agent-skill-imports.js';
import { resolve } from 'node:path';
import { ChatExecutor } from './chat-executor.js';
import { ExecutiveConnections } from './executive-connections.js';
import { ExecutiveSkills } from './executive-skills.js';
import { ExecutiveTeaching } from './executive-teaching.js';
import { SelectedRemainderHandoff } from './remainder-handoff.js';
import { SelectedExecutionControl } from './executive-control.js';
import { TeachingExecutiveExecutor } from '../../executive/src/teaching-executor.js';
import { NativeExecutiveExecutor } from '../../executive/src/native-executor.js';
import { BackgroundExecutiveExecutor } from '../../executive/src/background-executor.js';
import { validateExecutionUpdate } from '../../core/src/execution-lifecycle.js';
import type { ExternalCapabilities } from '../../core/src/mcp-configuration.js';
import { ExecutionSchema, freeze, id, now, type Change, type Execution, type Fact } from '../../core/src/domain.js';
import type { DecisionProvider, EmbeddingProvider, Executor, ReasoningProvider, Store } from '../../core/src/contracts.js';
import { CognitiveRuntime, defaultRuntimeOptions, type RuntimeOptions } from '../../core/src/runtime.js';
import { Inspection } from '../../core/src/inspection.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../providers/src/mock.js';
import { demoIdentity, demoParts } from './seed.js';
import { Consolidation } from '../../core/src/consolidation.js';
import { XaiProvider } from '../../providers/src/xai.js';
import { OpenAIProvider, type UsageObserver } from '../../providers/src/openai.js';
import { AgentReasoningProvider } from '../../providers/src/agent-reasoning.js';
import { SecretVault } from '../../providers/src/secret-vault.js';
import { editPrompt, promptSettings, resetAllPrompts, resetPrompt, promptResolver } from './prompt-settings.js';
import type { PromptTask } from '../../core/src/domain.js';
import { ExecutiveCompetenceSchema, type ExecutiveCompetence } from '../../core/src/executive-attention.js';
import { RemainderAuthoritySchema } from '../../core/src/remainder-authority.js';
import { prepareRemainderInstruction } from '../../core/src/remainder-instruction.js';
import { verifyCorrectionBoundary } from '../../core/src/correction-boundary.js';

export class Application {
  readonly agentSkillImports: AgentSkillImports;
  readonly agentSkillPackages: AgentSkillPackages;
  readonly procedureConsolidation: ProcedureConsolidator;
  readonly executiveConnections: ExecutiveConnections;
  readonly executiveSkills: ExecutiveSkills;
  readonly executiveTeaching: ExecutiveTeaching;
  readonly executiveControl: SelectedExecutionControl;
  readonly remainderHandoff: SelectedRemainderHandoff;
  readonly inspection: Inspection;
  readonly runtime: CognitiveRuntime;
  readonly consolidation: Consolidation;
  readonly providers: { decisions: DecisionProvider; reasoning: ReasoningProvider; embeddings: EmbeddingProvider };
  readonly runtimeConfiguration: RuntimeOptions;
  readonly #vault: SecretVault;
  readonly executiveWorkers: BackgroundExecutiveExecutor;
  readonly #inference = new Map<string, Promise<void>>();
  readonly #checkpointReviews = new Map<string, { traceId: string; done: Promise<void> }>();
  #closing = false;
  constructor(readonly store: Store, providers: { decisions: DecisionProvider; reasoning: ReasoningProvider; embeddings: EmbeddingProvider } = {
    decisions: new MockDecisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings(),
  }, executor?: Executor, options: RuntimeOptions = defaultRuntimeOptions,
  vault = new SecretVault()) {
    this.runtimeConfiguration = freeze(structuredClone(options));
    this.#vault = vault;
    this.executiveConnections = new ExecutiveConnections(store, trace => {
      if (this.#closing || !store.executiveProfile(trace.agentId).enabled || !store.executiveProfile(trace.agentId).attention.enabled) return;
      const execution = store.executions(trace.agentId).find(item => item.contractId === trace.contractId);
      // Background handoffs exist before tool submission. Synchronous checkpoints cannot re-enter their source cycle.
      if (!execution || execution.status !== 'running') return;
      const status = trace.outcome?.status ?? 'unverified';
      const completed = store.eventsByType(trace.agentId, ['execution.tool_trace'], [execution.cycleId]).flatMap(event =>
        event.type === 'execution.tool_trace' && event.payload.contractId === trace.contractId && event.payload.phase === 'finished'
          && event.payload.outcome?.status === 'succeeded' ? [`${event.payload.serverId} / ${event.payload.toolName}`] : []);
      const review = this.observeExecution(trace.agentId, execution.id, [{ source: 'External execution', kind: 'observes',
        text: `Tool ${trace.serverId} / ${trace.toolName} returned operational status ${status} for the selected activity “${execution.action.text}”. This status alone does not establish goal completion.`,
        timestamp: trace.timestamp, referenceId: trace.id }, { source: 'External execution', kind: 'observes',
        text: `At this tool result, the recorded successful call prefix contains ${completed.length} calls: ${completed.slice(0, 20).map((tool, index) => `${index + 1}. ${tool}`).join('; ') || 'none'}. Successful calls do not establish whole-goal completion. This is historical checkpoint progress; later submissions must be rechecked before changing the remainder.`,
        timestamp: trace.timestamp, referenceId: trace.id }], 'tool_result', {
        confidence: status === 'reported_error' || status === 'blocked' || status === 'unverified' ? 0 : null,
        coverage: null, evidence: status === 'succeeded' ? 'The selected tool returned successfully; overall procedural competence and coverage were not assessed.'
          : `The selected tool returned ${status}; reliable continuation of this exact strategy is unsupported.`,
      }).catch(error => {
        this.inspection.emit(trace.agentId, null, 'infrastructure.error', { stage: 'executive_attention',
          message: error instanceof Error ? error.message : String(error) });
        throw error;
      });
      this.#checkpointReviews.set(trace.contractId, { traceId: trace.id, done: review.then(() => {}) });
      void review.catch(() => {});
      void this.#checkpointReviews.get(trace.contractId)!.done.catch(() => {});
    });
    this.agentSkillPackages = new AgentSkillPackages(store, projectEnvironmentValue('SKILLS_ROOT') ?? resolve('workspace/skills'));
    this.agentSkillImports = new AgentSkillImports(store, projectEnvironmentValue('SKILLS_ROOT') ?? resolve('workspace/skills'));
    this.executiveSkills = new ExecutiveSkills(store, skill => this.agentSkillPackages.schedule(skill));
    const observeUsage: UsageObserver = record => {
      if (suppressProviderObservation.getStore()) return;
      const scope = researchStageContext.getStore(); const operationId = providerOperationContext.getStore();
      store.appendEvent(record.agentId, record.cycleId, 'provider.usage', { ...record.usage,
        ...(scope?.agentId === record.agentId ? { researchScope: { runId: scope.runId, stageId: scope.stageId, stageIndex: scope.stageIndex, startEventId: scope.startEventId } } : {}),
        ...(operationId ? { operationId } : {}) });
    };
    this.providers = { ...providers, decisions: observeProvider(store, providers.decisions, 'decisions'), reasoning: observeProvider(store, new AgentReasoningProvider(providers.reasoning, agentId => {
      const settings = store.agentProviderSettings(agentId);
      if (!settings) return providers.reasoning;
      const apiKey = settings.encryptedApiKey ? vault.decrypt(settings.encryptedApiKey) : (settings.model === 'grok-4.3' ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY) ?? '';
      if (!apiKey) throw new Error(`Set an API key in this Agent's Settings to use ${settings.model}`);
      return settings.model === 'grok-4.3' ? new XaiProvider(apiKey, settings.model, fetch, promptResolver(store), observeUsage) : new OpenAIProvider(apiKey, settings.model, fetch, promptResolver(store), 'openai', observeUsage);
    }), 'reasoning') };
    this.procedureConsolidation = new ProcedureConsolidator(store, this.providers.reasoning, this.executiveSkills);
    this.inspection = new Inspection(store, agentId => {
      const scope = researchStageContext.getStore();
      if (!scope || scope.agentId !== agentId) return undefined;
      return { runId: scope.runId, stageId: scope.stageId, stageIndex: scope.stageIndex, startEventId: scope.startEventId };
    });
    this.executiveTeaching = new ExecutiveTeaching(store, this.executiveSkills, this.inspection);
    this.executiveWorkers = new BackgroundExecutiveExecutor(new NativeExecutiveExecutor(
      new ChatExecutor(store, this.providers.reasoning, this.inspection), contract => this.executiveConnections.executionGateway(contract), undefined,
      input => this.executiveControl.pause(input), async (contract, completedSteps) => {
        if (!store.executiveProfile(contract.agentId).enabled) return;
        const attention = store.executiveProfile(contract.agentId).attention;
        if (attention.enabled && attention.reviewInterested && attention.awaitCheckpointReview) {
          const execution = store.executions(contract.agentId).find(item => item.contractId === contract.id && item.status === 'running');
          if (!execution || !this.executiveWorkers.owns(contract.agentId, execution.id)) throw new Error('Checkpoint boundary has no live local worker');
          const finished = store.eventsByType(contract.agentId, ['execution.tool_trace'], [contract.cycleId]).filter(event =>
            event.type === 'execution.tool_trace' && event.payload.contractId === contract.id && event.payload.phase === 'finished'
            && event.payload.outcome?.status === 'succeeded');
          const traceRefs = finished.flatMap(event => event.type === 'execution.tool_trace' ? [event.payload.traceId] : []);
          if (traceRefs.length !== completedSteps || new Set(traceRefs).size !== traceRefs.length)
            throw new Error('Checkpoint progress disagrees with recorded successful calls');
          const reached = this.inspection.emit(contract.agentId, contract.cycleId, 'execution.checkpoint_boundary',
            { executionId: execution.id, contractId: contract.id, completedSteps, traceRefs });
          const boundaryInput = { agentId: contract.agentId, threadId: contract.threadId, executionId: execution.id, boundaryId: reached.id };
          verifyCorrectionBoundary(store, boundaryInput, (agentId, executionId) => this.executiveWorkers.owns(agentId, executionId),
            (agentId, executionId, count) => this.executiveWorkers.atCheckpoint(agentId, executionId, count));
          const review = this.#checkpointReviews.get(contract.id);
          if (review && review.traceId === traceRefs.at(-1)) await review.done;
          verifyCorrectionBoundary(store, boundaryInput, (agentId, executionId) => this.executiveWorkers.owns(agentId, executionId),
            (agentId, executionId, count) => this.executiveWorkers.atCheckpoint(agentId, executionId, count));
        }
      }, async input => {
        const handoff = await this.remainderHandoff.handoff({ contract: input.contract!, bid: input.bid });
        if (handoff.ready) return this.executiveWorkers.executeReadyRemainder(input);
        return { id: id('execution'), agentId: input.agentId, cycleId: input.cycleId, action: input.bid.action,
          contractId: input.contract!.id, status: 'blocked', facts: [{ source: 'External execution', kind: 'observes', timestamp: now(),
            originCycleId: input.cycleId, referenceId: null, text: `The selected remainder was not dispatched: ${handoff.reason}. Consumption: ${handoff.consumed ?? 'unknown'}.` }],
          operational: { attempts: 0, verified: false, reason: handoff.reason, traceRefs: [] } };
      }, input => new SelectedSkillReview(store, this.agentSkillPackages).execute(input)), {
      executions: agentId => store.executions(agentId), report: execution => { this.reportExecution(execution); },
      reportError: (agentId, executionId) => {
        const previous = store.executions(agentId).find(item => item.id === executionId);
        if (!previous || previous.status !== 'running') return;
        const ledger = store.eventsByType(previous.agentId, ['execution.tool_trace'], [previous.cycleId])
          .filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === previous.contractId && event.payload.phase === 'submitted');
        this.reportExecution({ ...previous, status: 'unverified', facts: [{ source: 'External execution', kind: 'observes',
          timestamp: now(), originCycleId: previous.cycleId, referenceId: previous.id,
          text: `Execution of “${previous.action.text}” has an unverified outcome: the external worker stopped without a verified result.` }], operational: { attempts: ledger.length, verified: false,
          reason: 'External worker stopped without a verified result; inspect the execution audit', traceRefs: ledger.map(event => event.type === 'execution.tool_trace' ? event.payload.traceId : '') } });
      },
    });
    this.remainderHandoff = new SelectedRemainderHandoff(store, this.inspection, this.executiveWorkers);
    this.executiveControl = new SelectedExecutionControl(store, this.inspection, this.executiveWorkers);
    this.runtime = new CognitiveRuntime(store, this.providers.decisions, this.providers.reasoning, providers.embeddings,
      new TeachingExecutiveExecutor(executor ?? this.executiveWorkers, execution => { if (store.executiveProfile(execution.agentId).enabled) this.executiveTeaching.record(execution); this.#scheduleProcedures(execution); }), this.inspection, options,
      async (agentId, skillId, version) => {
        await this.agentSkillPackages.flush(agentId);
        const loaded = await this.agentSkillPackages.resolveMethod(agentId, skillId, version);
        return { skill: loaded.method, digest: loaded.digest };
      }, input => {
        if (input.bid.action.kind !== 'operate' || !input.bid.action.operation.remainderCorrection) return;
        const prepared = prepareRemainderInstruction(store, { ...input, ...input.bid.action.operation.remainderCorrection }, this.executiveWorkers);
        return RemainderAuthoritySchema.parse({ parentExecutionId: prepared.parentExecutionId, parentContractId: prepared.parentContractId,
          checkpointTraceId: prepared.checkpointTraceId, completedSteps: prepared.completedSteps, completedTraceRefs: prepared.completedTraceRefs,
          deadlineAt: prepared.deadlineAt, limits: prepared.limits });
      });
    this.consolidation = new Consolidation(store, this.providers.reasoning, this.runtime.mutations, this.inspection, this.runtime.constructed);
  }
  identityAuthoringProvider(agentId: string): OpenAIProvider { return this.researcherAuthoringProvider(agentId); }
  researcherAuthoringProvider(agentId: string): OpenAIProvider {
    this.store.get('agent', agentId);
    const settings = this.store.agentProviderSettings(agentId);
    const xai = settings?.model === 'grok-4.3' || (!settings && projectEnvironmentValue('PROVIDER') === 'xai');
    const apiKey = settings?.encryptedApiKey ? this.#vault.decrypt(settings.encryptedApiKey) : (xai ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY) ?? '';
    if (!apiKey) throw new Error('Set an API key in Agent Settings before smart creation');
    if (xai) return new XaiProvider(apiKey, settings?.model ?? process.env.XAI_MODEL, fetch, promptResolver(this.store));
    return new OpenAIProvider(apiKey, settings?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-nano');
  }
  simulationEvaluatorProvider(agentId: string, model?: string): Pick<OpenAIProvider, 'label' | 'author'> {
    this.store.get('agent', agentId);
    const settings = this.store.agentProviderSettings(agentId);
    const selected = model ?? this.agentInferenceSettings(agentId).model;
    if (!['gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini', 'grok-4.3'].includes(selected)) throw new Error('Choose a supported evaluator model');
    const xai = selected === 'grok-4.3';
    const sameVendor = settings && (settings.model === 'grok-4.3') === xai;
    const key = sameVendor && settings.encryptedApiKey ? this.#vault.decrypt(settings.encryptedApiKey)
      : (xai ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY) ?? '';
    if (!key) throw new Error('Configure a key for the evaluator model in Agent Settings or the server environment');
    return xai ? new XaiProvider(key, selected) : new OpenAIProvider(key, selected);
  }
  agentActivationSettings(agentId: string) { return this.store.agentActivationSettings(agentId); }
  updateAgentActivationSettings(agentId: string, settings: { memorySearchEnabled?: boolean | undefined; memoryRelevanceThreshold?: number | undefined; memoryRecallLimit?: number | null | undefined; vectorSearchEnabled?: boolean | undefined; primitivesFirst?: boolean | undefined; reevaluateAfterDeliberation?: boolean | undefined }) {
    this.store.saveAgentActivationSettings(agentId, { ...this.agentActivationSettings(agentId), ...Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) });
    return this.agentActivationSettings(agentId);
  }
  agentInferenceSettings(agentId: string) {
    this.store.get('agent', agentId);
    const saved = this.store.agentProviderSettings(agentId);
    const model = saved?.model ?? (projectEnvironmentValue('PROVIDER') === 'xai' ? process.env.XAI_MODEL ?? 'grok-4.3' : process.env.OPENAI_MODEL ?? 'gpt-4.1-nano');
    const serverKey = model === 'grok-4.3' ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY;
    return { model, usesAgentModel: saved !== null,
      hasAgentKey: saved?.encryptedApiKey !== null && saved?.encryptedApiKey !== undefined,
      hasServerKey: Boolean(serverKey), hasUsableKey: Boolean(saved?.encryptedApiKey || serverKey), availableModels: [
        { id: 'gpt-5-nano', label: 'GPT-5 nano · $0.05 / 1M input tokens' },
        { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano · $0.10 / 1M input tokens' },
        { id: 'grok-4.3', label: 'Grok 4.3 · xAI · reasoning off' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini · non-reasoning · $0.40 / 1M input tokens' },
      ] };
  }
  updateAgentInferenceSettings(agentId: string, input: { model: string; apiKey?: string | undefined; clearApiKey?: boolean | undefined }) {
    this.store.get('agent', agentId);
    const models = ['gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini', 'grok-4.3'];
    if (!models.includes(input.model)) throw new Error('Choose a supported inference model');
    if (input.clearApiKey && input.apiKey) throw new Error('Choose either a new API key or clear the Agent key');
    const previous = this.store.agentProviderSettings(agentId);
    const switchingProvider = previous && (previous.model === 'grok-4.3') !== (input.model === 'grok-4.3');
    if (switchingProvider && previous.encryptedApiKey && !input.apiKey && !input.clearApiKey) throw new Error('Changing provider requires its API key, or clearApiKey to use its server key');
    let encryptedApiKey = switchingProvider ? null : previous?.encryptedApiKey ?? null;
    if (input.clearApiKey) encryptedApiKey = null;
    if (input.apiKey) {
      if (input.apiKey.length < 16 || input.apiKey.length > 512 || /\s/.test(input.apiKey)) throw new Error('Enter a valid API key without whitespace');
      encryptedApiKey = this.#vault.encrypt(input.apiKey);
    }
    const serverKey = input.model === 'grok-4.3' ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY;
    if (!encryptedApiKey && !serverKey) throw new Error(`Add an ${input.model === 'grok-4.3' ? 'xAI' : 'OpenAI'} API key for this Agent or to the server .env file`);
    this.store.saveAgentProviderSettings(agentId, { model: input.model, encryptedApiKey });
    return this.agentInferenceSettings(agentId);
  }
  promptSettings(agentId: string) { return promptSettings(this.store, agentId); }
  editPrompt(agentId: string, task: PromptTask, scope: 'agent' | 'global', text: string) { return editPrompt(this.store, agentId, task, scope, text); }
  resetPrompt(agentId: string, task: PromptTask, scope: 'agent' | 'global') { return resetPrompt(this.store, agentId, task, scope); }
  resetAllPrompts() { return resetAllPrompts(this.store); }
  /** The historical profile seeds offline research Parts; online cognition always constructs instances. */
  createAgent(name = 'Demo Agent', architecture: 'constructed' | 'persistent' = 'constructed') {
    const agentId = id('agent');
    const change: Change = { origin: 'seed', reason: 'Instantiate inspectable demo preset', sourceIds: ['demo-v1'] };
    this.inspection.atomic(() => {
      this.store.save('agent', { id: agentId, agentId, version: 1, schemaVersion: 1, name, architecture, createdAt: now() }, 0, change);
      this.store.saveAgentActivationSettings(agentId, { vectorSearchEnabled: false, memoryRecallLimit: null });
      this.store.save('identity', { ...structuredClone(demoIdentity), traits: demoIdentity.traits.map(trait => ({ ...structuredClone(trait), id: id('trait'), createdAt: now() })), id: agentId, agentId, version: 1, schemaVersion: 2 }, 0, change);
      if (architecture === 'persistent') for (const draft of demoParts) this.runtime.mutations.create(agentId, structuredClone(draft), change);
    });
    return this.store.get('agent', agentId);
  }
  changeConsolidationProfile(agentId: string, architecture: 'constructed' | 'persistent') {
    const agent = this.store.get('agent', agentId);
    if (this.store.cycles(agentId).some(cycle => cycle.status === 'running') || this.store.consolidations(agentId).some(run => run.status === 'running')) throw new Error('Wait for current cognition or consolidation to finish');
    const next = { ...agent, architecture, version: agent.version + 1 };
    this.store.save('agent', next, agent.version, { origin: 'researcher_edit', reason: `Selected ${architecture} offline consolidation profile`, sourceIds: [] });
    return next;
  }
  renameAgent(agentId: string, name: string) {
    const trimmed = name.trim();
    const agent = this.store.get('agent', agentId);
    const updated = { ...agent, name: trimmed, version: agent.version + 1 };
    this.inspection.atomic(() => {
      this.store.save('agent', updated, agent.version, { origin: 'researcher_edit', reason: 'Researcher renamed Agent', sourceIds: [] });
    });
    return updated;
  }
  async #capabilities(agentId: string) {
    if (!this.store.executiveProfile(agentId).enabled) return undefined;
    let capabilities: ExternalCapabilities | undefined;
    const permissions = this.store.mcpPermissions(agentId);
    if (permissions.tools.length) {
      try {
        const catalog = await this.executiveConnections.agentCatalog(agentId);
        capabilities = { status: 'available', permissionRevision: catalog.revision, tools: catalog.tools };
      } catch {
        capabilities = { status: 'unavailable', permissionRevision: this.store.mcpPermissions(agentId).revision, tools: [] };
      }
    }
    return capabilities;
  }
  /** Coordinate inference only; external workers/cancellation continue independently. */
  #coordinate<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
    if (this.#closing) return Promise.reject(new Error('Application is closing'));
    const result = (this.#inference.get(agentId) ?? Promise.resolve()).then(operation);
    const tail = result.then(() => {}, () => {});
    this.#inference.set(agentId, tail);
    void tail.then(() => { if (this.#inference.get(agentId) === tail) this.#inference.delete(agentId); });
    return result;
  }
  async waitForInference(agentId: string): Promise<void> {
    while (this.#inference.has(agentId)) await this.#inference.get(agentId);
  }
  async consolidateProcedures(agentId: string) {
    return this.#coordinate(agentId, () => this.procedureConsolidation.run(agentId));
  }
  async message(agentId: string, text: string, source = 'user', threadId?: string, skillDocumentIds: string[] = []) {
    const fact: Fact = { source, kind: 'says', text, referenceId: null, timestamp: now() };
    return this.#coordinate(agentId, async () => {
      if (skillDocumentIds.length > 10 || new Set(skillDocumentIds).size !== skillDocumentIds.length) throw new Error('Request at most ten distinct skill documents');
      if (skillDocumentIds.length && !this.store.executiveProfile(agentId).enabled) throw new Error('Executive is disabled');
      const documents = await Promise.all(skillDocumentIds.map(async proposalId => {
        const proposal = await this.agentSkillImports.load(agentId, proposalId); const review = proposal.reviews.at(-1);
        if (review?.decision !== 'reviewed') throw new Error('Skill document requires a current same-Agent knowledge review');
        return { id: proposal.id, digest: proposal.digest, name: proposal.name, description: proposal.package.frontmatter.description,
          reviewRevision: review.revision, instructions: proposal.package.instructions };
      }));
      return this.runtime.run(agentId, [fact], threadId, await this.#capabilities(agentId), documents);
    });
  }
  async observeExecution(agentId: string, executionId: string, facts: Fact[], checkpoint: 'tool_result' | 'environment' = 'environment',
    competence: ExecutiveCompetence = { confidence: null, coverage: null, evidence: 'No operational competence or procedure coverage assessment was supplied.' }) {
    const assessed = ExecutiveCompetenceSchema.parse(competence);
    return this.#coordinate(agentId, async () => {
      const settings = this.store.executiveProfile(agentId).attention;
      const capabilities = settings.enabled && settings.checkpoints.includes(checkpoint) ? await this.#capabilities(agentId) : undefined;
      return this.runtime.monitorExecution(agentId, executionId, facts, checkpoint, assessed, capabilities);
    });
  }
  async consultExecution(agentId: string, executionId: string, facts: Fact[], reason: string,
    competence: ExecutiveCompetence = { confidence: null, coverage: null, evidence: 'No operational competence or procedure coverage assessment was supplied.' }) {
    const requestedReason = z.string().trim().min(1).max(4000).parse(reason);
    const assessed = ExecutiveCompetenceSchema.parse(competence);
    return this.#coordinate(agentId, async () => this.runtime.monitorExecution(agentId, executionId, facts,
      'environment', assessed, await this.#capabilities(agentId), requestedReason));
  }
  inspectCycle(cycleId: string) {
    const cycle = this.store.cycle(cycleId);
    return { cycle, world: this.store.world(cycle.worldId), events: this.store.events(cycle.agentId).filter(e => e.cycleId === cycleId) };
  }
  reportExecution(execution: Execution): Execution {
    const validated = ExecutionSchema.parse(execution);
    const previous = this.store.executions(validated.agentId).find(e => e.id === validated.id);
    if (!previous) throw new Error('Execution identity or selected action mismatch');
    validateExecutionUpdate(previous, validated);
    this.inspection.atomic(() => {
      this.store.saveExecution(validated);
      this.inspection.emit(validated.agentId, validated.cycleId, 'execution.status', validated);
      if (validated.guidance && !previous.guidance) this.inspection.emit(validated.agentId, validated.cycleId, 'execution.guidance', validated.guidance);
    });
    if (!['running', 'pending'].includes(validated.status) && validated.contractId) this.#checkpointReviews.delete(validated.contractId);
    // External retention failures must not roll back an already observed tool outcome.
    if (this.store.executiveProfile(validated.agentId).enabled) this.executiveTeaching.record(validated);
    this.#scheduleProcedures(validated);
    return validated;
  }
  #scheduleProcedures(execution: Execution): void {
    if (this.#closing || !this.store.executiveProfile(execution.agentId).enabled || execution.status !== 'completed' || execution.action.kind !== 'operate'
      || this.store.executiveProfile(execution.agentId).consolidation.mode === 'manual') return;
    // Queue behind the selecting/review cycle. Candidate inference never blocks a tool worker.
    void this.#coordinate(execution.agentId, () => this.store.executiveProfile(execution.agentId).enabled ? this.procedureConsolidation.automatically(execution.agentId, execution.id) : Promise.resolve(null)).catch(error => {
      try { this.procedureConsolidation.recordTriggerFailure(execution.agentId, execution.id, error); }
      catch { /* A persistence outage cannot roll back an already recorded operational outcome. */ }
    });
  }
  cancelExecution(agentId: string, executionId: string): Execution {
    const execution = this.store.executions(agentId).find(item => item.id === executionId);
    if (!execution || execution.status !== 'running') throw new Error('Execution is not running for this Agent');
    this.executiveWorkers.cancel(agentId, executionId);
    return this.reportExecution({ ...execution, operational: { ...execution.operational!,
      reason: 'Cancellation requested; submitted external effects have not been verified as reversed' } });
  }
  async close(): Promise<void> {
    this.#closing = true;
    try { await this.executiveWorkers.close(); }
    finally {
      try { await Promise.allSettled(this.#inference.values()); }
      finally {
        try { await this.agentSkillPackages.flush(); }
        finally { await this.executiveConnections.close(); }
      }
    }
  }
  recoverCycle(cycleId: string, reason: string): void {
    if (reason.trim().length < 10) throw new Error('Recovery requires an explicit reason after confirming the old process stopped');
    const cycle = this.store.cycle(cycleId);
    if (cycle.status !== 'running') throw new Error('Only interrupted running cycles can be recovered');
    this.inspection.atomic(() => {
      this.store.saveCycle({ ...cycle, status: 'failed', error: `Researcher recovery: ${reason}` });
      this.inspection.emit(cycle.agentId, cycleId, 'researcher.recovery', { targetId: cycleId, targetKind: 'cycle', reason, origin: 'researcher_edit' });
    });
  }
  recoverConsolidation(agentId: string, runId: string, reason: string): void {
    if (reason.trim().length < 10) throw new Error('Recovery requires an explicit reason after confirming the old process stopped');
    const run = this.store.consolidations(agentId).find(r => r.id === runId);
    if (!run || run.status !== 'running') throw new Error('Only interrupted running consolidation can be recovered');
    this.inspection.atomic(() => {
      this.store.saveConsolidation({ ...run, status: 'failed', error: `Researcher recovery: ${reason}` });
      this.inspection.emit(agentId, null, 'researcher.recovery', { targetId: runId, targetKind: 'consolidation', reason, origin: 'researcher_edit' });
    });
  }
}
import { z } from 'zod';
