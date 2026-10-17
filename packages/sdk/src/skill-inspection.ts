import { isDeepStrictEqual } from 'node:util';
import type { Store, CognitiveEvent, EventPayloads } from '../../core/src/contracts.js';
import type { ExecutiveSkill } from '../../core/src/executive-skill.js';
import type { Execution, Fact } from '../../core/src/domain.js';
import type { ExecutionContract } from '../../core/src/execution-contract.js';
import { evaluateSkillEvidence } from '../../core/src/executive-skill-evidence.js';
import { executionProcedure } from '../../core/src/skill-invocation.js';
import type { Operation } from '../../core/src/operation.js';

export type SkillVersionInspection = { skill: ExecutiveSkill; changes: { label: string; before: unknown; after: unknown }[] };
export type SkillEpisodeInspection = {
  contractId: string; cycleId: string; sequence: number; threadId: string | null; at: string;
  relationship: 'instruction' | 'selected_review' | 'ancestor' | 'validation' | 'application' | 'rejected_application'; goal: string;
  methodRejection?: string;
  applicationEvidence?: { executionId: string; result: 'passed' | 'failed' | 'inconclusive' | 'pending'; traceRefs: string[] }[];
  guidance: { parentContractId: string; instruction: string } | null;
  correction?: { parentContractId: string; checkpointTraceId: string; completedPrefix: Operation['steps']; discardedFuture: Operation['steps']; selectedFuture: Operation['steps']; verifiedReady: boolean };
  usedMethod: { skillId: string; version: number; packageDigest?: string; memberPackageDigest?: string } | null;
  observations: Fact[]; observationCount: number;
  thoughts: { partId: string; name: string; text: string; interpretation: string | null; kind: 'thought' | 'answer'; at: string }[];
  bids: { id: string; partId: string; name: string; kind: string; text: string; argument: string;
    selected: boolean; role: 'source' | 'earlier_same_part' | 'other_selected'; replacesBidId: string | null }[];
  activations: { dispositionId: string; name: string; version: number; concern: string; cues: string[];
    phase: string; score: number; threshold: number }[];
  decisions: { choice: string; explanation: string; identityConflict: string }[];
  outcomes: { execution: Execution; history: { at: string; status: string; reason: string | null }[] }[];
  tools: { traceId: string; tool: string; phase: string; status: string | null; at: string }[];
  reviews?: { cycleId: string; sequence: number; at: string;
    consultations?: { reason: string; outcome: 'reviewed' | 'activity_ended' | 'failed' | 'pending' }[];
    thoughts: { name: string; text: string; interpretation: string | null; partId?: string; kind?: 'thought' | 'answer'; at?: string }[];
    bids: { text: string; argument: string; selected: boolean }[];
    attention: EventPayloads['execution.attention'][];
    decisions: EventPayloads['self.choice'][];
    outcomes: EventPayloads['execution.review_completed'][];
    interventions: EventPayloads['execution.intervention'][] }[];
  limitations: string[];
};
export type ExecutiveSkillInspection = {
  skill: ExecutiveSkill; versions: SkillVersionInspection[]; episodes: SkillEpisodeInspection[];
  related: { id: string; name: string; version: number; relationship: 'same_instruction' | 'derived_from' | 'derived_use' | 'conditional_branch' | 'conditional_parent'; explanation: string }[];
  missingContracts: string[]; limitations: string[];
  applicationSummary: { passed: number; failed: number; inconclusive: number; pending: number; rejected: number };
};

function changes(previous: ExecutiveSkill | undefined, next: ExecutiveSkill): SkillVersionInspection['changes'] {
  if (!previous) return [];
  const fields = [
    ['Name', previous.name, next.name], ['Conditional branches', previous.conditional ?? null, next.conditional ?? null], ['Status', previous.status, next.status],
    ['Maturity assessment', previous.maturity ?? null, next.maturity ?? null],
    ['Declared conditions', previous.conditions, next.conditions], ['Scope', previous.scope, next.scope],
    ['Thread', previous.threadId, next.threadId], ['Success criterion', previous.procedure.successCriteria, next.procedure.successCriteria],
    ['Constraint declarations', previous.procedure.constraints, next.procedure.constraints],
    ['Procedure steps', previous.procedure.steps, next.procedure.steps], ['Verification', previous.procedure.verification, next.procedure.verification],
    ['Execution limits', previous.limits, next.limits], ['Source instruction', previous.source.contractId, next.source.contractId],
    ['Expressed source reason', previous.source.instruction, next.source.instruction],
    ['Validation records', previous.validations.length, next.validations.length],
  ] as const;
  return fields.filter(([, before, after]) => !isDeepStrictEqual(before, after)).map(([label, before, after]) => ({ label, before, after }));
}

/** Privileged read-only audit projection. Never supplied to Part or Self inference. */
export function inspectExecutiveSkill(store: Store, agentId: string, skillId: string): ExecutiveSkillInspection {
  const skill = store.executiveSkills(agentId).find(item => item.id === skillId);
  if (!skill) throw new Error('Executive skill not found for this Agent');
  const history = store.executiveSkillHistory(agentId, skillId);
  const versions = history.length ? history : [skill];
  const contracts = new Map(store.eventsByType(agentId, ['execution.contract']).flatMap(event =>
    event.type === 'execution.contract' && event.payload.agentId === agentId && event.cycleId === event.payload.cycleId ? [[event.payload.id, event] as const] : []));
  const executions = store.executions(agentId);
  const sources = new Set(versions.map(version => version.source.contractId));
  const requested = new Map([...sources].map(contractId => [contractId, 'instruction' as SkillEpisodeInspection['relationship']]));
  // Actual reuse is evidence even when nobody separately validates it. Include
  // parent and member links without inferring ancestry from textual similarity.
  for (const [contractId, event] of contracts) {
    const reviewAction = event.payload.commands[0]?.action;
    if (reviewAction?.kind === 'operate' && reviewAction.operation.skillReview?.skillId === skillId && !requested.has(contractId))
      requested.set(contractId, 'selected_review');
    const method = event.payload.selectedSkill;
    if (method && (method.skillId === skillId || method.memberSkillId === skillId) && !requested.has(contractId))
      requested.set(contractId, 'application');
    const action = event.payload.commands[0]?.action;
    if (event.payload.skillRejection && action?.kind === 'operate' && action.operation.skillInvocation?.skillId === skillId
      && !requested.has(contractId)) requested.set(contractId, 'rejected_application');
  }
  for (const validation of versions.flatMap(version => version.validations)) {
    const contractId = executions.find(execution => execution.id === validation.executionId)?.contractId;
    if (contractId && !requested.has(contractId)) requested.set(contractId, 'validation');
  }
  // Follow only recorded handoff/knowledge edges; similarity never establishes ancestry.
  const pending = [...requested.keys()]; const visited = new Set<string>(); const limitations: string[] = [];
  while (pending.length && visited.size < 200) {
    const contractId = pending.shift()!; if (visited.has(contractId)) continue; visited.add(contractId);
    const contract = contracts.get(contractId)?.payload;
    for (const parentId of [contract?.continuation?.parentContractId, contract?.remainder?.parentContractId, contract?.selectedSkill?.sourceContractId]) {
      if (parentId && !requested.has(parentId)) { requested.set(parentId, 'ancestor'); pending.push(parentId); }
    }
  }
  if (pending.length) limitations.push('Ancestor traversal is bounded to 200 contracts. Direct version and validation sources remain included; inspect linked records for deeper history.');
  if (!history.length) limitations.push('Preserved version history is unavailable; only the current record is shown.');
  limitations.push('A successful outcome after an instruction is temporal evidence, not proof that the bid caused success. Exact-input validation does not establish conditional transfer or established maturity.');
  const cycleIds = [...new Set([...requested.keys()].flatMap(contractId => contracts.get(contractId)?.cycleId ? [contracts.get(contractId)!.cycleId!] : []))];
  const events = cycleIds.length ? store.eventsByType(agentId, ['part.thought', 'part.bid_created', 'part.deliberation_response',
    'primitive.bid_created', 'self.arbitration_started', 'self.choice', 'construction.judgment', 'execution.status', 'execution.tool_trace'], cycleIds) : [];
  const episodes: SkillEpisodeInspection[] = [];
  const missingContracts: string[] = [];
  for (const [contractId, relationship] of requested) {
    const event = contracts.get(contractId); if (!event) { missingContracts.push(contractId); continue; }
    episodes.push(episode(store, event.payload, event.at, relationship, events.filter(item => item.cycleId === event.cycleId), executions));
  }
  episodes.sort((a, b) => a.sequence - b.sequence || a.at.localeCompare(b.at));
  const reviewStarts = store.eventsByType(agentId, ['execution.review_started', 'execution.consultation_requested']);
  for (const episode of episodes) {
    const executionIds = new Set(episode.outcomes.map(outcome => outcome.execution.id));
    const seenCycles = new Set<string>();
    const starts = reviewStarts.filter(event => {
      if ((event.type !== 'execution.review_started' && event.type !== 'execution.consultation_requested')
        || !executionIds.has(event.payload.executionId) || !event.cycleId || seenCycles.has(event.cycleId)) return false;
      seenCycles.add(event.cycleId); return true;
    });
    if (starts.length > 200) episode.limitations.push('Checkpoint review inspection is bounded to the first 200 recorded reviews; open the source Agent history for later records.');
    episode.reviews = starts.slice(0, 200).flatMap(start => {
      if (!start.cycleId) return [];
      const cycle = store.cycle(start.cycleId);
      if (cycle.agentId !== agentId) throw new Error('Checkpoint review belongs to a different Agent');
      const reviewEvents = store.eventsByType(agentId, ['part.thought', 'part.deliberation_response', 'part.bid_created', 'self.choice', 'execution.attention',
        'execution.review_started', 'execution.consultation_requested', 'execution.review_completed', 'execution.intervention'], [cycle.id]);
      const selected = new Set(cycle.selectedBidIds ?? []);
      const names = new Map(reviewEvents.flatMap(event => event.type === 'part.thought'
        ? [[event.payload.partId, event.payload.partSnapshot.name] as const] : []));
      return [{ cycleId: cycle.id, sequence: cycle.sequence, at: start.at,
        consultations: reviewEvents.flatMap(event => event.type === 'execution.consultation_requested' ? [{ reason: event.payload.reason,
          outcome: cycle.status === 'failed' ? 'failed' as const : reviewEvents.some(item => item.type === 'execution.review_started')
            ? 'reviewed' as const : cycle.status === 'completed' ? 'activity_ended' as const : 'pending' as const }] : []),
        thoughts: reviewEvents.flatMap((event): NonNullable<SkillEpisodeInspection['reviews']>[number]['thoughts'] =>
          event.type === 'part.thought' ? [{ name: event.payload.partSnapshot.name, partId: event.payload.partId, kind: 'thought', at: event.at,
            text: event.payload.output.thought, interpretation: event.payload.output.interpretation }]
            : event.type === 'part.deliberation_response' ? [{ name: names.get(event.payload.partId) ?? 'Recorded Part',
              partId: event.payload.partId, kind: 'answer', at: event.at, text: event.payload.response, interpretation: null }] : []),
        bids: reviewEvents.flatMap(event => event.type === 'part.bid_created' ? [{ text: event.payload.action?.text ?? event.payload.argument,
          argument: event.payload.argument, selected: selected.has(event.payload.id) }] : []),
        attention: reviewEvents.flatMap(event => event.type === 'execution.attention' ? [event.payload] : []),
        decisions: reviewEvents.flatMap(event => event.type === 'self.choice' ? [event.payload] : []),
        outcomes: reviewEvents.flatMap(event => event.type === 'execution.review_completed' ? [event.payload] : []),
        interventions: reviewEvents.flatMap(event => event.type === 'execution.intervention' ? [event.payload] : []),
      }];
    });
  }
  const related: ExecutiveSkillInspection['related'] = [];
  const applicationSummary = { passed: 0, failed: 0, inconclusive: 0, pending: 0, rejected: 0 };
  for (const episode of episodes) {
    if (episode.relationship === 'rejected_application') applicationSummary.rejected++;
    for (const evidence of episode.applicationEvidence ?? []) applicationSummary[evidence.result]++;
  }
  for (const other of store.executiveSkills(agentId).filter(item => item.id !== skill.id)) {
    const otherVersions = store.executiveSkillHistory(agentId, other.id);
    const sourceIds = (otherVersions.length ? otherVersions : [other]).map(version => version.source.contractId);
    const add = (relationship: ExecutiveSkillInspection['related'][number]['relationship'], explanation: string) =>
      related.push({ id: other.id, name: other.name, version: other.version, relationship, explanation });
    if (versions.some(version => version.conditional?.branches.some(branch => branch.skillId === other.id)))
      add('conditional_branch', 'An explicitly recorded conditional branch references this exact method and its preserved source evidence.');
    if ((otherVersions.length ? otherVersions : [other]).some(version => version.conditional?.branches.some(branch => branch.skillId === skill.id)))
      add('conditional_parent', 'An explicitly recorded conditional procedure contains this method as a branch.');
    if ([...sources].some(contractId => contracts.get(contractId)?.payload.selectedSkill?.skillId === other.id))
      add('derived_from', 'A recorded source instruction invoked this other method.');
    if (sourceIds.some(contractId => contracts.get(contractId)?.payload.selectedSkill?.skillId === skill.id))
      add('derived_use', 'A recorded instruction for this method invoked the inspected skill.');
    if (sourceIds.some(contractId => sources.has(contractId)))
      add('same_instruction', 'These are separate retained proposals from the same recorded instruction, not a proven parent/child relationship.');
  }
  return { skill, versions: versions.map((version, index) => ({ skill: version, changes: changes(versions[index - 1], version) })),
    episodes, related, missingContracts, limitations, applicationSummary };
}

function episode(store: Store, contract: ExecutionContract, at: string, relationship: SkillEpisodeInspection['relationship'],
  events: CognitiveEvent[], executions: Execution[]): SkillEpisodeInspection {
  const cycle = store.cycle(contract.cycleId); const world = store.world(cycle.worldId);
  if (cycle.agentId !== contract.agentId || world.agentId !== contract.agentId) throw new Error('Skill source evidence belongs to a different Agent');
  const sourceIds = new Set(contract.commands.map(command => command.bidId));
  const sourceParts = new Set(contract.commands.map(command => command.partId));
  const names = new Map<string, string>(); const bindings = new Set<string>();
  const thoughts: SkillEpisodeInspection['thoughts'] = [];
  for (const event of events) {
    if (event.type === 'self.arbitration_started') for (const contribution of event.payload.contributions) names.set(contribution.partId, contribution.name);
    if (event.type === 'part.thought' && sourceParts.has(event.payload.partId)) {
      const payload = event.payload; names.set(payload.partId, payload.partSnapshot.name);
      for (const binding of payload.partSnapshot.instance?.dispositionBindings ?? []) bindings.add(binding.dispositionId);
      thoughts.push({ partId: payload.partId, name: payload.partSnapshot.name, text: payload.output.thought,
        interpretation: payload.output.interpretation, kind: 'thought', at: event.at });
    }
    if (event.type === 'part.deliberation_response' && sourceParts.has(event.payload.partId)) thoughts.push({ partId: event.payload.partId,
      name: names.get(event.payload.partId) ?? 'Recorded Part', text: event.payload.response, interpretation: null, kind: 'answer', at: event.at });
  }
  const selected = new Set(events.flatMap(event => event.type === 'self.choice'
    ? [event.payload.choice, ...(event.payload.selectedBidIds ?? [])] : []));
  for (const bidId of cycle.selectedBidIds ?? []) selected.add(bidId);
  const bids: SkillEpisodeInspection['bids'] = events.flatMap(event => {
    if (event.type !== 'part.bid_created' && event.type !== 'primitive.bid_created') return [];
    const bid = event.payload;
    if (!sourceParts.has(bid.partId) && !selected.has(bid.id)) return [];
    return [{ id: bid.id, partId: bid.partId, name: names.get(bid.partId) ?? 'Recorded contributor', kind: bid.type ?? 'action',
      text: bid.action?.text ?? (bid.type === 'deliberate' ? bid.question : bid.type === 'navigate' ? 'Return to an experienced stance' : ''),
      argument: bid.argument, selected: selected.has(bid.id) || sourceIds.has(bid.id),
      role: sourceIds.has(bid.id) ? 'source' as const : sourceParts.has(bid.partId) ? 'earlier_same_part' as const : 'other_selected' as const,
      replacesBidId: bid.replacesBidId ?? null }];
  });
  for (const command of contract.commands) if (!bids.some(bid => bid.id === command.bidId)) bids.push({ id: command.bidId,
    partId: command.partId, name: names.get(command.partId) ?? 'Recorded contributor', kind: command.action.kind,
    text: command.action.text, argument: command.argument, selected: true, role: 'source', replacesBidId: null });
  const activations: SkillEpisodeInspection['activations'] = events.flatMap(event => event.type !== 'construction.judgment'
    || event.payload.input.task !== 'disposition_activation' ? [] : event.payload.scores.flatMap(score => {
      if (!bindings.has(score.partId)) return [];
      const candidate = event.payload.input.candidates.find(item => item.id === score.partId);
      const context = candidate?.context as { disposition?: import('../../core/src/domain.js').Disposition; activationPhase?: string } | undefined;
      const disposition = context?.disposition; if (!disposition) return [];
      return [{ dispositionId: disposition.id, name: disposition.name, version: disposition.version, concern: disposition.concern,
        cues: disposition.cues, phase: context?.activationPhase ?? 'final', score: score.score, threshold: event.payload.thresholds?.[disposition.id] ?? disposition.threshold }];
    }));
  const sourceOutcomes = executions.filter(execution => execution.contractId === contract.id);
  const applicationEvidence = relationship === 'application' && contract.selectedSkill ? sourceOutcomes.map(execution => {
    const pending = ['pending', 'running', 'needs_guidance'].includes(execution.status);
    return { executionId: execution.id, ...(pending ? { result: 'pending' as const, traceRefs: [] }
      : evaluateSkillEvidence(contract.selectedSkill!.procedure, execution, store.eventsByType(contract.agentId,
        ['execution.contract', 'execution.tool_trace'], [contract.cycleId]))) };
  }) : undefined;
  const limitations: string[] = [];
  const parentEvent = contract.remainder ? store.eventsByType(contract.agentId, ['execution.contract']).find(event =>
    event.type === 'execution.contract' && event.payload.id === contract.remainder!.parentContractId) : undefined;
  const parentMethod = parentEvent?.type === 'execution.contract' ? executionProcedure(parentEvent.payload) : undefined;
  const correction = contract.remainder && parentMethod ? {
    parentContractId: contract.remainder.parentContractId, checkpointTraceId: contract.remainder.checkpointTraceId,
    completedPrefix: parentMethod.steps.slice(0, contract.remainder.completedSteps),
    discardedFuture: parentMethod.steps.slice(contract.remainder.completedSteps),
    selectedFuture: executionProcedure(contract)?.steps ?? [],
    verifiedReady: store.eventsByType(contract.agentId, ['execution.remainder_ready']).some(event => event.type === 'execution.remainder_ready' && event.payload.contractId === contract.id),
  } : undefined;
  if (!thoughts.length) limitations.push('No expressed source-Part thought is available in this historical episode. Current Part state is not substituted.');
  if (!activations.length) limitations.push('No disposition judgment is linked to the source contributor. A fallback Part or missing historical binding is possible; assembly participation is not substituted for activation.');
  return { contractId: contract.id, cycleId: cycle.id, sequence: cycle.sequence, threadId: contract.threadId, at, relationship,
    ...(contract.skillRejection ? { methodRejection: contract.skillRejection } : {}),
    ...(applicationEvidence ? { applicationEvidence } : {}),
    ...(correction ? { correction } : {}),
    goal: contract.commands.map(command => command.action.text).join('; '),
    guidance: contract.continuation ? { parentContractId: contract.continuation.parentContractId, instruction: contract.continuation.newInformation } : null,
    usedMethod: contract.selectedSkill ? { skillId: contract.selectedSkill.skillId, version: contract.selectedSkill.version,
      ...(contract.selectedSkill.packageDigest ? { packageDigest: contract.selectedSkill.packageDigest } : {}),
      ...(contract.selectedSkill.memberPackageDigest ? { memberPackageDigest: contract.selectedSkill.memberPackageDigest } : {}) } : null,
    observations: world.facts.slice(-20), observationCount: world.facts.length, thoughts, bids, activations,
    decisions: events.flatMap(event => event.type === 'self.choice' ? [{ choice: event.payload.choice, explanation: event.payload.explanation, identityConflict: event.payload.identityConflict }] : []),
    outcomes: sourceOutcomes.map(execution => ({ execution, history: events.flatMap(event => event.type === 'execution.status' && event.payload.id === execution.id
      ? [{ at: event.at, status: event.payload.status, reason: event.payload.operational?.reason ?? null }] : []) })),
    tools: events.flatMap(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.id ? [{
      traceId: event.payload.traceId, tool: `${event.payload.serverId} / ${event.payload.toolName}`, phase: event.payload.phase,
      status: typeof event.payload.outcome?.status === 'string' ? event.payload.outcome.status : null, at: event.at }] : []), limitations };
}
