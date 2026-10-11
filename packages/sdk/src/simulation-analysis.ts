import type { CognitiveEvent, Store } from '../../core/src/contracts.js';
import type { SimulationRun, SimulationStage } from './simulation-tests.js';

export const simulationLanes = ['Environment', 'Activation', 'Parts', 'Cognition', 'Self', 'Executive', 'Learning'] as const;
type Lane = typeof simulationLanes[number];
function lane(type: string): Lane {
  if (type.startsWith('execution.')) return 'Executive';
  if (type.startsWith('self.')) return 'Self';
  if (/prediction\.|memory\.|consolidation\.|disposition\./.test(type)) return 'Learning';
  if (/judgment|activation|scope_budget/.test(type)) return 'Activation';
  if (/construction\.|part\.(?:created|retired|updated)/.test(type)) return 'Parts';
  if (/worldstate|experience/.test(type)) return 'Environment';
  return 'Cognition';
}
type Versioned = { id: string; version: number };
function changes(before: Versioned[], after: Versioned[]) {
  const old = new Map(before.map(item => [item.id, item]));
  return after.flatMap(item => {
    const previous = old.get(item.id);
    return !previous || previous.version !== item.version ? [{ id: item.id, kind: previous ? 'revised' as const : 'added' as const, before: previous ?? null, after: item }] : [];
  });
}
/** Research-only projection: never reads current psychology to reconstruct a historical run. */
export function analyzeSimulation(store: Store, run: SimulationRun) {
  const recorded = store.events(run.agentId);
  const cycleIds = new Set(run.stages.flatMap(stage => stage.cycleId ? [stage.cycleId] : []));
  const events = recorded.filter(event => event.cycleId && cycleIds.has(event.cycleId));
  const stages = run.stages.map((stage, index) => {
    const previous = run.stages[index - 1];
    const trace = events.filter(event => event.cycleId === stage.cycleId);
    return { index, name: stage.name, phase: stage.phase, cycleId: stage.cycleId,
      changes: {
        parts: changes(previous?.parts ?? [], stage.parts),
        predictions: changes(previous?.predictions ?? [], stage.predictions),
        memories: changes(previous?.memories ?? [], stage.memories),
        dispositions: changes(previous?.dispositions ?? [], stage.dispositions),
      },
      trace: trace.map(event => ({ id: event.id, sequence: event.sequence, at: event.at, type: event.type, lane: lane(event.type),
        runId: run.id, stageIndex: index, cycleId: event.cycleId, parentEventId: null,
        provenance: 'recorded audit event' as const, payload: event.payload })),
      traceAvailable: trace.length > 0,
    };
  });
  const latest = new Map(run.stages.flatMap(stage => stage.predictions).map(prediction => [prediction.id, prediction]));
  const predictions = [...latest.values()].map(prediction => {
    const origin = run.stages.findIndex(stage => stage.cycleId === prediction.createdCycle);
    const firstSeen = run.stages.findIndex(stage => stage.predictions.some(item => item.id === prediction.id));
    const versions = run.stages.flatMap((stage, index) => stage.predictions.filter(item => item.id === prediction.id).map(item => ({ stageIndex: index, prediction: item })))
      .filter((entry, index, all) => index === 0 || entry.prediction.version !== all[index - 1]!.prediction.version);
    const checks = run.stages.flatMap((stage, index) => (stage.predictionChecks ?? []).filter(check => check.predictionId === prediction.id).map(check => ({ stageIndex: index, ...check })));
    return { prediction, originStage: origin < 0 ? null : origin, firstSeenStage: firstSeen,
      administrativeStatus: prediction.status, expectationAssessment: prediction.evaluation?.assessment ?? 'unassessed',
      evidenceSufficiency: prediction.evaluation?.assessment === 'confirmed' || prediction.evaluation?.assessment === 'contradicted' ? 'decisive recorded assessment' : 'not established',
      versions, checks, calibration: 'unavailable: conviction is not a calibrated probability' };
  });
  const dispositionIds = [...new Set(run.stages.flatMap(stage => stage.activations.map(item => item.dispositionId)))];
  const activation = dispositionIds.map(dispositionId => ({ dispositionId,
    name: run.stages.flatMap(stage => stage.activations).find(item => item.dispositionId === dispositionId)!.name,
    cells: run.stages.map((stage, index) => ({ stageIndex: index,
      // Retain every evaluation round; a later score must not erase an earlier one.
      rounds: stage.activations.filter(item => item.dispositionId === dispositionId).map(item => ({ ...item,
        threshold: stage.dispositions.find(disposition => disposition.id === dispositionId)?.threshold ?? null })),
      evaluated: stage.activations.some(item => item.dispositionId === dispositionId) })),
  }));
  return { runId: run.id, agentId: run.agentId, status: run.status, evidenceBasis: run.evidenceBasis,
    summary: { completedStages: run.stages.length, totalStages: run.totalSteps,
      controls: run.stages.filter(stage => stage.phase === 'control').length,
      hypothesis: 'Review recorded criteria; execution completion does not establish the hypothesis.',
      changedObjects: stages.reduce((count, stage) => count + Object.values(stage.changes).reduce((sum, entries) => sum + entries.length, 0), 0),
      error: run.error }, stages, activation, predictions,
    gaps: ['Causal parents are unavailable unless explicitly recorded; chronological proximity is not causation.',
      'Memory creation and object-version changes do not establish learning effectiveness or transfer.',
      ...(stages.some(stage => !stage.traceAvailable) ? ['Some stages have no recorded cycle trace (including offline-only stages); snapshots remain available.'] : [])] };
}

export type SimulationAnalysis = ReturnType<typeof analyzeSimulation>;
// These types document the source boundary for clients without exporting mutable runtime state.
export type SimulationAnalysisSource = SimulationStage | CognitiveEvent;
