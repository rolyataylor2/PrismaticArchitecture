import { z } from 'zod';

/** Researcher inputs and generated drafts, separate from cognitive contexts. */
export const IdentityReferenceSchema = z.strictObject({
  name: z.string().trim().min(1).max(300),
});
export const IdentityClarificationSchema = z.strictObject({
  question: z.string().trim().min(1).max(2000),
  options: z.array(z.strictObject({ label: z.string().trim().min(1).max(300), description: z.string().trim().min(1).max(4000) })).min(1).max(6),
});
export const IdentityAnswersSchema = z.strictObject({
  answers: z.array(z.strictObject({ questionId: z.string().min(1), answer: z.string().trim().min(1).max(16000) })).min(1),
});
