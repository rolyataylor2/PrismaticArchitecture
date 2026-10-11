import { researchMetricCatalog } from './simulation-metrics.js';
import type { SimulationMetricReview, SimulationCandidate } from './simulation-research.js';
import { createHash } from 'node:crypto';
import type { SimulationRun, SimulationStage } from './simulation-tests.js';
import type { Disposition } from '../../core/src/domain.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Exact documented semantic roles, never cross-run generated IDs or fuzzy causal guesses. */
function role(disposition: Disposition) {
  return JSON.stringify({ concern: disposition.concern, scope: disposition.scope, cues: [...disposition.cues].sort() });
}
export function simulationConfiguration(run: SimulationRun) {
  const start = run.startingConfiguration;
  return { scenarioHash: hash(run.specification), startingConditionsHash: hash(run.specification.seeds),
    promptHash: hash(run.prompts.slice().sort((a, b) => a.task.localeCompare(b.task))), providers: run.providers,
    mode: run.mode, evidenceBasis: run.evidenceBasis, providerRouting: run.providerRouting ?? null,
    activationSettingsHash: start ? hash(start.activationSettings) : null, runtimeHash: start ? hash(start.runtime) : null,
    identityHash: start ? hash({ traits: start.identity.traits.map(({ question, answer, keywords, role }) => ({ question, answer, keywords, role })), mask: start.identity.mask }) : null,
    executiveProfileHash: start ? hash({ ...start.executiveProfile, revision: undefined }) : null,
    startingConfigurationAvailable: !!start };
}
export function stageMeasures(stage: SimulationStage) {
  const final = new Map(stage.activations.map(item => [item.dispositionId, item]));
  const executions = stage.executions ?? [];
  return { scoredScopes: final.size, activeScopes: [...final.values()].filter(item => item.active).length,
    contributors: new Set(stage.thoughts.map(item => item.partId)).size,
    proposals: stage.thoughts.filter(item => item.proposal).length,
    recalledMemories: new Set(stage.recalls.flatMap(item => item.memoryIds)).size,
    selectedChoices: stage.selfChoices?.length ?? null,
    recordedExecutions: stage.executions === undefined ? null : executions.length,
    verifiedOperations: stage.executions === undefined ? null : executions.filter(item => item.operational?.verified === true).length,
    predictions: new Set(stage.predictions.map(item => item.id)).size,
    memories: new Set(stage.memories.map(item => item.id)).size };
}
function stageKeys(run: SimulationRun) {
  const occurrences = new Map<string, number>();
  return run.stages.map((stage, index) => {
    const base = `${stage.phase}\n${stage.name}`; const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
    return { key: `${base}\n${occurrence}`, index, stage };
  });
}
type IndexedStage = { index: number; stage: SimulationStage };
function compareStagePair(l: IndexedStage | undefined, r: IndexedStage | undefined) {
    const roles = new Set([...(l?.stage.dispositions ?? []), ...(r?.stage.dispositions ?? [])].map(role));
    const activation = [...roles].map(semanticRole => {
      const ld = l?.stage.dispositions.filter(item => role(item) === semanticRole) ?? [];
      const rd = r?.stage.dispositions.filter(item => role(item) === semanticRole) ?? [];
      const unique = ld.length === 1 && rd.length === 1;
      const last = (stage: SimulationStage | undefined, disposition: Disposition | undefined) =>
        stage?.activations.filter(item => item.dispositionId === disposition?.id).at(-1) ?? null;
      return { semanticRole, name: ld[0]?.name ?? rd[0]?.name ?? 'Unmatched scope',
        match: unique ? 'exact semantic role' : ld.length > 1 || rd.length > 1 ? 'ambiguous' : 'unmatched',
        left: unique ? last(l?.stage, ld[0]) : null, right: unique ? last(r?.stage, rd[0]) : null,
        leftIds: ld.map(item => item.id), rightIds: rd.map(item => item.id) };
    });
    return { name: l?.stage.name ?? r!.stage.name, phase: l?.stage.phase ?? r!.stage.phase,
      leftIndex: l?.index ?? null, rightIndex: r?.index ?? null, matched: !!l && !!r,
      left: l ? { measures: stageMeasures(l.stage), thoughts: l.stage.thoughts, choices: l.stage.selfChoices ?? [], predictions: l.stage.predictions,
        memories: l.stage.memories, dispositions: l.stage.dispositions, executions: l.stage.executions ?? [] } : null,
      right: r ? { measures: stageMeasures(r.stage), thoughts: r.stage.thoughts, choices: r.stage.selfChoices ?? [], predictions: r.stage.predictions,
        memories: r.stage.memories, dispositions: r.stage.dispositions, executions: r.stage.executions ?? [] } : null, activation };
}
function compareDimensionReviews(left: SimulationRun, right: SimulationRun, reviews: SimulationMetricReview[], leftStage: number | null, rightStage: number | null) {
  return researchMetricCatalog.map(metric => {
    const select = (run: SimulationRun, stageIndex: number | null) => reviews.filter(item => item.runId === run.id && item.metricId === metric.id && (item.stageIndex ?? null) === stageIndex)
      .sort((a, b) => a.version - b.version).at(-1) ?? null;
    const l = select(left, leftStage); const r = select(right, rightStage);
    const comparable = !!l && !!r && l.operationalization === r.operationalization && l.unit === r.unit && l.value !== null && r.value !== null;
    return { metricId: metric.id, title: metric.title, left: l, right: r, leftStage, rightStage,
      difference: comparable ? r!.value! - l!.value! : null, unit: comparable ? l!.unit : null,
      limitation: !l || !r ? 'Scope-matched independent review is missing on at least one side.' : !comparable ? 'Methods, units or available numeric values differ; no numeric difference is computed.'
        : 'Follow-up minus baseline is descriptive, with no automatic improvement/regression or causal judgment.' };
  });
}
export function compareSimulations(left: SimulationRun, right: SimulationRun, reviews: SimulationMetricReview[] = []) {
  const leftConfig = simulationConfiguration(left); const rightConfig = simulationConfiguration(right);
  const configurationDifferences = Object.keys(leftConfig).filter(key => JSON.stringify(leftConfig[key as keyof typeof leftConfig]) !== JSON.stringify(rightConfig[key as keyof typeof rightConfig]));
  const ls = stageKeys(left); const rs = stageKeys(right);
  const stages = [...new Set([...ls, ...rs].map(item => item.key))].map(key => {
    const l = ls.find(item => item.key === key); const r = rs.find(item => item.key === key);
    return compareStagePair(l, r);
  });
  return { leftRunId: left.id, rightRunId: right.id, leftConfiguration: leftConfig, rightConfiguration: rightConfig,
    configurationDifferences, stages, dimensionReviews: compareDimensionReviews(left, right, reviews, null, null),
    limitations: ['One run per side cannot establish provider superiority or a causal learning effect.',
      'Stage names, phases and occurrence align exactly; missing or renamed stages remain unmatched.',
      'Scope roles match exact concern/scope/cues, with ambiguous duplicates left unmatched; generated IDs never establish equivalence.',
      ...(configurationDifferences.length ? ['Configuration differences are confounds; inspect them before interpreting behavior differences.'] : []),
      ...(!left.startingConfiguration || !right.startingConfiguration ? ['Historical starting configuration is missing; matches cannot establish controlled conditions and these runs are not grouped into repeated configurations.'] : []),
      ...(left.evidenceBasis !== 'configured_models' || right.evidenceBasis !== 'configured_models' ? ['Fixture/mixed-provider comparisons establish workflow behavior only.'] : [])] };
}
export function compareSimulationStages(left: SimulationRun, right: SimulationRun, leftIndex: number, rightIndex: number, reviews: SimulationMetricReview[] = []) {
  const leftStage = left.stages[leftIndex]; const rightStage = right.stages[rightIndex];
  if (!leftStage || !rightStage) throw new Error('Unknown baseline or follow-up stage');
  const report = compareSimulations(left, right, reviews);
  const pair = compareStagePair({ index: leftIndex, stage: leftStage }, { index: rightIndex, stage: rightStage });
  return { ...report, dimensionReviews: compareDimensionReviews(left, right, reviews, leftIndex, rightIndex), stages: [{ ...pair, name: `${leftStage.name} → ${rightStage.name}` }],
    limitations: [...report.limitations.filter(item => !item.startsWith('Stage names')),
      'Baseline and follow-up stages are explicitly researcher-selected; different experiences and same-thread carryover are confounds.',
      'Recorded recall, memory revisions and behavioral differences support inspection; no causal improvement, transfer or durability verdict is inferred.'] };
}
export type SimulationComparison = ReturnType<typeof compareSimulations>;

export function aggregateSimulations(runs: SimulationRun[], reviews: SimulationMetricReview[] = [], candidateSets: { runId: string; candidates: SimulationCandidate[] }[] = []) {
  const groups = new Map<string, SimulationRun[]>();
  for (const run of runs) { const key = hash({ configuration: simulationConfiguration(run), missingHistoricalConfiguration: run.startingConfiguration ? null : run.id }); groups.set(key, [...(groups.get(key) ?? []), run]); }
  return [...groups.entries()].map(([configurationId, trials]) => {
    const completed = trials.filter(run => run.status === 'completed');
    const values = completed.map(run => run.stages.reduce((count, stage) => count + stageMeasures(stage).activeScopes, 0));
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return { configurationId, testId: trials[0]!.testId, configuration: simulationConfiguration(trials[0]!),
      trials: trials.length, completed: completed.length, failed: trials.filter(run => run.status === 'failed').length,
      runIds: trials.map(run => run.id), candidatePatterns: (() => {
        const observed = new Map(candidateSets.map(item => [item.runId, item.candidates]));
        const patterns = [...new Set(candidateSets.filter(item => runs.some(run => run.id === item.runId && run.status !== 'running')).flatMap(item => item.candidates.map(candidate => candidate.pattern)))].sort();
        const analyzed = trials.filter(run => run.status !== 'running' && observed.has(run.id));
        return { analyzed: analyzed.length, missingAnalysis: trials.filter(run => run.status !== 'running' && !observed.has(run.id)).length,
          runningExcluded: trials.filter(run => run.status === 'running').length,
          patterns: patterns.map(pattern => {
            const cohort = (status: 'completed' | 'failed') => {
              const eligible = analyzed.filter(run => run.status === status);
              const affected = eligible.filter(run => observed.get(run.id)!.some(candidate => candidate.pattern === pattern));
              return { n: eligible.length, affected: affected.length, rate: eligible.length ? affected.length / eligible.length : null,
                runIds: affected.map(run => run.id), candidates: affected.flatMap(run => observed.get(run.id)!.filter(candidate => candidate.pattern === pattern).map(candidate => ({ runId: run.id, ...candidate }))) };
            };
            return { pattern, completed: cohort('completed'), failed: cohort('failed') };
          }), limitation: 'Runs with recorded candidate analysis, not independent findings or confirmed regressions. Failed cohorts, missing analysis and live runs stay separate. Configuration/scenario differences are confounds; engine source revision is not recorded in historical configurations. Review exact evidence and matched repeated controls.' };
      })(), activeScopeEvaluations: { n: values.length, mean,
        min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
        sampleStandardDeviation: values.length > 1 && mean !== null ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null },
      dimensionReviews: researchMetricCatalog.map(metric => {
        const latest = completed.flatMap(run => {
          const review = reviews.filter(item => item.runId === run.id && item.metricId === metric.id && (item.stageIndex ?? null) === null).sort((a, b) => a.version - b.version).at(-1);
          return review ? [review] : [];
        });
        const methods = [...new Set(latest.map(item => JSON.stringify({ method: item.operationalization, unit: item.unit })))];
        return { metricId: metric.id, title: metric.title, reviewed: latest.length, unreviewed: completed.length - latest.length,
          supported: latest.filter(item => item.verdict === 'supported').length, notSupported: latest.filter(item => item.verdict === 'not_supported').length,
          inconclusive: latest.filter(item => item.verdict === 'inconclusive').length,
          methodGroups: methods.map(key => {
            const matched = latest.filter(item => JSON.stringify({ method: item.operationalization, unit: item.unit }) === key);
            const measured = matched.flatMap(item => item.value === null ? [] : [item.value]);
            const mean = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
            return { operationalization: matched[0]!.operationalization, unit: matched[0]!.unit, n: measured.length, mean,
              min: measured.length ? Math.min(...measured) : null, max: measured.length ? Math.max(...measured) : null,
              sampleStandardDeviation: measured.length > 1 && mean !== null ? Math.sqrt(measured.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (measured.length - 1)) : null,
              reviewIds: matched.map(item => item.id), runIds: matched.map(item => item.runId) };
          }), limitation: 'External researcher measurements; methods/units remain separate and numeric differences do not establish causal effects.' };
      }),
      criterionOutcomes: trials[0]!.specification.criteria.map((criterion, index) => ({ criterion,
        observed: completed.filter(run => run.measures[index]?.outcome === 'observed').length,
        notObserved: completed.filter(run => run.measures[index]?.outcome === 'not_observed').length,
        inconclusive: completed.filter(run => run.measures[index]?.outcome === 'inconclusive').length,
        missing: completed.filter(run => !run.measures[index]).length,
        assessmentKind: completed[0]?.measures[index]?.assessmentKind ?? 'unavailable' })),
      limitations: 'Descriptive trial variation, not activation quality or a learning score. Only completed trials enter these counts; failures remain visible.' };
  });
}
