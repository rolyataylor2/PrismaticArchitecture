import type { CognitiveEvent } from '../../core/src/contracts.js';
import type { SimulationRun } from './simulation-tests.js';
export const researchMetricCatalog = [
  { id: 'activation_discrimination', title: 'Activation discrimination', question: 'Are relevant scopes distinguished from irrelevant ones?', prerequisite: 'Researcher relevance labels and comparable positive/negative controls.' },
  { id: 'context_retention', title: 'Context retention', question: 'Are useful unresolved concerns retained without obsolete actions?', prerequisite: 'Explicit concern/action review with fresh-context and carryover controls.' },
  { id: 'evidence_alignment', title: 'Evidence alignment', question: 'Are expectations checked against relevant later evidence?', prerequisite: 'Review the selected capsule, horizon, factual evidence and subjective evaluation.' },
  { id: 'prediction_calibration', title: 'Prediction calibration', question: 'Does a justified probability match assessable external outcomes?', prerequisite: 'Explicit probability semantics and independently labeled assessable outcomes; current conviction is not calibrated probability.' },
  { id: 'retrieval_appropriateness', title: 'Retrieval appropriateness', question: 'Do recalled memories help this encounter?', prerequisite: 'Contextual usefulness review; retrieval and subjective usefulness records alone do not establish benefit.' },
  { id: 'learning_transfer', title: 'Learning transfer', question: 'Does experience help in a novel related context?', prerequisite: 'Preserved baseline, trained/control conditions and a held-out analogous probe.' },
  { id: 'learning_stability', title: 'Learning stability', question: 'Are earlier competencies preserved after development?', prerequisite: 'Comparable baseline/retests and durability observations, with explicit criterion judgments.' },
  { id: 'decision_coherence', title: 'Decision coherence', question: 'Is choice supported by Self-visible contributions?', prerequisite: 'Recorded visibility, scoring/choice and researcher review of meaning; availability is not coherence.' },
  { id: 'execution_reliability', title: 'Execution reliability', question: 'Does selected authority lead to independently verified enactment?', prerequisite: 'Captured authority, ended execution and explicit verification; successful tools alone do not establish whole-goal success.' },
  { id: 'cost_latency', title: 'Cost and latency', question: 'What resources do recorded component calls consume?', prerequisite: 'Reported usage and measured call intervals; absent cache, cost and uninstrumented latency stay unknown.' },
] as const;
export type ResearchMetricId = typeof researchMetricCatalog[number]['id'];
const counts = (values: string[]) => Object.fromEntries([...new Set(values)].map(value => [value, values.filter(item => item === value).length]));
const stats = (values: number[]) => ({ n: values.length, min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null });
/** Research-only descriptors. No automatic relevance, learning, causal or probability judgment. */
export function simulationMetrics(run: SimulationRun, events: CognitiveEvent[]) {
  const predictionIds = [...new Set(run.stages.flatMap(stage => stage.predictions.map(prediction => prediction.id)))];
  const predictions = predictionIds.map(id => {
    const occurrences = run.stages.flatMap((stage, index) => stage.predictions.filter(prediction => prediction.id === id).map(prediction => ({ stageIndex: index, prediction })));
    const last = occurrences.at(-1)!.prediction;
    const originStage = run.stages.findIndex(stage => stage.cycleId === last.createdCycle);
    const checks = run.stages.flatMap((stage, index) => (stage.predictionChecks ?? []).filter(check => check.predictionId === id).map(check => ({ stageIndex: index, outcome: check.outcome })));
    const firstClosure = occurrences.find(item => item.prediction.status !== 'open');
    const laterCycles = run.stages.slice(Math.max(originStage, occurrences[0]!.stageIndex) + 1).filter(stage => stage.cycleId).length;
    return { id, originStage: originStage < 0 ? null : originStage, status: last.status, assessment: last.evaluation?.assessment ?? 'unassessed',
      laterRecordedCycles: laterCycles, checks, delayStages: originStage >= 0 && firstClosure ? firstClosure.stageIndex - originStage : null,
      evidenceWorldId: last.evaluation?.evidenceWorldId ?? null,
      evidenceReference: `/stages/${occurrences.at(-1)!.stageIndex}/predictions/${run.stages[occurrences.at(-1)!.stageIndex]!.predictions.findIndex(prediction => prediction.id === id)}` };
  });
  const memories = [...new Map(run.stages.flatMap(stage => stage.memories).map(memory => [memory.id, memory])).values()].map(memory => {
    const versions = [...new Set(run.stages.flatMap(stage => stage.memories.filter(item => item.id === memory.id).map(item => item.version)))];
    const retrievals = run.stages.flatMap((stage, index) => stage.recalls.filter(recall => recall.memoryIds.includes(memory.id)).map(recall => ({ stageIndex: index, partId: recall.partId,
      evidenceReference: `/stages/${index}/recalls/${stage.recalls.indexOf(recall)}` })));
    const evidence = new Map<string, { dispositionId: string; stageIndex: number; usefulness: string; relationship: string; reason: string; reference: string }>();
    run.stages.forEach((stage, stageIndex) => stage.dispositions.forEach((disposition, dispositionIndex) => disposition.development?.evidence?.forEach((item, evidenceIndex) => {
      if (item.memoryId === memory.id) evidence.set(JSON.stringify([disposition.id, item.memoryId, item.cycleId, item.threadId, item.predictionId]), {
        dispositionId: disposition.id, stageIndex, usefulness: item.retrievalUsefulness, relationship: item.relationship, reason: item.reason,
        reference: `/stages/${stageIndex}/dispositions/${dispositionIndex}/development/evidence/${evidenceIndex}` });
    })));
    return { id: memory.id, gist: memory.gist, versions, retrievals, subjectiveUsefulness: [...evidence.values()],
      finalSnapshot: run.stages.at(-1)?.memories.some(item => item.id === memory.id) ?? false, deleted: memory.deleted === true };
  });
  const operations = [...new Map(events.flatMap(event => event.type === 'provider.operation' ? [[event.payload.operationId, { eventId: event.id, ...event.payload }] as const] : [])).values()];
  const components = [...new Set(operations.map(item => `${item.component}:${item.task}:${item.provider}`))].map(key => {
    const records = operations.filter(item => `${item.component}:${item.task}:${item.provider}` === key);
    const usage = records.filter(item => item.usage);
    return { key, operations: records.length, returned: records.filter(item => item.phase === 'returned').length,
      failed: records.filter(item => item.phase === 'failed').length, unfinished: records.filter(item => item.phase === 'started').length,
      latencyMs: stats(records.flatMap(item => item.elapsedMs === null ? [] : [item.elapsedMs])),
      usageReported: usage.length, inputTokens: usage.length ? usage.reduce((sum, item) => sum + item.usage!.inputTokens, 0) : null,
      outputTokens: usage.length ? usage.reduce((sum, item) => sum + item.usage!.outputTokens, 0) : null,
      cachedInputTokens: usage.length && usage.every(item => item.usage!.cachedInputTokens !== null) ? usage.reduce((sum, item) => sum + item.usage!.cachedInputTokens!, 0) : null,
      cost: null, evidenceReferences: records.map(item => `/events/${item.eventId}`) };
  });
  const finalExecutions = [...new Map([...run.stages.flatMap(stage => stage.executions ?? []), ...(run.executiveEvidence?.executions ?? [])].map(execution => [execution.id, execution])).values()];
  const contracts = events.flatMap(event => event.type === 'execution.contract' ? [event.payload] : []);
  return { dimensions: researchMetricCatalog, predictions: { total: predictions.length, originInRun: predictions.filter(item => item.originStage !== null).length,
    inherited: predictions.filter(item => item.originStage === null).length, checked: predictions.filter(item => item.checks.length).length,
    withoutLaterCycle: predictions.filter(item => !item.laterRecordedCycles).length,
    administrativeStatus: counts(predictions.map(item => item.status)), expectationAssessment: counts(predictions.map(item => item.assessment)),
    closureDelayStages: stats(predictions.flatMap(item => item.delayStages === null ? [] : [item.delayStages])), entries: predictions,
    calibration: { value: null, reason: 'Recorded conviction has no justified probability semantics or independent assessability labels.' } },
    memory: { total: memories.length, retrieved: memories.filter(item => item.retrievals.length).length,
      recallGroups: run.stages.reduce((sum, stage) => sum + stage.recalls.filter(recall => recall.memoryIds.length > 0).length, 0),
      memoryRecallOccurrences: memories.reduce((sum, item) => sum + item.retrievals.length, 0), revised: memories.filter(item => item.versions.length > 1).length,
      retainedInFinalSnapshot: memories.filter(item => item.finalSnapshot && !item.deleted).length,
      subjectiveUsefulness: counts(memories.flatMap(item => item.subjectiveUsefulness.map(evidence => evidence.usefulness))), entries: memories },
    execution: { capturedContracts: new Set(contracts.map(contract => contract.id)).size, recordedExecutions: finalExecutions.length,
      status: counts(finalExecutions.map(execution => execution.status)), operationallyVerified: finalExecutions.filter(execution => execution.operational?.verified === true).length,
      unverified: finalExecutions.filter(execution => execution.operational && !execution.operational.verified).length,
      capturedAuthorityWithoutStatus: contracts.filter(contract => !finalExecutions.some(execution => execution.contractId === contract.id)).map(contract => contract.id) },
    resources: components, stageHistory: run.stages.map((stage, index) => ({ index, name: stage.name, phase: stage.phase,
      predictions: new Set(stage.predictions.map(item => item.id)).size, memories: new Set(stage.memories.map(item => item.id)).size,
      recalledMemoryIds: [...new Set(stage.recalls.flatMap(item => item.memoryIds))], proposals: stage.thoughts.filter(item => item.proposal).length,
      selectedChoices: stage.selfChoices?.length ?? null, executions: stage.executions?.length ?? null, reference: `/stages/${index}` })),
    limitations: ['Counts and snapshot retention are descriptive, not evidence of effectiveness, transfer or stability.',
      'Checking coverage uses all recorded predictions; missing later cycles are censored opportunities, not failed predictions.',
      'Closure delay is measured in recorded scenario stages, including offline stages, not elapsed psychological time.',
      'Disposition usefulness labels are attributed subjective development records, not independent researcher grades.',
      'Component latency is measured adapter-call wall time; resource totals cover only operations with reported usage and may include nested calls.'] };
}
