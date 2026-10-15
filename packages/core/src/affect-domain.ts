import { z } from 'zod';
import type { Identity } from './domain.js';

const Reference = z.string().min(1).max(200);
const Language = z.string().trim().min(1).max(4000);

/** Psychological meaning is authored by a Part, never inferred from activation. */
export const AffectProposalSchema = z.strictObject({
  orientation: Language, motivation: Language, reason: Language, expectedValue: Language,
  supportingPredictionIds: z.array(Reference).max(10),
});
export type AffectProposal = z.infer<typeof AffectProposalSchema>;
export const AffectBidSchema = AffectProposalSchema.extend({ id: Reference, partId: Reference, name: Language });
export type AffectBid = z.infer<typeof AffectBidSchema>;

export const SelectedAffectSchema = z.strictObject({
  periodId: Reference, agentId: Reference, threadId: Reference.nullable(),
  startedCycleId: Reference, renewedCycleId: Reference,
  startedSequence: z.number().int().positive(), renewedSequence: z.number().int().positive(),
  // Committed choice epochs in this thread; internal attention/monitor passes do not advance it.
  expiresAfterSequence: z.number().int().positive(),
  proposals: z.array(AffectBidSchema).min(1).max(2), reason: Language,
}).refine(value => value.renewedSequence >= value.startedSequence, 'Renewal cannot precede period start')
  .refine(value => value.expiresAfterSequence === value.renewedSequence + 1, 'Focus expires after the next same-thread choice epoch');
export type SelectedAffect = z.infer<typeof SelectedAffectSchema>;

export const AffectFeedbackSchema = z.strictObject({
  periodId: Reference, completedCycles: z.number().int().nonnegative(),
  baselinePredictions: z.number().int().nonnegative(),
  originatedPredictions: z.number().int().nonnegative(),
  supported: z.number().int().nonnegative(), contradicted: z.number().int().nonnegative(),
  partlySupported: z.number().int().nonnegative(), ambiguous: z.number().int().nonnegative(),
  selfInfluenced: z.number().int().nonnegative(), externalCircumstances: z.number().int().nonnegative(),
  interrupted: z.number().int().nonnegative(), notTestable: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(), untested: z.number().int().nonnegative(),
  abandoned: z.number().int().nonnegative(), expired: z.number().int().nonnegative(), invalidated: z.number().int().nonnegative(),
  resolvedFraction: z.number().min(0).max(1).nullable(),
  supportedFractionAmongDecisive: z.number().min(0).max(1).nullable(),
  learningProgress: z.literal('unavailable'),
  practicalValue: z.literal('requires_part_interpretation'),
});
export type AffectFeedback = z.infer<typeof AffectFeedbackSchema>;

/** World-blind first-pass input. No arbitrary Part, prediction or event objects. */
export type AffectSelectionContext = {
  identity: Identity;
  proposals: AffectBid[];
  currentFocus: SelectedAffect | null;
  previousPeriodFeedback: AffectFeedback | null;
  availableContributors: { partId: string; name: string }[];
  canDeliberate: boolean;
};
/** Bounded first-pass choice; a deliberate result subsequently requests generative inquiry. */
export const AffectChoiceSchema = z.strictObject({
  mode: z.enum(['select', 'maintain', 'no_change', 'deliberate']),
  selectedProposalIds: z.array(Reference).max(2), reason: Language,
  scores: z.array(z.strictObject({ proposalId: Reference, score: z.number().min(0).max(4),
    selectedBefore: z.array(Reference).max(1),
    distribution: z.array(z.strictObject({ label: Language, probability: z.number().min(0).max(1) })).optional() })).optional(),
}).refine(value => (value.mode === 'select') === (value.selectedProposalIds.length > 0), 'Only select requires proposal IDs')
  .refine(value => new Set(value.selectedProposalIds).size === value.selectedProposalIds.length, 'Duplicate affect selections');
export type AffectChoice = z.infer<typeof AffectChoiceSchema>;
const ExplorationRequest = z.strictObject({
  target_parts: z.array(Reference).min(1).max(16), question: Language,
}).refine(value => new Set(value.target_parts).size === value.target_parts.length, 'Duplicate affect inquiry targets');
export const AffectSelectionSchema = z.strictObject({
  mode: z.enum(['select', 'maintain', 'no_change', 'deliberate']),
  selectedProposalIds: z.array(Reference).max(2), reason: Language,
  explorationRequest: ExplorationRequest.nullable(),
}).refine(value => (value.mode === 'select') === (value.selectedProposalIds.length > 0), 'Only select requires proposal IDs')
  .refine(value => new Set(value.selectedProposalIds).size === value.selectedProposalIds.length, 'Duplicate affect selections')
  .refine(value => (value.mode === 'deliberate') === (value.explorationRequest !== null), 'Only deliberate requires an inquiry');
export type AffectSelection = z.infer<typeof AffectSelectionSchema>;

export const AffectDecisionSchema = z.strictObject({
  cycleId: Reference, agentId: Reference, threadId: Reference.nullable(),
  sequence: z.number().int().positive(), selection: AffectSelectionSchema,
  previousFocus: SelectedAffectSchema.nullable(), resultingFocus: SelectedAffectSchema.nullable(),
  endedPeriodId: Reference.nullable(),
  boundary: z.enum(['started', 'switched', 'renewed', 'unchanged', 'expired', 'inquiry']),
});
export type AffectDecision = z.infer<typeof AffectDecisionSchema>;

/** Committed only with completed cognition. Failed calls remain audit, never carried state. */
export const AffectCycleSchema = z.strictObject({
  cycleId: Reference, threadId: Reference.nullable(), sequence: z.number().int().positive(),
  focusBefore: SelectedAffectSchema.nullable(), focusAfter: SelectedAffectSchema.nullable(), usedFocus: SelectedAffectSchema.nullable(),
  decisions: z.array(AffectDecisionSchema), baselinePredictionIds: z.array(Reference),
  originated: z.array(z.strictObject({ predictionId: Reference, periodId: Reference,
    stage: z.enum(['part_cognition', 'coverage']) })),
  selectedBidIds: z.array(Reference), navigationStateId: Reference.nullable(),
});
export type AffectCycle = z.infer<typeof AffectCycleSchema>;
