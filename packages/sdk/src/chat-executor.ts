import { ExecutionSchema, SpeechResultSchema, id, now, type Execution } from '../../core/src/domain.js';
import { InfrastructureError, type Executor, type ReasoningProvider, type Store } from '../../core/src/contracts.js';
import { speechContext } from '../../core/src/speech.js';
import type { Inspection } from '../../core/src/inspection.js';

/** External chat expression; selected intentions remain immutable audit records. */
export class ChatExecutor implements Executor {
  constructor(private readonly store: Store, private readonly reasoning: ReasoningProvider, private readonly inspection: Inspection) {}
  async execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    const { agentId, cycleId, bid } = input;
    if (bid.action.kind === 'operate') throw new InfrastructureError('execution', 'Chat expression cannot execute operational tools');
    if (bid.action.kind === 'say' || bid.action.kind === 'ask') return this.executeSay({ agentId, cycleId, bids: [bid] });
    const executionId = id('execution');
    return ExecutionSchema.parse({ id: executionId, agentId, cycleId, action: bid.action, status: 'completed',
      facts: [{ source: 'Agent', kind: bid.action.kind === 'wait' ? 'does' : 'says', text: bid.action.text,
        referenceId: executionId, timestamp: now(), originCycleId: cycleId }] });
  }
  async executeSay({ agentId, cycleId, bids }: Parameters<NonNullable<Executor['executeSay']>>[0]): Promise<Execution> {
    const context = speechContext(this.store.get('identity', agentId), bids);
    if (!this.reasoning.renderSpeech) throw new InfrastructureError('execution', 'Speech realization provider unavailable');
    this.inspection.emit(agentId, cycleId, 'speech.realization_started', context);
    const output = SpeechResultSchema.parse(await this.reasoning.renderSpeech(context));
    const executionId = id('execution');
    return ExecutionSchema.parse({ id: executionId, agentId, cycleId, action: bids[0]!.action, status: 'completed',
      speech: { bidIds: bids.map(bid => bid.id), text: output.text },
      facts: [{ source: 'Sensor audio', kind: 'says', text: `You said: ${output.text}`, referenceId: executionId, timestamp: now(), originCycleId: cycleId }] });
  }
}
