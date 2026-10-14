import { evaluationPacket, packetIncludesReference, type EvaluationPacket } from './evaluation-packet.js';
import { createHash } from 'node:crypto';
import { predictionAlignmentCriteria } from './simulation-alignment.js';
import { saveSimulationCandidates } from './simulation-research.js';
import type { Application } from './application.js';
import { id, now } from '../../core/src/domain.js';
import { SimulationEvaluationSchema, type SimulationEvaluation } from '../../providers/src/simulation-evaluation.js';
import { renderTaskPrompt, prompts } from '../../providers/src/prompts.js';
import { simulationRubric, type SimulationRubric } from './simulation-rubrics.js';
import { measureSimulation, type SimulationRun, type SimulationStage } from './simulation-tests.js';

export type SimulationAssessment = { id: string; version: number; status: 'running' | 'completed' | 'failed';
  createdAt: string; finishedAt: string | null; model: string; evaluatorAgentId: string;
  evidenceBasis: SimulationRun['evidenceBasis']; rubric: SimulationRubric; prompt: { version: string; template: string; rendered: string };
  evidence: { dream?: SimulationRun['dream']; testId: string; evidenceBasis: SimulationRun['evidenceBasis']; providers: SimulationRun['providers']; stages: SimulationStage[]; supplementalEvidence: string[] };
  packet?: EvaluationPacket; packetHash?: string; batches?: { criterionIds: string[]; packet: EvaluationPacket; rendered: string; status: 'running' | 'completed' | 'blocked' | 'failed'; error: string | null }[];
  evidenceHash: string; measures: SimulationEvaluation['measures']; error: string | null };

function referenceExists(evidence: SimulationAssessment['evidence'], reference: string): boolean {
  if (!/^\/stages\/(0|[1-9]\d*)(?:\/|$)/.test(reference) && !/^\/dream\/(before|after|sourceBefore)(?:\/|$)/.test(reference)) return false;
  let value: unknown = evidence;
  for (const encoded of reference.slice(1).split('/')) {
    if (/~(?![01])/.test(encoded)) return false;
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
    value = (value as Record<string, unknown>)[key];
  }
  return value !== undefined && value !== null;
}

export function semanticSimulationCriteria(run: SimulationRun): number[] {
  const observer = measureSimulation(run.specification, run.stages);
  return run.measures.flatMap((measure, index) => measure.assessmentKind === 'semantic'
    || (measure.assessmentKind === undefined && observer[index]?.assessmentKind === 'semantic') ? [index] : []);
}
export function simulationAssessmentAvailable(run: SimulationRun): boolean {
  return semanticSimulationCriteria(run).length > 0 || predictionAlignmentCriteria(run).length > 0;
}

/** No Store/provider handles are passed to the model. Only an immutable evidence packet. */
export function startSimulationAssessment(app: Application, runId: string, options: { model?: string; evaluatorAgentId?: string } = {}): SimulationRun {
  const stored = app.store.experiments().find(item => item.id === runId && item.kind === 'simulation_test') as SimulationRun | undefined;
  const run = stored ? structuredClone(stored) : undefined;
  if (!run) throw new Error('Unknown simulation run');
  if (run.status !== 'completed') throw new Error('Only completed simulation runs can be assessed');
  if (run.assessments?.some(assessment => assessment.status === 'running')) throw new Error('An assessment is already running');
  const currentObserver = measureSimulation(run.specification, run.stages);
  const indexes = semanticSimulationCriteria(run);
  const alignment = predictionAlignmentCriteria(run);
  if (!indexes.length && !alignment.length) throw new Error('This run has no semantic criteria requiring model assessment');
  const evaluatorAgentId = options.evaluatorAgentId ?? run.sourceAgentId ?? run.agentId;
  app.store.get('agent', evaluatorAgentId);
  const evidence: SimulationAssessment['evidence'] = structuredClone({ ...(run.dream ? { dream: run.dream } : {}), testId: run.testId, evidenceBasis: run.evidenceBasis, providers: run.providers, stages: run.stages, supplementalEvidence: [] });
  // Historical reports predate emitted-speech/selection capture. Read existing audit products by exact cycle;
  // preserve the original stage and clearly record the supplemental evidence's origin.
  const executions = app.store.executions(run.agentId);
  for (const [index, stage] of evidence.stages.entries()) {
    if (!stage.cycleId) continue;
    if (stage.executions === undefined) {
      stage.executions = executions.filter(execution => execution.cycleId === stage.cycleId);
      evidence.supplementalEvidence.push(`/stages/${index}/executions: saved execution records for cycle ${stage.cycleId}`);
    }
    if (stage.selfChoices === undefined) {
      stage.selfChoices = app.store.eventsByType(run.agentId, ['self.choice'], [stage.cycleId]).flatMap(event => event.type === 'self.choice' ? [event.payload] : []);
      evidence.supplementalEvidence.push(`/stages/${index}/selfChoices: saved Self choices for cycle ${stage.cycleId}`);
    }
  }
  const rubric = simulationRubric(run.specification, indexes);
  for (const criterion of rubric.criteria) {
    const index = Number(criterion.criterionId.slice('criterion-'.length)) - 1;
    const missingFirst = currentObserver[0]?.outcome !== 'observed';
    if ((run.testId === 'observatory-learning-trained' || run.testId === 'observatory-learning-fresh-control') && index === 2) {
      criterion.blockedReason = 'The paired fresh/experienced run and repeated trials are not part of this single-run evidence packet; causal comparative benefit remains inconclusive.';
    }
    if (run.testId === 'observatory-learning-trained' || run.testId === 'observatory-learning-fresh-control') {
      const baseline = run.stages[0];
      const forecastIds = new Set(baseline?.predictions.filter(prediction => prediction.createdCycle === baseline.cycleId).map(prediction => prediction.id) ?? []);
      if (index === 0 && (!forecastIds.size || !run.stages.some(stage => stage.predictionChecks?.some(check => forecastIds.has(check.predictionId))))) {
        criterion.blockedReason = 'No assessable baseline forecast with a recorded later factual check supports this prediction-correction criterion.';
      }
      const episodes = new Set(run.stages.filter(stage => stage.phase === 'training' && stage.cycleId)
        .flatMap(stage => stage.memories.filter(memory => memory.createdCycle === stage.cycleId).map(memory => memory.id)));
      const retest = run.stages.find(stage => stage.name === 'Familiar source retest');
      if (index === 1 && (!episodes.size || !retest?.recalls.some(recall => recall.memoryIds.some(memoryId => episodes.has(memoryId))))) {
        criterion.blockedReason = 'No training episode with recorded relevant later recall supports memory-driven learning at the familiar retest.';
      }
    }
    if (run.testId.startsWith('observatory-') && run.testId.includes('context') && index === 0) {
      criterion.blockedReason = 'The matched other-context run is outside this single-run evidence packet; a comparative causal conclusion requires preserved paired evidence.';
    }
    const initialTraining = run.stages.find(stage => stage.phase === 'training' && stage.cycleId);
    if ((run.testId === 'prediction-contradiction' && index === 2 && (missingFirst || currentObserver[1]?.outcome !== 'observed'))
      || (['prospective-calibration', 'missing-perspective'].includes(run.testId) && index === 2 && (missingFirst || currentObserver[1]?.outcome !== 'observed'))
      || (run.testId === 'prospective-anticipation' && index === 2 && missingFirst)
      || (run.testId.startsWith('experiential-') && index === 2 && !initialTraining?.memories.some(memory => memory.createdCycle === initialTraining.cycleId))
      || (run.testId.startsWith('concern-inheritance-') && index >= 2 && (missingFirst || currentObserver[1]?.outcome !== 'observed'))
      || (run.testId.startsWith('scaffold-') && index === 3 && !run.stages.at(-1)?.predictions.some(prediction => prediction.gapOrigin))) {
      criterion.blockedReason = 'Required earlier forecast, investigation or subjective episode is absent; the dependent semantic criterion must remain inconclusive.';
    }
    if (run.testId.startsWith('affect-') && !run.testId.startsWith('affect-relational-') && index >= 1 && !run.stages.some(stage => stage.affectCycles?.some(record => record.usedFocus))) {
      criterion.blockedReason = 'No committed selected affect period supports this dependent exploration criterion; keep it inconclusive.';
    }
    if (['affect-disconfirmation', 'affect-generalization'].includes(run.testId) && index >= 1 && !run.stages.some(stage => stage.predictionChecks?.length)) {
      criterion.blockedReason = 'No recorded prediction outcome check supports the reliability or generalization comparison; keep it inconclusive.';
    }
    if (run.testId === 'subjective-path-forward' && index === 1 && !run.stages.some(stage => stage.predictionChecks?.length)) {
      criterion.blockedReason = 'No recorded prediction outcome check supports the feedback-learning criterion.';
    }
  }
  if (alignment.length) { rubric.version += '-prediction-alignment-v1'; rubric.criteria.push(...alignment);
    rubric.assessmentScope += ' Includes separate candidate prediction/evidence alignment and remembered-expectation fidelity checks; an observed mismatch remains a provisional machine interpretation.'; }
  const template = app.promptSettings(evaluatorAgentId).find(prompt => prompt.task === 'simulation_evaluation')!.effective;
  const packet = evaluationPacket(run, evidence);
  const rendered = renderTaskPrompt(evaluatorAgentId, 'simulation_evaluation', { rubric, evidence: packet }, () => template);
  const assessment: SimulationAssessment = { id: id('assessment'), version: (run.assessments?.length ?? 0) + 1, status: 'running',
    createdAt: now(), finishedAt: null, model: options.model ?? app.agentInferenceSettings(evaluatorAgentId).model,
    evaluatorAgentId, evidenceBasis: run.evidenceBasis, rubric, prompt: { version: prompts.simulation_evaluation.version, template, rendered },
    packet, packetHash: createHash('sha256').update(JSON.stringify(packet)).digest('hex'),
    evidence, evidenceHash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'), measures: [], error: null };
  run.assessments = [...(run.assessments ?? []), assessment]; app.store.saveExperiment(run);
  void evaluate(app, run, assessment);
  return structuredClone(run);
}

async function evaluate(app: Application, run: SimulationRun, assessment: SimulationAssessment): Promise<void> {
  try {
    // Fail explicitly rather than silently truncate evidence or pretend missing evidence is a negative observation.

    const provider = app.simulationEvaluatorProvider(assessment.evaluatorAgentId, assessment.model);
    assessment.model = provider.label; app.store.saveExperiment(run);
    const result: SimulationEvaluation = { measures: [] };
    if (assessment.prompt.rendered.length <= 750_000) {
      result.measures = SimulationEvaluationSchema.parse(await provider.author(SimulationEvaluationSchema, assessment.prompt.rendered, 8192)).measures;
    } else {
      assessment.batches = [];
      for (const criterion of assessment.rubric.criteria) {
        const required = criterion.requiredEvidenceGroups?.flat() ?? [];
        const predictionIds = new Set(required.flatMap(reference => {
          const match = /^\/stages\/(\d+)\/predictions\/(\d+)/.exec(reference);
          const prediction = match ? assessment.evidence.stages[Number(match[1])]?.predictions[Number(match[2])] : undefined;
          return prediction ? [prediction.id] : [];
        }));
        const packet = evaluationPacket(run, assessment.evidence, predictionIds.size ? predictionIds : undefined);
        const rendered = renderTaskPrompt(assessment.evaluatorAgentId, 'simulation_evaluation', { rubric: { ...assessment.rubric, criteria: [criterion] }, evidence: packet }, () => assessment.prompt.template);
        const batch: NonNullable<SimulationAssessment['batches']>[number] = { criterionIds: [criterion.criterionId], packet, rendered, status: 'running', error: null };
        assessment.batches.push(batch); app.store.saveExperiment(run);
        if (rendered.length > 750_000) {
          batch.status = 'blocked'; batch.error = 'Criterion evidence exceeds the request bound; no evidence was truncated or sent';
          result.measures.push({ criterionId: criterion.criterionId, outcome: 'inconclusive', evidenceReferences: [], explanation: batch.error,
            counterevidence: 'This is a packaging limit, not evidence for or against the hypothesis.', limitations: 'No evaluator verdict was obtained for this criterion.' });
          continue;
        }
        try {
          const output = SimulationEvaluationSchema.parse(await provider.author(SimulationEvaluationSchema, rendered, 8192));
          if (output.measures.length !== 1 || output.measures[0]!.criterionId !== criterion.criterionId) throw new Error('Evaluator must assess the requested criterion exactly once');
          if (output.measures[0]!.evidenceReferences.some(reference => !packetIncludesReference(packet, reference))) throw new Error('Evaluator cited evidence absent from this criterion packet');
          result.measures.push(...output.measures); batch.status = 'completed';
        } catch (error) { batch.status = 'failed'; batch.error = error instanceof Error ? error.message : String(error); throw error; }
      }
    }
    const expected = new Set(assessment.rubric.criteria.map(criterion => criterion.criterionId));
    if (result.measures.length !== expected.size || new Set(result.measures.map(measure => measure.criterionId)).size !== expected.size
      || result.measures.some(measure => !expected.has(measure.criterionId))) throw new Error('Evaluator must assess every requested criterion exactly once');
    for (const measure of result.measures) {
      const blocked = assessment.rubric.criteria.find(criterion => criterion.criterionId === measure.criterionId)?.blockedReason;
      if (blocked && measure.outcome !== 'inconclusive') throw new Error('Evaluator issued a decisive verdict despite a missing required prerequisite');
      if (measure.outcome !== 'inconclusive' && !measure.evidenceReferences.length) throw new Error('Decisive evaluator verdicts require evidence citations');
      if (measure.evidenceReferences.some(reference => !referenceExists(assessment.evidence, reference) || (assessment.packet && !packetIncludesReference(assessment.packet, reference)))) throw new Error('Evaluator cited an invalid evidence reference');
      const groups = assessment.rubric.criteria.find(criterion => criterion.criterionId === measure.criterionId)?.requiredEvidenceGroups;
      if (measure.outcome !== 'inconclusive' && groups?.some(group => !group.some(prefix => measure.evidenceReferences.some(reference => reference === prefix || reference.startsWith(prefix + '/'))))) {
        throw new Error('Decisive alignment verdicts require citations to both preserved sides of the comparison');
      }
    }
    assessment.measures = result.measures; assessment.status = 'completed';
  } catch (error) {
    assessment.status = 'failed'; assessment.error = error instanceof Error ? error.message : String(error);
  }
  assessment.finishedAt = now(); app.store.saveExperiment(run);
  if (assessment.status === 'completed') {
    try { saveSimulationCandidates(app.store, run.id); }
    catch (error) { run.researchAnalysisError = error instanceof Error ? error.message : String(error); app.store.saveExperiment(run); }
  }
}
