import { z } from 'zod';
import { Id, Text } from './domain.js';

/** Evidence relationships are not waking outcome classifications or rewards. */
export const SleepPredictionEvidenceSchema = z.strictObject({
  relationship: z.enum(['validated', 'invalidated', 'retrospectively_supported', 'retrospectively_challenged', 'obsolete', 'unverifiable']),
  evidence: z.array(z.strictObject({ memoryId: Id, memoryVersion: z.number().int().positive(),
    occurrence: z.enum(['before_prediction', 'after_prediction', 'unknown']),
    basis: z.enum(['experienced', 'reported', 'inferred', 'counterfactual']),
    stance: z.enum(['supports', 'contradicts', 'undetermined']).default('undetermined'),
    test: z.enum(['outcome', 'interpretation', 'report', 'counterfactual', 'untested']).default('untested'),
    conditions: z.enum(['met', 'not_met', 'unknown']).default('unknown'),
    actionInfluence: z.enum(['observational', 'action_conditioned', 'self_influenced', 'unknown']).default('unknown'),
    outcomeSourceIds: z.array(Id).max(100).default([]),
    testedClaim: Text.optional(),
    explanation: Text })).max(100),
  coverage: z.strictObject({ supportingMemoryIds: z.array(Id).max(100), contradictingMemoryIds: z.array(Id).max(100),
    undeterminedMemoryIds: z.array(Id).max(100), assessment: Text }).optional(),
  interpretation: Text, causalAttribution: Text, limitations: Text,
});
export type SleepPredictionEvidence = z.infer<typeof SleepPredictionEvidenceSchema>;
export type SleepPredictionReview = {
  predictionId: string; predictionVersion: number; fingerprint: string;
  expectation?: string;
  sourceMemories: { memoryId: string; version: number }[];
  status: 'pending' | 'reviewed' | 'unchanged' | 'deferred' | 'failed';
  result: SleepPredictionEvidence | null; reason: string;
  search?: { eligibleCount: number; candidateCount: number; omittedCount: number; modes: string[]; scores: { memoryId: string; mode: string; score: number }[] };
  lineage?: { memoryId: string; version: number; experienceIds: string[]; legacyExperienceIds: string[]; sourceIds: string[] }[];
  newExperienceIds?: string[]; reusedExperienceIds?: string[]; independentOutcomeExperienceIds?: string[];
  newSourceIds?: string[]; reusedSourceIds?: string[];
};
export const SleepPredictionPolicySchema = z.strictObject({
  reviewPredictions: z.boolean().default(true),
  maxPredictionReviews: z.number().int().min(0).max(100).default(12),
  maxPredictionMemories: z.number().int().min(1).max(100).default(40),
  maxPredictionSearchMemories: z.number().int().min(1).max(1000).default(200),
});
export type SleepPredictionPolicy = z.infer<typeof SleepPredictionPolicySchema>;
export const SleepPredictionChronologySchema = z.strictObject({
  predictionSequence: z.number().int().positive(), predictionCreatedAt: Text, predictionVersionAt: Text,
  memories: z.array(z.strictObject({ memoryId: Id, memoryVersion: z.number().int().positive(),
    recordedSequence: z.number().int().positive(), recordedAt: Text,
    experienceIds: z.array(Id).optional(), sources: z.array(z.unknown()).optional(), legacyExperienceIds: z.array(Id).optional(),
  })).max(100),
  knownExperienceIds: z.array(Id).optional(), previouslyReviewedExperienceIds: z.array(Id).optional(),
  knownSourceIds: z.array(Id).optional(), previouslyReviewedSourceIds: z.array(Id).optional(),
  search: z.unknown().optional(),
});
export type SleepPredictionChronology = z.infer<typeof SleepPredictionChronologySchema>;
