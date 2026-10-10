import type { z } from 'zod';
import type { PrimitiveActivation, PrimitiveContext, PrimitiveSettings, Primitive } from './primitives.js';
import type { ConsolidationContext, ConsolidationRun, DevelopmentResultSchema, ReplayResultSchema } from './consolidation-domain.js';
import type {
  Activation, ActivationScore, ActionBid, Bid, Change, Choice, Cognition, Contribution, Cycle, DeliberationAnswerSchema, EntityKind, EntityMap,
  Execution, Fact, Part, Prediction, PredictionUpdate, QuestionSchema, DeliberationSchema, DeliberationMessage, SelfContext, VersionRecord, WorldState, Memory,
  PromptOverride, PromptTask, PredictionOutcome, PredictionDraftSchema, IdentityTrait,
} from './domain.js';

export type PartContext = { world: WorldState; part: Part; memories: Memory[]; prediction: Prediction | null; activation: Activation;
  effortfulRecollections?: { recollection: string; uncertainty: string }[];
  dispositions?: import('./domain.js').Disposition[];
  availableContributors?: { partId: string; name: string }[];
  recentThoughts?: { cycleId: string; thought: string; interpretation: string }[] };
export type PredictionContext = PartContext & { cognition: Cognition };
export type PredictionEvidenceContext = PartContext & { prediction: Prediction; laterEvidence: Fact[] };
export type HypothesisEvidenceContext = { world: WorldState; prediction: Prediction; laterEvidence: Fact[] };
export type ActivationInput = { world: WorldState; candidates: Omit<Part, 'retrievalKeys'>[]; primitives?: Primitive[]; primitiveSensitivities?: IdentityTrait[];
  directParticipants?: { partId: string; name: string }[];
  partActivationContext?: { partId: string; previous: number; memories: { timestamp: string | null; gist: string }[]; prediction: Prediction | null }[] };
export type MemoryRelevanceInput = { world: WorldState; purpose: 'recall' | 'candidates' | 'search'; entries: { part: Part; memory: Memory; timestamp: string | null }[] };
export interface DecisionProvider {
  chooseAffect?(context: import('./affect-domain.js').AffectSelectionContext): Promise<import('./affect-domain.js').AffectChoice>;
  judge?(input: import('./constructed-domain.js').JudgmentInput): Promise<ActivationScore[]>;
  recall?(input: MemoryRelevanceInput): Promise<ActivationScore[]>;
  readonly label: string;
  score(input: ActivationInput): Promise<ActivationScore[]>;
  choose(context: SelfContext): Promise<Choice>;
  shouldPredict(context: PredictionContext): Promise<boolean>;
  checkHypothesis?(context: HypothesisEvidenceContext): Promise<PredictionOutcome>;
  checkPrediction(context: PredictionEvidenceContext): Promise<PredictionOutcome>;
}
export interface ReasoningProvider {
  affectInquiry?(context: import('./affect-domain.js').AffectSelectionContext): Promise<z.infer<typeof DeliberationSchema>>;
  reviseFocusedBid?(context: FocusedBidContext): Promise<z.infer<typeof DeliberationAnswerSchema>>;
  consolidateProcedures?(input: import('./procedure-consolidation.js').ProcedureConsolidationInput): Promise<unknown>;
  constructed?(input: import('./constructed-domain.js').ConstructedInput): Promise<unknown>;
  readonly label: string;
  renderSpeech?(context: import('./domain.js').SpeechContext): Promise<z.infer<typeof import('./domain.js').SpeechResultSchema>>;
  primitive?(context: PrimitiveContext): Promise<Cognition>;
  primitiveAnswer?(context: PrimitiveContext & { currentBid: Bid | null; deliberation: DeliberationMessage[] }, question: string): Promise<z.infer<typeof DeliberationAnswerSchema>>;
  cognize(context: PartContext): Promise<Cognition>;
  predict(context: PredictionContext): Promise<z.infer<typeof PredictionDraftSchema>>;
  question(context: SelfContext): Promise<z.infer<typeof DeliberationSchema>>;
  answer(context: PartContext & { currentBid?: Bid | null; deliberation?: DeliberationMessage[] }, question: string): Promise<z.infer<typeof DeliberationAnswerSchema>>;
  evaluate(context: PredictionEvidenceContext & { outcome: 'correct' | 'incorrect' }): Promise<PredictionUpdate>;
  consolidate(context: ConsolidationContext): Promise<z.infer<typeof DevelopmentResultSchema>>;
  reinterpret(context: { part: Part; memory: Memory; ancestor: WorldState; reason: string }): Promise<z.infer<typeof ReplayResultSchema>>;
}
export type FocusedBidContext = PartContext & { currentBid: Bid | null;
  selectedFocus: import('./affect-domain.js').SelectedAffect;
  expressed: Pick<Contribution, 'thought' | 'interpretation' | 'affect' | 'evidenceSummary'> };
export interface EmbeddingProvider { readonly label: string; embed(text: string): Promise<number[]> }
export interface Executor {
  recorded?(execution: Execution): void;
  resume?(input: Parameters<Executor['execute']>[0]): Promise<Execution>;
  execute(input: { agentId: string; cycleId: string; bid: ActionBid; contract?: import('./execution-contract.js').ExecutionContract }): Promise<Execution>;
  executeSay?(input: { agentId: string; cycleId: string; bids: ActionBid[]; contract?: import('./execution-contract.js').ExecutionContract }): Promise<Execution>;
}

export type EventPayloads = {
  'executive.skill_package_copied': { sourceAgentId: string; skillId: string; version: number; packageDigest: string; proposalId: string; reason: string };
  'executive.profile_copied': { sourceAgentId: string; sourceRevision: number; targetRevision: number; reason: string };
  'execution.procedure_review': { contractId: string; skillId: string; sourceVersion: number; resultVersion: number; decision: 'approval' | 'rejection'; reason: string; packageDigest: string }; 
  'cognition.coverage': import('./cognition-coverage.js').CognitionCoverage;
  'provider.usage': { provider: string; task: string; inputTokens: number; cachedInputTokens: number; outputTokens: number; cacheKey: string | null };
  'construction.inference_started': import('./constructed-domain.js').ConstructedInput;
  'construction.temporary_scope_budget': { limit: number; activeScopeIds: string[]; admittedScopeIds: string[]; deferredScopeIds: string[] };
  'construction.generated': { partId: string; result: z.infer<typeof import('./constructed-domain.js').PartGenerationSchema> };
  'construction.judgment': { input: import('./constructed-domain.js').JudgmentInput; scores: ActivationScore[] };
  'execution.attention': import('./executive-attention.js').ExecutiveAttentionRecord;
  'execution.remainder_handoff_failed': { contractId: string; stage: 'consume' | 'cancel' | 'wait' | 'ready'; consumed: boolean; reason: string };
  'execution.remainder_ready': { contractId: string; parentExecutionId: string };
  'execution.remainder_claim': { contractId: string; authority: import('./remainder-authority.js').RemainderAuthority };
  'execution.checkpoint_boundary': { executionId: string; contractId: string; completedSteps: number; traceRefs: string[] };
  'execution.review_started': { executionId: string; activity: import('./execution-review.js').SelectedActivity };
  'execution.consultation_requested': { executionId: string; contractId: string; reason: string };
  'execution.review_completed': { executionId: string; outcome: 'thoughts_only' | 'continued' | 'selected' | 'no_external_selection'; selectedBidIds: string[] };
  'execution.intervention': { contractId: string; executionId: string; targetExecutionId: string; targetContractId: string;
    state: 'requested' | 'stopped'; parentStatus?: import('./domain.js').Execution['status'] };
  'part.instance_retired': { partId: string; reason: string };
  'disposition.learned': import('./domain.js').Disposition;

  'primitive.thought': { primitive: PrimitiveContext['primitive']; output: Cognition; durationMs: number };
  'primitive.bid_created': Bid;
  'primitive.deliberation_response': { primitiveId: string } & z.infer<typeof DeliberationAnswerSchema>;
  'cycle.started': Cycle;
  'worldstate.frozen': WorldState;
  'activation.vector_candidates': { candidates: { partId: string; similarity: number; reasons: string[] }[]; population: number };
  'activation.scoring_started': ActivationInput;
  'activation.scored': { results: Activation[]; primitives?: PrimitiveActivation[]; provider: string };
  'activation.part_activated': Activation;
  'activation.spike': Activation;
  'part.reasoning_started': { partId: string; provider: string };
  'part.thought': { partId: string; partSnapshot: Part; predictionSnapshot: Prediction | null; output: Cognition; durationMs: number; recalledMemoryIds?: string[] };
  'prediction.formation_checked': { partId: string; shouldPredict: boolean; provider: string };
  'prediction.outcome_checked': { partId: string | null; predictionId: string; outcome: PredictionOutcome; provider: string };
  'part.prediction_created': Prediction;
  'part.prediction_revised': Prediction;
  'part.bid_created': Bid;
  'part.affect_proposals': { partId: string; proposals: import('./affect-domain.js').AffectBid[] };
  'self.arbitration_started': SelfContext;
  'self.affect_selection_started': import('./affect-domain.js').AffectSelectionContext;
  'self.affect_inquiry_started': import('./affect-domain.js').AffectSelectionContext;
  'self.affect_choice': import('./affect-domain.js').AffectChoice;
  'part.focused_bid_revision_started': FocusedBidContext;
  'self.choice': Choice;
  'self.experienced_transition': import('./domain.js').ExperiencedTransition;
  // Historical audit records remain immutable and readable. New cycles never emit these.
  'self.debate_started': { round: number };
  'part.debate_response': { partId: string; answer: string; proposal: import('./domain.js').Proposal | null };
  'primitive.debate_response': { primitiveId: string; answer: string; proposal: import('./domain.js').Proposal | null };
  'self.deliberation_started': { round: number; sourceBidId: string | null };
  'self.deliberation_planned': z.infer<typeof DeliberationSchema>;
  'part.bid_withdrawn': { partId: string; bidId: string | null };
  'primitive.bid_withdrawn': { primitiveId: string; bidId: string | null };
  'self.question': z.infer<typeof QuestionSchema>;
  'part.deliberation_response': { partId: string } & z.infer<typeof DeliberationAnswerSchema>;
  'speech.realization_started': import('./domain.js').SpeechContext;
  'execution.handoff': { bid: ActionBid };
  'execution.contract': import('./execution-contract.js').ExecutionContract;
  'execution.tool_trace': { traceId: string; contractId: string; serverId: string; toolName: string; phase: string;
    arguments?: Record<string, unknown>; outcome?: Record<string, unknown>; progress?: { progress: number; total?: number; message?: string } };
  'execution.status': Execution;
  'execution.guidance': import('./execution-guidance.js').ExecutionGuidance;
  'execution.guidance_instruction': { contractId: string; continuation: import('./execution-guidance.js').GuidanceContinuation };
  'execution.procedure_teaching': import('./procedure-teaching.js').ProcedureTeachingReport;
  'prediction.evaluation': { partId: string | null; prediction: Prediction; update: PredictionUpdate };
  'memory.episodic_created': Memory;
  'memory.relevance_scored': { worldId: string; purpose: 'recall' | 'candidates'; provider: string; scores: { memoryId: string; partId: string; score: number; relevance: number; distribution?: import('./domain.js').ActivationScore['distribution'] }[]; selectedMemoryIds: string[] }; 
  'part.mutation_proposed': { partId: string; patch: unknown; change: Change };
  'part.mutation_rejected': { partId: string; patch: unknown; change: Change; reason: string };
  'part.mutation_applied': { part: Part; change: Change };
  'cycle.completed': Cycle;
  'consolidation.started': ConsolidationRun;
  'consolidation.replay_selected': ConsolidationRun['selections'][number];
  'consolidation.mutation_proposed': ConsolidationRun['changes'][number];
  'consolidation.mutation_decided': ConsolidationRun['changes'][number];
  'consolidation.completed': ConsolidationRun;
  'memory.reconsolidated': Memory;
  'memory.ancestor_replayed': { partId: string; memoryId: string; ancestorId: string; reason: string; before: string; after: string; changed: boolean };
  'infrastructure.error': { stage: string; message: string };
  'researcher.recovery': { targetId: string; targetKind: 'cycle' | 'consolidation'; reason: string; origin: 'researcher_edit' };
};
export type CognitiveEvent = { [K in keyof EventPayloads]: {
  id: string; sequence: number; agentId: string; cycleId: string | null; at: string;
  type: K; payload: EventPayloads[K];
} }[keyof EventPayloads];
export interface Store {
  deleteAgent(agentId: string): void;
  transaction<T>(operation: () => T): T;
  get<K extends EntityKind>(kind: K, id: string): EntityMap[K];
  list<K extends EntityKind>(kind: K, agentId?: string): EntityMap[K][];
  save<K extends EntityKind>(kind: K, state: EntityMap[K], expectedVersion: number, change: Change): void;
  versions<K extends EntityKind>(kind: K, id: string): VersionRecord<EntityMap[K]>[];
  saveWorld(world: WorldState, previousWorldId?: string): void;
  world(id: string): WorldState;
  worlds(agentId: string): WorldState[];
  startCycle(agentId: string, threadId?: string): Cycle;
  assignCyclesToThread(agentId: string, threadId: string, cycleIds: string[]): void;
  partForThread(partId: string, threadId?: string): Part;
  saveThreadStickiness(partId: string, threadId: string, stickiness: Part['stickiness'], cycleId: string): void;
  saveCycle(cycle: Cycle): void;
  cycles(agentId: string): Cycle[];
  cycle(id: string): Cycle;
  appendEvent<K extends keyof EventPayloads>(agentId: string, cycleId: string | null, type: K, payload: EventPayloads[K]): CognitiveEvent;
  events(agentId: string, after?: number): CognitiveEvent[];
  eventsByType(agentId: string, types: (keyof EventPayloads)[], cycleIds?: string[]): CognitiveEvent[];
  saveEmbedding(partId: string, key: string, vector: number[]): void;
  embedding(partId: string, key: string): number[] | null;
  saveExecution(execution: Execution): void;
  executions(agentId: string): Execution[];
  recentFacts(agentId: string, limit: number | null, threadId?: string): Fact[];
  saveConsolidation(run: ConsolidationRun): void;
  consolidations(agentId: string): ConsolidationRun[];
  saveExperiment(run: { id: string; agentId: string } & Record<string, unknown>): void;
  experiments(): ({ id: string; agentId: string } & Record<string, unknown>)[];
  mcpRegistry(): import('./mcp-configuration.js').McpRegistry;
  saveMcpRegistry(registry: import('./mcp-configuration.js').McpRegistry, expectedRevision: number): void;
  mcpRegistryHistory(): import('./mcp-configuration.js').McpRegistry[];
  mcpPermissions(agentId: string): import('./mcp-configuration.js').McpPermissions;
  saveMcpPermissions(agentId: string, permissions: import('./mcp-configuration.js').McpPermissions, expectedRevision: number): void;
  mcpPermissionsHistory(agentId: string): import('./mcp-configuration.js').McpPermissions[];
  executiveProfile(agentId: string): import('./executive-profile.js').ExecutiveProfile;
  saveExecutiveProfile(agentId: string, profile: import('./executive-profile.js').ExecutiveProfile, expectedRevision: number): void;
  executiveProfileHistory(agentId: string): import('./executive-profile.js').ExecutiveProfile[];
  executiveSkills(agentId: string): import('./executive-skill.js').ExecutiveSkill[];
  executiveSkillHistory(agentId: string, skillId: string): import('./executive-skill.js').ExecutiveSkill[];
  saveExecutiveSkill(skill: import('./executive-skill.js').ExecutiveSkill, expectedVersion: number): void;
  identityAuthoringSettings(agentId: string): import('./domain.js').IdentityAuthoringSettings | null;
  saveIdentityAuthoringSettings(agentId: string, settings: import('./domain.js').IdentityAuthoringSettings): void;
  primitiveSettings(agentId: string): PrimitiveSettings;
  savePrimitiveSettings(agentId: string, settings: PrimitiveSettings, expectedRevision: number): void;
  agentActivationSettings(agentId: string): { vectorSearchEnabled: boolean; memorySearchEnabled?: boolean; memoryRelevanceThreshold?: number; memoryRecallLimit?: number | null; primitivesFirst?: boolean; reevaluateAfterDeliberation?: boolean };
  saveAgentActivationSettings(agentId: string, settings: { vectorSearchEnabled: boolean; memorySearchEnabled?: boolean; memoryRelevanceThreshold?: number; memoryRecallLimit?: number | null; primitivesFirst?: boolean; reevaluateAfterDeliberation?: boolean }): void;
  agentProviderSettings(agentId: string): { model: string; encryptedApiKey: string | null } | null;
  saveAgentProviderSettings(agentId: string, settings: { model: string; encryptedApiKey: string | null }): void;
  promptOverrides(input?: { scope?: 'global' | 'agent'; agentId?: string; task?: PromptTask }): PromptOverride[];
  savePromptOverride(input: PromptOverride): void;
  deletePromptOverride(scope: 'global' | 'agent', agentId: string | null, task: PromptTask): void;
  clearPromptOverrides(): number;
  close(): void;
}
export class InfrastructureError extends Error {
  constructor(readonly stage: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'InfrastructureError'; }
}
export class ContextLimitError extends InfrastructureError {
  constructor(provider: string) { super('provider', `${provider} context limit exceeded`); this.name = 'ContextLimitError'; }
}
export class ConflictError extends Error { override name = 'ConflictError'; }
export class MutationValidationError extends Error { override name = 'MutationValidationError'; }
