type StageSources = { cycleId: string | null; concurrentCycleIds?: string[] };
/** Explicit recorded ownership only; additional sources may be observations or internal attention snapshots. */
export function simulationSourceCycles(stage: StageSources): string[] {
  return [...new Set([...(stage.cycleId ? [stage.cycleId] : []), ...(stage.concurrentCycleIds ?? [])])];
}
export function stageOwnsCycle(stage: StageSources, cycleId: string | null | undefined): boolean {
  return Boolean(cycleId && simulationSourceCycles(stage).includes(cycleId));
}
