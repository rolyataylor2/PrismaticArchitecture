import type { CognitiveEvent, EventPayloads, Store } from './contracts.js';

export class Inspection {
  readonly #listeners = new Set<(event: CognitiveEvent) => void>();
  #pending: CognitiveEvent[] | null = null;
  constructor(private readonly store: Store) {}
  subscribe(listener: (event: CognitiveEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  atomic<T>(operation: () => T): T {
    if (this.#pending) return operation();
    this.#pending = [];
    let events: CognitiveEvent[];
    let result: T;
    try {
      result = this.store.transaction(operation);
      events = this.#pending;
    } finally { this.#pending = null; }
    for (const event of events) this.publish(event);
    return result;
  }
  emit<K extends keyof EventPayloads>(agentId: string, cycleId: string | null, type: K, payload: EventPayloads[K]): CognitiveEvent {
    const event = this.store.appendEvent(agentId, cycleId, type, payload);
    if (this.#pending) this.#pending.push(event);
    else this.publish(event);
    return event;
  }
  private publish(event: CognitiveEvent): void {
    for (const listener of this.#listeners) {
      // Observer errors cannot change cognitive behavior; persistence is the replay source.
      try { listener(event); } catch { /* Disconnected observers may recover from stored events. */ }
    }
  }
}
