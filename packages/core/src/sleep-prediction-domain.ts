import { z } from 'zod';
import { Id, Text } from './domain.js';

/** Evidence relationships are not waking outcome classifications or rewards. */
export const SleepPredictionEvidenceSchema = z.strictObject({
  relationship: z.enum(['validated', 'invalidated', 'retrospectively_supported', 'retrospectively_challenged', 'obsolete', 'unverifiable']),
  evidence: z.array(z.strictObject({ memoryId: Id, memoryVersion: z.number().int().positive(),
    occurrence: z.enum(['before_prediction', 'after_prediction', 'unknown']),
    basis: z.enum(['experienced', 'reported', 'inferred', 'counterfactual']),
    explanation: Text })).max(100),
  interpretation: Text, causalAttribution: Text, limitations: Text,
});
export type SleepPredictionEvidence = z.infer<typeof SleepPredictionEvidenceSchema>;
export type SleepPredictionReview = {
  predictionId: string; predictionVersion: number; fingerprint: string;
  expectation?: string;
  sourceMemories: { memoryId: string; version: number }[];
  status: 'pending' | 'reviewed' | 'unchanged' | 'deferred' | 'failed';
  result: SleepPredictionEvidence | null; reason: string;
};
export const SleepPredictionPolicySchema = z.strictObject({
  reviewPredictions: z.boolean().default(true),
  maxPredictionReviews: z.number().int().min(0).max(100).default(12),
  maxPredictionMemories: z.number().int().min(1).max(100).default(40),
});
export type SleepPredictionPolicy = z.infer<typeof SleepPredictionPolicySchema>;
export const SleepPredictionChronologySchema = z.strictObject({
  predictionSequence: z.number().int().positive(), predictionCreatedAt: Text, predictionVersionAt: Text,
  memories: z.array(z.strictObject({ memoryId: Id, memoryVersion: z.number().int().positive(),
    recordedSequence: z.number().int().positive(), recordedAt: Text })).max(100),
});
export type SleepPredictionChronology = z.infer<typeof SleepPredictionChronologySchema>;
