import { isDeepStrictEqual } from 'node:util';
import { id, now, type Execution } from '../../core/src/domain.js';
import { freeze } from '../../core/src/domain.js';
import { ExecutionContractSchema, type ExecutionContract } from '../../core/src/execution-contract.js';
import type { Executor } from '../../core/src/contracts.js';
import type { ToolGateway } from './mcp-client-manager.js';
import { defaultExecutiveSensitivity, ExecutiveSensitivitySchema, type ExecutiveSensitivity, type OperationalSignal } from '../../core/src/executive-sensitivity.js';
import { ExecutiveReactionPolicy } from './reaction-policy.js';
import { guidanceFeedback, type ExecutionGuidance } from '../../core/src/execution-guidance.js';
import { executionProcedure } from '../../core/src/skill-invocation.js';

/** External deterministic baseline. It receives selected intent and a framework-scoped tool gateway only. */
export class NativeExecutiveExecutor implements Executor {
  readonly executeSay?: NonNullable<Executor['executeSay']>;
  private readonly sensitivity: ExecutiveSensitivity;
  constructor(private readonly chat: Executor, private readonly gateway: (contract: ExecutionContract) => Promise<ToolGateway>,
    sensitivity: ExecutiveSensitivity = defaultExecutiveSensitivity(), private readonly pause?: (input: Parameters<Executor['execute']>[0]) => Promise<Execution>,
    private readonly checkpoint?: (contract: ExecutionContract, completedSteps: number) => Promise<void>,
    private readonly handoff?: (input: Parameters<Executor['execute']>[0]) => Promise<Execution>,
    private readonly review?: (input: Parameters<Executor['execute']>[0]) => Promise<Execution>) {
    this.sensitivity = freeze(ExecutiveSensitivitySchema.parse(sensitivity));
    if (chat.executeSay) this.executeSay = input => chat.executeSay!(input);
  }
  async execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    return this.executeControlled(input);
  }
  async resume(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    if (!input.contract?.continuation) throw new Error('Resume requires a selected supplemental contract');
    return this.executeControlled(input);
  }
  async executeControlled(input: Parameters<Executor['execute']>[0], control?: { executionId: string; signal: AbortSignal; checkpoint?: (completedSteps: number | null) => void }, readyRemainder = false): Promise<Execution> {
    if (input.bid.action.kind === 'act') return { id: id('execution'), agentId: input.agentId, cycleId: input.cycleId,
      action: input.bid.action, status: 'blocked', facts: [],
      operational: { attempts: 0, verified: false, reason: 'No external embodiment Executive is configured', traceRefs: [] } };
    if (input.bid.action.kind !== 'operate') return this.chat.execute(input);
    const { agentId, cycleId, bid } = input;
    const action = bid.action;
    if (action.kind !== 'operate') throw new Error('Expected operational action');
    const contract = freeze(ExecutionContractSchema.parse(input.contract));
    if (contract.agentId !== agentId || contract.cycleId !== cycleId || contract.commands.length !== 1
      || contract.commands[0]!.bidId !== bid.id || !isDeepStrictEqual(contract.commands[0]!.action, action))
      throw new Error('Executive input does not match selected contract');
    const executionId = control?.executionId ?? id('execution'); const traceRefs: string[] = []; let attempts = 0;
    // Current contracts lack an independently established harmlessness assessment. Treat them conservatively.
    const diagnostics: NonNullable<NonNullable<Execution['operational']>['diagnostics']> = {
      risk: 'consequential', observations: [], reactions: [],
    };
    const policy = new ExecutiveReactionPolicy(contract.sensitivity ?? this.sensitivity);
    const observe = (signal: OperationalSignal, evidence: string, unresolvedSubmission = false) => {
      const observation = { signal, intensity: 1, evidence };
      diagnostics.observations.push(observation);
      diagnostics.reactions.push(policy.evaluate(observation, { risk: diagnostics.risk,
        timestampMs: Date.now(), unresolvedSubmission }));
    };
    const finish = (status: Execution['status'], reason: string, verified = false): Execution => ({
      id: executionId, agentId, cycleId, action, contractId: contract.id, status,
      operational: { attempts, verified, reason, traceRefs, diagnostics },
      facts: [{ source: 'External execution', kind: 'observes', timestamp: now(), originCycleId: cycleId,
        referenceId: executionId, text: `Execution of “${action.text}”: ${status}. ${reason} Attempts: ${attempts}; verified: ${verified}.` }],
    });
    const operation = executionProcedure(contract)!;
    if (action.operation.skillReview) return this.review ? this.review(input) : finish('blocked', 'Selected procedure review is not yet implemented by this host.');
    if (action.operation.intervention) {
      if (!this.pause) return finish('blocked', 'Selected execution control is unavailable in this adapter.');
      return this.pause(input);
    }
    if (contract.guidanceRejection) return finish('blocked', `Guidance response rejected: ${contract.guidanceRejection}`);
    if (contract.remainder && !readyRemainder) return this.handoff ? this.handoff(input)
      : finish('blocked', 'Remainder coordination is unavailable in this adapter.');
    if (contract.remainderRejection) return finish('blocked', `Remainder correction rejected: ${contract.remainderRejection}`);
    if (contract.skillRejection) return finish('blocked', `Skill invocation rejected: ${contract.skillRejection}`);
    if (control?.signal.aborted) return finish('blocked', 'Cancellation stopped execution before tool submission.');
    if (!operation.steps.length && !operation.verification) {
      observe('uncertainty', 'No executable strategy was selected.');
      if (!contract.limits.maxGuidanceRequests) return finish('blocked', 'No executable strategy was selected; the guidance request budget is exhausted.');
      const guidance: ExecutionGuidance = { id: id('guidance'), executionId, contractId: contract.id, createdAt: now(),
        goal: action.text, problem: 'No executable strategy was selected.', attempted: [],
        uncertainty: 'There is no selected permitted sequence of tool calls to enact this goal.',
        requestedInstruction: 'Supply an explicit permitted operational strategy and an observable verification criterion, or choose a different action.',
        traceRefs: [], state: 'awaiting_instruction' };
      const result = finish('needs_guidance', guidance.problem);
      return { ...result, guidance, facts: [{ source: 'External execution', kind: 'observes', timestamp: guidance.createdAt,
        originCycleId: cycleId, referenceId: guidance.id, text: guidanceFeedback(guidance) }] };
    }
    if (operation.steps.length + (operation.verification ? 1 : 0) > contract.limits.maxSteps) {
      observe('drift', 'The selected strategy cannot complete within its step budget.');
      return finish('blocked', 'The selected strategy exceeds the permitted step budget.');
    }
    const tools = await this.gateway(contract);
    const deadline = Math.min(Date.now() + contract.limits.maxDurationMs, contract.remainder?.deadlineAt ?? Infinity);
    const steps = [...operation.steps, ...(operation.verification ? [operation.verification] : [])];
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index]!;
      if (control?.signal.aborted) return finish('blocked', 'Cancellation stopped further submissions; earlier external effects are not reversed.');
      if (Date.now() >= deadline) {
        observe('drift', 'The execution duration budget expired before completion.');
        return finish('blocked', 'Execution duration budget exhausted before another submission.');
      }
      attempts++;
      const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      const signal = control ? AbortSignal.any([control.signal, timeout]) : timeout;
      const outcome = await tools.call(step, JSON.parse(step.argumentsJson) as Record<string, unknown>, signal);
      traceRefs.push(outcome.traceId);
      if (outcome.status === 'unverified') {
        observe('uncertainty', 'A submitted operation has no valid verified response.', true);
        return finish('unverified', 'A submitted operation has no valid verified response; no automatic retry was made.');
      }
      if (outcome.status === 'blocked') return finish('blocked', `Tool submission was blocked: ${outcome.code}.`);
      if (outcome.status === 'reported_error') {
        observe('failure', 'The selected tool reported an execution error.');
        return finish('failed', 'The tool reported an execution error; its causal meaning remains for cognition.');
      }
      if (!('result' in outcome)) return finish('unverified', 'No structured tool result is available.');
      if (this.checkpoint && control && index < steps.length - 1) {
        control.checkpoint?.(index + 1);
        try {
          const boundarySignal = AbortSignal.any([control.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]);
          await awaitBoundary(this.checkpoint(contract, index + 1), boundarySignal);
        } catch {
          return finish('blocked', 'The checkpoint boundary stopped further submissions; completed operations remain recorded and are not replayed.');
        } finally { control.checkpoint?.(null); }
      }
      if (operation.verification && index === steps.length - 1) {
        let observed: unknown = outcome.result.structuredContent;
        for (const segment of operation.verification.path) {
          if (observed === null || typeof observed !== 'object' || !Object.hasOwn(observed, segment)) { observed = undefined; break; }
          observed = (observed as Record<string, unknown>)[segment];
        }
        if (!isDeepStrictEqual(observed, JSON.parse(operation.verification.expectedJson))) {
          observe('surprise', 'The observed structured verification value differs from the selected criterion.');
          return finish('unverified', 'The selected verification criterion was not observed; tool success alone does not prove goal completion.');
        }
        return finish('completed', 'The separately selected verification call matched its observable criterion.', true);
      }
    }
    observe('uncertainty', 'Tools reported success without a selected verification criterion.');
    return finish('unverified', 'Tools reported success, but no verification criterion was selected.');
  }
}

/** Cancellation releases a worker even if the review itself awaits its cessation. */
async function awaitBoundary(review: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) { void review.catch(() => {}); throw signal.reason; }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true });
  });
  try { await Promise.race([review, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
