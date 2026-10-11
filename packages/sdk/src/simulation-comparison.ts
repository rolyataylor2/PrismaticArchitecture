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
    mode: run.mode, evidenceBasis: run.evidenceBasis,
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
export function compareSimulations(left: SimulationRun, right: SimulationRun) {
  const leftConfig = simulationConfiguration(left); const rightConfig = simulationConfiguration(right);
  const configurationDifferences = Object.keys(leftConfig).filter(key => JSON.stringify(leftConfig[key as keyof typeof leftConfig]) !== JSON.stringify(rightConfig[key as keyof typeof rightConfig]));
  const ls = stageKeys(left); const rs = stageKeys(right);
  const stages = [...new Set([...ls, ...rs].map(item => item.key))].map(key => {
    const l = ls.find(item => item.key === key); const r = rs.find(item => item.key === key);
    return compareStagePair(l, r);
  });
  return { leftRunId: left.id, rightRunId: right.id, leftConfiguration: leftConfig, rightConfiguration: rightConfig,
    configurationDifferences, stages,
    limitations: ['One run per side cannot establish provider superiority or a causal learning effect.',
      'Stage names, phases and occurrence align exactly; missing or renamed stages remain unmatched.',
      'Scope roles match exact concern/scope/cues, with ambiguous duplicates left unmatched; generated IDs never establish equivalence.',
      ...(configurationDifferences.length ? ['Configuration differences are confounds; inspect them before interpreting behavior differences.'] : []),
      ...(!left.startingConfiguration || !right.startingConfiguration ? ['Historical starting configuration is missing; matches cannot establish controlled conditions and these runs are not grouped into repeated configurations.'] : []),
      ...(left.evidenceBasis !== 'configured_models' || right.evidenceBasis !== 'configured_models' ? ['Fixture/mixed-provider comparisons establish workflow behavior only.'] : [])] };
}
export function compareSimulationStages(left: SimulationRun, right: SimulationRun, leftIndex: number, rightIndex: number) {
  const leftStage = left.stages[leftIndex]; const rightStage = right.stages[rightIndex];
  if (!leftStage || !rightStage) throw new Error('Unknown baseline or follow-up stage');
  const report = compareSimulations(left, right);
  const pair = compareStagePair({ index: leftIndex, stage: leftStage }, { index: rightIndex, stage: rightStage });
  return { ...report, stages: [{ ...pair, name: `${leftStage.name} → ${rightStage.name}` }],
    limitations: [...report.limitations.filter(item => !item.startsWith('Stage names')),
      'Baseline and follow-up stages are explicitly researcher-selected; different experiences and same-thread carryover are confounds.',
      'Recorded recall, memory revisions and behavioral differences support inspection; no causal improvement, transfer or durability verdict is inferred.'] };
}
export type SimulationComparison = ReturnType<typeof compareSimulations>;

export function aggregateSimulations(runs: SimulationRun[]) {
  const groups = new Map<string, SimulationRun[]>();
  for (const run of runs) { const key = hash({ configuration: simulationConfiguration(run), missingHistoricalConfiguration: run.startingConfiguration ? null : run.id }); groups.set(key, [...(groups.get(key) ?? []), run]); }
  return [...groups.entries()].map(([configurationId, trials]) => {
    const completed = trials.filter(run => run.status === 'completed');
    const values = completed.map(run => run.stages.reduce((count, stage) => count + stageMeasures(stage).activeScopes, 0));
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return { configurationId, testId: trials[0]!.testId, configuration: simulationConfiguration(trials[0]!),
      trials: trials.length, completed: completed.length, failed: trials.filter(run => run.status === 'failed').length,
      runIds: trials.map(run => run.id), activeScopeEvaluations: { n: values.length, mean,
        min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
        sampleStandardDeviation: values.length > 1 && mean !== null ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null },
      criterionOutcomes: trials[0]!.specification.criteria.map((criterion, index) => ({ criterion,
        observed: completed.filter(run => run.measures[index]?.outcome === 'observed').length,
        notObserved: completed.filter(run => run.measures[index]?.outcome === 'not_observed').length,
        inconclusive: completed.filter(run => run.measures[index]?.outcome === 'inconclusive').length,
        missing: completed.filter(run => !run.measures[index]).length,
        assessmentKind: completed[0]?.measures[index]?.assessmentKind ?? 'unavailable' })),
      limitations: 'Descriptive trial variation, not activation quality or a learning score. Only completed trials enter these counts; failures remain visible.' };
  });
}
