import { interestDisposition, interestTime, defaultInterestSettings } from '../../core/src/disposition-interest.js';
import { generativeModels, modelProvider, vendorModel } from '../../core/src/generative-models.js';
import { generativeProvider } from '../../providers/src/generative.js';
import { validateQwenBaseUrl } from '../../providers/src/compatible-chat.js';
import { providerApiKey, providerConnections, encryptedProviderKey, serverProviderKey, removeProviderConnection, type ConnectedProvider } from './provider-connections.js';
import { agentClassifiers } from './classifier-settings.js';
import { executiveModuleEnabled } from '../../core/src/executive-profile.js';
import { repeatedPredictionContradiction } from './thought-model-evidence.js';
import { ThoughtRoutingSettingsSchema, type ThoughtRoutingSettings } from '../../core/src/thought-resources.js';
import { sensorFacts } from './sensor-input.js';
import { recoverInterruptedDreams } from './dream-state.js';
import { observeProvider, providerOperationContext, researchStageContext, suppressProviderObservation } from './provider-observation.js';
import { projectEnvironmentValue } from '../../providers/src/environment.js';
import { SelectedSkillReview } from './selected-skill-review.js';
import { ProcedureConsolidator } from './procedure-consolidation.js';
import { AgentSkillPackages } from './agent-skill-packages.js';
import { AgentSkillImports } from './agent-skill-imports.js';
import { resolve } from 'node:path';
import { ChatExecutor } from './chat-executor.js';
import { EmbodiedExecutive } from './embodied-executive.js';
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
import { FactSchema, ExecutionSchema, freeze, id, now, type Change, type Execution, type Fact } from '../../core/src/domain.js';
import { ConflictError } from '../../core/src/contracts.js';
import type { DecisionProvider, EmbeddingProvider, Executor, ReasoningProvider, Store } from '../../core/src/contracts.js';
import { CognitiveRuntime, defaultRuntimeOptions, type RuntimeOptions } from '../../core/src/runtime.js';
import { Inspection } from '../../core/src/inspection.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../providers/src/mock.js';
import { demoIdentity, demoParts } from './seed.js';
import { Consolidation } from '../../core/src/consolidation.js';
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
  readonly embodiedExecutives: EmbodiedExecutive;
  readonly #inference = new Map<string, Promise<void>>();
  readonly #checkpointReviews = new Map<string, { traceId: string; done: Promise<void> }>();
  #closing = false;
  constructor(readonly store: Store, providers: { decisions: DecisionProvider; reasoning: ReasoningProvider; embeddings: EmbeddingProvider } = {
    decisions: new MockDecisions(), reasoning: new MockReasoning(), embeddings: new MockEmbeddings(),
  }, executor?: Executor, options: RuntimeOptions = defaultRuntimeOptions,
  vault = new SecretVault(), embodimentBindings: Record<string, string> = {}) {
    this.runtimeConfiguration = freeze(structuredClone(options));
    this.#vault = vault;
    this.executiveConnections = new ExecutiveConnections(store, trace => {
      if (this.#closing || !executiveModuleEnabled(store.executiveProfile(trace.agentId), 'tools') || !store.executiveProfile(trace.agentId).attention.enabled) return;
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
    this.providers = { ...providers, decisions: agentClassifiers(store, providers.decisions, vault), reasoning: new AgentReasoningProvider(providers.reasoning, (agentId, requestedModel) => {
      const settings = store.agentProviderSettings(agentId);
      if (!settings) {
        if (requestedModel) throw new Error('Thought routing requires saved Agent provider settings');
        return observeProvider(store, providers.reasoning, 'reasoning', providers.reasoning.label);
      }
      const model = requestedModel ?? settings.model;
      const apiKey = providerApiKey(store, vault, agentId, modelProvider(model));
      if (!apiKey) throw new Error(`Set an API key in this Agent's Settings to use ${settings.model}`);
      const provider = generativeProvider(model, apiKey, promptResolver(store), observeUsage, store.agentProviderConnections(agentId).find(item => item.provider === 'qwen')?.baseUrl ?? process.env.QWEN_BASE_URL);
      return observeProvider(store, provider, 'reasoning', provider.label);
    }, { settings: agentId => store.agentProviderSettings(agentId)?.thoughtRouting ?? null,
      historyEscalation: (input, provider, threshold) => repeatedPredictionContradiction(store, input, provider, threshold),
      record: (input, assessment, model, reason, purpose) => store.appendEvent(input.agentId, input.world?.cycleId ?? null, 'cognition.resources',
        { worldId: input.world?.id ?? null, dispositionIds: input.dispositions?.map(disposition => disposition.id) ?? [], model, assessment, reason, purpose }) }) };
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
        if (!executiveModuleEnabled(store.executiveProfile(contract.agentId), 'tools')) return;
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
    this.embodiedExecutives = new EmbodiedExecutive(store, executor ?? this.executiveWorkers, embodimentBindings);
    this.runtime = new CognitiveRuntime(store, this.providers.decisions, this.providers.reasoning, providers.embeddings,
      new TeachingExecutiveExecutor(this.embodiedExecutives, execution => { if (executiveModuleEnabled(store.executiveProfile(execution.agentId), 'tools')) this.executiveTeaching.record(execution); this.#scheduleProcedures(execution); }), this.inspection, options,
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
      }, agentId => this.embodiedExecutives.isEmbodied(agentId));
    this.consolidation = new Consolidation(store, this.providers.reasoning, this.runtime.mutations, this.inspection, this.runtime.constructed);
    recoverInterruptedDreams(store, (cycleId, reason) => this.recoverCycle(cycleId, reason), (agentId, runId, reason) => this.recoverConsolidation(agentId, runId, reason));
  }
  identityAuthoringProvider(agentId: string): OpenAIProvider { return this.researcherAuthoringProvider(agentId); }
  researcherAuthoringProvider(agentId: string): OpenAIProvider {
    this.store.get('agent', agentId);
    const model = this.agentInferenceSettings(agentId).model;
    const key = providerApiKey(this.store, this.#vault, agentId, modelProvider(model));
    if (!key) throw new Error('Set an API key in Agent Settings before smart creation');
    return generativeProvider(model, key, promptResolver(this.store), undefined, this.store.agentProviderConnections(agentId).find(item => item.provider === 'qwen')?.baseUrl ?? process.env.QWEN_BASE_URL);
  }
  simulationEvaluatorProvider(agentId: string, model?: string): Pick<OpenAIProvider, 'label' | 'author'> {
    const selected = model ?? this.agentInferenceSettings(agentId).model;
    const key = providerApiKey(this.store, this.#vault, agentId, modelProvider(selected));
    if (!key) throw new Error('Configure a key for the evaluator model in Agent Settings or the server environment');
    return generativeProvider(selected, key, promptResolver(this.store), undefined, this.store.agentProviderConnections(agentId).find(item => item.provider === 'qwen')?.baseUrl ?? process.env.QWEN_BASE_URL);
  }

  agentActivationSettings(agentId: string) { return this.store.agentActivationSettings(agentId); }
  updateAgentActivationSettings(agentId: string, settings: { dispositionInterests?: Partial<import('../../core/src/disposition-interest.js').DispositionInterestSettings> | undefined; includeProcessingDispositions?: boolean | undefined; maxConcurrentThoughts?: number | undefined; maxQueuedThoughts?: number | undefined; activationPassLimit?: number | null | undefined; memorySearchEnabled?: boolean | undefined; memoryRelevanceThreshold?: number | undefined; memoryRecallLimit?: number | null | undefined; vectorSearchEnabled?: boolean | undefined; primitivesFirst?: boolean | undefined; reevaluateAfterDeliberation?: boolean | undefined }) {
    this.store.transaction(() => {
      const previous = this.agentActivationSettings(agentId);
      const next = { ...previous, ...Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)),
        ...(settings.dispositionInterests ? { dispositionInterests: { ...defaultInterestSettings, ...previous.dispositionInterests, ...settings.dispositionInterests } } : {}) };
      // Materialize under old rates; invalid settings roll back this entire transaction.
      const at = interestTime(this.store, agentId);
      if (settings.dispositionInterests) for (const disposition of this.store.list('disposition', agentId)) {
        if (!disposition.interestUpdatedAt || disposition.interestUpdatedAt >= at) continue;
        this.store.save('disposition', { ...interestDisposition(disposition, at, previous.dispositionInterests), version: disposition.version + 1,
          ...(disposition.development ? { development: { ...disposition.development, previousVersion: disposition.version } } : {}) }, disposition.version,
          { origin: 'researcher_edit', reason: 'Materialize interest decay before changing its settings', sourceIds: [] });
      }
      this.store.saveAgentActivationSettings(agentId, next);
    });
    return this.agentActivationSettings(agentId);
  }
  providerConnections(agentId: string) { return providerConnections(this.store, agentId); }
  addProviderConnection(agentId: string, provider: ConnectedProvider, apiKey: string, accountId?: string, baseUrl?: string) {
    if (provider === 'cloudflare' && !accountId) throw new Error('Cloudflare Account ID is required');
    if (provider === 'qwen' && baseUrl) validateQwenBaseUrl(baseUrl);
    const encryptedApiKey = this.#vault.encrypt(apiKey);
    this.store.transaction(() => {
      this.store.saveAgentProviderConnection(agentId, provider, encryptedApiKey, baseUrl);
      if (provider === 'cloudflare') this.store.saveAgentImageSettings(agentId, accountId!, encryptedApiKey);
    });
    return this.providerConnections(agentId);
  }
  removeProviderConnection(agentId: string, provider: ConnectedProvider) {
    removeProviderConnection(this.store, agentId, provider);
    return this.providerConnections(agentId);
  }
  agentClassifierSettings(agentId: string) {
    const saved = this.store.agentClassifierSettings(agentId);
    return { model: saved?.model ?? process.env.JEV_MODEL ?? 'jev-latest', hasAgentKey: Boolean(encryptedProviderKey(this.store, agentId, 'jev')),
      hasServerKey: Boolean(process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY),
      usesServerProvider: !saved, provider: this.providers.decisions.labelForAgent?.(agentId) ?? this.providers.decisions.label };
  }
  updateAgentClassifierSettings(agentId: string, input: { model: string; apiKey?: string | undefined; clearApiKey?: boolean | undefined }) {
    if (input.apiKey && input.clearApiKey) throw new Error('Choose a replacement classifier key or clear the key');
    const previous = this.store.agentClassifierSettings(agentId);
    const encryptedApiKey = input.clearApiKey ? null : input.apiKey ? this.#vault.encrypt(input.apiKey) : previous?.encryptedApiKey ?? null;
    if (!encryptedApiKey && (input.clearApiKey ? !process.env.JEV_API_KEY && !process.env.TYPESAFE_API_KEY : !providerApiKey(this.store, this.#vault, agentId, 'jev'))) throw new Error('Add a JEV API key for this Agent or configure JEV_API_KEY / TYPESAFE_API_KEY on the server');
    if (input.clearApiKey) removeProviderConnection(this.store, agentId, 'jev');
    if (input.apiKey) this.store.saveAgentProviderConnection(agentId, 'jev', encryptedApiKey!);
    this.store.saveAgentClassifierSettings(agentId, { model: input.model, encryptedApiKey });
    return this.agentClassifierSettings(agentId);
  }
  agentImageSettings(agentId: string) {
    const saved = this.store.agentImageSettings(agentId);
    return { accountId: saved?.accountId ?? '', hasApiKey: Boolean(encryptedProviderKey(this.store, agentId, 'cloudflare')) };
  }
  updateAgentImageSettings(agentId: string, input: { accountId: string; apiKey?: string | undefined; clearApiKey?: boolean | undefined }) {
    if (input.apiKey && input.clearApiKey) throw new Error('Choose a replacement key or clear the key');
    const saved = this.store.agentImageSettings(agentId);
    const encryptedApiKey = input.clearApiKey ? null : input.apiKey ? this.#vault.encrypt(input.apiKey) : saved?.encryptedApiKey ?? null;
    if (input.clearApiKey) removeProviderConnection(this.store, agentId, 'cloudflare');
    if (input.apiKey) this.store.saveAgentProviderConnection(agentId, 'cloudflare', encryptedApiKey!);
    this.store.saveAgentImageSettings(agentId, input.accountId, encryptedApiKey);
    return this.agentImageSettings(agentId);
  }
  async generateAgentImage(agentId: string, prompt: string) {
    const saved = this.store.agentImageSettings(agentId);
    const apiKey = providerApiKey(this.store, this.#vault, agentId, 'cloudflare');
    if (!saved?.accountId || !apiKey) throw new Error('Configure Cloudflare Account ID and API token in Agent Settings first');
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${saved.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 4 }), signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Cloudflare image generation failed (HTTP ${response.status})`);
    const body = await response.json() as { success?: boolean; result?: { image?: string } };
    if (body.success === false || !body.result?.image) throw new Error('Cloudflare returned no generated image');
    return { avatar: `data:image/jpeg;base64,${body.result.image}` };
  }
  agentInferenceSettings(agentId: string) {
    this.store.get('agent', agentId);
    const saved = this.store.agentProviderSettings(agentId);
    const mode = projectEnvironmentValue('PROVIDER');
    const model = saved?.model ?? (mode === 'xai' ? process.env.XAI_MODEL ?? 'grok-4.3' : mode === 'gemini' ? `gemini:${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite'}` : mode === 'qwen' ? `qwen:${process.env.QWEN_MODEL ?? 'qwen-flash'}` : mode === 'openrouter' ? `openrouter:${process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash-lite'}` : process.env.OPENAI_MODEL ?? 'gpt-4.1-nano');
    const serverKey = serverProviderKey(modelProvider(model));
    const additionalModels = [...new Set([model, saved?.thoughtRouting?.intuitiveModel, saved?.thoughtRouting?.deliberativeModel].filter((item): item is string => Boolean(item)))].filter(id => !generativeModels.some(item => item.id === id)).map(id => ({ id, label: `${vendorModel(id)} · ${modelProvider(id)}`, provider: modelProvider(id) }));
    return { model, thoughtRouting: saved?.thoughtRouting ?? null, usesAgentModel: saved !== null,
      hasAgentKey: Boolean(encryptedProviderKey(this.store, agentId, modelProvider(model))),
      hasServerKey: Boolean(serverKey), hasUsableKey: Boolean(encryptedProviderKey(this.store, agentId, modelProvider(model)) || serverKey), availableModels: [...generativeModels, ...additionalModels] };
  }
  updateAgentInferenceSettings(agentId: string, input: { model: string; apiKey?: string | undefined; clearApiKey?: boolean | undefined; thoughtRouting?: ThoughtRoutingSettings | null | undefined }) {
    this.store.get('agent', agentId);
    const provider = modelProvider(input.model);
    if (input.clearApiKey && input.apiKey) throw new Error('Choose either a new API key or clear the Agent key');
    const previous = this.store.agentProviderSettings(agentId);
    const switchingProvider = previous && modelProvider(previous.model) !== provider;
    const connectedKey = this.store.agentProviderConnections(agentId).find(item => item.provider === provider)?.encryptedApiKey;
    if (switchingProvider && previous.encryptedApiKey && !input.apiKey && !input.clearApiKey && !connectedKey) throw new Error('Changing provider requires its API key, or clearApiKey to use its server key');
    let encryptedApiKey = switchingProvider ? null : previous?.encryptedApiKey ?? null;
    if (input.clearApiKey) encryptedApiKey = null;
    if (input.apiKey) {
      if (input.apiKey.length < 16 || input.apiKey.length > 512 || /\s/.test(input.apiKey)) throw new Error('Enter a valid API key without whitespace');
      encryptedApiKey = this.#vault.encrypt(input.apiKey);
    }
    const serverKey = serverProviderKey(provider);
    if (!encryptedApiKey && !serverKey && !(input.clearApiKey ? false : connectedKey)) throw new Error(`Add an ${provider} API key for this Agent or to the server .env file`);
    const thoughtRouting = input.thoughtRouting === undefined ? previous?.thoughtRouting ?? null
      : input.thoughtRouting === null ? null : ThoughtRoutingSettingsSchema.parse(input.thoughtRouting);
    if (thoughtRouting) for (const model of [thoughtRouting.intuitiveModel, thoughtRouting.deliberativeModel]) modelProvider(model);
    if (thoughtRouting?.enabled) for (const model of [thoughtRouting.intuitiveModel, thoughtRouting.deliberativeModel]) {
      const selectedProvider = modelProvider(model);
      if (selectedProvider !== provider && !providerApiKey(this.store, this.#vault, agentId, selectedProvider))
        throw new Error(`Add a key for the thought model provider ${selectedProvider}`);
    }
    if (switchingProvider && previous.encryptedApiKey && !this.store.agentProviderConnections(agentId).some(item => item.provider === modelProvider(previous.model)))
      this.store.saveAgentProviderConnection(agentId, modelProvider(previous.model), previous.encryptedApiKey);
    if (input.clearApiKey) removeProviderConnection(this.store, agentId, provider);
    if (input.apiKey) this.store.saveAgentProviderConnection(agentId, provider, encryptedApiKey!);
    this.store.saveAgentProviderSettings(agentId, { model: input.model, encryptedApiKey, thoughtRouting });
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
  renameAgent(agentId: string, name: string, avatar?: string) {
    const trimmed = name.trim();
    const agent = this.store.get('agent', agentId);
    const updated = { ...agent, name: trimmed, ...(avatar === undefined ? {} : { avatar }), version: agent.version + 1 };
    this.inspection.atomic(() => {
      this.store.save('agent', updated, agent.version, { origin: 'researcher_edit', reason: 'Researcher edited Agent profile', sourceIds: [] });
    });
    return updated;
  }
  async #capabilities(agentId: string) {
    if (this.embodiedExecutives.isEmbodied(agentId)) return undefined;
    if (!executiveModuleEnabled(this.store.executiveProfile(agentId), 'tools')) return undefined;
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
  #coordinate<T>(agentId: string, operation: () => Promise<T>, concurrent = false): Promise<T> {
    if (this.#closing) return Promise.reject(new Error('Application is closing'));
    const previous = this.#inference.get(agentId) ?? Promise.resolve();
    const result = (concurrent ? Promise.resolve() : previous).then(operation);
    const tail = Promise.allSettled([previous, result]).then(() => {});
    this.#inference.set(agentId, tail);
    void tail.then(() => { if (this.#inference.get(agentId) === tail) this.#inference.delete(agentId); });
    return result;
  }
  async waitForInference(agentId: string): Promise<void> {
    while (this.#inference.has(agentId)) await this.#inference.get(agentId);
    await this.runtime.idle(agentId);
  }
  async consolidate(agentId: string, fromCycle?: number, toCycle?: number, options: Partial<import('../../core/src/consolidation-domain.js').SleepOptions> = {}) {
    return this.#coordinate(agentId, () => this.consolidation.run(agentId, fromCycle, toCycle, options));
  }
  async consolidateProcedures(agentId: string) {
    return this.#coordinate(agentId, () => this.procedureConsolidation.run(agentId));
  }
  protected messageFacts(text: string, source: string): Fact[] { return sensorFacts(text, source); }
  async message(agentId: string, text: string, source = 'user', threadId?: string, skillDocumentIds: string[] = [], clientMessageId?: string, observation?: { facts: Fact[]; expectedSnapshotId: string | null }) {
    const activeDream = this.store.experiments().find(run => run.kind === 'simulation_test' && (run.status === 'running' || run.status === 'paused') && run.agentId === agentId && run.dream);
    if (activeDream && (threadId !== activeDream.id || researchStageContext.getStore()?.runId !== activeDream.id)) throw new ConflictError('Agent is experiencing a dream; wait for it to finish');
    const facts = observation ? z.array(FactSchema).max(1000).parse(observation.facts) : this.messageFacts(text, source);
    return this.#coordinate(agentId, async () => {
      if (skillDocumentIds.length > 10 || new Set(skillDocumentIds).size !== skillDocumentIds.length) throw new Error('Request at most ten distinct skill documents');
      if (skillDocumentIds.length && this.embodiedExecutives.isEmbodied(agentId)) throw new Error('Embodied cognition does not receive technical procedure documents');
      if (skillDocumentIds.length && !executiveModuleEnabled(this.store.executiveProfile(agentId), 'tools')) throw new Error('Executive tool execution is disabled');
      const documents = await Promise.all(skillDocumentIds.map(async proposalId => {
        const proposal = await this.agentSkillImports.load(agentId, proposalId); const review = proposal.reviews.at(-1);
        if (review?.decision !== 'reviewed') throw new Error('Skill document requires a current same-Agent knowledge review');
        return { id: proposal.id, digest: proposal.digest, name: proposal.name, description: proposal.package.frontmatter.description,
          reviewRevision: review.revision, instructions: proposal.package.instructions };
      }));
      const capabilities = await this.#capabilities(agentId);
      if (observation) {
        const latest = this.store.events(agentId).findLast(event => event.type === 'worldstate.frozen');
        if ((latest?.type === 'worldstate.frozen' ? latest.payload.id : null) !== observation.expectedSnapshotId) throw new ConflictError('WorldState changed; reset edits to the latest snapshot before submitting');
      }
      return this.runtime.run(agentId, facts, threadId, capabilities, documents, clientMessageId, Boolean(observation));
    }, true);
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
    if (executiveModuleEnabled(this.store.executiveProfile(validated.agentId), 'tools')) this.executiveTeaching.record(validated);
    this.#scheduleProcedures(validated);
    return validated;
  }
  #scheduleProcedures(execution: Execution): void {
    if (this.#closing || !executiveModuleEnabled(this.store.executiveProfile(execution.agentId), 'tools') || execution.status !== 'completed' || execution.action.kind !== 'operate'
      || this.store.executiveProfile(execution.agentId).consolidation.mode === 'manual') return;
    // Queue behind the selecting/review cycle. Candidate inference never blocks a tool worker.
    void this.#coordinate(execution.agentId, () => executiveModuleEnabled(this.store.executiveProfile(execution.agentId), 'tools') ? this.procedureConsolidation.automatically(execution.agentId, execution.id) : Promise.resolve(null)).catch(error => {
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
    this.embodiedExecutives.close();
    try { await this.executiveWorkers.close(); }
    finally {
      try { await Promise.allSettled(this.#inference.values()); await this.runtime.close(); }
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
