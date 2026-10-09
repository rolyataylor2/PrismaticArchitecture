import { z } from 'zod';
import { Text } from '../../core/src/domain.js';

export const ComponentDraftSchema = z.strictObject({
  text: Text, summary: Text, context: z.array(Text).max(30), horizon: Text, confidence: z.number().min(0).max(1),
});
