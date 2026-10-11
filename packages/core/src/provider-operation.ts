/** Research audit only. An adapter return does not establish downstream contract validity. */
export type ProviderOperation = {
  operationId: string; parentOperationId: string | null; component: 'reasoning' | 'decisions'; method: string; task: string;
  provider: string; phase: 'started' | 'returned' | 'failed'; startedAt: string; finishedAt: string | null; elapsedMs: number | null;
  input: { id: string; hash: string; arguments: unknown[]; worldId: string | null; partId: string | null; predictionId: string | null };
  output: { id: string; hash: string; value: unknown } | null;
  prompts: { task: string; version: string; hash: string; text: string }[];
  validation: 'not_reported'; usage: { eventIds: string[]; inputTokens: number; outputTokens: number; cachedInputTokens: number | null } | null; cost: null;
  error: { category: 'infrastructure' | 'validation' | 'unclassified'; stage: string | null; name: string;
    message: string; httpStatus: number | null; retryable: boolean | null; issues: { path: string; code: string }[] } | null;
};
