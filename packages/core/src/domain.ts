import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SynthesisPolicySchema } from './sleep-policy.js';
import { OperationSchema } from './operation.js';
import { SelectedActivitySchema } from './execution-review.js';
import { ExternalCapabilitiesSchema } from './mcp-configuration.js';
import { ExecutiveDiagnosticsSchema } from './executive-sensitivity.js';
import { ExecutionGuidanceSchema, ExternalExecutionRequestSchema } from './execution-guidance.js';
import { PublicExecutiveSkillSchema } from './executive-skill.js';
import { AffectProposalSchema, SelectedAffectSchema, type AffectBid, type SelectedAffect } from './affect-domain.js';

export const id = (prefix: string): string => `${prefix}_${randomUUID()}`;
export const now = (): string => new Date().toISOString();
export const Text = z.string().trim().min(1).max(16000);
export const Id = z.string().min(1).max(200);
export const Origin = z.enum(['seed', 'organic_cognition', 'prediction_evaluation', 'consolidation', 'researcher_edit', 'migration']);
export type Origin = z.infer<typeof Origin>;
export const AgentActivationSettingsSchema = z.strictObject({ vectorSearchEnabled: z.boolean(), memorySearchEnabled: z.boolean().default(false), memoryRelevanceThreshold: z.number().min(0).max(1).default(0.5), memoryRecallLimit: z.number().int().positive().max(10000).nullable().default(12), reevaluateAfterDeliberation: z.boolean().default(false), primitivesFirst: z.boolean().default(false), includeProcessingDispositions: z.boolean().default(false), maxConcurrentThoughts: z.number().int().min(1).max(64).default(4), maxQueuedThoughts: z.number().int().min(0).max(10000).default(100), activationPassLimit: z.number().int().min(1).max(10000).nullable().default(1) });
export type AgentActivationSettings = z.infer<typeof AgentActivationSettingsSchema>;
export const PromptTaskSchema = z.enum(['thought_resources', 'bid_applicability', 'executive_skill_consolidation', 'simulation_evaluation', 'memory_relevance', 'activation', 'cognition', 'prediction', 'prediction_gate', 'prediction_outcome', 'evaluation', 'arbitration', 'affect_selection', 'affect_inquiry', 'focused_bid_revision', 'deliberation', 'answer', 'consolidation', 'reconsolidation', 'formation', 'replay', 'identity_clarification', 'identity_answers', 'researcher_authoring', 'speech', 'memory_accessibility', 'disposition_activation', 'part_cognition', 'cognition_coverage', 'hypothesis_reflection', 'hypothesis_outcome', 'experiential_formation', 'disposition_learning', 'memory_reinterpretation', 'memory_synthesis', 'effortful_recall']);
export type PromptTask = z.infer<typeof PromptTaskSchema>;
export const PromptOverrideSchema = z.strictObject({
  scope: z.enum(['global', 'agent']), agentId: z.string().nullable(), task: PromptTaskSchema, text: z.string().min(1).max(32768).refine(value => Boolean(value.trim()), 'Prompt cannot be empty'),
}).refine(value => value.scope === 'agent' ? value.agentId !== null : value.agentId === null);
export type PromptOverride = z.infer<typeof PromptOverrideSchema>;
const Version = { id: Id, agentId: Id, version: z.number().int().positive(), schemaVersion: z.literal(1) };
export const AgentSchema = z.strictObject({ ...Version, name: Text, createdAt: Text, architecture: z.enum(['constructed', 'persistent']).optional() });
export type Agent = z.infer<typeof AgentSchema>;
/** Researcher wizard preferences, never cognitive Identity or Part state. */
export const IdentityAuthoringSettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(300), question: z.string().min(1).max(2000),
  options: z.array(z.strictObject({ label: z.string().min(1).max(300), description: z.string().min(1).max(4000) })).min(1).max(6),
  selectedVersion: z.string().min(1).max(4000),
}).refine(value => value.options.some(option => option.description === value.selectedVersion), 'Selected version must be one of the character options');
export type IdentityAuthoringSettings = z.infer<typeof IdentityAuthoringSettingsSchema>;
export const IdentityTraitRoleSchema = z.enum(['self_definition', 'autobiographical']);
export const IdentityTraitDraftSchema = z.strictObject({
  question: Text, answer: Text, keywords: z.array(Text).max(100), role: IdentityTraitRoleSchema.default('self_definition'),
});
export const IdentityTraitSchema = IdentityTraitDraftSchema.extend({ id: Id, createdAt: z.iso.datetime() });
export type IdentityTrait = z.infer<typeof IdentityTraitSchema>;
export const IdentityMaskSchema = z.strictObject({ description: Text, expiresAfterCycle: z.number().int().positive() }).nullable();
export const IdentitySchema = z.strictObject({
  ...Version, schemaVersion: z.literal(2),
  traits: z.array(IdentityTraitSchema).refine(traits => new Set(traits.map(trait => trait.id)).size === traits.length, 'Trait IDs must be unique'),
  mask: IdentityMaskSchema,
});
export type Identity = z.infer<typeof IdentitySchema>;

/** Read compatibility only: original stored history is never rewritten. */
export function readIdentity(value: unknown, createdAt: string): Identity {
  if ((value as { schemaVersion?: number }).schemaVersion === 2) return IdentitySchema.parse(value);
  const legacy = z.strictObject({ ...Version, values: z.array(Text), roles: z.array(Text), commitments: z.array(Text),
    selfConceptions: z.array(Text), aspirations: z.array(Text), mask: IdentityMaskSchema }).parse(value);
  const categories = [
    ['values', 'What do I value?', 'value'], ['roles', 'What role do I identify with?', 'role'],
    ['commitments', 'What am I committed to?', 'commitment'], ['selfConceptions', 'How do I see myself?', 'self-conception'],
    ['aspirations', 'Who do I aspire to be?', 'aspiration'],
  ] as const;
  const traits = categories.flatMap(([field, question, keyword]) => legacy[field].map((answer, index) => ({
    id: `legacy_${field}_${index}`, question, answer, keywords: [keyword], createdAt,
  })));
  return IdentitySchema.parse({ id: legacy.id, agentId: legacy.agentId, version: legacy.version, schemaVersion: 2, traits, mask: legacy.mask });
}
export const AssociationSchema = z.strictObject({ targetPartId: Id, meaning: Text });
export const PartFields = {
  instance: z.strictObject({ createdCycle: Id, threadId: Id.nullable(), interpretation: Text,
    evidenceMemoryIds: z.array(Id).max(100), counterevidenceMemoryIds: z.array(Id).max(100),
    dispositionBindings: z.array(z.strictObject({ entityId: Id, dispositionId: Id })).optional(),
    retirement: z.strictObject({ cycleId: Id, reason: Text }).nullable() }).optional(),
  beliefConfidence: z.number().min(0).max(1).optional(),
  name: Text, mission: Text, beliefs: z.array(Text).max(100), strategies: z.array(Text).max(100),
  triggers: z.array(Text).min(1).max(100),
  retrievalKeys: z.array(Text).max(100).optional(),
  stickiness: z.strictObject({ retained: z.boolean(), unresolved: z.boolean(), concern: z.string().max(4000) }),
  associations: z.array(AssociationSchema).max(100),
  provenance: z.array(Text).max(200), lineage: z.array(Id).max(100),
  lifecycle: z.enum(['active', 'dormant', 'archived']),
  mode: z.enum(['perspective', 'recognition']), temporary: z.boolean(),
  emotionalCharge: z.string().max(4000).nullable(), cognitiveCharacteristics: z.array(Text).max(50),
};
export const PartNameSchema = Text.regex(/^\S+(?:\s+\S+){0,4}$/, 'Part names must contain fewer than six words')
  .describe('Under six words describing my feeling, need, fear, or motivation, not an action or operation label.');
export const PartDraftSchema = z.strictObject(PartFields).extend({ name: PartNameSchema });
export const PartSchema = z.strictObject({ ...Version, ...PartFields });
export type Part = z.infer<typeof PartSchema>;
export type PartDraft = z.infer<typeof PartDraftSchema>;
export const PartPatchSchema = PartDraftSchema.omit({ provenance: true, lineage: true }).partial()
  .refine(patch => Object.keys(patch).length > 0, 'An explicit change is required');
export type PartPatch = z.infer<typeof PartPatchSchema>;
export const MemorySchema = z.strictObject({
  ...Version, partId: Id.nullable(), content: Text, gist: Text, context: z.array(Text), deleted: z.boolean().optional(),
  synthesis: z.strictObject({ dispositionId: Id, dispositionVersion: z.number().int().positive(), runId: Id, policy: SynthesisPolicySchema.optional(),
    detailDecisions: z.array(z.strictObject({ memoryId: Id, retainedMeaning: Text, omittedDetails: z.array(Text).max(30), reason: Text })).optional(),
    sources: z.array(z.strictObject({ memoryId: Id, version: z.number().int().positive() })).min(2), reason: Text }).optional(),
  ancestorIds: z.array(Id), predictionId: Id.nullable(), createdCycle: Id,
  selfAffectAtFormation: z.array(z.strictObject({ partId: Id, affect: z.string().max(4000) })).optional(),
  encoding: z.strictObject({ interpretation: Text, affect: z.string().max(4000),
    perceivedDetails: z.array(Text).max(30), prediction: Text.nullable(), outcome: Text.nullable() }).optional(),
  referencingPartIds: z.array(Id).refine(ids => new Set(ids).size === ids.length, 'Duplicate Part references').optional(),
});
export type Memory = z.infer<typeof MemorySchema>;
/** Reserved formation metadata is not an inference input. */
export function memoryWithoutFormationAffect(memory: Memory): Memory {
  const { selfAffectAtFormation: _storedSelfAffect, synthesis: _synthesisLineage, ...ordinary } = memory;
  return ordinary;
}
/** Ordinary recall preserves subjective content; detailed traces require deliberate recollection. */
export function ordinaryMemory(memory: Memory): Memory {
  const ordinary = memoryWithoutFormationAffect(memory);
  return ordinary.encoding ? { ...ordinary, encoding: { ...ordinary.encoding, perceivedDetails: [] } } : ordinary;
}
/** Formation attribution is separate from explicit recall access. */
export function memoryPartIds(memory: Memory): string[] { return memory.referencingPartIds ?? (memory.partId ? [memory.partId] : []); }
export function referencesMemory(memory: Memory, partId: string): boolean { return memoryPartIds(memory).includes(partId); }
export const CapsuleSchema = z.strictObject({
  interpretation: Text, details: z.array(Text).max(12), entities: z.array(Text).max(12),
  activation: z.number().min(0).max(4), spike: z.number().min(-4).max(4), sourceIds: z.array(Id).max(12),
});
/** A proposed relevance relationship, not learned truth or autobiographical evidence. */
export const RelevanceScaffoldDraftSchema = z.strictObject({
  name: Text, target: Text, cues: z.array(Text).min(1).max(12),
  retrievalIntent: Text, relevantMemoryIds: z.array(Id).max(100),
  supportEvidence: z.array(Text).min(1).max(12), contradictEvidence: z.array(Text).min(1).max(12),
  trackedDistinction: Text, futureValue: Text,
});
export const PredictionDraftSchema = z.strictObject({
  expectation: Text.describe('A testable adjustable proposition about an unresolved state, hidden cause, continuity, current interpretation or future event, grounded in selected experienced context.'), capsule: CapsuleSchema, confidence: z.number().min(0).max(1),
  scaffolds: z.array(RelevanceScaffoldDraftSchema).max(4).optional(),
  attention: z.array(z.strictObject({ target: Text, cues: z.array(Text).min(1).max(12) })).max(12).optional(),
  horizon: Text, evaluateAfterCycle: z.number().int().nonnegative().nullable(),
  kind: z.enum(['trajectory', 'action_conditioned', 'state_hypothesis']).optional(),
  conditions: z.array(Text).max(12).optional(),
  conditionedAction: z.strictObject({ kind: z.enum(['say', 'ask', 'wait', 'operate']), text: Text }).nullable().optional(),
});
export const PredictionOutcomeSchema = z.enum(['correct', 'incorrect', 'incomplete', 'irrelevant']);
export type PredictionOutcome = z.infer<typeof PredictionOutcomeSchema>;
export const EvaluationSchema = z.strictObject({
  assessment: z.enum(['confirmed', 'partly_confirmed', 'contradicted', 'ambiguous', 'invalidated', 'external_circumstances', 'not_testable', 'self_influenced', 'interrupted']),
  interpretation: Text, causalAttribution: Text, evidence: z.array(Text), evidenceWorldId: Id,
});
export const DispositionVersionRefSchema = z.strictObject({ dispositionId: Id, version: z.number().int().positive() });
export const PredictionCognitionOriginSchema = z.strictObject({ thoughtEventId: Id,
  partVersion: z.number().int().positive(), dispositions: z.array(DispositionVersionRefSchema).max(12) });
export const InheritedConcernDraftSchema = z.strictObject({ concern: Text, meaning: Text,
  thoughtEventIds: z.array(Id).min(2).max(40), continuityReason: Text, distinctnessReason: Text });
export const PredictionSchema = z.strictObject({
  ...Version, ...PredictionDraftSchema.shape, partId: Id.nullable(), createdCycle: Id,
  cognitionOrigin: PredictionCognitionOriginSchema.optional(),
  committedAfterSequence: z.number().int().positive().optional(),
  gapOrigin: z.strictObject({ threadId: Id.nullable(), gap: Text, consequentialValue: Text,
    futureInference: z.strictObject({ prediction: Text, retrieval: Text, causal: Text, action: Text, compression: Text }),
    existingStructureInsufficient: Text }).optional(),
  status: z.enum(['open', 'resolved', 'abandoned', 'expired', 'invalidated']),
  evaluation: EvaluationSchema.nullable(), memoryId: Id.nullable(),
});
export type Prediction = z.infer<typeof PredictionSchema>;
export const FactSchema = z.strictObject({
  source: Text, kind: z.preprocess(kind => kind === 'utterance' || kind === 'prior_output' ? 'says' : kind === 'observation' ? 'observes' : kind === 'execution' ? 'does' : kind, z.enum(['says', 'observes', 'does'])), text: Text,
  timestamp: z.iso.datetime().nullable().default(null), originCycleId: Id.nullable().optional(),
  referenceId: Id.nullable(),
});
export type Fact = z.infer<typeof FactSchema>;
export const ThoughtHistorySchema = z.strictObject({
  id: Id, cycleId: Id, partId: Id, partName: Text, thought: Text,
  selectedBySelf: z.boolean(), age: z.number().int().nonnegative(), retention: z.number().min(0).max(1),
});
export type ThoughtHistory = z.infer<typeof ThoughtHistorySchema>;
/** Public subjective products only. Never copy private Part records into these layers. */
export const ExpressedStanceSchema = z.strictObject({ partId: Id, name: Text, interpretation: Text,
  affect: z.string().max(4000), thought: Text });
export const ExperiencedTransitionSchema = z.strictObject({ id: Id, cycleId: Id, threadId: Id.nullable(),
  before: z.array(ExpressedStanceSchema), chosen: z.array(ExpressedStanceSchema),
  resulting: z.array(ExpressedStanceSchema), selectedBidIds: z.array(Id),
  revisitedStateId: Id.nullable() });
export type ExperiencedTransition = z.infer<typeof ExperiencedTransitionSchema>;
export const StanceRecordSchema = z.strictObject({ id: Id, cycleId: Id, posture: z.array(ExpressedStanceSchema) });
export type StanceRecord = z.infer<typeof StanceRecordSchema>;
export const ProspectiveEntrySchema = z.strictObject({ predictionId: Id, version: z.number().int().positive(),
  partId: Id.nullable(), createdCycle: Id, kind: z.enum(['trajectory', 'action_conditioned', 'state_hypothesis', 'unclassified']),
  expectation: Text, confidence: z.number().min(0).max(1), horizon: Text,
  conditions: z.array(Text), conditionedAction: z.strictObject({ kind: z.enum(['say', 'ask', 'wait', 'operate']), text: Text }).nullable(),
  capsule: CapsuleSchema });
export type ProspectiveEntry = z.infer<typeof ProspectiveEntrySchema>;
export const ExperiencedStateSchema = z.strictObject({
  prospective: z.array(ProspectiveEntrySchema),
  rememberedInterpretations: z.array(z.strictObject({ cycleId: Id, partId: Id,
    interpretation: Text, evidenceSummary: z.array(Text) })),
  posture: z.array(ExpressedStanceSchema),
  stanceHistory: z.array(StanceRecordSchema).optional(),
  selectedFocus: SelectedAffectSchema.optional(),
});
export const WorldStateSchema = z.strictObject({
  id: Id, agentId: Id, cycleId: Id, sequence: z.number().int().positive(), capturedAt: Text,
  facts: z.array(FactSchema),
  replacesExternalFacts: z.boolean().optional(),
  externalCapabilities: ExternalCapabilitiesSchema.optional(),
  externalExecutionRequests: z.array(ExternalExecutionRequestSchema).max(100).optional(),
  externalSkills: z.array(PublicExecutiveSkillSchema).max(100).optional(),
  externalSkillDocuments: z.array(z.strictObject({ id: z.string().regex(/^[a-f0-9]{64}$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().min(1).max(64), description: z.string().min(1).max(1024), reviewRevision: z.number().int().positive(),
    instructions: z.string().max(50000) })).max(10).optional(),
  selectedActivity: SelectedActivitySchema.optional(),
  // Optional for immutable snapshots recorded before ADR 0093.
  thoughtHistory: z.array(ThoughtHistorySchema).optional(),
  experienced: ExperiencedStateSchema.optional(),
});
export type WorldState = z.infer<typeof WorldStateSchema>;
export const ActionSchema = z.union([
  z.strictObject({ kind: z.enum(['say', 'ask', 'wait']), text: Text }),
  z.strictObject({ kind: z.literal('operate'), text: Text, operation: OperationSchema }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const ActionProposalSchema = z.strictObject({
  type: z.literal('action').optional(),
  action: ActionSchema, argument: Text, identityFit: z.array(Text), executionOrder: z.array(Text).max(20),
  validWhile: z.array(Text).max(12).optional(),
  resultingPosture: z.strictObject({ interpretation: Text, affect: z.string().max(4000) }).optional(),
});
export const DeliberationProposalSchema = z.strictObject({
  type: z.literal('deliberate'), action: z.null(),
  target_parts: z.array(Id).min(1).max(16), question: Text,
  argument: Text, identityFit: z.array(Text), executionOrder: z.array(Text).max(0),
});
export const NavigationProposalSchema = z.strictObject({ type: z.literal('navigate'), action: z.null(),
  stateId: Id, argument: Text, identityFit: z.array(Text), executionOrder: z.array(Text).max(0) });
export const ProposalSchema = z.union([ActionProposalSchema, DeliberationProposalSchema, NavigationProposalSchema]);
export type Proposal = z.infer<typeof ProposalSchema>;
export type Bid = Proposal & { id: string; partId: string; sourceKind?: 'part' | 'primitive'; replacesBidId?: string };
export type ActionBid = z.infer<typeof ActionProposalSchema> & { id: string; partId: string; sourceKind?: 'part' | 'primitive'; replacesBidId?: string };
export type NavigationBid = z.infer<typeof NavigationProposalSchema> & { id: string; partId: string; sourceKind?: 'part' | 'primitive'; replacesBidId?: string };
export const CognitionSchema = z.strictObject({
  interpretation: Text, thought: Text, evidenceSummary: z.array(Text),
  proposal: ProposalSchema.nullable(),
  beliefs: z.array(Text).max(100).optional(), affect: z.string().max(4000).optional(),
  affectProposals: z.array(AffectProposalSchema).max(4).optional(),
  localGoal: Text.nullable().optional(), prediction: PredictionDraftSchema.nullable().optional(),
});
export const PredictionThoughtSchema = z.strictObject({ eventId: Id, cycleId: Id, sequence: z.number().int().positive(),
  threadId: Id.nullable(), partId: Id, partVersion: z.number().int().positive(),
  dispositions: z.array(DispositionVersionRefSchema).max(12),
  association: z.enum(['origin', 'holding_prediction', 'originating_disposition', 'scaffold']),
  predictionVersion: z.number().int().positive().nullable(), interpretation: Text, thought: Text,
  localGoal: Text.nullable(), proposal: CognitionSchema.shape.proposal });
export type Cognition = z.infer<typeof CognitionSchema>;
export const JudgmentDistributionSchema = z.array(z.strictObject({ label: Text, probability: z.number().min(0).max(1) }));
export const ActivationScoreSchema = z.strictObject({ partId: Id, score: z.number().min(0).max(4), distribution: JudgmentDistributionSchema.optional() });
export type ActivationScore = z.infer<typeof ActivationScoreSchema>;
export type Activation = ActivationScore & { similarity: number; reasons: string[]; previous: number; delta: number; active: boolean };
export type Contribution = { sourceKind?: 'part' | 'primitive'; partId: string; name: string; thought: string; interpretation: string; affect?: string; affectProposals?: AffectBid[]; supportingBidId?: string; evidenceSummary: string[]; prediction: string | null; bid: Bid | null };
export type SelfContext = { identity: Identity; contributions: Contribution[]; deliberation: DeliberationMessage[]; commitments?: import('./commitments.js').SelectedCommitment[]; selectedFocus?: SelectedAffect; ongoingActivity?: z.infer<typeof SelectedActivitySchema>; stanceHistory?: StanceRecord[]; contributionHistory?: Contribution[]; inquiries?: (Partial<z.infer<typeof DeliberationSchema>> & { question: string; target_parts: string[]; sourceBidId: string | null })[]; completedDeliberationRounds?: number };
export type DeliberationMessage = { partId: string; question: string; answer: string };
export const ChoiceSchema = z.strictObject({ choice: Id, explanation: Text, identityConflict: z.string().max(4000), distribution: JudgmentDistributionSchema.optional(), selectedBidIds: z.array(Id).optional(), scores: z.array(ActivationScoreSchema.extend({ selectedBefore: z.array(Id) })).optional() });
export type Choice = z.infer<typeof ChoiceSchema>;
export const QuestionSchema = z.strictObject({ partId: Id, question: Text });
export const SelfQualitySchema = z.enum(['curiosity', 'clarity', 'compassion', 'courage', 'confidence', 'creativity', 'connectedness', 'calm']);
// Insertion order is part of the generative contract; never sort these properties.
export const DeliberationSchema = z.strictObject({
  why_deliberate: Text.describe('Concise decision rationale identifying uncertainty; do not select a bid.'),
  primary_c: SelfQualitySchema.describe('Quality best suited to the preceding rationale.'),
  secondary_c: SelfQualitySchema.nullable().describe('Optional different quality supporting the primary stance.'),
  missing_information: Text.describe('Minimum information needed, guided by the preceding qualities.'),
  target_parts: z.array(Id).min(1).max(16).describe('Available contributors best able to supply that information.'),
  question: Text.describe('One concise neutral question guided by all preceding fields.'),
}).refine(value => value.secondary_c === null || value.secondary_c !== value.primary_c, 'Self qualities must differ')
  .refine(value => new Set(value.target_parts).size === value.target_parts.length, 'Duplicate inquiry targets');
export type Deliberation = z.infer<typeof DeliberationSchema>;
export const DeliberationAnswerSchema = z.strictObject({
  response: Text,
  bid_disposition: z.enum(['retain', 'replace', 'withdraw']),
  new_bid: ProposalSchema.nullable(),
}).refine(value => (value.bid_disposition === 'replace') === (value.new_bid !== null), 'Only replace requires a new bid');
export const AffectDeliberationAnswerSchema = DeliberationAnswerSchema.safeExtend({
  affectProposals: z.array(AffectProposalSchema).max(4).optional(),
});
export const PredictionUpdateSchema = z.strictObject({
  operation: z.enum(['continue', 'revise', 'resolve', 'abandon', 'expire', 'invalidate']),
  revision: PredictionDraftSchema.nullable(), evaluation: EvaluationSchema.nullable(),
  memory: z.strictObject({ content: Text, gist: Text, context: z.array(Text) }).nullable(), mutation: PartPatchSchema.nullable(), reason: Text,
});
export type PredictionUpdate = z.infer<typeof PredictionUpdateSchema>;
export const SpeechContextSchema = z.strictObject({
  agentId: Id, speechTraits: z.array(IdentityTraitSchema),
  commands: z.array(z.strictObject({ bidId: Id, text: Text, argument: Text })).min(1),
});
export type SpeechContext = z.infer<typeof SpeechContextSchema>;
export const SpeechResultSchema = z.strictObject({ text: Text });
export const ExecutionSchema = z.strictObject({
  id: Id, agentId: Id, cycleId: Id, action: ActionSchema,
  contractId: Id.optional(),
  status: z.enum(['pending', 'running', 'needs_guidance', 'continued', 'completed', 'failed', 'blocked', 'unverified']), facts: z.array(FactSchema),
  guidance: ExecutionGuidanceSchema.optional(),
  continuedByContractId: Id.optional(),
  operational: z.strictObject({ attempts: z.number().int().nonnegative(), verified: z.boolean(),
    reason: Text, traceRefs: z.array(Id).max(1000), diagnostics: ExecutiveDiagnosticsSchema.optional() }).optional(),
  speech: z.strictObject({ bidIds: z.array(Id).min(1), text: Text }).optional(),
}).superRefine((execution, context) => {
  if (execution.guidance && !['needs_guidance', 'blocked', 'continued'].includes(execution.status))
    context.addIssue({ code: 'custom', message: 'Guidance records must remain paused or explicitly blocked' });
  if ((execution.status === 'continued') !== Boolean(execution.continuedByContractId) || (execution.status === 'continued' && (execution.action.kind !== 'operate' || !execution.contractId)))
    context.addIssue({ code: 'custom', message: 'Continued executions must preserve their operational source and supplemental contract' });
  if (execution.guidance && (execution.action.kind !== 'operate' || execution.guidance.executionId !== execution.id
    || execution.guidance.contractId !== execution.contractId || execution.guidance.goal !== execution.action.text))
    context.addIssue({ code: 'custom', message: 'Guidance must retain its selected operational attribution' });
  if (execution.status === 'needs_guidance' && (!execution.guidance || !execution.operational
    || execution.operational.attempts !== 0 || execution.operational.traceRefs.length || execution.guidance.traceRefs.length || execution.operational.verified))
    context.addIssue({ code: 'custom', message: 'The no-submission guidance handoff cannot conceal attempts or verification' });
});
export type Execution = z.infer<typeof ExecutionSchema>;
export type Cycle = {
  id: string; agentId: string; sequence: number; worldId: string; startedAt: string;
  threadId?: string;
  clientMessageId?: string;
  kind?: 'attention_monitor' | 'attention_review';
  status: 'running' | 'completed' | 'failed'; error: string | null; selectedBidId: string | null; selectedBidIds?: string[];
};
export const ActivationAssociationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('keyword'), keyword: Text, effect: z.enum(['contribute', 'inhibit']) }),
  z.strictObject({ kind: z.literal('disposition'), dispositionId: Id, effect: z.enum(['contribute', 'inhibit']) }),
]);
export type ActivationAssociation = z.infer<typeof ActivationAssociationSchema>;
/** Explicit empty associations override legacy dependencies without rewriting history. */
export function activationAssociations(disposition: { activationAssociations?: ActivationAssociation[] | undefined; prerequisites: string[] }): ActivationAssociation[] {
  return disposition.activationAssociations ?? disposition.prerequisites.map(dispositionId => ({ kind: 'disposition', dispositionId, effect: 'contribute' }));
}
export const DispositionDraftSchema = z.strictObject({ name: Text, concern: Text, cues: z.array(Text).min(1).max(30),
  scope: Text.nullable(), prerequisites: z.array(Id).max(12).default([]), activationAssociations: z.array(ActivationAssociationSchema).max(60).optional(), threshold: z.number().min(0).max(4),
  memoryIds: z.array(Id).max(100), sourcePredictionId: Id.nullable(), temporary: z.boolean(),
});
/** Evidence is attributed experience, not an activation weight or world-truth assertion. */
export const DispositionEvidenceSchema = z.strictObject({
  memoryId: Id, predictionId: Id.nullable(), cycleId: Id, threadId: Id.nullable(),
  dispositionVersion: z.number().int().positive().nullable(),
  relationship: z.enum(['supporting', 'contradictory', 'unclassified']),
  retrievalUsefulness: z.enum(['appropriate', 'misleading', 'unknown']),
  reconciliation: z.enum(['pending', 'reconciled']), reason: Text,
});
export const DispositionDevelopmentSchema = z.strictObject({
  learnedConcern: z.strictObject({ concern: Text, meaning: Text }).optional(),
  concernInheritance: z.strictObject({ predictionIds: z.array(Id).min(1).max(12),
    thoughts: z.array(PredictionThoughtSchema).min(2).max(40), continuityReason: Text, distinctnessReason: Text }).optional(),
  retrievalIntent: Text,
  contextCues: z.array(Text).max(30), internalStateCues: z.array(Text).max(30),
  cueEvidence: z.array(z.strictObject({ cue: Text, kind: z.enum(['activation', 'context', 'internal']),
    memoryIds: z.array(Id).min(1).max(100) })).max(90).optional(),
  status: z.enum(['provisional', 'established', 'dormant', 'archived']),
  confidence: Text,
  lineage: z.array(z.strictObject({ dispositionId: Id, version: z.number().int().positive(),
    relationship: z.enum(['specialized_from', 'generalized_from', 'split_from', 'merged_from', 'reconciled_to', 'institutionalized_from']) })).max(100),
  previousVersion: z.number().int().positive().nullable(),
  evidence: z.array(DispositionEvidenceSchema).max(10000),
  createdAt: z.iso.datetime(),
});
// Optional metadata preserves legacy records without fabricating developmental evidence.
export const DispositionSchema = DispositionDraftSchema.extend({ ...Version, suppressedMemoryIds: z.array(Id).optional(), active: z.boolean(), deleted: z.boolean().optional(),
  scaffold: z.strictObject({ createdCycle: Id, threadId: Id.nullable(),
    hypothesisVersion: z.number().int().positive(), relevance: RelevanceScaffoldDraftSchema,
    endedCycle: Id.nullable(), endReason: Text.nullable() }).optional(),
  development: DispositionDevelopmentSchema.optional() });
export type Disposition = z.infer<typeof DispositionSchema>;
export type EntityMap = { agent: Agent; identity: Identity; part: Part; memory: Memory; prediction: Prediction; disposition: Disposition };
export type EntityKind = keyof EntityMap;
export const entitySchemas = { agent: AgentSchema, identity: IdentitySchema, part: PartSchema, memory: MemorySchema, prediction: PredictionSchema, disposition: DispositionSchema };
export type Change = { origin: Origin; reason: string; sourceIds: string[] };
export type VersionRecord<T> = { state: T; change: Change; at: string };

/** Freeze recursively without replacing references, including the shared cycle snapshot. */
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Learned psychology is ordinary context; its audit citations are not. */
export function ordinaryDisposition(disposition: Disposition): Disposition {
  const { suppressedMemoryIds: _retrievalExclusions, ...ordinary } = disposition;
  if (!disposition.development?.concernInheritance) return ordinary;
  const { concernInheritance: _audit, ...development } = disposition.development;
  return { ...ordinary, development };
}
