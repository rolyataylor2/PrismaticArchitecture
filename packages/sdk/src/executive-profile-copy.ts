import type { Store } from '../../core/src/contracts.js';
import { ConflictError } from '../../core/src/contracts.js';
import { z } from 'zod';

export const ExecutiveProfileCopySchema = z.strictObject({ sourceAgentId: z.string().min(1),
  sourceRevision: z.number().int().nonnegative(), expectedRevision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(16000) });

/** Researcher configuration portability, independent of execution and psychology. */
export function copyExecutiveProfile(store: Store, targetAgentId: string, value: unknown) {
  const input = ExecutiveProfileCopySchema.parse(value);
  return store.transaction(() => {
    store.get('agent', input.sourceAgentId); store.get('agent', targetAgentId);
    if (input.sourceAgentId === targetAgentId) throw new Error('Profile copy requires different Agents');
    const source = store.executiveProfile(input.sourceAgentId);
    const target = store.executiveProfile(targetAgentId);
    if (source.revision !== input.sourceRevision || target.revision !== input.expectedRevision)
      throw new ConflictError('Executive configuration changed; reload before copying');
    const next = { ...structuredClone(source), revision: target.revision + 1 };
    store.saveExecutiveProfile(targetAgentId, next, target.revision);
    store.appendEvent(targetAgentId, null, 'executive.profile_copied', { sourceAgentId: input.sourceAgentId,
      sourceRevision: source.revision, targetRevision: next.revision, reason: input.reason });
    return next;
  });
}
