import type { SimulationRun, SimulationStage } from '../../../packages/sdk/src/simulation-tests.js';

export type Verdict = 'observed' | 'not_observed' | 'inconclusive' | 'missing';
export const verdicts: Verdict[] = ['observed', 'not_observed', 'inconclusive', 'missing'];
export function stageMetrics(stage: SimulationStage) {
  const final = [...new Map(stage.activations.map(item => [item.dispositionId, item])).values()];
  return { active: final.filter(item => item.active).length, scored: final.length,
    contributors: new Set(stage.thoughts.map(item => item.partId)).size,
    proposals: stage.thoughts.filter(item => item.proposal !== null).length,
    recalls: new Set(stage.recalls.flatMap(item => item.memoryIds)).size,
    memories: new Set(stage.memories.map(item => item.id)).size,
    predictions: new Set(stage.predictions.map(item => item.id)).size,
    choices: stage.selfChoices === undefined ? null : stage.selfChoices.length,
    executions: stage.executions === undefined ? null : stage.executions.length,
    verified: stage.executions === undefined ? null : stage.executions.filter(item => item.operational?.verified === true).length };
}
export type Metric = keyof ReturnType<typeof stageMetrics>;
export function criterionRecurrence(runs: SimulationRun[]) {
  const completed = runs.filter(run => run.status === 'completed');
  const names = [...new Set(completed.flatMap(run => run.measures.map(item => item.criterion)))];
  return names.map(criterion => {
    const counts: Record<Verdict, number> = { observed: 0, not_observed: 0, inconclusive: 0, missing: 0 };
    for (const run of completed) {
      const measure = run.measures.find(item => item.criterion === criterion);
      counts[!measure ? 'missing' : measure.assessmentKind === 'semantic' ? 'inconclusive' : measure.outcome]++;
    }
    const measured = completed.length - counts.missing;
    return { criterion, counts, n: completed.length, measured,
      pattern: measured === 0 ? 'Unavailable' : counts.observed === measured ? 'Consistently observed'
        : counts.not_observed === measured ? 'Consistently not observed' : counts.inconclusive === measured ? 'Unresolved' : 'Varies across trials' };
  });
}
/** Phase, exact stage name and occurrence align repeats; absent records are never zeros. */
export function trajectories(runs: SimulationRun[], metric: Metric) {
  const keys = new Map<string, { name: string; phase: string; values: { runId: string; stage: number; value: number }[] }>();
  for (const run of runs) {
    const occurrences = new Map<string, number>();
    run.stages.forEach((stage, index) => {
      const base = `${stage.phase}\n${stage.name}`; const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
      const key = `${base}\n${occurrence}`; const item = keys.get(key) ?? { name: stage.name, phase: stage.phase, values: [] };
      const value = stageMetrics(stage)[metric];
      if (value !== null) item.values.push({ runId: run.id, stage: index, value }); keys.set(key, item);
    });
  }
  return [...keys.values()].map(item => ({ ...item, n: item.values.length,
    mean: item.values.length ? item.values.reduce((sum, entry) => sum + entry.value, 0) / item.values.length : null,
    min: item.values.length ? Math.min(...item.values.map(entry => entry.value)) : null,
    max: item.values.length ? Math.max(...item.values.map(entry => entry.value)) : null }));
}
