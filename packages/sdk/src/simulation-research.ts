import { simulationEventScope } from './simulation-event-scope.js';
import { researchMetricCatalog } from './simulation-metrics.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../../core/src/contracts.js';
import { ConflictError } from '../../core/src/contracts.js';
import { id, now } from '../../core/src/domain.js';
import type { SimulationRun } from './simulation-tests.js';
import { analyzeSimulation } from './simulation-analysis.js';

const text = z.string().trim().min(1).max(32768);
const references = z.array(z.string().min(1).max(500)).max(40);
export const SimulationReviewInput = z.strictObject({ criterionId: z.string().regex(/^criterion-[1-9]\d*$/),
  outcome: z.enum(['observed', 'not_observed', 'inconclusive']), reviewer: text, rationale: text,
  evidenceReferences: references, expectedVersion: z.number().int().min(0) });
export const SimulationFindingInput = z.strictObject({ key: z.string().min(1).max(500), title: text, claim: text,
  alternatives: text, followUp: text, reviewer: text, status: z.enum(['unreviewed', 'supported', 'disputed', 'insufficient_evidence']),
  evidenceReferences: references, expectedVersion: z.number().int().min(0) });
export const SimulationMetricReviewInput = z.strictObject({ metricId: z.enum(researchMetricCatalog.map(item => item.id)),
  stageIndex: z.number().int().min(0).nullable().default(null),
  verdict: z.enum(['supported', 'not_supported', 'inconclusive']), reviewer: text, operationalization: text, rationale: text, limitations: text,
  value: z.number().finite().min(-1e9).max(1e9).nullable().default(null), unit: z.string().trim().min(1).max(120).nullable().default(null),
  evidenceReferences: references, expectedVersion: z.number().int().min(0) });
export type SimulationMetricReview = RecordBase & Omit<z.infer<typeof SimulationMetricReviewInput>, 'expectedVersion' | 'evidenceReferences' | 'stageIndex'> & { kind: 'simulation_metric_review'; stageIndex?: number | null };
type Citation = { attribution: 'frozen_run' | 'recorded_cycle' | 'run_window_unassigned' | 'recorded_stage'; reference: string; runId: string; evidenceBasis: SimulationRun['evidenceBasis']; runStatus: SimulationRun['status']; value: unknown; hash: string };
type RecordBase = { id: string; agentId: string; runId: string; version: number; previousId: string | null; createdAt: string; citations: Citation[]; evidenceBasis: SimulationRun['evidenceBasis'] };
export type SimulationReview = RecordBase & Omit<z.infer<typeof SimulationReviewInput>, 'expectedVersion' | 'evidenceReferences'> & { kind: 'simulation_review' };
export type SimulationFinding = RecordBase & Omit<z.infer<typeof SimulationFindingInput>, 'expectedVersion' | 'evidenceReferences'> & { kind: 'simulation_finding'; origin: 'mechanical_candidate' | 'model_assessment' | 'researcher' };

export function researchRun(store: Store, runId: string): SimulationRun {
  const run = store.experiments().find(item => item.kind === 'simulation_test' && item.id === runId) as SimulationRun | undefined;
  if (!run) throw new Error('Unknown simulation run');
  return run;
}
export function simulationResearch(store: Store, runId: string) {
  researchRun(store, runId);
  const records = store.experiments().filter(item => item.runId === runId);
  return { reviews: records.filter(item => item.kind === 'simulation_review') as SimulationReview[],
    findings: records.filter(item => item.kind === 'simulation_finding') as SimulationFinding[],
    metricReviews: records.filter(item => item.kind === 'simulation_metric_review') as SimulationMetricReview[] };
}
/** Only saved run/stage records and events of this run are valid privileged evidence. */
export function simulationCitation(store: Store, run: SimulationRun, reference: string): Citation {
  let attribution: Citation['attribution'] = 'frozen_run';
  let root: unknown = run;
  let keys = reference.slice(1).split('/');
  if (!reference.startsWith('/') || keys.some(key => /~(?![01])/.test(key))) throw new Error('Invalid evidence reference');
  keys = keys.map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (keys[0] === 'runs') {
    const compared = researchRun(store, keys[1] ?? '');
    const citation = simulationCitation(store, compared, '/' + keys.slice(2).map(key => key.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'));
    return { ...citation, reference };
  }
  if (keys[0] === 'events') {
    const eventId = keys[1];
    const cycleIds = new Set(run.stages.flatMap(stage => stage.cycleId ? [stage.cycleId] : []));
    for (const event of store.events(run.agentId)) if (event.type === 'cycle.started' && event.payload.threadId === run.id) cycleIds.add(event.payload.id);
    for (const cycle of store.cycles(run.agentId)) if (cycle.threadId === run.id && cycle.startedAt >= run.createdAt && (!run.finishedAt || cycle.startedAt <= run.finishedAt)) cycleIds.add(cycle.id);
    root = store.events(run.agentId).find(event => event.id === eventId && (simulationEventScope(event) ? simulationEventScope(event)!.runId === run.id : event.cycleId ? cycleIds.has(event.cycleId)
      : ['provider.operation', 'provider.usage', 'runtime.validation', 'construction.inference_started', 'consolidation.started', 'consolidation.completed'].includes(event.type)
        && event.at >= run.createdAt && !!run.finishedAt && event.at <= run.finishedAt));
    attribution = root && simulationEventScope(root as import('../../core/src/contracts.js').CognitiveEvent) ? 'recorded_stage' : (root as { cycleId?: string | null } | undefined)?.cycleId ? 'recorded_cycle' : 'run_window_unassigned';
    keys = keys.slice(2);
  } else if (!['stages', 'measures', 'specification', 'assessments', 'executiveEvidence', 'startingConfiguration', 'error', 'status', 'engine'].includes(keys[0] ?? '')) throw new Error('Reference is outside the preserved research evidence');
  let value = root;
  for (const key of keys) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('Evidence reference does not exist in this run');
    value = (value as Record<string, unknown>)[key];
  }
  if (value === undefined || value === null) throw new Error('Evidence reference is empty or unavailable');
  return { attribution, reference, runId: run.id, evidenceBasis: run.evidenceBasis, runStatus: run.status,
    value: structuredClone(value), hash: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}
function terminal(run: SimulationRun) { if (run.status === 'running' || run.status === 'paused') throw new Error('Finish the run before saving researcher judgments'); }
export function saveSimulationReview(store: Store, runId: string, body: unknown): SimulationReview {
  const input = SimulationReviewInput.parse(body);
  return store.transaction(() => {
    const run = researchRun(store, runId); terminal(run);
    const index = Number(input.criterionId.slice(10)) - 1;
    if (!run.specification.criteria[index]) throw new Error('Unknown criterion');
    if (input.outcome !== 'inconclusive' && !input.evidenceReferences.length) throw new Error('Decisive human reviews require evidence citations');
    const prior = simulationResearch(store, runId).reviews.filter(item => item.criterionId === input.criterionId).at(-1);
    if ((prior?.version ?? 0) !== input.expectedVersion) throw new ConflictError('Review changed; reload its history');
    const record: SimulationReview = { id: id('review'), kind: 'simulation_review', agentId: run.agentId, runId,
      version: input.expectedVersion + 1, previousId: prior?.id ?? null, createdAt: now(), criterionId: input.criterionId,
      outcome: input.outcome, reviewer: input.reviewer, rationale: input.rationale, evidenceBasis: run.evidenceBasis,
      citations: [...new Set(input.evidenceReferences)].map(reference => simulationCitation(store, run, reference)) };
    store.saveExperiment(record); return record;
  });
}
export function saveSimulationMetricReview(store: Store, runId: string, body: unknown): SimulationMetricReview {
  const input = SimulationMetricReviewInput.parse(body);
  if ((input.value === null) !== (input.unit === null)) throw new Error('A measured value and unit must be supplied together');
  return store.transaction(() => {
    const run = researchRun(store, runId); terminal(run);
    if (input.stageIndex !== null && !run.stages[input.stageIndex]) throw new Error('Unknown dimension review stage');
    if (input.stageIndex !== null && (input.verdict !== 'inconclusive' || input.value !== null)) {
      const prefix = `/stages/${input.stageIndex}`;
      if (!input.evidenceReferences.some(reference => [prefix, `/runs/${runId}${prefix}`].some(path => reference === path || reference.startsWith(path + '/')))) {
        throw new Error('A decisive or measured stage review requires its own stage evidence citation');
      }
    }
    if (input.verdict !== 'inconclusive' && !input.evidenceReferences.length) throw new Error('Decisive dimension reviews require evidence citations');
    const prior = simulationResearch(store, runId).metricReviews.filter(item => item.metricId === input.metricId && (item.stageIndex ?? null) === input.stageIndex).at(-1);
    if ((prior?.version ?? 0) !== input.expectedVersion) throw new ConflictError('Dimension review changed; reload its history');
    const { expectedVersion, evidenceReferences, ...fields } = input;
    const record: SimulationMetricReview = { ...fields, id: id('metric_review'), kind: 'simulation_metric_review', agentId: run.agentId, runId,
      version: expectedVersion + 1, previousId: prior?.id ?? null, createdAt: now(), evidenceBasis: run.evidenceBasis,
      citations: [...new Set(evidenceReferences)].map(reference => simulationCitation(store, run, reference)) };
    store.saveExperiment(record); return record;
  });
}
export type SimulationCandidate = { key: string; title: string; claim: string; alternatives: string; followUp: string; evidenceReferences: string[]; pattern: string };
/** Transparent checks suggest inspections, not psychological truth. No Agent or model calls. */
export function simulationCandidates(store: Store, run: SimulationRun): SimulationCandidate[] {
  const analysis = analyzeSimulation(store, run);
  const candidates: SimulationCandidate[] = [];
  for (const [assessmentIndex, assessment] of (run.assessments ?? []).entries()) if (assessment.status === 'completed') {
    for (const [measureIndex, measure] of assessment.measures.entries()) if (/^prediction-(alignment|memory)-\d+$/.test(measure.criterionId) && measure.outcome === 'observed') {
      const criterion = assessment.rubric.criteria.find(item => item.criterionId === measure.criterionId);
      candidates.push({ key: `model-alignment:${assessment.id}:${measure.criterionId}`, pattern: 'model-prediction-alignment',
        title: criterion?.criterion ?? 'Possible prediction provenance mismatch',
        claim: `Provisional researcher model ${assessment.model}: ${measure.explanation}`,
        alternatives: `${measure.counterevidence} Limitations: ${measure.limitations} This is an external machine interpretation, not Agent learning or independently verified research truth.`,
        followUp: 'Review original open versions, legitimate revisions, horizons, factual checks and linked memory versions. Repeat under matching settings with alignment-preserving controls.',
        evidenceReferences: [`/assessments/${assessmentIndex}/measures/${measureIndex}`, ...measure.evidenceReferences.map(reference => `/assessments/${assessmentIndex}/evidence${reference}`)] });
    }
  }
  for (const entry of analysis.predictions) {
    if (entry.prediction.status === 'resolved' && entry.evidenceSufficiency === 'not established') candidates.push({
      key: `uncertain-closure:${entry.prediction.id}`, pattern: 'uncertain-closure', title: 'Closed prediction with nondecisive evidence',
      claim: `The prediction “${entry.prediction.expectation}” is administratively resolved with ${entry.expectationAssessment} assessment.`,
      alternatives: 'Administrative closure may be intentional; it does not establish that the expectation was supported or uncertainty was resolved.',
      followUp: 'Inspect the owning perspective, exact outcome evidence and later analogous probe before grading learning.',
      evidenceReferences: [`/stages/${entry.versions.at(-1)!.stageIndex}/predictions/${run.stages[entry.versions.at(-1)!.stageIndex]!.predictions.findIndex(item => item.id === entry.prediction.id)}`] });
  }
  for (const [index, stage] of run.stages.entries()) {
    const previous = run.stages[index - 1];
    if (stage.phase === 'control' && previous) {
      const repeated = stage.activations.filter(item => item.active && previous.activations.some(old => old.dispositionId === item.dispositionId && old.active));
      if (repeated.length) candidates.push({ key: `control-carryover:${index}`, pattern: 'control-carryover', title: 'Continuing activation in a control',
        claim: `${new Set(repeated.map(item => item.dispositionId)).size} scope(s) active in the previous stage remain active in “${stage.name}”.`,
        alternatives: 'Unresolved concern carryover may be appropriate; an unrelated control may also expose overgeneralization. Activation alone cannot decide this.',
        followUp: 'Compare this control immediately after experience with the same control on a fresh Agent under matching settings.',
        evidenceReferences: [`/stages/${index}/activations`, `/stages/${index - 1}/activations`, `/stages/${index}`] });
    }
    if (stage.thoughts.some(thought => thought.proposal) && !(stage.executions?.length)) candidates.push({
      key: `behavior-gap:${index}`, pattern: 'behavior-gap', title: 'Proposal has no captured execution outcome',
      claim: `“${stage.name}” contains advocacy but no saved stage execution outcome.`,
      alternatives: 'Self may reject all proposals, the Executive may be disconnected, or historical capture may be incomplete. A proposal is not an action.',
      followUp: 'Inspect the recorded Self choice, connection configuration and cycle execution audit.',
      evidenceReferences: [`/stages/${index}/thoughts`] });
  }
  if (run.error) candidates.push({ key: 'run-failure', pattern: 'infrastructure-failure', title: 'Run stopped before completing the scenario',
    claim: run.error, alternatives: 'This is an operational failure; the psychological hypothesis remains unevaluated for missing stages.',
    followUp: 'Inspect the failing operation and provider diagnostics; rerun only after checking the underlying failure.', evidenceReferences: ['/error'] });
  for (const operation of analysis.providerOperations) if (operation.phase === 'failed' || (operation.phase === 'started' && !['running', 'paused'].includes(run.status))) candidates.push({
    key: `operation-diagnostic:${operation.operationId}`, pattern: operation.phase === 'failed' ? 'provider-operation-failure' : 'unsettled-operation',
    title: operation.phase === 'failed' ? 'Recorded provider operation failure' : 'Ended run retains an unsettled operation record',
    claim: `${operation.provider} / ${operation.task}: ${operation.error?.message ?? 'No terminal operation record was captured.'}`,
    alternatives: 'Provider or recording infrastructure may have failed. Missing terminal capture is not proof of a stalled thought or a psychological failure.',
    followUp: 'Inspect exact operation diagnostics, safe contract locations and source input; distinguish an adapter problem from runtime rejection.', evidenceReferences: [`/events/${operation.eventId}`] });
  if (!['running', 'paused'].includes(run.status)) {
    for (const attempt of analysis.cycleAttempts.filter(item => !item.end)) candidates.push({
      key: `unfinished-cycle:${attempt.cycle.id}`, pattern: 'unfinished-cycle-capture', title: 'Ended run has a cycle start without terminal capture',
      claim: `Cycle ${attempt.cycle.sequence} has an explicit start but no matching completion or infrastructure-error event in the recorded audit.`,
      alternatives: 'Execution may have been interrupted, recording may be incomplete, or work may have continued outside this observation. A start record does not prove a currently live or psychologically stalled process.',
      followUp: 'Inspect the exact start, recorded provider operations and external process state before considering a rerun; distinguish interruption from an ordinary bounded cognitive result.',
      evidenceReferences: [`/events/${attempt.startEventId}`, '/status'] });
    for (const attempt of analysis.stageAttempts.filter(item => !item.end)) candidates.push({
      key: `unfinished-stage:${attempt.stageId}`, pattern: 'unfinished-stage-capture', title: 'Ended run has a stage start without terminal capture',
      claim: `“${attempt.name}” has an explicit stage start but no completion or failure event referencing that start.`,
      alternatives: 'Interrupted delivery, offline work, missing recording or continued external work may explain the gap. A missing stage snapshot is not a failed psychological hypothesis.',
      followUp: 'Inspect stage-scoped operations, exact stage identity and external process status; preserve the original evidence when rerunning.',
      evidenceReferences: [`/events/${attempt.startEventId}`, '/status'] });
  }
  for (const validation of analysis.validations.filter(item => item.status === 'rejected')) candidates.push({ key: `validation:${validation.eventId}`,
    pattern: 'runtime-contract-rejection', title: 'Returned product rejected by a runtime contract',
    claim: `${validation.task} failed ${validation.contract} at ${validation.issues.map(issue => issue.path || '(root)').join(', ')}.`,
    alternatives: 'The adapter returned a product, but schema or candidate coverage was invalid. This is a technical contract failure, not a failed psychological hypothesis.',
    followUp: 'Inspect the input-event reference, violated contract and provider output, then repeat under matching settings.', evidenceReferences: [`/events/${validation.eventId}`] });
  const repeated = new Map<string, { stageIndex: number; thoughtIndex: number }[]>();
  run.stages.forEach((stage, stageIndex) => stage.thoughts.forEach((thought, thoughtIndex) => {
    if (thought.proposal && thought.proposal.type !== 'deliberate' && thought.proposal.type !== 'navigate') {
      const key = JSON.stringify(thought.proposal.action); repeated.set(key, [...(repeated.get(key) ?? []), { stageIndex, thoughtIndex }]);
    }
  }));
  for (const [key, occurrences] of repeated) if (new Set(occurrences.map(item => item.stageIndex)).size > 1 && occurrences.some(item => run.stages[item.stageIndex]!.phase === 'control')) candidates.push({
    key: `repeated-proposal:${createHash('sha256').update(key).digest('hex')}`, pattern: 'repeated-proposal', title: 'Same proposal appears across encounters including a control',
    claim: `An identical authored action appears in ${new Set(occurrences.map(item => item.stageIndex)).size} stages, including a control.`,
    alternatives: 'Repeated requests, unresolved concerns or a legitimate stable strategy may explain repetition. Exact action equality cannot establish obsolescence.',
    followUp: 'Review each current experience and actual enactment; compare a fresh control and a changed-goal probe.',
    evidenceReferences: occurrences.slice(0, 40).map(item => `/stages/${item.stageIndex}/thoughts/${item.thoughtIndex}`) });
  for (const memory of analysis.metrics.memory.entries) for (const evidence of memory.subjectiveUsefulness.filter(item => item.usefulness === 'misleading')) candidates.push({
    key: `retrieval-concern:${memory.id}:${evidence.dispositionId}:${evidence.stageIndex}`, pattern: 'subjective-retrieval-concern', title: 'Development record labels retrieval as misleading',
    claim: `The recorded subjective development evidence for “${memory.gist}” labels this retrieval misleading: ${evidence.reason}`,
    alternatives: 'This is an attributed cognitive interpretation, not an independent judgment of memory accuracy or benefit.',
    followUp: 'Compare later relevant and unrelated probes; preserve competing interpretations and grade retrieval with an explicit researcher criterion.', evidenceReferences: [evidence.reference] });
  const noncontributing = analysis.parts.filter(item => item.originStage >= 0 && run.stages[item.originStage]!.parts.some(part => part.id === item.part.id) && item.contributions.length === 0);
  if (noncontributing.length) candidates.push({ key: 'formation-without-captured-contribution', pattern: 'formation-without-captured-contribution',
    title: 'Newly formed Parts have no captured contribution',
    claim: `${noncontributing.length} distinct Part(s) formed during this run have no recorded thought contribution in its saved stages. Repeated snapshots count once.`,
    alternatives: 'Formation may support recognition or a later concern without advocacy. Computation admission, missing capture or the observation horizon may explain absence; this does not establish unnecessary Part proliferation.',
    followUp: 'Inspect formation, eligibility/admission, retirement and later comparable encounters. Compare matched starting conditions and budgets before judging whether formation was useful.',
    evidenceReferences: noncontributing.slice(0, 40).map(item => `/stages/${item.originStage}/parts/${run.stages[item.originStage]!.parts.findIndex(part => part.id === item.part.id)}`) });
  const unrecalled = analysis.memories.filter(item => item.originStage >= 0 && run.stages[item.originStage]!.memories.some(memory => memory.id === item.memory.id) && !item.retrievals.some(retrieval => retrieval.stageIndex > item.originStage));
  if (unrecalled.length) {
    const censored = unrecalled.filter(item => item.originStage === run.stages.length - 1).length;
    candidates.push({ key: 'new-memory-without-later-recall', pattern: 'new-memory-without-later-recall',
      title: 'New subjective episodes have no later captured recall',
      claim: `${unrecalled.length} distinct new episode(s) have no later-stage recorded recall; ${censored} originated in the final stage and have no later-stage observation opportunity. Same-stage recall is not later retention evidence.`,
      alternatives: 'Later stages may provide no relevant cue, memory may remain useful without recall in this window, or capture may be incomplete. Counts do not establish failed retention, transfer or learning.',
      followUp: 'Inspect exact subjective versions and subsequent experiences; author relevant, novel analogous and unrelated probes with a matched untrained control, preserving the original Agent.',
      evidenceReferences: [...unrecalled.slice(0, 39).map(item => `/stages/${item.originStage}/memories/${run.stages[item.originStage]!.memories.findIndex(memory => memory.id === item.memory.id)}`), '/stages'] });
  }
  return candidates;
}
export function saveSimulationFinding(store: Store, runId: string, body: unknown, origin: SimulationFinding['origin'] = 'researcher'): SimulationFinding {
  const input = SimulationFindingInput.parse(body);
  return store.transaction(() => {
    const run = researchRun(store, runId); terminal(run);
    if (input.status === 'supported' && !input.evidenceReferences.length) throw new Error('Supported findings require evidence citations');
    const prior = simulationResearch(store, runId).findings.filter(item => item.key === input.key).at(-1);
    if ((prior?.version ?? 0) !== input.expectedVersion) throw new ConflictError('Finding changed; reload its history');
    const record: SimulationFinding = { id: id('finding'), kind: 'simulation_finding', agentId: run.agentId, runId,
      version: input.expectedVersion + 1, previousId: prior?.id ?? null, createdAt: now(), key: input.key,
      title: input.title, claim: input.claim, alternatives: input.alternatives, followUp: input.followUp, reviewer: input.reviewer,
      status: input.status, origin, evidenceBasis: run.evidenceBasis,
      citations: [...new Set(input.evidenceReferences)].map(reference => simulationCitation(store, run, reference)) };
    store.saveExperiment(record); return record;
  });
}
export function saveSimulationCandidates(store: Store, runId: string) {
  const run = researchRun(store, runId); terminal(run);
  const existing = new Set(simulationResearch(store, runId).findings.map(item => item.key));
  return store.transaction(() => simulationCandidates(store, run).filter(candidate => !existing.has(candidate.key)).map(candidate =>
    saveSimulationFinding(store, runId, { key: candidate.key, title: candidate.title, claim: candidate.claim,
      alternatives: candidate.alternatives, followUp: candidate.followUp, evidenceReferences: candidate.evidenceReferences,
      reviewer: candidate.pattern === 'model-prediction-alignment' ? 'Recorded model assessment candidate' : 'Mechanical candidate analysis', status: 'unreviewed', expectedVersion: 0 }, candidate.pattern === 'model-prediction-alignment' ? 'model_assessment' : 'mechanical_candidate')));
}
