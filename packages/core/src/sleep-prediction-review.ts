import { createHash } from 'node:crypto';
import type { Store } from './contracts.js';
import { MutationValidationError } from './contracts.js';
import type { ConstructedCognition } from './constructed.js';
import { DispositionSchema, PredictionSchema, freeze, now, type Memory, type Prediction } from './domain.js';
import { memoryEvidenceLineage } from './evidence-provenance.js';
import { SleepPredictionEvidenceSchema, type SleepPredictionEvidence, type SleepPredictionPolicy, type SleepPredictionReview } from './sleep-prediction-domain.js';

const stratified = <T>(items: T[], limit: number): T[] => limit <= 0 ? [] : items.length <= limit ? [...items] : limit === 1 ? items.slice(-1)
  : Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]!);

export function validateSleepPredictionEvidence(result: SleepPredictionEvidence, memories: Memory[], prediction: Prediction, sequences: Map<string, number>): void {
  const supplied = new Map(memories.map(memory => [memory.id, memory]));
  if (new Set(result.evidence.map(reference => reference.memoryId)).size !== result.evidence.length
    || result.evidence.some(reference => supplied.get(reference.memoryId)?.version !== reference.memoryVersion))
    throw new MutationValidationError('Sleep review requires unique supplied memory versions');
  if (result.relationship !== 'unverifiable' && !result.evidence.length)
    throw new MutationValidationError('Sleep evidence conclusions require recorded source memories');
  const frontier = Math.max(prediction.committedAfterSequence ?? 0, prediction.evidenceOrigin?.sequence ?? 0, sequences.get(prediction.createdCycle) ?? 0);
  if (['validated', 'invalidated'].includes(result.relationship) && (!frontier || !result.evidence.some(reference =>
    reference.occurrence === 'after_prediction' && reference.basis === 'experienced'
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
  const memories = store.list('memory', agentId).filter(memory => !memory.deleted && cycleById.get(memory.createdCycle)?.status === 'completed');
  const lineageById = new Map(memories.map(memory => [memory.id, memoryEvidenceLineage(store, memory)]));
  const previous = store.consolidations(agentId).filter(run => run.status === 'completed').flatMap(run => run.predictionReviews ?? []);
  let admitted = 0;
  return store.list('prediction', agentId).filter(prediction => prediction.status === 'open').flatMap(prediction => {
    const thread = prediction.gapOrigin?.threadId ?? cycleById.get(prediction.createdCycle)?.threadId ?? null;
    if (!selectedThreads.has(thread)) return [];
    const frontier = threadFrontiers.get(thread)!;
    if ((prediction.committedAfterSequence ?? cycleById.get(prediction.createdCycle)?.sequence ?? Number.MAX_SAFE_INTEGER) > frontier) return [];
    const eligible = memories.filter(memory => (cycleById.get(memory.createdCycle)?.threadId ?? null) === thread && cycleById.get(memory.createdCycle)!.sequence <= frontier)
      .sort((left, right) => (cycleById.get(left.createdCycle)?.sequence ?? 0) - (cycleById.get(right.createdCycle)?.sequence ?? 0) || left.id.localeCompare(right.id));
    // Stratify across recorded history. The disposition under test supplies no candidate preference.
    const distinct: Memory[] = []; const alternatives: Memory[] = []; const seenRoots = new Set<string>(); const seenExcerpts = new Set<string>();
    for (const memory of eligible) {
      const lineage = lineageById.get(memory.id)!;
      const roots = [...lineage.experienceIds, ...lineage.legacyExperienceIds];
      const signature = JSON.stringify([lineage.sources.map(source => [source.sourceId, source.quote]).sort(), lineage.legacyExperienceIds,
        lineage.sources.length ? null : memory.content]);
      if (seenExcerpts.has(signature)) continue;
      seenExcerpts.add(signature);
      if (roots.some(root => !seenRoots.has(root)) || !roots.length) {
        distinct.push(memory); roots.forEach(root => seenRoots.add(root));
      } else alternatives.push(memory);
    }
    const pool = distinct.length >= policy.maxPredictionSearchMemories ? stratified(distinct, policy.maxPredictionSearchMemories)
      : [...distinct, ...stratified(alternatives, policy.maxPredictionSearchMemories - distinct.length)];
    const sources = pool.map(memory => ({ memoryId: memory.id, version: memory.version }));
    const fingerprint = createHash('sha256').update(JSON.stringify({ policy: 'independent-evidence-v1', predictionId: prediction.id, predictionVersion: prediction.version,
      sources, selectionLimit: policy.maxPredictionMemories })).digest('hex');
    const priorReview = previous.find(review => review.status === 'reviewed' && review.fingerprint === fingerprint);
    const unchanged = Boolean(priorReview);
    const deferred = !unchanged && (!sources.length || admitted >= policy.maxPredictionReviews);
    if (!unchanged && !deferred) admitted++;
    return [{ predictionId: prediction.id, predictionVersion: prediction.version, expectation: prediction.expectation, fingerprint, sourceMemories: priorReview?.sourceMemories ?? sources,
      ...(priorReview?.lineage ? { lineage: priorReview.lineage, newSourceIds: [], reusedSourceIds: [...new Set(priorReview.lineage.flatMap(item => item.sourceIds))], newExperienceIds: [], reusedExperienceIds: [...new Set(priorReview.lineage.flatMap(item => item.experienceIds))], independentOutcomeExperienceIds: [] } : {}),
      search: priorReview?.search ?? { eligibleCount: eligible.length, candidateCount: pool.length, omittedCount: eligible.length - pool.length,
        modes: ['support', 'contradict', 'undetermined'], scores: [] },
      status: unchanged ? 'unchanged' as const : deferred ? 'deferred' as const : 'pending' as const, result: priorReview?.result ?? null,
      reason: unchanged ? 'This prediction and selected evidence were already reviewed.' : !sources.length ? 'No recorded subjective memory candidates available; hypothesis retained.'
        : deferred ? 'Sleep prediction review budget exhausted.' : 'Selected for review.' }];
  });
}

export async function searchSleepPredictionEvidence(store: Store, cognition: ConstructedCognition, review: SleepPredictionReview, limit: number): Promise<SleepPredictionReview> {
  const prediction = store.get('prediction', review.predictionId);
  const memories = review.sourceMemories.map(source => store.get('memory', source.memoryId));
  const scores = await cognition.searchPredictionEvidence(prediction, memories);
  const selected = new Set<string>(); const seenExperiences = new Set<string>();
  const lineages = new Map(memories.map(memory => [memory.id, memoryEvidenceLineage(store, memory)]));
  const ranked = ['support', 'contradict', 'undetermined'].map(mode => scores.filter(score => score.mode === mode).sort((a, b) => b.score - a.score || a.memoryId.localeCompare(b.memoryId)));
  for (let index = 0; index < memories.length && selected.size < limit; index++) for (const group of ranked) {
    if (selected.size >= limit) break;
    const candidate = group[index]; if (!candidate || selected.has(candidate.memoryId)) continue;
    const lineage = lineages.get(candidate.memoryId)!;
    const roots = [...lineage.experienceIds, ...lineage.legacyExperienceIds];
    if (roots.length && roots.every(root => seenExperiences.has(root))) continue;
    selected.add(candidate.memoryId); roots.forEach(root => seenExperiences.add(root));
  }
  // Alternative remembered excerpts can matter without becoming independent confirmations.
  for (let index = 0; index < memories.length && selected.size < limit; index++) for (const group of ranked) {
    if (selected.size >= limit) break;
    const candidate = group[index]; if (candidate) selected.add(candidate.memoryId);
  }
  return { ...review, sourceMemories: review.sourceMemories.filter(source => selected.has(source.memoryId)),
    search: { ...review.search!, scores } };
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
  const created = store.cycle(prediction.createdCycle);
  const predictionVersions = store.versions('prediction', prediction.id);
  const lineages = new Map(memories.map(memory => [memory.id, memoryEvidenceLineage(store, memory)]));
  const knownExperiences = new Set(prediction.evidenceOrigin?.knownExperienceIds ?? []);
  const knownSources = new Set(prediction.evidenceOrigin?.sourceIds ?? []);
  for (const reference of prediction.evidenceOrigin?.memories ?? []) {
    const version = store.versions('memory', reference.memoryId).find(record => record.state.version === reference.version)?.state;
    if (version) memoryEvidenceLineage(store, version).experienceIds.forEach(experienceId => knownExperiences.add(experienceId));
  }
  const previouslyReviewed = new Set(store.consolidations(agentId).flatMap(run => run.predictionReviews ?? [])
    .filter(previous => previous.predictionId === prediction.id && previous.status !== 'pending' && previous.status !== 'failed')
    .flatMap(previous => previous.lineage?.flatMap(item => item.experienceIds) ?? []));
  const previousReviews = store.consolidations(agentId).flatMap(run => run.predictionReviews ?? [])
    .filter(previous => previous.predictionId === prediction.id && previous.status !== 'pending' && previous.status !== 'failed');
  const previouslyReviewedSources = new Set(previousReviews.flatMap(previous => previous.lineage?.flatMap(item => item.sourceIds) ?? []));
  const previouslyCertified = new Set(previousReviews.flatMap(previous => previous.independentOutcomeExperienceIds ?? []));
  const predictionReviewContext = { predictionSequence: Math.max(prediction.committedAfterSequence ?? 0, prediction.evidenceOrigin?.sequence ?? 0, created.sequence),
    predictionCreatedAt: predictionVersions[0]!.at, predictionVersionAt: prediction.evidenceOrigin?.formedAt ?? predictionVersions.at(-1)!.at,
    knownExperienceIds: [...knownExperiences], previouslyReviewedExperienceIds: [...previouslyReviewed], search: review.search,
    knownSourceIds: [...knownSources], previouslyReviewedSourceIds: [...previouslyReviewedSources],
    memories: memories.map(memory => ({ memoryId: memory.id, memoryVersion: memory.version,
      recordedSequence: store.cycle(memory.createdCycle).sequence, recordedAt: store.versions('memory', memory.id)[0]!.at,
      experienceIds: lineages.get(memory.id)!.experienceIds, sources: lineages.get(memory.id)!.sources, legacyExperienceIds: lineages.get(memory.id)!.legacyExperienceIds })) };
  const result = SleepPredictionEvidenceSchema.parse(await cognition.infer('sleep_prediction_review', freeze({ agentId, predictions: [prediction], memories, predictionReviewContext })));
  if (!result.coverage) throw new MutationValidationError('Sleep review must explicitly assess supporting, contradicting and undetermined coverage');
  const covered = [...result.coverage.supportingMemoryIds, ...result.coverage.contradictingMemoryIds, ...result.coverage.undeterminedMemoryIds];
  if (covered.length !== memories.length || new Set(covered).size !== memories.length || covered.some(memoryId => !lineages.has(memoryId)))
    throw new MutationValidationError('Contradiction-aware review must account for every selected memory exactly once');
  for (const reference of result.evidence) {
    const group = reference.stance === 'supports' ? result.coverage.supportingMemoryIds : reference.stance === 'contradicts' ? result.coverage.contradictingMemoryIds : result.coverage.undeterminedMemoryIds;
    if (!group.includes(reference.memoryId)) throw new MutationValidationError('Evidence stance must agree with the explicit coverage assessment');
  }
  validateSleepPredictionEvidence(result, memories, prediction, new Map(store.cycles(agentId).map(cycle => [cycle.id, cycle.sequence])));
  const prospectiveEvidence = result.evidence.filter(reference => reference.basis === 'experienced'
    && reference.test === 'outcome' && reference.conditions === 'met'
    && reference.testedClaim === prediction.expectation
    && (reference.actionInfluence === 'observational' || (reference.actionInfluence === 'action_conditioned' && prediction.kind === 'action_conditioned'))
    && reference.stance === (result.relationship === 'invalidated' ? 'contradicts' : 'supports')
    && reference.occurrence === 'after_prediction'
    && store.cycle(memories.find(memory => memory.id === reference.memoryId)!.createdCycle).sequence > predictionReviewContext.predictionSequence
    && reference.outcomeSourceIds.some(sourceId => lineages.get(reference.memoryId)!.sources.some(source => source.available && source.sourceId === sourceId
      && source.firstRecordedAt >= predictionReviewContext.predictionVersionAt && !knownExperiences.has(source.experienceId)
      && !knownSources.has(source.sourceId)
      && (!source.timestamp || source.timestamp >= predictionReviewContext.predictionVersionAt)
      && (source.source !== 'Agent' || (reference.actionInfluence === 'action_conditioned' && prediction.kind === 'action_conditioned'))
      && !previouslyReviewedSources.has(source.sourceId) && !previouslyCertified.has(source.experienceId) && !source.experienceId.startsWith('unattributed_'))));
  for (const reference of result.evidence) if (reference.outcomeSourceIds.some(sourceId => !lineages.get(reference.memoryId)!.sources.some(source => source.sourceId === sourceId)))
    throw new MutationValidationError('Outcome tests must cite preserved experience sources, never invented or merely interpreted outcomes');
  if (['validated', 'invalidated'].includes(result.relationship) && !prospectiveEvidence.length)
    throw new MutationValidationError('Prospective evidence requires a new independently sourced observable test after the assessed claim version with conditions and causation accounted for');
  if (store.get('prediction', prediction.id).version !== prediction.version
    || review.sourceMemories.some(source => store.get('memory', source.memoryId).version !== source.version || store.get('memory', source.memoryId).deleted))
    throw new MutationValidationError('Sleep review sources changed during inference');
  const experienceIds = [...new Set([...lineages.values()].flatMap(lineage => lineage.experienceIds))];
  const independentOutcomeExperienceIds = [...new Set(prospectiveEvidence.flatMap(reference => lineages.get(reference.memoryId)!.sources
    .filter(source => source.available && reference.outcomeSourceIds.includes(source.sourceId) && !knownExperiences.has(source.experienceId) && !knownSources.has(source.sourceId)
      && !previouslyReviewedSources.has(source.sourceId) && !previouslyCertified.has(source.experienceId) && !source.experienceId.startsWith('unattributed_') && source.firstRecordedAt >= predictionReviewContext.predictionVersionAt
      && (!source.timestamp || source.timestamp >= predictionReviewContext.predictionVersionAt)
      && (source.source !== 'Agent' || reference.actionInfluence === 'action_conditioned')).map(source => source.experienceId)))];
  const completed: SleepPredictionReview = { ...review, status: 'reviewed', result, reason: result.interpretation,
    lineage: memories.map(memory => ({ memoryId: memory.id, version: memory.version, experienceIds: lineages.get(memory.id)!.experienceIds,
      legacyExperienceIds: lineages.get(memory.id)!.legacyExperienceIds, sourceIds: lineages.get(memory.id)!.sources.map(source => source.sourceId) })),
    newExperienceIds: experienceIds.filter(experienceId => !previouslyReviewed.has(experienceId)),
    reusedExperienceIds: experienceIds.filter(experienceId => previouslyReviewed.has(experienceId)), independentOutcomeExperienceIds,
    newSourceIds: [...new Set([...lineages.values()].flatMap(lineage => lineage.sources.map(source => source.sourceId)))].filter(sourceId => !previouslyReviewedSources.has(sourceId)),
    reusedSourceIds: [...previouslyReviewedSources].filter(sourceId => [...lineages.values()].some(lineage => lineage.sources.some(source => source.sourceId === sourceId))) };
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
          provenance: { predictionVersion: prediction.version, sourceIds: prospectiveEvidence.flatMap(reference => reference.outcomeSourceIds),
            experienceIds: independentOutcomeExperienceIds, recordedAt: now() },
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
