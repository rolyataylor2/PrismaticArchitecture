import { DispositionSchema, activationAssociations, id, now, type Disposition, type Memory } from './domain.js';
import { reconciliationOutcomeEvidence, consumedExperienceIds } from './reconciliation-evidence.js';
import { memoryEvidenceLineage } from './evidence-provenance.js';
import { predictionTrajectories, type PredictionTrajectory } from './prediction-lineage.js';
import type { Store } from './contracts.js';
import type { Inspection } from './inspection.js';
import { cueEvidence } from './experiential-formation.js';
import { ReconciliationRejectedError, validateReconciliationCitations, validateReconciliationEvidence,
  type ReconciliationObservations, type ReconciliationOperation } from './disposition-reconciliation.js';

/** Commit validated structural proposals without changing subjective memory content. */
export function commitReconciliation(store: Store, inspection: Inspection, agentId: string,
  operations: ReconciliationOperation[], memories: Memory[], observations: ReconciliationObservations,
  expectedDispositionVersions?: Record<string, number>, suppliedTrajectories: PredictionTrajectory[] = []) {
  const definitions = store.list('disposition', agentId);
  if (memories.some(memory => memory.agentId !== agentId)) throw new Error('Reconciliation memory ownership mismatch');
  return inspection.atomic(() => {
    for (const memory of memories) {
      if (store.get('memory', memory.id).version !== memory.version) throw new Error('Reconciliation memory evidence changed during inference');
    }
    observations = { ...observations, episodes: observations.episodes.map(episode => {
      const memory = memories.find(memory => memory.id === episode.memoryId);
      if (!memory) return { ...episode, experienceIds: [] };
      const lineage = memoryEvidenceLineage(store, memory);
      return { ...episode, experienceIds: [...lineage.experienceIds, ...lineage.legacyExperienceIds.filter(root => !root.startsWith('untraced:'))] };
    }) };
    if (expectedDispositionVersions) {
      for (const operation of operations) {
        if (!('sourceDispositionIds' in operation)) continue;
        for (const source of operation.sourceDispositionIds) {
          // Unknown citations are rejected per proposal below; stale supplied state remains fatal.
          if (definitions.some(definition => definition.id === source)
            && store.get('disposition', source).version !== expectedDispositionVersions[source])
            throw new Error('Reconciliation source disposition changed during inference');
        }
      }
    }
    const committed: Disposition[] = [];
    for (const operation of operations) {
      if (operation.operation === 'NO_CHANGE' || operation.operation === 'INSUFFICIENT_EVIDENCE') continue;
      let concernInheritance: NonNullable<Disposition['development']>['concernInheritance'];
      let newExperienceIds: string[] = [];
      try {
        validateReconciliationCitations(operation, memories.map(memory => memory.id), definitions.map(disposition => disposition.id));
        validateReconciliationEvidence(operation, observations);
        const sources = operation.sourceDispositionIds.map(source => store.get('disposition', source));
        const source = sources[0]!;
        if (operation.operation === 'INSTITUTIONALIZE' && sources.some(source => !source.temporary || !source.scaffold
          || !source.sourcePredictionId || store.get('prediction', source.sourcePredictionId).status === 'open'))
          throw new ReconciliationRejectedError('Institutionalization requires preserved temporary scaffold sources whose originating hypotheses have ended');
        if (operation.operation === 'INSTITUTIONALIZE' && operation.inheritedConcern) {
          const inherited = operation.inheritedConcern;
          const predictionIds = [...new Set(sources.map(source => source.sourcePredictionId!))];
          const recorded = predictionTrajectories(store, agentId, predictionIds.map(id => store.get('prediction', id)), definitions);
          const selectedIds = new Set(inherited.thoughtEventIds);
          if (selectedIds.size !== inherited.thoughtEventIds.length) throw new ReconciliationRejectedError('Inherited concern requires unique thought citations');
          const thoughts = recorded.flatMap(trajectory => trajectory.thoughts).filter(thought => selectedIds.has(thought.eventId));
          const unique = [...new Map(thoughts.map(thought => [thought.eventId, thought])).values()];
          if (unique.length !== selectedIds.size || unique.some(thought => !suppliedTrajectories.some(trajectory =>
            predictionIds.includes(trajectory.predictionId) && trajectory.thoughts.some(selected => selected.eventId === thought.eventId
              && JSON.stringify(selected) === JSON.stringify(thought)))))
            throw new ReconciliationRejectedError('Inherited concern requires supplied recorded source-investigation thoughts');
          if (!recorded.some(trajectory => {
            const origin = trajectory.thoughts.find(thought => thought.association === 'origin' && selectedIds.has(thought.eventId));
            return origin && trajectory.thoughts.some(thought => selectedIds.has(thought.eventId) && thought.sequence > origin.sequence);
          }))
            throw new ReconciliationRejectedError('Inherited concern requires originating and later expressed cognition');
          concernInheritance = { predictionIds, thoughts: unique.sort((a, b) => a.sequence - b.sequence),
            continuityReason: inherited.continuityReason, distinctnessReason: inherited.distinctnessReason };
        }
        if (operation.operation === 'ASSESS_HYPOTHESIS' && source.temporary)
          throw new ReconciliationRejectedError('Temporary scaffolds require explicit institutionalization to become durable');
        if (operation.operation === 'ASSESS_HYPOTHESIS') {
          if (!source.development) throw new ReconciliationRejectedError('Hypothesis assessment requires recorded developmental provenance');
        }
        const association = 'association' in operation ? operation.association : 'dependencyId' in operation
          ? { kind: 'disposition' as const, dispositionId: operation.dependencyId, effect: 'contribute' as const } : null;
        const associations = activationAssociations(source);
        const matches = (entry: typeof association) => entry?.kind === association?.kind && entry?.effect === association?.effect
          && (entry?.kind === 'keyword' && association?.kind === 'keyword' ? entry.keyword === association.keyword
            : entry?.kind === 'disposition' && association?.kind === 'disposition' && entry.dispositionId === association.dispositionId);
        if (operation.operation === 'REMOVE_ASSOCIATION' && !associations.some(matches)) throw new ReconciliationRejectedError('Cannot remove an absent activation association');
        newExperienceIds = reconciliationOutcomeEvidence(store, operation, sources, memories, observations);
        if (operation.operation === 'ADD_ASSOCIATION' && associations.some(matches)) throw new ReconciliationRejectedError('Activation association already exists');
        if (operation.operation === 'REMOVE_DEPENDENCY' && !source.prerequisites.includes(operation.dependencyId))
          throw new ReconciliationRejectedError('Cannot remove an absent disposition dependency');
        if (operation.operation === 'ADD_DEPENDENCY' && source.prerequisites.includes(operation.dependencyId))
          throw new ReconciliationRejectedError('Dependency already exists; preserve the structure without another semantic version');
      } catch (error) {
        if (!(error instanceof ReconciliationRejectedError)) throw error;
        inspection.emit(agentId, null, 'disposition.reconciliation_rejected', { operation, reason: error.message });
        continue;
      }
      const sources = operation.sourceDispositionIds.map(source => store.get('disposition', source));
      const source = sources[0]!;
      const association = 'association' in operation ? operation.association : 'dependencyId' in operation
        ? { kind: 'disposition' as const, dispositionId: operation.dependencyId, effect: 'contribute' as const } : null;
      const associations = activationAssociations(source);
      const matches = (entry: typeof association) => entry?.kind === association?.kind && entry?.effect === association?.effect
        && (entry?.kind === 'keyword' && association?.kind === 'keyword' ? entry.keyword === association.keyword
          : entry?.kind === 'disposition' && association?.kind === 'disposition' && entry.dispositionId === association.dispositionId);
      const base = source.development ?? { retrievalIntent: source.concern, contextCues: [], internalStateCues: [],
        status: 'provisional' as const, confidence: 'Unassessed developmental status', lineage: [], previousVersion: null,
        evidence: [], createdAt: now() };
      const drafts = 'children' in operation ? operation.children : 'draft' in operation ? [operation.draft] : [null];
      for (const draft of drafts) {
        const creates = operation.operation === 'SPLIT' || operation.operation === 'MERGE' || operation.operation === 'INSTITUTIONALIZE';
        const relationship = operation.operation === 'INSTITUTIONALIZE' ? 'institutionalized_from' : operation.operation === 'SPLIT' ? 'split_from' : operation.operation === 'MERGE' ? 'merged_from'
          : operation.operation === 'GENERALIZE' ? 'generalized_from' : 'specialized_from';
        const evidence = operation.judgments.map(judgment => {
          const memory = memories.find(memory => memory.id === judgment.memoryId)!;
          const cycle = store.cycle(memory.createdCycle);
          return { memoryId: memory.id, predictionId: memory.predictionId, cycleId: cycle.id, threadId: cycle.threadId ?? null,
            confidenceEffect: operation.confidenceEffect ?? 'strengthen',
            outcomeSources: (judgment.outcomeEvidence ?? []).flatMap(outcome => {
              const episode = memories.find(memory => memory.id === outcome.memoryId)!;
              return memoryEvidenceLineage(store, episode).sources.filter(source => outcome.sourceIds.includes(source.sourceId))
                .map(source => ({ memoryId: episode.id, version: episode.version, sourceId: source.sourceId, experienceId: source.experienceId, firstRecordedAt: source.firstRecordedAt }));
            }),
            dispositionVersion: creates ? null : source.version, relationship: 'unclassified' as const,
            retrievalUsefulness: judgment.usefulness, reconciliation: 'reconciled' as const, reason: judgment.reason };
        });
        const priorEvidence = base.evidence.map(item => operation.memoryIds.includes(item.memoryId)
          ? { ...item, reconciliation: 'reconciled' as const } : item);
        const next = DispositionSchema.parse({ ...source, id: creates ? id('disposition') : source.id,
          version: creates ? 1 : source.version + 1,
          ...(draft ? { name: draft.name, concern: draft.concern, scope: draft.scope,
            cues: draft.activationCues.map(cue => cue.text), prerequisites: draft.prerequisites } : {}),
          prerequisites: operation.operation === 'ADD_DEPENDENCY' ? [...new Set([...source.prerequisites, operation.dependencyId])]
            : operation.operation === 'REMOVE_DEPENDENCY' ? source.prerequisites.filter(parent => parent !== operation.dependencyId)
            : draft?.prerequisites ?? source.prerequisites,
          activationAssociations: operation.operation === 'ADD_ASSOCIATION' || operation.operation === 'ADD_DEPENDENCY'
            ? [...associations, association!]
            : operation.operation === 'REMOVE_ASSOCIATION' || operation.operation === 'REMOVE_DEPENDENCY'
              ? associations.filter(entry => !matches(entry))
              : draft ? draft.activationAssociations ?? draft.prerequisites.map(dispositionId => ({ kind: 'disposition', dispositionId, effect: 'contribute' })) : source.activationAssociations,
          memoryIds: [...new Set([...sources.flatMap(source => source.memoryIds), ...operation.memoryIds])],
          ...(operation.operation === 'INSTITUTIONALIZE' ? { temporary: false, scaffold: undefined } : {}),
          active: operation.operation !== 'ARCHIVE' && (operation.operation === 'INSTITUTIONALIZE' || !source.temporary || source.active),
          development: { ...base,
            usedExperienceIds: [...new Set([...consumedExperienceIds(store, sources), ...newExperienceIds])],
            ...(draft ? { evidenceBoundaryAt: now() } : {}),
            ...(operation.operation === 'INSTITUTIONALIZE' ? { learnedConcern: operation.inheritedConcern
              ? { concern: operation.inheritedConcern.concern, meaning: operation.inheritedConcern.meaning } : undefined,
              concernInheritance } : {}), ...(draft ? { retrievalIntent: draft.retrievalIntent, cueEvidence: cueEvidence(draft), contextCues: draft.contextCues.map(cue => cue.text),
            internalStateCues: draft.internalStateCues.map(cue => cue.text), confidence: draft.confidence, status: 'provisional' } : {}),
            ...(operation.operation === 'ARCHIVE' ? { status: 'archived' } : {}),
            ...(operation.operation === 'ASSESS_HYPOTHESIS' ? { status: operation.status, confidence: operation.confidence } : {}),
            previousVersion: creates ? null : source.version,
            lineage: draft ? [...base.lineage, ...sources.map(source => ({ dispositionId: source.id, version: source.version, relationship }))] : base.lineage,
            evidence: creates ? evidence : [...priorEvidence, ...evidence], createdAt: creates ? now() : base.createdAt } });
        store.save('disposition', next, creates ? 0 : source.version,
          { origin: 'consolidation', reason: operation.reason, sourceIds: [...operation.sourceDispositionIds, ...operation.memoryIds] });
        inspection.emit(agentId, null, 'disposition.learned', next);
        committed.push(next);
      }
      if (newExperienceIds.length && ['SPLIT', 'MERGE', 'INSTITUTIONALIZE'].includes(operation.operation)) for (const original of sources) {
        const current = store.get('disposition', original.id);
        const development = current.development ?? { ...base, previousVersion: null };
        store.save('disposition', { ...current, version: current.version + 1, development: { ...development,
          previousVersion: current.version, usedExperienceIds: [...new Set([...(development.usedExperienceIds ?? []), ...newExperienceIds])] } }, current.version,
        { origin: 'consolidation', reason: 'Record independently used outcome sources without erasing temporary or parent history', sourceIds: operation.memoryIds });
      }
    }
    return committed;
  });
}
