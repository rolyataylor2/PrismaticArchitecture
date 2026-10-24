import { z } from 'zod';
import { SleepPredictionEvidenceSchema, type SleepPredictionReview, type SleepPredictionChronology } from './sleep-prediction-domain.js';
import { ThoughtResourcesSchema } from './thought-resources.js';
import type { SynthesisPolicy } from './sleep-policy.js';
import type { PredictionTrajectory } from './prediction-lineage.js';
import { CognitionCoverageSchema, type CoverageProductSchema } from './cognition-coverage.js';
import { DispositionReconciliationSchema, type ReconciliationObservations } from './disposition-reconciliation.js';
import { ExperienceAttachmentSchema } from './experiential-formation.js';
import { Text, Id, CognitionSchema, EvaluationSchema, type WorldState, type Memory, type Part, type Disposition, type Prediction, Fact } from './domain.js';

export const constructedTasks = ['thought_resources', 'part_cognition', 'cognition_coverage', 'hypothesis_reflection', 'sleep_prediction_review', 'experiential_formation', 'disposition_learning', 'memory_reinterpretation', 'memory_synthesis', 'effortful_recall'] as const;
export type ConstructedTask = typeof constructedTasks[number];
export type JudgmentTask = 'memory_accessibility' | 'disposition_activation' | 'bid_applicability';
export const PartFormationSchema = z.strictObject({ name: Text.regex(/^\S+(?:\s+\S+){0,4}$/), interpretation: Text,
  mission: Text, beliefs: z.array(Text).max(30), strategies: z.array(Text).max(30),
  triggers: z.array(Text).min(1).max(30), affect: z.string().max(4000),
  evidenceMemoryIds: z.array(Id).max(100), counterevidenceMemoryIds: z.array(Id).max(100), concern: Text });
export const MemoryReflectionSchema = z.strictObject({ content: Text, context: z.array(Text).max(30),
  interpretation: Text, affect: z.string().max(4000), perceivedDetails: z.array(Text).max(30) });
// Field insertion order is the generation contract: form, reflect, summarize, think.
export const PartGenerationSchema = z.strictObject({
  formation: PartFormationSchema,
  memoryReflection: MemoryReflectionSchema.nullable(),
  memoryGist: Text.nullable(),
  cognition: z.strictObject({ interpretation: CognitionSchema.shape.interpretation,
    beliefs: CognitionSchema.shape.beliefs, affect: CognitionSchema.shape.affect,
    affectProposals: CognitionSchema.shape.affectProposals,
    thought: CognitionSchema.shape.thought, evidenceSummary: CognitionSchema.shape.evidenceSummary,
    prediction: CognitionSchema.shape.prediction, localGoal: CognitionSchema.shape.localGoal,
    proposal: CognitionSchema.shape.proposal }),
});
export const LearningSchema = DispositionReconciliationSchema;
export const MemoryReinterpretationSchema = z.strictObject({ revisions: z.array(z.strictObject({ memoryId: Id, supportingMemoryIds: z.array(Id).min(1).max(100), content: Text, gist: Text, continuity: Text, reason: Text })).max(30), reason: Text });
export const MemorySynthesisSchema = z.strictObject({ reason: Text, synthesis: z.strictObject({
  sourceMemoryIds: z.array(Id).min(2).max(100), content: Text, gist: Text, context: z.array(Text).max(30),
  replaceSourceMemoryIds: z.array(Id).max(100),
  detailDecisions: z.array(z.strictObject({ memoryId: Id, retainedMeaning: Text, omittedDetails: z.array(Text).max(30), reason: Text })).min(2).max(100),
}).nullable() });
export const EffortfulRecallSchema = z.strictObject({ recollection: Text, uncertainty: Text });
/** Selected psychological products only; deliberately excludes worlds and private Part snapshots. */
export const DispositionLearningTraceSchema = z.strictObject({ cycleId: Id, sequence: z.number().int().positive(),
  threadId: Id.nullable(),
  activations: z.array(z.strictObject({ dispositionId: Id, dispositionVersion: z.number().int().positive().optional(), scope: Text.nullable(), baselineScore: z.number().min(0).max(4).optional(), score: z.number().min(0).max(4),
    active: z.boolean() })),
  thoughts: z.array(z.strictObject({ partId: Id, dispositionIds: z.array(Id), interpretation: Text,
    thought: Text, proposal: CognitionSchema.shape.proposal })),
});
export type DispositionLearningTrace = z.infer<typeof DispositionLearningTraceSchema>;
export const constructedOutputs = { thought_resources: ThoughtResourcesSchema, cognition_coverage: CognitionCoverageSchema, hypothesis_reflection: z.strictObject({ operation: z.literal('resolve'), evaluation: EvaluationSchema, memory: z.strictObject({ content: Text, gist: Text, context: z.array(Text) }).nullable(), reason: Text }), part_cognition: PartGenerationSchema, experiential_formation: ExperienceAttachmentSchema, disposition_learning: LearningSchema,
  sleep_prediction_review: SleepPredictionEvidenceSchema, memory_synthesis: MemorySynthesisSchema, memory_reinterpretation: MemoryReinterpretationSchema, effortful_recall: EffortfulRecallSchema };
/** Explicit permitted contexts; Self never receives this structure. */
export type ConstructedInput = { task: ConstructedTask; agentId: string; world?: WorldState;
  dispositions?: Disposition[]; dispositionBindings?: { entityId: string; dispositionId: string }[];
  memories?: Memory[]; workingParts?: Part[]; predictions?: Prediction[];
  hypothesis?: Prediction; laterEvidence?: Fact[]; outcome?: 'correct' | 'incorrect';
  hypothesisLimit?: number;
  coverageProducts?: z.infer<typeof CoverageProductSchema>[];
  identity?: import('./domain.js').Identity;
  learningTraces?: DispositionLearningTrace[];
  predictionTrajectories?: PredictionTrajectory[];
  dispositionHistory?: Disposition[];
  hypothesisHistory?: Prediction[];
  observations?: ReconciliationObservations;
  synthesisPolicy?: SynthesisPolicy;
  predictionReviews?: SleepPredictionReview[];
  predictionReviewContext?: SleepPredictionChronology;
  memory?: Memory; question?: string };
export type JudgmentInput = { task: JudgmentTask; agentId: string; world: WorldState;
  candidates: { id: string; question: string; context: object }[] };
