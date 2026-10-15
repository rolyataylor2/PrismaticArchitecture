/** Resource admission only. This queue has no psychological or action-selection authority. */
export type ThoughtScope = { agentId: string; threadId: string | null; dispositionId: string };
export type ThoughtJob<T> = ThoughtScope & { worldId: string; purpose?: string; run: () => Promise<T> };

function scopeKey(scope: ThoughtScope): string {
  return JSON.stringify([scope.agentId, scope.threadId, scope.dispositionId]);
}

/** Running jobs finish untouched; newer queued context replaces older context only for the same scope and purpose. */
export class ThoughtJobs {
  private readonly running = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, { scope: string; start: () => void }>();
  private readonly idleWaiters = new Set<() => void>();
  private closed = false;

  constructor(readonly concurrency: number, readonly queueLimit: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Thought concurrency must be a positive integer');
    if (!Number.isSafeInteger(queueLimit) || queueLimit < 0) throw new Error('Thought queue limit must be a nonnegative integer');
  }

  isProcessing(scope: ThoughtScope): boolean { return this.running.has(scopeKey(scope)); }
  get activeCount(): number { return this.running.size; }
  get queuedCount(): number { return this.pending.size; }

  submit<T>(job: ThoughtJob<T>): Promise<{ status: 'completed'; value: T } | { status: 'superseded' | 'deferred' | 'closed' }> {
    if (this.closed) return Promise.resolve({ status: 'closed' });
    const key = scopeKey(job);
    const pendingKey = JSON.stringify([key, job.purpose ?? 'thought']);
    // A scope never has two active jobs, even when idle capacity exists elsewhere.
    const immediate = !this.running.has(key) && this.running.size < this.concurrency;
    if (!immediate && !this.pending.has(pendingKey) && this.pending.size >= this.queueLimit)
      return Promise.resolve({ status: 'deferred' });
    return new Promise((resolve, reject) => {
      const start = () => {
        const handle = Promise.resolve().then(job.run).then(value => {
          resolve({ status: 'completed', value });
        }, reject).finally(() => {
          this.running.delete(key);
          this.drain();
        });
        this.running.set(key, handle);
      };
      if (immediate) start();
      else {
        this.supersede.get(pendingKey)?.();
        this.supersede.set(pendingKey, () => resolve({ status: 'superseded' }));
        this.pending.set(pendingKey, { scope: key, start });
      }
    });
  }

  private readonly supersede = new Map<string, () => void>();

  private drain(): void {
    for (const [key, { scope, start }] of this.pending) {
      if (this.running.size >= this.concurrency) break;
      if (this.running.has(scope)) continue;
      this.pending.delete(key);
      this.supersede.delete(key);
      start();
    }
    if (!this.running.size && !this.pending.size) {
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
    }
  }

  async idle(): Promise<void> {
    if (!this.running.size && !this.pending.size) return;
    await new Promise<void>(resolve => this.idleWaiters.add(resolve));
  }

  /** Stop admitting work and drain accepted work; never cancel a running thought. */
  async close(): Promise<void> { this.closed = true; await this.idle(); }
}
