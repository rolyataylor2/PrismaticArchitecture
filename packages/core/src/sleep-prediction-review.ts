import { createHash } from 'node:crypto';
import type { Store } from './contracts.js';
import { MutationValidationError } from './contracts.js';
import type { ConstructedCognition } from './constructed.js';
import { DispositionSchema, PredictionSchema, freeze, type Memory, type Prediction } from './domain.js';
import { SleepPredictionEvidenceSchema, type SleepPredictionEvidence, type SleepPredictionPolicy, type SleepPredictionReview } from './sleep-prediction-domain.js';

export function validateSleepPredictionEvidence(result: SleepPredictionEvidence, memories: Memory[], prediction: Prediction, sequences: Map<string, number>): void {
  const supplied = new Map(memories.map(memory => [memory.id, memory]));
  if (new Set(result.evidence.map(reference => reference.memoryId)).size !== result.evidence.length
    || result.evidence.some(reference => supplied.get(reference.memoryId)?.version !== reference.memoryVersion))
    throw new MutationValidationError('Sleep review requires unique supplied memory versions');
  if (result.relationship !== 'unverifiable' && !result.evidence.length)
    throw new MutationValidationError('Sleep evidence conclusions require recorded source memories');
  const frontier = prediction.committedAfterSequence ?? sequences.get(prediction.createdCycle);
  if (['validated', 'invalidated'].includes(result.relationship) && (!frontier || !result.evidence.some(reference =>
    reference.occurrence === 'after_prediction' && reference.basis === 'experienced'
    && !supplied.get(reference.memoryId)!.synthesis && supplied.get(reference.memoryId)!.predictionId !== prediction.id
    && (sequences.get(supplied.get(reference.memoryId)!.createdCycle) ?? 0) > frontier)))
    throw new MutationValidationError('Prospective sleep evidence requires an experienced later test, not retrospective or counterfactual support');
  if (['retrospectively_supported', 'retrospectively_challenged'].includes(result.relationship)
    && !result.evidence.some(reference => reference.occurrence === 'before_prediction' && !['inferred', 'counterfactual'].includes(reference.basis)))
    throw new MutationValidationError('Historical support or challenge requires recorded prior experience or an attributed report');
  if (result.relationship === 'obsolete' && !result.evidence.some(reference => ['experienced', 'reported'].includes(reference.basis)))
    throw new MutationValidationError('Obsolete context requires experienced or reported changed circumstances');
}

/** Capture selected subjective evidence before sleep writes; never loads a WorldState. */
export function selectSleepPredictionReviews(store: Store, agentId: string, selectedCycleIds: string[], policy: SleepPredictionPolicy): SleepPredictionReview[] {
  if (!policy.reviewPredictions) return [];
  const cycles = store.cycles(agentId);
  const selected = new Set(selectedCycleIds);
  const selectedThreads = new Set(cycles.filter(cycle => selected.has(cycle.id)).map(cycle => cycle.threadId ?? null));
  const threadFrontiers = new Map([...selectedThreads].map(thread => [thread, Math.max(...cycles.filter(cycle => selected.has(cycle.id) && (cycle.threadId ?? null) === thread).map(cycle => cycle.sequence))]));
  const cycleById = new Map(cycles.map(cycle => [cycle.id, cycle]));
  const dispositions = store.list('disposition', agentId);
  const memories = store.list('memory', agentId).filter(memory => !memory.deleted && cycleById.get(memory.createdCycle)?.status === 'completed');
  const previous = store.consolidations(agentId).filter(run => run.status === 'completed').flatMap(run => run.predictionReviews ?? []);
  let admitted = 0;
  return store.list('prediction', agentId).filter(prediction => prediction.status === 'open').flatMap(prediction => {
    const thread = prediction.gapOrigin?.threadId ?? cycleById.get(prediction.createdCycle)?.threadId ?? null;
    if (!selectedThreads.has(thread)) return [];
    const frontier = threadFrontiers.get(thread)!;
    if ((prediction.committedAfterSequence ?? cycleById.get(prediction.createdCycle)?.sequence ?? Number.MAX_SAFE_INTEGER) > frontier) return [];
    const linked = new Set(dispositions.filter(disposition => disposition.sourcePredictionId === prediction.id).flatMap(disposition => disposition.memoryIds));
    // Bounded recent context plus explicitly linked experience; semantic evidence selection occurs in review.
    const sources = memories.filter(memory => (cycleById.get(memory.createdCycle)?.threadId ?? null) === thread && cycleById.get(memory.createdCycle)!.sequence <= frontier)
      .sort((left, right) => Number(linked.has(right.id) || right.predictionId === prediction.id) - Number(linked.has(left.id) || left.predictionId === prediction.id)
        || (cycleById.get(right.createdCycle)?.sequence ?? 0) - (cycleById.get(left.createdCycle)?.sequence ?? 0) || left.id.localeCompare(right.id))
      .slice(0, policy.maxPredictionMemories).map(memory => ({ memoryId: memory.id, version: memory.version }));
    const fingerprint = createHash('sha256').update(JSON.stringify({ predictionId: prediction.id, predictionVersion: prediction.version, sources })).digest('hex');
    const priorReview = previous.find(review => review.status === 'reviewed' && review.fingerprint === fingerprint);
    const unchanged = Boolean(priorReview);
    const deferred = !unchanged && (!sources.length || admitted >= policy.maxPredictionReviews);
    if (!unchanged && !deferred) admitted++;
    return [{ predictionId: prediction.id, predictionVersion: prediction.version, expectation: prediction.expectation, fingerprint, sourceMemories: sources,
      status: unchanged ? 'unchanged' as const : deferred ? 'deferred' as const : 'pending' as const, result: priorReview?.result ?? null,
      reason: unchanged ? 'This prediction and selected evidence were already reviewed.' : !sources.length ? 'No recorded subjective memory candidates available; hypothesis retained.'
        : deferred ? 'Sleep prediction review budget exhausted.' : 'Selected for review.' }];
  });
}

export async function reviewSleepPrediction(store: Store, cognition: ConstructedCognition, agentId: string, review: SleepPredictionReview,
  persist?: (completed: SleepPredictionReview) => void): Promise<SleepPredictionReview> {
  const prediction = store.get('prediction', review.predictionId);
  if (prediction.agentId !== agentId || prediction.version !== review.predictionVersion || prediction.status !== 'open')
    throw new MutationValidationError('Sleep prediction changed after evidence capture');
  const memories = review.sourceMemories.map(source => {
    const memory = store.get('memory', source.memoryId);
    if (memory.agentId !== agentId || memory.deleted || memory.version !== source.version) throw new MutationValidationError('Sleep memory evidence changed after capture');
    return memory;
  });
  const dispositions = store.list('disposition', agentId).filter(disposition => disposition.sourcePredictionId === prediction.id);
  const created = store.cycle(prediction.createdCycle);
  const predictionVersions = store.versions('prediction', prediction.id);
  const predictionReviewContext = { predictionSequence: prediction.committedAfterSequence ?? created.sequence,
    predictionCreatedAt: predictionVersions[0]!.at, predictionVersionAt: predictionVersions.at(-1)!.at,
    memories: memories.map(memory => ({ memoryId: memory.id, memoryVersion: memory.version,
      recordedSequence: store.cycle(memory.createdCycle).sequence, recordedAt: store.versions('memory', memory.id)[0]!.at })) };
  const result = SleepPredictionEvidenceSchema.parse(await cognition.infer('sleep_prediction_review', freeze({ agentId, predictions: [prediction], memories, dispositions, predictionReviewContext })));
  validateSleepPredictionEvidence(result, memories, prediction, new Map(store.cycles(agentId).map(cycle => [cycle.id, cycle.sequence])));
  const prospectiveEvidence = result.evidence.filter(reference => reference.basis === 'experienced'
    && reference.occurrence === 'after_prediction' && !memories.find(memory => memory.id === reference.memoryId)!.synthesis
    && memories.find(memory => memory.id === reference.memoryId)!.predictionId !== prediction.id
    && store.cycle(memories.find(memory => memory.id === reference.memoryId)!.createdCycle).sequence > predictionReviewContext.predictionSequence
    && store.versions('memory', reference.memoryId)[0]!.at >= predictionReviewContext.predictionVersionAt);
  if (['validated', 'invalidated'].includes(result.relationship) && !prospectiveEvidence.length)
    throw new MutationValidationError('Prospective evidence must follow the assessed prediction version, not only its original creation');
  if (store.get('prediction', prediction.id).version !== prediction.version
    || review.sourceMemories.some(source => store.get('memory', source.memoryId).version !== source.version || store.get('memory', source.memoryId).deleted))
    throw new MutationValidationError('Sleep review sources changed during inference');
  const completed: SleepPredictionReview = { ...review, status: 'reviewed', result, reason: result.interpretation };
  if (['validated', 'invalidated', 'obsolete'].includes(result.relationship)) {
    store.transaction(() => {
      const current = store.get('prediction', prediction.id);
      if (current.version !== prediction.version || current.status !== 'open') throw new MutationValidationError('Prediction changed during sleep evidence review');
      for (const source of review.sourceMemories) if (store.get('memory', source.memoryId).version !== source.version)
        throw new MutationValidationError('Memory evidence changed during sleep review');
      const obsolete = result.relationship === 'obsolete';
      const laterSource = prospectiveEvidence[0];
      const sourceCycle = laterSource ? store.cycles(agentId).find(cycle => cycle.id === memories.find(memory => memory.id === laterSource.memoryId)!.createdCycle) : null;
      const next = PredictionSchema.parse({ ...prediction, version: prediction.version + 1,
        status: obsolete ? 'invalidated' : 'resolved', evaluation: obsolete ? prediction.evaluation : {
          assessment: result.relationship === 'validated' ? 'confirmed' : 'contradicted', interpretation: result.interpretation,
          causalAttribution: result.causalAttribution, evidence: result.evidence.map(reference => reference.explanation), evidenceWorldId: sourceCycle!.worldId,
        } });
      const provenance = { origin: 'consolidation' as const, reason: result.interpretation, sourceIds: [prediction.id, ...result.evidence.map(reference => reference.memoryId)] };
      store.save('prediction', next, prediction.version, provenance);
      for (const disposition of store.list('disposition', agentId).filter(disposition => disposition.temporary && disposition.active && disposition.scaffold && disposition.sourcePredictionId === prediction.id)) {
        const sourceThread = prediction.gapOrigin?.threadId ?? created.threadId ?? null;
        const endedCycle = store.cycles(agentId).filter(cycle => cycle.status === 'completed' && (cycle.threadId ?? null) === sourceThread).at(-1)?.id ?? prediction.createdCycle;
        store.save('disposition', DispositionSchema.parse({ ...disposition, version: disposition.version + 1, active: false,
          scaffold: { ...disposition.scaffold!, endedCycle, endReason: `Sleep evidence reconciliation: ${result.relationship}. ${result.interpretation}` },
          development: disposition.development ? { ...disposition.development, previousVersion: disposition.version } : undefined,
        }), disposition.version, provenance);
      }
      persist?.(completed);
    });
  } else store.transaction(() => persist?.(completed));
  return completed;
}
