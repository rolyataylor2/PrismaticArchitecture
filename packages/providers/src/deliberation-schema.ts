import { operationalProposalSchema } from './operational-proposal-schema.js';
import { z } from 'zod';
import { Text, PredictionDraftSchema, DeliberationSchema, CognitionSchema, AffectDeliberationAnswerSchema, DeliberationProposalSchema, type Cognition, type SelfContext, type WorldState } from '../../core/src/domain.js';
import { AffectProposalSchema } from '../../core/src/affect-domain.js';
import { navigationSchema } from './navigation-schema.js';
import { InfrastructureError } from '../../core/src/contracts.js';

/** Constrain generation to mediated contributors, without adding cognitive access. */
export function deliberationSchema(context: SelfContext) {
  const ids = [...new Set(context.contributions.map(contribution => contribution.partId))];
  if (!ids.length) throw new InfrastructureError('self', 'Cannot generate an inquiry without available contributors');
  return DeliberationSchema.safeExtend({
    target_parts: z.array(z.enum(ids as [string, ...string[]])).min(1).max(Math.min(16, ids.length))
      .describe('Unique available contributor IDs (partId), including primitives. Never bid IDs or contributor names.'),
  });
}

/** Public addressing identifiers only; legacy contexts can address their owner. */
export function partProposalSchema(context: { part: { id: string; instance?: unknown }; availableContributors?: { partId: string }[]; world?: WorldState; prediction?: { id: string } | null }) {
  const ids = [...new Set((context.availableContributors ?? [{ partId: context.part.id }]).map(c => c.partId))];
  const targets = z.array(z.enum(ids as [string, ...string[]])).min(1).max(Math.min(16, ids.length));
  const inquiry = DeliberationProposalSchema.extend({ target_parts: targets });
  const navigation = navigationSchema(context.world);
  const action = operationalProposalSchema(context.world);
  const proposal = navigation ? z.union([action, inquiry, navigation]) : z.union([action, inquiry]);
  const cognition: z.ZodType<Cognition> = context.part.instance
      ? CognitionSchema.extend({ proposal: proposal.nullable(), beliefs: z.array(Text).max(100), affect: z.string().max(4000), localGoal: Text.nullable(), prediction: PredictionDraftSchema.nullable() })
      : CognitionSchema.omit({ beliefs: true, affect: true, localGoal: true, prediction: true }).extend({ proposal: proposal.nullable() });
  return {
    cognition: cognition.refine(value => value.proposal?.type !== 'deliberate' || new Set(value.proposal.target_parts).size === value.proposal.target_parts.length, 'Inquiry targets must be unique'),
    answer: AffectDeliberationAnswerSchema.safeExtend({ new_bid: proposal.nullable(),
      affectProposals: z.array(AffectProposalSchema.extend({ supportingPredictionIds: context.prediction ?
        z.array(z.literal(context.prediction.id)).max(10) : z.array(z.string()).max(0) })).max(4).optional(),
    }).refine(value => value.new_bid?.type !== 'deliberate' || new Set(value.new_bid.target_parts).size === value.new_bid.target_parts.length, 'Inquiry targets must be unique'),
  };
}
