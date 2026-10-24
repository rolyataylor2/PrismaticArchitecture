import { operationalProposalSchema } from './operational-proposal-schema.js';
import { HypothesisAdjustmentSchema } from '../../core/src/cognition-coverage.js';
import { z } from 'zod';
import { constructedOutputs, PartFormationSchema, PartGenerationSchema, MemoryReflectionSchema, type ConstructedInput } from '../../core/src/constructed-domain.js';
import { Id, DeliberationProposalSchema, PredictionDraftSchema, RelevanceScaffoldDraftSchema } from '../../core/src/domain.js';
import { navigationSchema } from './navigation-schema.js';
import { AffectProposalSchema } from '../../core/src/affect-domain.js';

function groundedPredictionSchema(memoryIds: string[]) {
  const references = memoryIds.length ? z.array(z.enum(memoryIds as [string, ...string[]])).max(100) : z.array(Id).max(0);
  return PredictionDraftSchema.extend({ scaffolds: z.array(RelevanceScaffoldDraftSchema.extend({
    relevantMemoryIds: references.describe('Only supplied recalled memory IDs also selected in formation.evidenceMemoryIds; empty when no memory was recalled. Never invent IDs.'),
  })).max(4).optional() });
}

/** Historical references in continuity state do not grant current recall access. */
export function constructedOutputSchema(input: ConstructedInput): z.ZodType<unknown> {
  if (input.task === 'cognition_coverage') {
    const schema = constructedOutputs.cognition_coverage;
    const ids = [...new Set((input.predictions ?? []).filter(prediction => prediction.gapOrigin && prediction.status === 'open').map(prediction => prediction.id))];
    const prediction = groundedPredictionSchema([]);
    const adjustments = ids.length ? z.array(HypothesisAdjustmentSchema.safeExtend({ predictionId: z.enum(ids as [string, ...string[]]), revision: prediction.nullable() })).max(3).optional()
      : z.array(HypothesisAdjustmentSchema).max(0).optional();
    const sufficient = schema.options[0].extend({ adjustments });
    if (input.hypothesisLimit === 0) return sufficient;
    return z.union([sufficient, schema.options[1].extend({ adjustments, hypotheses: z.array(schema.options[1].shape.hypotheses.element.extend({ prediction })).min(1).max(input.hypothesisLimit ?? 3) })]);
  }
  if (input.task === 'hypothesis_reflection' && input.world) return constructedOutputs.hypothesis_reflection.extend({ evaluation: constructedOutputs.hypothesis_reflection.shape.evaluation.extend({ evidenceWorldId: z.literal(input.world.id) }) });
  if (input.task === 'memory_synthesis') {
    const ids = [...new Set((input.memories ?? []).map(memory => memory.id))];
    const schema = constructedOutputs.memory_synthesis;
    if (ids.length < 2) return schema.extend({ synthesis: z.null() });
    const references = z.array(z.enum(ids as [string, ...string[]])).max(100);
    return schema.extend({ synthesis: schema.shape.synthesis.unwrap().extend({ sourceMemoryIds: references.min(2), replaceSourceMemoryIds: references, detailDecisions: schema.shape.synthesis.unwrap().shape.detailDecisions.element.extend({ memoryId: z.enum(ids as [string, ...string[]]) }).array().min(2).max(100) }).nullable() });
  }
  if (input.task !== 'part_cognition') return constructedOutputs[input.task];
  const ids = [...new Set((input.memories ?? []).map(memory => memory.id))];
  const references = ids.length ? z.array(z.enum(ids as [string, ...string[]])).max(100) : z.array(Id).max(0);
  const navigation = navigationSchema(input.world);
  const contributorIds = [...new Set((input.workingParts ?? []).map(part => part.id))];
  const inquiry = contributorIds.length ? DeliberationProposalSchema.extend({
    target_parts: z.array(z.enum(contributorIds as [string, ...string[]])).min(1).max(contributorIds.length),
  }) : null;
  const action = operationalProposalSchema(input.world);
  const predictionIds = [...new Set((input.predictions ?? []).map(prediction => prediction.id))];
  const supportingPredictionIds = predictionIds.length ? z.array(z.enum(predictionIds as [string, ...string[]])).max(10)
    : z.array(Id).max(0);
  const alternatives = [action, ...(inquiry ? [inquiry] : []), ...(navigation ? [navigation] : [])];
  const proposal = alternatives.length === 1 ? action : z.union([alternatives[0]!, alternatives[1]!, ...alternatives.slice(2)]);
  const product = PartGenerationSchema.extend({ formation: PartFormationSchema.extend({
    beliefs: PartFormationSchema.shape.beliefs.max(ids.length ? 30 : 0).describe('Inferences from supplied recalled memories that fill gaps in current direct evidence. Direct observations are interpretation, not beliefs. Empty when no memory was recalled; withdraw contradicted carried claims.'),
    evidenceMemoryIds: references, counterevidenceMemoryIds: references,
  }), cognition: PartGenerationSchema.shape.cognition.extend({
    beliefs: PartGenerationSchema.shape.cognition.shape.beliefs.unwrap().max(ids.length ? 100 : 0).optional().describe('Optional reconsidered memory-based inferences where direct evidence is missing; [] withdraws beliefs. With no recalled memory only [] or omission is valid.'),
    interpretation: PartGenerationSchema.shape.cognition.shape.interpretation.describe('My interpretation of the current encounter, including relevant newly supplied details. Earlier state and memories frame this interpretation; they are not new observations.'),
    evidenceSummary: PartGenerationSchema.shape.cognition.shape.evidenceSummary.describe('Express relevant details of the current encounter for world-blind Self. Distinguish earlier context, recalled episodes and imagined futures from newly supplied records.'),
    proposal: proposal.nullable().describe('A complete recommendation if I advocate behavior now; otherwise null. Thought, localGoal and prediction conditionedAction are not selectable recommendations. Consider the current encounter and behavior already completed.'),
    affectProposals: z.array(AffectProposalSchema.extend({ supportingPredictionIds })).max(4).optional()
      .describe('Optional proposed attentional orientations, distinct from my experienced affect and action proposal. Include motivation, reason and expectedValue. Refer only to supplied predictions; an empty list is valid.'),
    prediction: input.predictions?.some(prediction => prediction.status === 'open') ? z.null() : groundedPredictionSchema(ids).nullable().optional(),
  }) });
  // Runtime commits a subjective episode and its gist together, or neither.
  // Preserve product field order in both mutually exclusive wire branches.
  return z.union([
    product.extend({ memoryReflection: z.null(), memoryGist: z.null() }),
    product.extend({ memoryReflection: MemoryReflectionSchema, memoryGist: PartGenerationSchema.shape.memoryGist.unwrap() }),
  ]).superRefine((output, context) => {
    const selected = new Set(output.formation.evidenceMemoryIds);
    for (const [index, scaffold] of (output.cognition.prediction?.scaffolds ?? []).entries()) {
      if (new Set(scaffold.relevantMemoryIds).size !== scaffold.relevantMemoryIds.length || scaffold.relevantMemoryIds.some(id => !selected.has(id)))
        context.addIssue({ code: 'custom', path: ['cognition', 'prediction', 'scaffolds', index, 'relevantMemoryIds'],
          message: 'Scaffold memory hints must be distinct and selected in the owning formation evidence' });
    }
  });
}
