import { z } from 'zod';
import { DeliberationSchema, DeliberationAnswerSchema } from '../../core/src/domain.js';
import type { AffectSelectionContext } from '../../core/src/affect-domain.js';
import { SelectedAffectSchema } from '../../core/src/affect-domain.js';
import type { FocusedBidContext } from '../../core/src/contracts.js';
import { InfrastructureError } from '../../core/src/contracts.js';
import { partProposalSchema } from './deliberation-schema.js';

export function affectInquirySchema(context: AffectSelectionContext) {
  const ids = [...new Set(context.availableContributors.map(contributor => contributor.partId))];
  if (!ids.length) throw new InfrastructureError('affect_selection', 'Cannot generate an affect inquiry without contributors');
  return DeliberationSchema.safeExtend({ target_parts: z.array(z.enum(ids as [string, ...string[]])).min(1).max(Math.min(16, ids.length)) });
}
export function focusedBidSchema(context: FocusedBidContext) {
  SelectedAffectSchema.parse(context.selectedFocus);
  if (context.selectedFocus.agentId !== context.world.agentId || context.part.agentId !== context.world.agentId) {
    throw new InfrastructureError('focused_bid_revision', 'Focused cognition ownership mismatch');
  }
  if (context.activation.partId !== context.part.id || (context.currentBid && context.currentBid.partId !== context.part.id)) {
    throw new InfrastructureError('focused_bid_revision', 'Focused revision requires the owning Part activation and bid');
  }
  return DeliberationAnswerSchema.safeExtend({ new_bid: partProposalSchema(context).answer.shape.new_bid })
    .refine(value => value.new_bid?.type !== 'deliberate' || new Set(value.new_bid.target_parts).size === value.new_bid.target_parts.length, 'Inquiry targets must be unique');
}
