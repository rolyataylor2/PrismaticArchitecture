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
type Citation = { reference: string; runId: string; evidenceBasis: SimulationRun['evidenceBasis']; runStatus: SimulationRun['status']; value: unknown; hash: string };
type RecordBase = { id: string; agentId: string; runId: string; version: number; previousId: string | null; createdAt: string; citations: Citation[]; evidenceBasis: SimulationRun['evidenceBasis'] };
export type SimulationReview = RecordBase & Omit<z.infer<typeof SimulationReviewInput>, 'expectedVersion' | 'evidenceReferences'> & { kind: 'simulation_review' };
export type SimulationFinding = RecordBase & Omit<z.infer<typeof SimulationFindingInput>, 'expectedVersion' | 'evidenceReferences'> & { kind: 'simulation_finding'; origin: 'mechanical_candidate' | 'researcher' };

export function researchRun(store: Store, runId: string): SimulationRun {
  const run = store.experiments().find(item => item.kind === 'simulation_test' && item.id === runId) as SimulationRun | undefined;
  if (!run) throw new Error('Unknown simulation run');
  return run;
}
export function simulationResearch(store: Store, runId: string) {
  researchRun(store, runId);
  const records = store.experiments().filter(item => item.runId === runId);
  return { reviews: records.filter(item => item.kind === 'simulation_review') as SimulationReview[],
    findings: records.filter(item => item.kind === 'simulation_finding') as SimulationFinding[] };
}
/** Only saved run/stage records and events of this run are valid privileged evidence. */
function cite(store: Store, run: SimulationRun, reference: string): Citation {
  let root: unknown = run;
  let keys = reference.slice(1).split('/');
  if (!reference.startsWith('/') || keys.some(key => /~(?![01])/.test(key))) throw new Error('Invalid evidence reference');
  keys = keys.map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (keys[0] === 'runs') {
    const compared = researchRun(store, keys[1] ?? '');
    const citation = cite(store, compared, '/' + keys.slice(2).map(key => key.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'));
    return { ...citation, reference };
  }
  if (keys[0] === 'events') {
    const eventId = keys[1];
    const cycleIds = new Set(run.stages.flatMap(stage => stage.cycleId ? [stage.cycleId] : []));
    for (const cycle of store.cycles(run.agentId)) if (cycle.threadId === run.id && cycle.startedAt >= run.createdAt && (!run.finishedAt || cycle.startedAt <= run.finishedAt)) cycleIds.add(cycle.id);
    root = store.events(run.agentId).find(event => event.id === eventId && event.cycleId && cycleIds.has(event.cycleId));
    keys = keys.slice(2);
  } else if (!['stages', 'measures', 'specification', 'assessments', 'executiveEvidence', 'startingConfiguration', 'error'].includes(keys[0] ?? '')) throw new Error('Reference is outside the preserved research evidence');
  let value = root;
  for (const key of keys) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('Evidence reference does not exist in this run');
    value = (value as Record<string, unknown>)[key];
  }
  if (value === undefined || value === null) throw new Error('Evidence reference is empty or unavailable');
  return { reference, runId: run.id, evidenceBasis: run.evidenceBasis, runStatus: run.status,
    value: structuredClone(value), hash: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}
function terminal(run: SimulationRun) { if (run.status === 'running') throw new Error('Finish the run before saving researcher judgments'); }
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
      citations: [...new Set(input.evidenceReferences)].map(reference => cite(store, run, reference)) };
    store.saveExperiment(record); return record;
  });
}
export type SimulationCandidate = { key: string; title: string; claim: string; alternatives: string; followUp: string; evidenceReferences: string[]; pattern: string };
/** Transparent checks suggest inspections, not psychological truth. No Agent or model calls. */
export function simulationCandidates(store: Store, run: SimulationRun): SimulationCandidate[] {
  const analysis = analyzeSimulation(store, run);
  const candidates: SimulationCandidate[] = [];
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
      citations: [...new Set(input.evidenceReferences)].map(reference => cite(store, run, reference)) };
    store.saveExperiment(record); return record;
  });
}
export function saveSimulationCandidates(store: Store, runId: string) {
  const run = researchRun(store, runId); terminal(run);
  const existing = new Set(simulationResearch(store, runId).findings.map(item => item.key));
  return store.transaction(() => simulationCandidates(store, run).filter(candidate => !existing.has(candidate.key)).map(candidate =>
    saveSimulationFinding(store, runId, { key: candidate.key, title: candidate.title, claim: candidate.claim,
      alternatives: candidate.alternatives, followUp: candidate.followUp, evidenceReferences: candidate.evidenceReferences,
      reviewer: 'Mechanical candidate analysis', status: 'unreviewed', expectedVersion: 0 }, 'mechanical_candidate')));
}
