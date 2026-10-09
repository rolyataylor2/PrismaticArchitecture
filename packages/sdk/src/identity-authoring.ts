import { z } from 'zod';
import { IdentitySchema, id, now } from '../../core/src/domain.js';
import { IdentityAnswersSchema, IdentityClarificationSchema, IdentityReferenceSchema } from '../../providers/src/identity-authoring.js';
import { renderTaskPrompt } from '../../providers/src/prompts.js';
import type { Application } from './application.js';
import { identityAnswerGuidance, identityQuestionLibrary } from './identity-questions.js';
import { promptResolver } from './prompt-settings.js';

export async function clarifyIdentity(app: Application, agentId: string, body: unknown) {
  const input = IdentityReferenceSchema.parse(body);
  const result = await app.identityAuthoringProvider(agentId).author(IdentityClarificationSchema,
    renderTaskPrompt(agentId, 'identity_clarification', input, promptResolver(app.store)));
  app.store.saveIdentityAuthoringSettings(agentId, { ...input, ...result, selectedVersion: result.options[0]!.description });
  return result;
}

export async function generateIdentity(app: Application, agentId: string, body: unknown) {
  const input = IdentityReferenceSchema.extend({
    version: z.string().trim().min(1).max(4000), details: z.string().trim().max(16000), expectedVersion: z.number().int().positive(),
    deleteExistingTraits: z.boolean().default(true),
    questionIds: z.array(z.string().min(1)).min(1).refine(ids => new Set(ids).size === ids.length, 'Question IDs must be unique').optional(),
  }).parse(body);
  const identity = app.store.get('identity', agentId);
  if (identity.version !== input.expectedVersion) throw new Error('Identity changed. Reopen the dialog before generating.');
  const catalog = identityQuestionLibrary.flatMap(group => group.questions);
  const selectedIds = new Set(input.questionIds ?? catalog.map(question => question.id));
  if ([...selectedIds].some(id => !catalog.some(question => question.id === id))) throw new Error('Unknown preset question. Identity was preserved.');
  const selectedQuestions = catalog.filter(question => selectedIds.has(question.id));
  const provider = app.identityAuthoringProvider(agentId);
  const answers = new Map<string, string>();
  // Bound each request without creating more prompt types. No writes until every batch succeeds.
  for (const group of identityQuestionLibrary) {
    const selected = group.questions.filter(question => selectedIds.has(question.id));
    for (let offset = 0; offset < selected.length; offset += 8) {
      const questions = selected.slice(offset, offset + 8);
      const output = await provider.author(IdentityAnswersSchema, renderTaskPrompt(agentId, 'identity_answers',
        { ...input, guidance: identityAnswerGuidance, questions }, promptResolver(app.store)), 16000);
      const expected = new Set(questions.map(question => question.id));
      if (output.answers.length !== questions.length) throw new Error('Generated answers did not cover every preset question. Identity was preserved.');
      for (const answer of output.answers) {
        if (!expected.delete(answer.questionId) || answers.has(answer.questionId)) throw new Error('Generated answers contain an unknown or duplicate question. Identity was preserved.');
        answers.set(answer.questionId, answer.answer);
      }
      if (expected.size) throw new Error('Generated answers are incomplete. Identity was preserved.');
    }
  }
  const createdAt = now();
  const traits = selectedQuestions.map(question => ({
    id: id('trait'), createdAt, role: question.role, question: question.question, keywords: [...question.keywords], answer: answers.get(question.id),
  }));
  const next = IdentitySchema.parse({ ...identity, traits: input.deleteExistingTraits ? traits : [...identity.traits, ...traits], version: input.expectedVersion + 1 });
  app.store.save('identity', next, input.expectedVersion, {
    origin: 'researcher_edit', reason: `Researcher generated Identity inspired by ${input.name}: ${input.version}`, sourceIds: [],
  });
  return next;
}
