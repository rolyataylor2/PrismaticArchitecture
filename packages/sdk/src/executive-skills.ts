import { isDeepStrictEqual } from 'node:util';
import type { Store } from '../../core/src/contracts.js';
import { id, now } from '../../core/src/domain.js';
import { ConditionalProcedureSchema, SkillProposalSchema, SkillMaturityAssessmentSchema, type SkillProposal, type ExecutiveSkill } from '../../core/src/executive-skill.js';
import { ConflictError } from '../../core/src/contracts.js';
import { executionProcedure } from '../../core/src/skill-invocation.js';
import { correctedProcedure, evaluateRecordedProcedure } from '../../core/src/corrected-procedure.js';

const limitations = ['Evidence validates only the exact recorded inputs and structured criterion. Transfer, new condition applicability and novel-context safety are not established.'];

/** External procedural administration. Source instruction/evidence comes from selected contracts, never private psychology. */
export class ExecutiveSkills {
  constructor(private readonly store: Store, private readonly onSaved?: (skill: ExecutiveSkill) => void) {}
  private save(skill: ExecutiveSkill, expectedVersion: number) {
    this.store.saveExecutiveSkill(skill, expectedVersion);
    this.onSaved?.(skill);
  }
  assessMaturity(agentId: string, skillId: string, expectedVersion: number, input: unknown): ExecutiveSkill {
    return this.store.transaction(() => {
      this.learning(agentId); const previous = this.current(agentId, skillId, expectedVersion);
      const maturity = SkillMaturityAssessmentSchema.parse(input);
      const next: ExecutiveSkill = { ...previous, version: previous.version + 1, maturity,
        change: { kind: 'maturity', reason: maturity.reason, restoredVersion: null, at: now() } };
      this.save(next, expectedVersion); return next;
    });
  }
  private learning(agentId: string) {
    const profile = this.store.executiveProfile(agentId);
    if (profile.learningMode === 'disabled') throw new Error('Executive procedural learning is disabled');
    return profile.learningMode;
  }
  private current(agentId: string, skillId: string, expectedVersion: number) {
    const skill = this.store.executiveSkills(agentId).find(item => item.id === skillId);
    if (!skill) throw new Error('Executive skill not found for this Agent');
    if (skill.version !== expectedVersion) throw new ConflictError('Executive skill changed; reload before saving');
    return skill;
  }
  private proposal(agentId: string, input: SkillProposal): ExecutiveSkill {
    this.learning(agentId); const proposal = SkillProposalSchema.parse(input);
    const event = this.store.eventsByType(agentId, ['execution.contract']).find(item => item.type === 'execution.contract' && item.payload.id === proposal.sourceContractId);
    if (!event || event.type !== 'execution.contract' || event.payload.agentId !== agentId) throw new Error('Skill requires a recorded same-Agent source contract');
    if (event.payload.guidanceRejection || event.payload.skillRejection) throw new Error('A rejected guidance instruction or method cannot teach a retained procedure');
    const contract = event.payload; const command = contract.commands[0];
    const ended = contract.remainder ? this.store.executions(agentId).find(item => item.contractId === contract.id) : undefined;
    const chain = ended ? correctedProcedure(this.store, agentId, ended.id) : undefined;
    if (contract.remainder && (!chain || chain.evidence !== 'passed')) throw new Error('Corrected skill requires independently passed whole-chain evidence');
    const procedure = chain?.method ?? executionProcedure(contract);
    const root = chain ? this.store.eventsByType(agentId, ['execution.contract']).find(item => item.type === 'execution.contract' && item.payload.id === chain.rootContractId) : undefined;
    const limits = root?.type === 'execution.contract' ? root.payload.limits : contract.limits;
    if (contract.commands.length !== 1 || command?.action.kind !== 'operate' || !procedure?.steps.length)
      throw new Error('Skill source must contain one explicit selected operational strategy');
    if (proposal.scope === 'thread' && !contract.threadId) throw new Error('Thread-scoped skill requires an attributed source thread');
    return { id: id('skill'), agentId, version: 1, name: proposal.name, conditions: proposal.conditions, scope: proposal.scope,
      threadId: proposal.scope === 'thread' ? contract.threadId : null, status: 'proposed', procedure,
      limits, source: { contractId: contract.id, cycleId: contract.cycleId, bidId: command.bidId, partId: command.partId,
        instruction: command.argument, ...(chain ? { correctionChain: { executionId: ended!.id, rootContractId: chain.rootContractId, contractIds: chain.contractIds, executionIds: chain.executionIds } } : {}) },
      validations: [], change: { kind: 'proposal', reason: chain ? 'Retain the verified completed prefixes and selected remainder as one whole procedure' : 'Retain selected instruction as a procedural proposal', restoredVersion: null, at: now() } };
  }
  proposeSkill(agentId: string, input: SkillProposal): ExecutiveSkill {
    return this.store.transaction(() => {
      const skill = this.proposal(agentId, input); this.save(skill, 0); return skill;
    });
  }
  proposeConditional(agentId: string, input: SkillProposal, conditional: NonNullable<ExecutiveSkill['conditional']>): ExecutiveSkill {
    return this.store.transaction(() => {
      const proposed = this.proposal(agentId, input);
      const skill = { ...proposed, conditional: ConditionalProcedureSchema.parse(conditional),
        change: { ...proposed.change, reason: `Conditional consolidation candidate: ${conditional.reason}`.slice(0, 16000) } };
      this.save(skill, 0); return skill;
    });
  }
  refreshBranches(agentId: string, skillId: string, expectedVersion: number): ExecutiveSkill {
    return this.store.transaction(() => {
      this.learning(agentId); const previous = this.current(agentId, skillId, expectedVersion);
      if (!previous.conditional) throw new Error('This method has no conditional branches');
      const branches = previous.conditional.branches.map(branch => {
        const old = this.store.executiveSkillHistory(agentId, branch.skillId).find(member => member.version === branch.version);
        const current = this.store.executiveSkills(agentId).find(member => member.id === branch.skillId);
        if (!old || !current || current.status !== 'active' || current.conditional || !isDeepStrictEqual(old.procedure, current.procedure)
          || !isDeepStrictEqual(old.source, current.source) || !isDeepStrictEqual(old.limits, current.limits))
          throw new Error('Branch refresh requires an approved unchanged method; changed procedures need new consolidation');
        return { ...branch, version: current.version };
      });
      if (isDeepStrictEqual(branches, previous.conditional.branches)) throw new Error('Branch versions are already current');
      const { maturity: _maturity, ...unchanged } = previous;
      const next: ExecutiveSkill = { ...unchanged, version: previous.version + 1, status: 'proposed', validations: [],
        conditional: { ...previous.conditional, branches },
        change: { kind: 'revision', reason: 'Rebind explicitly approved unchanged branch versions; applicability and family approval remain separate.', restoredVersion: null, at: now() } };
      this.save(next, expectedVersion); return next;
    });
  }
  revise(agentId: string, skillId: string, expectedVersion: number, input: SkillProposal): ExecutiveSkill {
    return this.store.transaction(() => {
      const previous = this.current(agentId, skillId, expectedVersion); const proposal = this.proposal(agentId, input);
      const next = { ...proposal, id: previous.id, version: previous.version + 1,
        change: { ...proposal.change, kind: 'revision' as const, reason: 'Revise procedure from a new recorded selected instruction' } };
      this.save(next, expectedVersion); return next;
    });
  }
  validate(agentId: string, skillId: string, expectedVersion: number, executionId: string, allowAutomatic = true): ExecutiveSkill {
    return this.store.transaction(() => {
      const mode = this.learning(agentId); const previous = this.current(agentId, skillId, expectedVersion);
      if (previous.status !== 'proposed') throw new Error('Only proposed skills can receive new validation');
      const execution = this.store.executions(agentId).find(item => item.id === executionId);
      if (!execution) throw new Error('Skill evidence requires a same-Agent execution');
      if (previous.scope === 'thread' && this.store.cycle(execution.cycleId).threadId !== previous.threadId)
        throw new Error('Skill evidence is outside its thread scope');
      const evidence = evaluateRecordedProcedure(this.store, previous.procedure, execution);
      const source = this.store.eventsByType(agentId, ['execution.contract'], [previous.source.cycleId])
        .find(event => event.type === 'execution.contract' && event.payload.id === previous.source.contractId);
      const teachingMode = source?.type === 'execution.contract' && source.payload.commands[0]?.action.kind === 'operate'
        && source.payload.commands[0].action.operation.teachProcedure ? source.payload.learningMode : undefined;
      const next: ExecutiveSkill = { ...previous, version: previous.version + 1,
        validations: [...previous.validations, { executionId, at: now(), ...evidence, limitations }],
        status: evidence.result === 'passed' && mode === 'validated_automatic' && allowAutomatic
          && (teachingMode === undefined || teachingMode === 'validated_automatic') ? 'active' : 'proposed',
        change: { kind: 'validation', reason: `Recorded exact-strategy validation: ${evidence.result}`, restoredVersion: null, at: now() } };
      if (next.status === 'active') this.permissions(next);
      this.save(next, expectedVersion); return next;
    });
  }
  private permissions(skill: ExecutiveSkill) {
    const grants = this.store.mcpPermissions(skill.agentId).tools;
    const tools = [...skill.procedure.steps, ...(skill.procedure.verification ? [skill.procedure.verification] : [])];
    if (tools.some(tool => !grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName)))
      throw new Error('Skill activation cannot expand current tool permissions');
  }
  decide(agentId: string, skillId: string, expectedVersion: number, decision: 'approval' | 'rejection' | 'archive', reason: string): ExecutiveSkill {
    return this.store.transaction(() => {
      const previous = this.current(agentId, skillId, expectedVersion);
      if (decision === 'approval') {
        this.learning(agentId);
        if (previous.status !== 'proposed' || !previous.validations.some(item => item.result === 'passed')) throw new Error('Skill approval requires a validated proposal');
        this.permissions(previous);
      }
      const next: ExecutiveSkill = { ...previous, version: previous.version + 1,
        status: decision === 'approval' ? 'active' : decision === 'rejection' ? 'rejected' : 'archived',
        change: { kind: decision, reason, restoredVersion: null, at: now() } };
      this.save(next, expectedVersion); return next;
    });
  }
  rollback(agentId: string, skillId: string, expectedVersion: number, restoredVersion: number, reason: string): ExecutiveSkill {
    return this.store.transaction(() => {
      this.learning(agentId); const previous = this.current(agentId, skillId, expectedVersion);
      const restored = this.store.executiveSkillHistory(agentId, skillId).find(item => item.version === restoredVersion);
      if (!restored) throw new Error('Skill rollback requires a preserved version');
      if (restored.status === 'active') this.permissions(restored);
      const next: ExecutiveSkill = { ...restored, version: previous.version + 1,
        change: { kind: 'rollback', reason, restoredVersion, at: now() } };
      this.save(next, expectedVersion); return next;
    });
  }
}
