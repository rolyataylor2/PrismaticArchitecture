import type { SimulationRun } from './simulation-tests.js';
export type KnowledgeEntry = { kind: 'scenario_input' | 'reported_utterance' | 'external_observation' | 'external_action' | 'part_interpretation' | 'subjective_memory' | 'remembered_interpretation' | 'imagined_future' | 'self_posture';
  text: string; source: string; partId: string | null; references: string[]; provenanceIds: string[]; limitation: string };
/** Frozen source categories, never NLP truth inference or a current-memory lookup. */
export function simulationKnowledge(run: SimulationRun) {
  return run.stages.map((stage, stageIndex) => {
    const prefix = `/stages/${stageIndex}`; const entries: KnowledgeEntry[] = [];
    if (stage.text) entries.push({ kind: 'scenario_input', text: stage.text, source: 'Researcher-authored scenario delivery', partId: null,
      references: [prefix + '/text'], provenanceIds: [], limitation: 'Authored external experience; embedded testimony is not automatically verified world truth.' });
    for (const [index, fact] of (stage.observations ?? []).entries()) entries.push({ kind: fact.kind === 'says' ? 'reported_utterance' : fact.kind === 'does' ? 'external_action' : 'external_observation',
      text: fact.text, source: fact.source, partId: null, references: [`${prefix}/observations/${index}`],
      provenanceIds: [fact.referenceId, fact.originCycleId].filter((id): id is string => !!id),
      limitation: fact.kind === 'says' ? 'Records an attributed utterance, not independent verification of its content or nested testimony.' : 'A source-attributed factual record; inspect authoritative external evidence before causal or truth claims.' });
    for (const [index, thought] of stage.thoughts.entries()) entries.push({ kind: 'part_interpretation', text: thought.interpretation ?? thought.thought,
      source: thought.name, partId: thought.partId, references: [`${prefix}/thoughts/${index}`], provenanceIds: thought.dispositionIds,
      limitation: 'An expressed bounded perspective, not objective reality; biased or fantastical meaning may be intentional.' });
    for (const [recallIndex, recall] of stage.recalls.entries()) for (const memoryId of recall.memoryIds) {
      const index = stage.memories.findIndex(memory => memory.id === memoryId); const memory = stage.memories[index];
      entries.push({ kind: 'subjective_memory', text: memory?.content ?? `No frozen content for recalled memory ${memoryId}`, source: memory ? `Subjective episode ${memory.id} · version ${memory.version}` : 'Missing recalled-memory snapshot',
        partId: recall.partId, references: [`${prefix}/recalls/${recallIndex}`, ...(memory ? [`${prefix}/memories/${index}`] : [])],
        provenanceIds: memory ? [memory.id, memory.createdCycle, ...memory.ancestorIds, ...(memory.predictionId ? [memory.predictionId] : [])] : [memoryId],
        limitation: 'Recorded recall does not establish accuracy or usefulness. Ancestor IDs preserve lineage and do not grant recall access.' });
    }
    for (const [index, item] of (stage.experienced?.rememberedInterpretations ?? []).entries()) entries.push({ kind: 'remembered_interpretation', text: item.interpretation,
      source: 'Attributed remembered interpretation in experienced snapshot', partId: item.partId, references: [`${prefix}/experienced/rememberedInterpretations/${index}`], provenanceIds: [item.cycleId],
      limitation: 'Mediated expressed meaning from a prior cycle, not transparent access to another Part’s private memory or authoritative history.' });
    for (const [index, item] of (stage.experienced?.prospective ?? []).entries()) entries.push({ kind: 'imagined_future', text: item.expectation,
      source: `Prospective prediction ${item.predictionId} · version ${item.version}`, partId: item.partId, references: [`${prefix}/experienced/prospective/${index}`], provenanceIds: [item.predictionId, item.createdCycle],
      limitation: 'Attributed prospective alternative available in this captured experience, not an event that occurred or calibrated probability.' });
    for (const [index, item] of (stage.experienced?.posture ?? []).entries()) entries.push({ kind: 'self_posture', text: item.interpretation,
      source: item.name, partId: item.partId, references: [`${prefix}/experienced/posture/${index}`], provenanceIds: [],
      limitation: 'Mediated selected stance; selection does not verify its worldview or rewrite the underlying perspective.' });
    return { stageIndex, cycleId: stage.cycleId, entries, gaps: [
      ...(stage.observations === undefined ? ['Historical attributed fact snapshot is unavailable.'] : []),
      ...(stage.experienced === undefined ? ['Historical prospective/remembered/posture snapshot is unavailable; current state is not substituted.'] : []),
      'Source categories describe preserved record ownership. Semantic credibility and nested testimony remain research questions.',
    ] };
  });
}
