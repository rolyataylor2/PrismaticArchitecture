import { createHash } from 'node:crypto';
import type { Application } from './application.js';
import { id, now } from '../../core/src/domain.js';
import { SimulationEvaluationSchema, type SimulationEvaluation } from '../../providers/src/simulation-evaluation.js';
import { renderTaskPrompt, prompts } from '../../providers/src/prompts.js';
import { simulationRubric, type SimulationRubric } from './simulation-rubrics.js';
import { measureSimulation, type SimulationRun, type SimulationStage } from './simulation-tests.js';

export type SimulationAssessment = { id: string; version: number; status: 'running' | 'completed' | 'failed';
  createdAt: string; finishedAt: string | null; model: string; evaluatorAgentId: string;
  evidenceBasis: SimulationRun['evidenceBasis']; rubric: SimulationRubric; prompt: { version: string; template: string; rendered: string };
  evidence: { testId: string; evidenceBasis: SimulationRun['evidenceBasis']; providers: SimulationRun['providers']; stages: SimulationStage[]; supplementalEvidence: string[] };
  evidenceHash: string; measures: SimulationEvaluation['measures']; error: string | null };

function referenceExists(evidence: SimulationAssessment['evidence'], reference: string): boolean {
  if (!/^\/stages\/(0|[1-9]\d*)(?:\/|$)/.test(reference)) return false;
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

/** No Store/provider handles are passed to the model. Only an immutable evidence packet. */
export function startSimulationAssessment(app: Application, runId: string, options: { model?: string; evaluatorAgentId?: string } = {}): SimulationRun {
  const stored = app.store.experiments().find(item => item.id === runId && item.kind === 'simulation_test') as SimulationRun | undefined;
  const run = stored ? structuredClone(stored) : undefined;
  if (!run) throw new Error('Unknown simulation run');
  if (run.status !== 'completed') throw new Error('Only completed simulation runs can be assessed');
  if (run.assessments?.some(assessment => assessment.status === 'running')) throw new Error('An assessment is already running');
  const currentObserver = measureSimulation(run.specification, run.stages);
  const indexes = semanticSimulationCriteria(run);
  if (!indexes.length) throw new Error('This run has no semantic criteria requiring model assessment');
  const evaluatorAgentId = options.evaluatorAgentId ?? run.sourceAgentId ?? run.agentId;
  app.store.get('agent', evaluatorAgentId);
  const evidence: SimulationAssessment['evidence'] = structuredClone({ testId: run.testId, evidenceBasis: run.evidenceBasis, providers: run.providers, stages: run.stages, supplementalEvidence: [] });
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
    const initialTraining = run.stages.find(stage => stage.phase === 'training' && stage.cycleId);
    if ((run.testId === 'prediction-contradiction' && index === 2 && (missingFirst || currentObserver[1]?.outcome !== 'observed'))
      || (['prospective-calibration', 'missing-perspective'].includes(run.testId) && index === 2 && (missingFirst || currentObserver[1]?.outcome !== 'observed'))
      || (run.testId === 'prospective-anticipation' && index === 2 && missingFirst)
      || (run.testId.startsWith('experiential-') && index === 2 && !initialTraining?.memories.some(memory => memory.createdCycle === initialTraining.cycleId))
      || (run.testId.startsWith('scaffold-') && index === 3 && !run.stages.at(-1)?.predictions.some(prediction => prediction.gapOrigin))) {
      criterion.blockedReason = 'Required earlier forecast, investigation or subjective episode is absent; the dependent semantic criterion must remain inconclusive.';
    }
    if (run.testId === 'subjective-path-forward' && index === 1 && !run.stages.some(stage => stage.predictionChecks?.length)) {
      criterion.blockedReason = 'No recorded prediction outcome check supports the feedback-learning criterion.';
    }
  }
  const template = app.promptSettings(evaluatorAgentId).find(prompt => prompt.task === 'simulation_evaluation')!.effective;
  const rendered = renderTaskPrompt(evaluatorAgentId, 'simulation_evaluation', { rubric, evidence }, () => template);
  const assessment: SimulationAssessment = { id: id('assessment'), version: (run.assessments?.length ?? 0) + 1, status: 'running',
    createdAt: now(), finishedAt: null, model: options.model ?? app.agentInferenceSettings(evaluatorAgentId).model,
    evaluatorAgentId, evidenceBasis: run.evidenceBasis, rubric, prompt: { version: prompts.simulation_evaluation.version, template, rendered },
    evidence, evidenceHash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'), measures: [], error: null };
  run.assessments = [...(run.assessments ?? []), assessment]; app.store.saveExperiment(run);
  void evaluate(app, run, assessment);
  return structuredClone(run);
}

async function evaluate(app: Application, run: SimulationRun, assessment: SimulationAssessment): Promise<void> {
  try {
    // Fail explicitly rather than silently truncate evidence or pretend missing evidence is a negative observation.
    if (assessment.prompt.rendered.length > 750_000) throw new Error('Evaluator evidence exceeds the request bound; no evidence was truncated');
    const provider = app.simulationEvaluatorProvider(assessment.evaluatorAgentId, assessment.model);
    assessment.model = provider.label; app.store.saveExperiment(run);
    const result = SimulationEvaluationSchema.parse(await provider.author(SimulationEvaluationSchema, assessment.prompt.rendered, 8192));
    const expected = new Set(assessment.rubric.criteria.map(criterion => criterion.criterionId));
    if (result.measures.length !== expected.size || new Set(result.measures.map(measure => measure.criterionId)).size !== expected.size
      || result.measures.some(measure => !expected.has(measure.criterionId))) throw new Error('Evaluator must assess every requested criterion exactly once');
    for (const measure of result.measures) {
      const blocked = assessment.rubric.criteria.find(criterion => criterion.criterionId === measure.criterionId)?.blockedReason;
      if (blocked && measure.outcome !== 'inconclusive') throw new Error('Evaluator issued a decisive verdict despite a missing required prerequisite');
      if (measure.outcome !== 'inconclusive' && !measure.evidenceReferences.length) throw new Error('Decisive evaluator verdicts require evidence citations');
      if (measure.evidenceReferences.some(reference => !referenceExists(assessment.evidence, reference))) throw new Error('Evaluator cited an invalid evidence reference');
    }
    assessment.measures = result.measures; assessment.status = 'completed';
  } catch (error) {
    assessment.status = 'failed'; assessment.error = error instanceof Error ? error.message : String(error);
  }
  assessment.finishedAt = now(); app.store.saveExperiment(run);
}
