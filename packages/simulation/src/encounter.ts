import { ActionSchema, id, now, type Fact } from '../../core/src/domain.js';
import type { Executor } from '../../core/src/contracts.js';

/** Small external interaction adapter, not an internal cognitive Faculty. */
export class TextEncounter implements Executor {
  readonly #facts: Fact[] = [];
  #responses = 0;
  constructor(readonly participant = 'Bill') {}
  observe(text: string): Fact[] {
    const fact: Fact = { source: this.participant, kind: 'says', text, referenceId: null, timestamp: now() };
    this.#facts.push(fact); return [structuredClone(fact)];
  }
  async execute({ agentId, cycleId, bid }: Parameters<Executor['execute']>[0]): ReturnType<Executor['execute']> {
    const action = ActionSchema.parse(bid.action);
    const executionId = id('execution');
    const facts: Fact[] = [{ source: 'Agent', kind: action.kind === 'wait' ? 'does' : 'says', text: action.text, referenceId: executionId, timestamp: now(), originCycleId: cycleId }];
    // Only validated speech/questions provoke dialogue; waiting never fabricates a disclosure or response.
    if (action.kind !== 'wait') {
      this.#responses++;
      facts.push({ source: this.participant, kind: 'says', text: this.#responses === 1
        ? 'Thank you for asking. I respect you. That joke was about my own awkwardness.'
        : 'Thank you for sharing. I appreciate you, and I am glad you told me.', referenceId: executionId, timestamp: now(), originCycleId: cycleId });
    }
    this.#facts.push(...facts);
    return { id: executionId, agentId, cycleId, action, status: 'completed', facts };
  }
  facts(): Fact[] { return structuredClone(this.#facts); }
}
