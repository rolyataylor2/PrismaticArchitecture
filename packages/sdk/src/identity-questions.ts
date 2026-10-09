import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { IdentityTraitRoleSchema } from '../../core/src/domain.js';

const QuestionGroupSchema = z.strictObject({
  category: z.string().min(1), source: z.string().min(1), answerGuidance: z.string().min(1),
  questions: z.array(z.strictObject({
    role: IdentityTraitRoleSchema, id: z.string().min(1), question: z.string().min(1), sourceQuestion: z.string().min(1), keywords: z.array(z.string().min(1)).min(1),
  })).min(1),
});
export type IdentityQuestionGroup = z.infer<typeof QuestionGroupSchema>;

/** Authored examples for researcher forms; loading the catalog does not change an Agent. */
export const identityQuestionLibrary: readonly IdentityQuestionGroup[] = z.array(QuestionGroupSchema).parse(
  JSON.parse(readFileSync(new URL('../../../presets/identities/question-library.json', import.meta.url), 'utf8')),
);

/** One shared authoring guide; original source guidance remains preserved in the catalog. */
export const identityAnswerGuidance = z.string().trim().min(1).parse(
  readFileSync(new URL('../../../presets/identities/answer-guidance.txt', import.meta.url), 'utf8'),
);
