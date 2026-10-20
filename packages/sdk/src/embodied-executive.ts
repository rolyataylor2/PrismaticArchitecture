import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { freeze, id, now, type Execution } from '../../core/src/domain.js';
import { ExecutionContractSchema } from '../../core/src/execution-contract.js';
import { executiveModuleEnabled } from '../../core/src/executive-profile.js';
import type { Executor, Store } from '../../core/src/contracts.js';

const Reply = z.strictObject({ contractId: z.string().min(1), status: z.enum(['completed', 'blocked', 'unverified']),
  observations: z.array(z.string().min(1).max(12000)).max(1000), verified: z.boolean() }).refine(
  reply => reply.status === 'completed' ? reply.verified : !reply.verified, 'Only separately verified outcomes may complete');

/** Host-configured external realization. No psychological store or MCP gateway crosses this boundary. */
export class EmbodiedExecutive implements Executor {
  readonly executeSay?: NonNullable<Executor['executeSay']>;
  private readonly endpoints: ReadonlyMap<string, string>;
  private readonly shutdown = new AbortController();
  constructor(private readonly store: Store, private readonly fallback: Executor, bindings: Record<string, string> = {}) {
    this.endpoints = new Map(Object.entries(bindings).map(([agentId, endpoint]) => {
      store.get('agent', agentId);
      const url = new URL(endpoint);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.username || url.password || url.search || url.hash) throw new Error('Embodiment endpoints must be trusted loopback HTTP URLs');
      const worlds = store.eventsByType(agentId, ['worldstate.frozen']);
      if (worlds.some(event => event.type === 'worldstate.frozen' && !event.payload.embodied))
        throw new Error('Bind embodiment before the first experience; existing nonembodied history cannot be hidden');
      return [agentId, url.href];
    }));
    if (fallback.executeSay) this.executeSay = input => fallback.executeSay!(input);
  }
  isEmbodied(agentId: string): boolean {
    return this.endpoints.has(agentId) || this.store.eventsByType(agentId, ['worldstate.frozen'])
      .some(event => event.type === 'worldstate.frozen' && event.payload.embodied);
  }
  close(): void { this.shutdown.abort(); }
  recorded(execution: Execution): void { this.fallback.recorded?.(execution); }
  async resume(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    if (input.bid.action.kind === 'act' || !this.fallback.resume) throw new Error('Embodied actions cannot replay a supplemental tool contract');
    return this.fallback.resume(input);
  }
  async execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    if (input.bid.action.kind !== 'act') return this.fallback.execute(input);
    const contract = freeze(ExecutionContractSchema.parse(input.contract));
    const action = input.bid.action;
    const command = contract.commands[0];
    const recorded = this.store.eventsByType(input.agentId, ['execution.contract'], [input.cycleId])
      .find(event => event.type === 'execution.contract' && isDeepStrictEqual(event.payload, contract));
    const cycle = this.store.cycle(input.cycleId);
    if (contract.agentId !== input.agentId || contract.cycleId !== input.cycleId || contract.commands.length !== 1
      || command?.bidId !== input.bid.id || !isDeepStrictEqual(command.action, action) || !recorded
      || !cycle.selectedBidIds?.includes(input.bid.id) || cycle.status === 'failed') throw new Error('Embodied handoff requires its recorded Self-selected contract');
    const executionId = id('execution');
    const finish = (status: Execution['status'], reason: string, observations: string[] = [], verified = false): Execution => ({
      id: executionId, agentId: input.agentId, cycleId: input.cycleId, contractId: contract.id, action, status,
      facts: observations.map(text => ({ source: 'Embodied perception', kind: 'observes', text, timestamp: now(), referenceId: executionId, originCycleId: input.cycleId })),
      operational: { attempts: status === 'blocked' ? 0 : 1, verified, reason, traceRefs: [] },
    });
    const endpoint = this.endpoints.get(input.agentId);
    if (!endpoint) return finish('blocked', 'No embodiment endpoint is bound');
    const admission: { reason: string } | { expiresAt: number } = this.store.transaction(() => {
      const profile = this.store.executiveProfile(input.agentId);
      if (this.shutdown.signal.aborted || !executiveModuleEnabled(profile, 'tools') || !profile.allowEquivalentMethods) return { reason: 'External action realization is disabled by the current profile' };
      const expiresAt = Date.parse(recorded.at) + Math.min(contract.limits.maxDurationMs, profile.limits.maxDurationMs);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { reason: 'Selected duration budget expired' };
      if (Object.entries(contract.limits).some(([key, value]) => value > profile.limits[key as keyof typeof profile.limits]))
        return { reason: 'Current execution limits are narrower than the selected contract' };
      const prior = this.store.eventsByType(input.agentId, ['execution.intent_dispatch']).some(event => event.type === 'execution.intent_dispatch'
        && event.payload.contractId === contract.id && event.payload.phase === 'submitted');
      if (prior) return { reason: 'This intention already has a dispatch receipt; inspect its outcome without replay' };
      const dispatches = this.store.eventsByType(input.agentId, ['execution.intent_dispatch']);
      const unsettled = dispatches.filter(event => event.type === 'execution.intent_dispatch' && event.payload.phase === 'submitted'
        && !dispatches.some(later => later.type === 'execution.intent_dispatch' && later.payload.contractId === event.payload.contractId && later.payload.phase === 'returned'));
      if (unsettled.length >= Math.min(profile.limits.maxParallelJobs, contract.limits.maxParallelJobs)) return { reason: 'Parallel action budget is occupied, including uncertain submissions' };
      this.store.appendEvent(input.agentId, input.cycleId, 'execution.intent_dispatch', { contractId: contract.id, executionId, phase: 'submitted' });
      return { expiresAt };
    });
    if ('reason' in admission) return finish('blocked', admission.reason);
    const { expiresAt } = admission;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
        body: JSON.stringify({ protocolVersion: 1, contract, expiresAt }),
        signal: AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(Math.max(1, expiresAt - Date.now()))]) });
      if (!response.ok) throw new Error('External handoff did not return a usable outcome');
      const reply = Reply.parse(await response.json());
      if (reply.contractId !== contract.id) throw new Error('External reply changed contract reference');
      this.store.appendEvent(input.agentId, input.cycleId, 'execution.intent_dispatch', { contractId: contract.id, executionId, phase: 'returned' });
      return finish(reply.status, 'External embodiment outcome; technical evidence is held by the external Executive', reply.observations, reply.verified);
    } catch {
      this.store.appendEvent(input.agentId, input.cycleId, 'execution.intent_dispatch', { contractId: contract.id, executionId, phase: 'uncertain' });
      return finish('unverified', 'External response unavailable; effects may have occurred. No automatic retry.');
    }
  }
}
