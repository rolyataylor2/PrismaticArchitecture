import type { SimulationRun } from './simulation-tests.js';
import type { SimulationRubric } from './simulation-rubrics.js';

/** External semantic checks; code establishes captured prerequisites, never semantic mismatch. */
export function predictionAlignmentCriteria(run: SimulationRun): SimulationRubric['criteria'] {
  const ids = [...new Set(run.stages.flatMap(stage => stage.predictions.filter(item => item.evaluation).map(item => item.id)))];
  return ids.flatMap((id, index) => {
    const versions = run.stages.flatMap((stage, stageIndex) => stage.predictions.filter(item => item.id === id).map(item => ({ stageIndex, predictionIndex: stage.predictions.indexOf(item), prediction: item })));
    const evaluated = versions.filter(item => item.prediction.evaluation).at(-1)!;
    const prior = versions.filter(item => item.stageIndex < evaluated.stageIndex && item.prediction.status === 'open' && !item.prediction.evaluation);
    const references = versions.map(item => `/stages/${item.stageIndex}/predictions/${item.predictionIndex}`);
    const base = { prerequisites: 'An independently captured open pre-evaluation prediction and its later evaluation; preserved versions/revisions, selected capsule, horizon and factual checks.',
      guidance: `Prediction ID ${id}. Inspect exact preserved versions: ${references.join(', ')}. Legitimate recorded revisions can change expectations. Compare the applicable pre-evaluation expectation/capsule/horizon, not just the latest text. Subjective bias is not a defect; lexical differences alone cannot establish a mismatch.`,
      blockedReason: prior.length ? null : 'No independently captured open pre-evaluation prediction supports alignment; missing origin cannot be reconstructed from the later evaluation.' };
    const criteria: SimulationRubric['criteria'] = [{ ...base, criterionId: `prediction-alignment-${index + 1}`,
      criterion: `Possible prediction/evaluation subject mismatch for ${id}`,
      requiredEvidenceGroups: [prior.filter(item => item.prediction.version === prior.at(-1)?.prediction.version).map(item => `/stages/${item.stageIndex}/predictions/${item.predictionIndex}`), [`/stages/${evaluated.stageIndex}/predictions/${evaluated.predictionIndex}`]],
      observed: 'The evaluation materially substitutes a different entity, encounter, action or expected outcome for the preserved applicable expectation, with exact original and evaluation citations.',
      notObserved: 'Adequate preserved evidence shows that evaluation addresses the applicable expectation and horizon without material subject substitution; this is not prediction success or causal learning.' }];
    const memoryId = evaluated.prediction.memoryId;
    if (memoryId) {
      const memories = run.stages.flatMap((stage, stageIndex) => stage.memories.filter(item => item.id === memoryId).map(item => `/stages/${stageIndex}/memories/${stage.memories.indexOf(item)}`));
      criteria.push({ ...base, criterionId: `prediction-memory-${index + 1}`, criterion: `Possible remembered-expectation drift for ${id}`,
        requiredEvidenceGroups: [prior.filter(item => item.prediction.version === prior.at(-1)?.prediction.version).map(item => `/stages/${item.stageIndex}/predictions/${item.predictionIndex}`), memories],
        observed: 'The linked memory materially claims that the Agent predicted something absent from the preserved applicable expectation, retaining exact prediction and memory citations.',
        notObserved: 'Adequate evidence shows faithful expectation provenance while allowing changed interpretation, resistant psychology and explicit later reconsolidation.',
        guidance: `${base.guidance} Exact linked memory ID ${memoryId}; captured versions: ${memories.join(', ') || 'unavailable'}. Separate the first encoded episode from explicit later reconsolidation. Do not require memory wording to match the expectation verbatim.`,
        blockedReason: base.blockedReason ?? (memories.length ? null : 'The explicitly linked subjective memory is absent from the frozen evidence; no memory-fidelity verdict is justified.') });
    }
    return criteria;
  });
}
