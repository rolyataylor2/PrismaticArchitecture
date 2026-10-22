import { z } from 'zod';
import { IdentityTraitDraftSchema, IdentityMaskSchema } from '../../core/src/domain.js';

/** Researcher-authored starting data, never a living Agent mutation or a behavioral policy. */
export const AgentInitializationSchema = z.strictObject({
  source: z.string().trim().min(1).max(500),
  identity: z.strictObject({ traits: z.array(IdentityTraitDraftSchema).max(100), mask: IdentityMaskSchema.default(null) }),
});
export type AgentInitialization = z.input<typeof AgentInitializationSchema>;
