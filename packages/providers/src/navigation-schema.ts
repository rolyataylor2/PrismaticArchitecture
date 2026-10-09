import { z } from 'zod';
import { NavigationProposalSchema, type WorldState } from '../../core/src/domain.js';

/** A new thread has no prior stance to revisit; provenance cannot invent one. */
export function navigationSchema(world?: WorldState) {
  const ids = [...new Set((world?.experienced?.stanceHistory ?? []).map(stance => stance.id))];
  return ids.length ? NavigationProposalSchema.extend({ stateId: z.enum(ids as [string, ...string[]]) }) : null;
}
