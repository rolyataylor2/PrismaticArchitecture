import { freeze, id, now, type Execution } from '../../core/src/domain.js';
import type { Executor } from '../../core/src/contracts.js';
import { ExecutionContractSchema } from '../../core/src/execution-contract.js';
import { NativeExecutiveExecutor } from './native-executor.js';

type Job = { agentId: string; controller: AbortController; done: Promise<void>; completedCheckpoint: number | null };
/** External workers only. The host owns persistence, attribution and framework permissions. */
export class BackgroundExecutiveExecutor implements Executor {
  readonly executeSay?: NonNullable<Executor['executeSay']>;
  private readonly jobs = new Map<string, Job>();
  private readonly reportingFailures = new Set<string>();
  private closed = false;
  constructor(private readonly native: NativeExecutiveExecutor, private readonly host: {
    executions(agentId: string): Execution[]; report(execution: Execution): void;
    reportError(agentId: string, executionId: string, error: unknown): void;
  }) {
    if (native.executeSay) this.executeSay = input => native.executeSay!(input);
  }
  async execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> { return this.dispatch(input); }
  async executeReadyRemainder(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    if (!input.contract?.remainder) throw new Error('Ready remainder dispatch requires captured successor authority');
    return this.dispatch(input, true);
  }
  private async dispatch(input: Parameters<Executor['execute']>[0], readyRemainder = false): Promise<Execution> {
    if (input.bid.action.kind !== 'operate' || input.bid.action.operation.intervention || input.bid.action.operation.skillReview || input.contract?.executionMode !== 'background' || input.contract.guidanceRejection || input.contract.skillRejection || input.contract.remainderRejection || (input.contract.remainder && !readyRemainder)) return readyRemainder
      ? this.native.executeControlled(input, undefined, true) : this.native.execute(input);
    if (this.closed) throw new Error('Executive worker service is closed');
    const contract = freeze(ExecutionContractSchema.parse(input.contract));
    const execution: Execution = { id: id('execution'), agentId: input.agentId, cycleId: input.cycleId,
      action: input.bid.action, contractId: contract.id, status: 'running', facts: [],
      operational: { attempts: 0, verified: false, reason: 'External background work scheduled', traceRefs: [] } };
    const active = new Set(this.host.executions(input.agentId).filter(item => item.action.kind === 'operate'
      && (item.status === 'running' || item.status === 'pending')).map(item => item.id));
    for (const [executionId, job] of this.jobs) if (job.agentId === input.agentId) active.add(executionId);
    if (active.size >= contract.limits.maxParallelJobs) return { ...execution, status: 'blocked',
      facts: [{ source: 'External execution', kind: 'observes', timestamp: now(), originCycleId: input.cycleId,
        referenceId: execution.id, text: `Execution of “${execution.action.text}” is blocked: the per-Agent parallel-job budget is exhausted.` }],
      operational: { ...execution.operational!, reason: 'The per-Agent parallel-job budget is exhausted' } };
    const controller = new AbortController();
    const captured = freeze(structuredClone(input));
    // A timer starts after the runtime has persisted the running handoff. No process restart replays this timer.
    const done = new Promise<void>(resolve => setTimeout(() => {
      void this.native.executeControlled(captured, { executionId: execution.id, signal: controller.signal,
        checkpoint: completedSteps => { const job = this.jobs.get(execution.id); if (job) job.completedCheckpoint = completedSteps; } }, readyRemainder)
        .then(result => { this.host.report(result); })
        .catch(error => {
          try { this.host.reportError(input.agentId, execution.id, error); }
          catch { this.reportingFailures.add(execution.id); }
        })
        .finally(() => { this.jobs.delete(execution.id); resolve(); });
    }, 0));
    this.jobs.set(execution.id, { agentId: input.agentId, controller, done, completedCheckpoint: null });
    return execution;
  }
  async resume(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    if (!input.contract?.continuation) throw new Error('Resume requires a selected supplemental contract');
    return this.execute(input);
  }
  cancel(agentId: string, executionId: string): void {
    const job = this.jobs.get(executionId);
    if (!job || job.agentId !== agentId) throw new Error('No active local Executive worker owns this execution');
    job.controller.abort(new Error('Executive cancellation requested'));
  }
  owns(agentId: string, executionId: string): boolean {
    const job = this.jobs.get(executionId);
    return Boolean(job && job.agentId === agentId && !job.controller.signal.aborted);
  }
  atCheckpoint(agentId: string, executionId: string, completedSteps: number): boolean {
    const job = this.jobs.get(executionId);
    return Boolean(job && job.agentId === agentId && !job.controller.signal.aborted && job.completedCheckpoint === completedSteps);
  }
  async wait(agentId: string, executionId: string): Promise<void> {
    const job = this.jobs.get(executionId);
    if (job && job.agentId !== agentId) throw new Error('Executive worker Agent mismatch');
    if (job) await job.done;
    if (this.reportingFailures.has(executionId)) throw new Error('Executive worker result could not be persisted');
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort(new Error('Executive shutdown'));
    await Promise.all([...this.jobs.values()].map(job => job.done));
    if (this.reportingFailures.size) throw new Error('Executive worker results could not be persisted');
  }
}
