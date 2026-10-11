import type { Store } from '../../core/src/contracts.js';
/** Frozen researcher evidence; never an input to cognition or Self. */
export function dreamState(store: Store, agentId: string) {
  return { agent: store.get('agent', agentId), identity: store.get('identity', agentId),
    parts: store.list('part', agentId), dispositions: store.list('disposition', agentId), memories: store.list('memory', agentId),
    predictions: store.list('prediction', agentId), cycles: store.cycles(agentId), consolidations: store.consolidations(agentId) };
}
export type DreamState = ReturnType<typeof dreamState>;

/** A verified dead local host cannot continue this experience; preserve its partial evidence. */
export function recoverInterruptedDreams(store: Store, recoverCycle: (id: string, reason: string) => void,
  recoverConsolidation: (agentId: string, id: string, reason: string) => void): void {
  for (const record of store.experiments()) {
    const run = structuredClone(record) as unknown as import('./simulation-tests.js').SimulationRun;
    if (run.kind !== 'simulation_test' || run.status !== 'running' || !run.dream?.hostPid || run.dream.hostPid === process.pid) continue;
    try { process.kill(run.dream.hostPid, 0); continue; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue; }
    const reason = 'Dream host process ended; no experiences or tools were replayed';
    for (const cycle of store.cycles(run.agentId).filter(cycle => cycle.status === 'running' && cycle.threadId === run.id)) recoverCycle(cycle.id, reason);
    const prior = new Set(run.dream.before.consolidations.map(cycle => cycle.id));
    for (const cycle of store.consolidations(run.agentId).filter(cycle => cycle.status === 'running' && !prior.has(cycle.id))) recoverConsolidation(run.agentId, cycle.id, reason);
    run.dream.after = structuredClone(dreamState(store, run.agentId)); run.status = 'failed'; run.error = reason;
    run.currentStep = 'Interrupted host'; run.finishedAt = new Date().toISOString(); store.saveExperiment(run);
  }
}
