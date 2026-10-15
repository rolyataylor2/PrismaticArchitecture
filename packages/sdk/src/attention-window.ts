import type { Application } from './application.js';
import { now } from '../../core/src/domain.js';

export type AttentionWindowEvidence = { allowanceMs: number; startedAt: string | null; pausedAt: string | null;
  drainedAt: string; elapsedToPauseMs: number | null; passesAtPause: number | null; passLimit: number | null; cycleIds: string[] };

/** Research resource treatment only. Accepted cognition drains; no thought is cancelled or authored here. */
export async function attentionWindow<T>(app: Application, agentId: string, threadId: string, allowanceMs: number,
  run: () => Promise<T>): Promise<{ result: T; evidence: AttentionWindowEvidence }> {
  if (!Number.isInteger(allowanceMs) || allowanceMs < 1 || allowanceMs > 10000) throw new Error('Invalid attention observation window');
  let timer: ReturnType<typeof setTimeout> | undefined; let startedAt: string | null = null;
  let pausedAt: string | null = null; let elapsedToPauseMs: number | null = null; let started = 0;
  const cycleIds: string[] = []; let passesAtPause: number | null = null; let passLimit: number | null = null;
  let finish!: () => void; const deadline = new Promise<void>(resolve => { finish = resolve; });
  const stop = app.inspection.subscribe(event => {
    if (event.agentId !== agentId || event.type !== 'worldstate.frozen' || app.store.cycle(event.payload.cycleId).threadId !== threadId) return;
    cycleIds.push(event.payload.cycleId);
    if (startedAt !== null) return;
    startedAt = now(); started = performance.now();
    timer = setTimeout(() => {
      const status = app.runtime.pauseThinking(agentId, threadId); passesAtPause = status?.passCount ?? null; passLimit = status?.passLimit ?? null; pausedAt = now(); elapsedToPauseMs = performance.now() - started; finish();
    }, allowanceMs);
  });
  try {
    const result = await run();
    if (startedAt === null) throw new Error('Attention window did not observe a newly admitted experience');
    await deadline;
    await app.runtime.idle(agentId);
    if (cycleIds.some(cycleId => app.store.cycle(cycleId).status === 'failed')) throw new Error('Accepted attention inference failed; the window is not a completed cognition trial');
    return { result, evidence: { allowanceMs, startedAt, pausedAt, drainedAt: now(), elapsedToPauseMs, passesAtPause, passLimit, cycleIds } };
  } finally {
    stop(); if (timer) clearTimeout(timer);
    if (startedAt !== null && pausedAt === null) app.runtime.pauseThinking(agentId, threadId);
    await app.runtime.idle(agentId);
  }
}
