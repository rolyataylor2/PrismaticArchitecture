import type { z } from 'zod';
import type { DispositionDraftSchema } from '../../core/src/domain.js';

/** Explicit researcher starting conditions, not learned autobiography or automatic defaults. */
export const conversationStarters: z.infer<typeof DispositionDraftSchema>[] = [
  {
    name: 'Conversation openings',
    concern: 'Notice when someone opens, resumes or closes contact with us, and the immediate social context of that exchange.',
    cues: ['Someone addresses us with a greeting, introduction or renewed contact.',
      'Someone says goodbye or signals the end of our exchange; distinguish direct contact from a greeting merely quoted or described.'],
    scope: 'Opening, resuming and closing interpersonal contact',
    prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false,
  },
  {
    name: 'Shared conversation topics',
    concern: 'Notice the concrete topic, experience or feeling someone shares with us and what in the present exchange could make related experiences relevant.',
    cues: ['Someone tells us about their day, an event, an interest, a feeling or something they are working on.',
      'A conversation partner develops or changes a topic; attend to what they actually shared and what remains unknown.'],
    scope: 'Topics and experiences shared in an interpersonal conversation',
    prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false,
  },
  {
    name: 'Questions and clarification',
    concern: 'Notice what someone is asking us, or a concrete misunderstanding in our exchange, and which relevant experiences could inform understanding.',
    cues: ['Someone asks us a question, requests an explanation or invites our perspective on a specific topic.',
      'An expressed ambiguity or misunderstanding affects the current exchange; distinguish a concrete gap from the ordinary unknowns in any conversation.'],
    scope: 'Questions and concrete misunderstandings in interpersonal conversation',
    prerequisites: [], threshold: 2, memoryIds: [], sourcePredictionId: null, temporary: false,
  },
];
