import { isDeepStrictEqual } from 'node:util';
import type { Executor, Store } from '../../core/src/contracts.js';
import { id, now, type Execution } from '../../core/src/domain.js';
import { selectedSkillReview } from '../../core/src/selected-skill-review.js';
import { prepareSkillApproval } from '../../core/src/skill-approval.js';
import type { AgentSkillPackages } from './agent-skill-packages.js';

/** External host decision. Approval creates no tool dispatch or new permission. */
export class SelectedSkillReview {
  constructor(private readonly store: Store, private readonly packages: AgentSkillPackages) {}
  async execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> {
    const executionId = id('execution');
    const finish = (status: 'completed' | 'blocked', reason: string): Execution => ({
      id: executionId, agentId: input.agentId, cycleId: input.cycleId, contractId: input.contract!.id,
      action: input.bid.action, status, operational: { attempts: 0, verified: status === 'completed', reason, traceRefs: [] },
      facts: [{ source: 'External execution', kind: 'observes', timestamp: now(), originCycleId: input.cycleId,
        referenceId: executionId, text: `Procedure review ${status}: ${reason}` }],
    });
    try {
      const contract = input.contract!;
      if (contract.agentId !== input.agentId || contract.cycleId !== input.cycleId
        || contract.commands[0]?.bidId !== input.bid.id || !isDeepStrictEqual(contract.commands[0]?.action, input.bid.action))
        throw new Error('Procedure review input does not match its selected contract');
      const check = () => {
        const review = selectedSkillReview(this.store, contract);
        const profile = this.store.executiveProfile(input.agentId);
        if (contract.skillReviewPolicy !== 'self_selected' || profile.skillReviewPolicy !== 'self_selected'
          || !contract.learningMode || contract.learningMode === 'disabled' || profile.learningMode === 'disabled')
          throw new Error('Self-selected procedure review is disabled by captured or current policy');
        if (this.store.cycle(input.cycleId).status !== 'running') throw new Error('Procedure review requires the current running selection');
        if (this.store.eventsByType(input.agentId, ['execution.procedure_review']).some(event =>
          event.type === 'execution.procedure_review' && event.payload.contractId === contract.id))
          throw new Error('Selected procedure review was already consumed');
        const candidate = this.store.executiveSkills(input.agentId).find(skill => skill.id === review.skillId);
        if (!candidate || candidate.version !== review.version || candidate.status !== 'proposed'
          || (candidate.scope === 'thread' && candidate.threadId !== contract.threadId))
          throw new Error('Review requires the exact current same-Agent scoped candidate');
        if (review.decision === 'approval') prepareSkillApproval(this.store, input.agentId, contract.threadId, review.skillId, review.version);
        return { review, candidate };
      };
      const initial = check();
      await this.packages.flush(input.agentId);
      const pack = await this.packages.resolveMethod(input.agentId, initial.candidate.id, initial.candidate.version);
      if (!isDeepStrictEqual(pack.method, initial.candidate)) throw new Error('Review package differs from the candidate');
      this.store.transaction(() => {
        const { review, candidate } = check();
        if (!isDeepStrictEqual(candidate, pack.method)) throw new Error('Candidate changed while resolving its package');
        this.store.appendEvent(input.agentId, input.cycleId, 'execution.procedure_review', {
          contractId: contract.id, skillId: candidate.id, sourceVersion: candidate.version, resultVersion: candidate.version + 1,
          decision: review.decision, reason: review.reason, packageDigest: pack.digest,
        });
        const next = { ...candidate, version: candidate.version + 1,
          status: review.decision === 'approval' ? 'active' as const : 'rejected' as const,
          change: { kind: review.decision, reason: review.reason, restoredVersion: null, reviewContractId: contract.id, at: now() } };
        this.store.saveExecutiveSkill(next, candidate.version);
        this.packages.schedule(next);
      });
      return finish('completed', `Selected ${initial.review.decision} recorded for ${initial.candidate.name}, version ${initial.candidate.version + 1}. This decision does not execute the skill or establish transfer.`);
    } catch (error) {
      return finish('blocked', error instanceof Error ? error.message : String(error));
    }
  }
}
