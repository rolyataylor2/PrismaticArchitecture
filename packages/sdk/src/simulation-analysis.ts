import { simulationMetrics } from './simulation-metrics.js';
import { simulationEventFocus } from './simulation-event-focus.js';
import { simulationEventScope } from './simulation-event-scope.js';
import { simulationKnowledge } from './simulation-knowledge.js';
import type { CognitiveEvent, Store } from '../../core/src/contracts.js';
import type { SimulationRun, SimulationStage } from './simulation-tests.js';
import { simulationLineage } from './simulation-lineage.js';
import { stageMeasures } from './simulation-comparison.js';

export const simulationLanes = ['Environment', 'Activation', 'Parts', 'Cognition', 'Self', 'Executive', 'Learning'] as const;
type Lane = typeof simulationLanes[number];
function lane(type: string, payload?: unknown): Lane {
  if (type.startsWith('simulation.stage_')) return 'Environment';
  if (type === 'provider.operation' || type === 'provider.usage' || type === 'runtime.validation') {
    const task = (payload as { task?: string } | undefined)?.task ?? '';
    if (/activation|hypothesis_outcome|prediction_outcome/.test(task)) return /activation/.test(task) ? 'Activation' : 'Learning';
    if (/arbitration|affect_selection|affect_inquiry|deliberation/.test(task)) return 'Self';
    if (/speech|executive/.test(task)) return 'Executive';
    if (/consolidation|reconsolidation|disposition_learning|experiential_formation|memory_|replay/.test(task)) return 'Learning';
    if (/formation/.test(task)) return 'Parts';
  }
  if (type.startsWith('execution.')) return 'Executive';
  if (type.startsWith('self.')) return 'Self';
  if (/prediction\.|memory\.|consolidation\.|disposition\./.test(type)) return 'Learning';
  if (/judgment|activation|scope_budget|eligibility|admission/.test(type)) return 'Activation';
  if (/construction\.|part\.(?:created|instance_retired|updated)/.test(type)) return 'Parts';
  if (/worldstate|experience/.test(type)) return 'Environment';
  return 'Cognition';
}
type Versioned = { id: string; version: number };
function changes<T extends Versioned>(before: T[], after: T[]) {
  const old = new Map(before.map(item => [item.id, item]));
  return after.flatMap(item => {
    const previous = old.get(item.id);
    return !previous || previous.version !== item.version ? [{ id: item.id, kind: previous ? 'revised' as const : 'added' as const, before: previous ?? null, after: item,
      fields: previous ? Object.keys(item).filter(key => !['id', 'agentId', 'schemaVersion', 'version'].includes(key)
        && JSON.stringify(previous[key as keyof T]) !== JSON.stringify(item[key as keyof T])).map(key => ({ field: key, before: previous[key as keyof T], after: item[key as keyof T] })) : [] }] : [];
  });
}
/** Research-only projection: never reads current psychology to reconstruct a historical run. */
export function analyzeSimulation(store: Store, run: SimulationRun) {
  const recorded = store.events(run.agentId);
  const cycleIds = new Set(run.stages.flatMap(stage => stage.cycleId ? [stage.cycleId] : []));
  const inRun = (event: CognitiveEvent) => simulationEventScope(event)?.runId === run.id
    || (!simulationEventScope(event) && event.at >= run.createdAt && (!run.finishedAt || event.at <= run.finishedAt));
  const events = recorded.filter(event => simulationEventScope(event)?.runId === run.id || (event.cycleId && cycleIds.has(event.cycleId)));
  const stages = run.stages.map((stage, index) => {
    const previous = run.stages[index - 1];
    const trace = events.filter(event => simulationEventScope(event)?.runId === run.id && simulationEventScope(event)?.stageId === stage.id
      || (!!stage.cycleId && event.cycleId === stage.cycleId && !simulationEventScope(event)));
    return { index, name: stage.name, phase: stage.phase, cycleId: stage.cycleId,
      measures: stageMeasures(stage),
      lifecycle: { formed: stage.parts.filter(part => part.instance?.createdCycle === stage.cycleId && stage.cycleId).map(part => part.id),
        continued: stage.thoughts.filter(thought => previous?.parts.some(part => part.id === thought.partId)).map(thought => thought.partId),
        retired: stage.parts.filter(part => part.instance?.retirement?.cycleId === stage.cycleId && stage.cycleId).map(part => ({ partId: part.id, reason: part.instance!.retirement!.reason })),
        recruited: stage.recruitedScopes ?? [] },
      changes: {
        parts: changes(previous?.parts ?? [], stage.parts),
        predictions: changes(previous?.predictions ?? [], stage.predictions),
        memories: changes(previous?.memories ?? [], stage.memories),
        dispositions: changes(previous?.dispositions ?? [], stage.dispositions),
      },
      trace: trace.map(event => ({ id: event.id, sequence: event.sequence, at: event.at, type: event.type, lane: lane(event.type, event.payload),
        runId: run.id, stageIndex: index, cycleId: event.cycleId, parentEventId: event.type === 'runtime.validation' ? event.payload.inputEventId : simulationEventScope(event)?.startEventId === event.id ? null : simulationEventScope(event)?.startEventId ?? null,
        references: simulationEventFocus(run, events, event.payload), provenance: 'recorded audit event' as const, payload: event.payload })),
      traceAvailable: trace.length > 0,
      eligibility: trace.flatMap(event => event.type === 'construction.eligibility' ? [{ eventId: event.id, ...event.payload }] : []),
      admission: trace.flatMap(event => event.type === 'construction.admission' ? [{ eventId: event.id, ...event.payload }] : []),
      activationDetails: trace.flatMap(event => event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation'
        ? event.payload.input.candidates.map(candidate => {
          const context = candidate.context as { activationPhase?: string; baselineActivation?: number; associationSignals?: unknown[];
            disposition?: { name: string; threshold: number }; inquiry?: string };
          const score = event.payload.scores.find(score => score.partId === candidate.id)?.score ?? null;
          return { eventId: event.id, dispositionId: candidate.id, name: context.disposition?.name ?? 'Historical scope',
            phase: context.activationPhase ?? 'unreported', score, directScore: context.baselineActivation ?? null,
            scoreDifference: score !== null && context.baselineActivation !== undefined ? score - context.baselineActivation : null,
            threshold: context.disposition?.threshold ?? null, associationSignals: context.associationSignals ?? [], inquiry: context.inquiry ?? null };
        }) : []),
      decisions: trace.flatMap(event => event.type === 'self.choice' ? [{ eventId: event.id, at: event.at, choice: event.payload }] : []),
      bids: trace.flatMap(event => event.type === 'part.bid_created' ? [{ eventId: event.id, bid: event.payload }] : []),
      selfInputs: trace.flatMap(event => event.type === 'self.arbitration_started' ? [{ eventId: event.id, context: event.payload }] : []),
      operations: trace.filter(event => event.type.startsWith('execution.')).map(event => ({ eventId: event.id, type: event.type, at: event.at, payload: event.payload })),
      contracts: trace.flatMap(event => event.type === 'execution.contract' ? [{ eventId: event.id, contract: event.payload }] : []),
    };
  });
  const latest = new Map(run.stages.flatMap(stage => stage.predictions).map(prediction => [prediction.id, prediction]));
  const predictions = [...latest.values()].map(prediction => {
    const origin = run.stages.findIndex(stage => stage.cycleId === prediction.createdCycle);
    const firstSeen = run.stages.findIndex(stage => stage.predictions.some(item => item.id === prediction.id));
    const versions = run.stages.flatMap((stage, index) => stage.predictions.filter(item => item.id === prediction.id).map(item => ({ stageIndex: index, prediction: item })))
      .filter((entry, index, all) => index === 0 || entry.prediction.version !== all[index - 1]!.prediction.version);
    const checks = run.stages.flatMap((stage, index) => (stage.predictionChecks ?? []).filter(check => check.predictionId === prediction.id).map(check => ({ stageIndex: index, ...check })));
    const lastVersionStage = versions.at(-1)!.stageIndex;
    const learnedMemory = prediction.memoryId ? run.stages.flatMap(stage => stage.memories).find(memory => memory.id === prediction.memoryId) ?? null : null;
    return { prediction, originStage: origin < 0 ? null : origin, firstSeenStage: firstSeen,
      ownerName: run.stages.flatMap(stage => stage.parts).find(part => part.id === prediction.partId)?.name ?? (prediction.gapOrigin ? 'Coverage gap' : 'Unavailable historical owner'),
      resolutionDelayStages: origin >= 0 && prediction.status !== 'open' ? (versions.find(item => item.prediction.status !== 'open')?.stageIndex ?? lastVersionStage) - origin : null,
      learnedMemory,
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
  const coactivation = new Map<string, { left: string; right: string; stages: number[] }>();
  for (const [index, stage] of run.stages.entries()) {
    const active = [...new Map(stage.activations.map(item => [item.dispositionId, item])).values()].filter(item => item.active).map(item => item.dispositionId).sort();
    for (let l = 0; l < active.length; l++) for (let r = l + 1; r < active.length; r++) {
      const left = active[l]!; const right = active[r]!; const key = JSON.stringify([left, right]);
      const entry = coactivation.get(key) ?? { left, right, stages: [] }; entry.stages.push(index); coactivation.set(key, entry);
    }
  }
  const parts = [...new Map(run.stages.flatMap(stage => stage.parts).map(part => [part.id, part])).values()].map(part => ({
    part, originStage: run.stages.findIndex(stage => stage.cycleId === part.instance?.createdCycle),
    contributions: run.stages.flatMap((stage, index) => stage.thoughts.filter(item => item.partId === part.id).map(thought => ({ stageIndex: index, thought,
      recalls: stage.recalls.filter(item => item.partId === part.id),
      predictions: stage.predictions.filter(item => item.partId === part.id && item.createdCycle === stage.cycleId) }))),
    retirement: part.instance?.retirement ?? null,
  }));
  const memories = [...new Map(run.stages.flatMap(stage => stage.memories).map(memory => [memory.id, memory])).values()].map(memory => ({
    memory, originStage: run.stages.findIndex(stage => stage.cycleId === memory.createdCycle),
    retrievals: run.stages.flatMap((stage, index) => stage.recalls.filter(item => item.memoryIds.includes(memory.id)).map(item => ({ stageIndex: index, partId: item.partId, dispositionIds: item.dispositionIds }))),
    versions: run.stages.flatMap((stage, index) => stage.memories.filter(item => item.id === memory.id).map(item => ({ stageIndex: index, memory: item })))
      .filter((entry, index, all) => index === 0 || entry.memory.version !== all[index - 1]!.memory.version),
    linkedDispositions: run.stages.at(-1)?.dispositions.filter(item => item.memoryIds.includes(memory.id)).map(item => ({ id: item.id, name: item.name, version: item.version })) ?? [],
    effectiveness: 'Requires baseline, relevant and held-out behavior review; retrieval is not proof of usefulness.',
  }));
  const relatedCycles = store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id && cycle.startedAt >= run.createdAt
    && (!run.finishedAt || cycle.startedAt <= run.finishedAt));
  const failedAttempts = relatedCycles.filter(cycle => cycle.status === 'failed').map(cycle => ({ cycle,
    events: recorded.filter(event => event.cycleId === cycle.id) }));
  const cycleAttempts = recorded.flatMap(event => event.type === 'cycle.started' && event.payload.threadId === run.id ? [{
    cycle: event.payload, startEventId: event.id,
    end: recorded.filter(item => item.cycleId === event.payload.id && item.sequence > event.sequence
      && (item.type === 'cycle.completed' || item.type === 'infrastructure.error')).at(-1) ?? null,
  }] : []);
  const providerEvents = recorded.filter(event => event.type === 'provider.operation' && inRun(event));
  const providerOperations = [...new Map(providerEvents.flatMap(event => event.type === 'provider.operation'
    ? [[event.payload.operationId, { eventId: event.id, cycleId: event.cycleId, ...event.payload }] as const] : [])).values()];
  const validations = recorded.flatMap(event => event.type === 'runtime.validation' && event.at >= run.createdAt && (!run.finishedAt || event.at <= run.finishedAt)
    ? [{ eventId: event.id, cycleId: event.cycleId, ...event.payload }] : []);
  const usage = recorded.flatMap(event => event.type === 'provider.usage' && inRun(event)
    ? [{ eventId: event.id, cycleId: event.cycleId, ...event.payload }] : []);
  const stageAttempts = recorded.flatMap(event => event.type === 'simulation.stage_started' && event.payload.runId === run.id ? [{
    ...event.payload, startEventId: event.id, startedAt: event.at,
    end: recorded.find(item => (item.type === 'simulation.stage_completed' || item.type === 'simulation.stage_failed') && item.payload.startEventId === event.id) ?? null,
  }] : []);
  return { runId: run.id, agentId: run.agentId, status: run.status, evidenceBasis: run.evidenceBasis,
    summary: { completedStages: run.stages.length, totalStages: run.totalSteps,
      controls: run.stages.filter(stage => stage.phase === 'control').length,
      hypothesis: 'Review recorded criteria; execution completion does not establish the hypothesis.',
      changedObjects: stages.reduce((count, stage) => count + Object.values(stage.changes).reduce((sum, entries) => sum + entries.length, 0), 0),
      error: run.error }, knowledge: simulationKnowledge(run), stages, stageAttempts, cycleAttempts, activation, predictions, parts, memories, providerOperations, validations, providerUsage: usage, lineage: simulationLineage(run, events), metrics: simulationMetrics(run, recorded.filter(inRun)), coactivation: [...coactivation.values()], failedAttempts,
    gaps: ['Causal parents are unavailable unless explicitly recorded; chronological proximity is not causation.',
      'Memory creation and object-version changes do not establish learning effectiveness or transfer.',
      ...(stages.some(stage => !stage.traceAvailable) ? ['Some stages have no recorded cycle trace (including offline-only stages); snapshots remain available.'] : [])] };
}

export type SimulationAnalysis = ReturnType<typeof analyzeSimulation>;
// These types document the source boundary for clients without exporting mutable runtime state.
export type SimulationAnalysisSource = SimulationStage | CognitiveEvent;
