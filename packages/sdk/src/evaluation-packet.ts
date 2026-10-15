import { createHash } from 'node:crypto';
import type { SimulationRun } from './simulation-tests.js';
import type { SimulationAssessment } from './simulation-evaluator.js';

/** Only recorded involvement or change makes inherited predictions relevant to this run. */
export function evaluationPredictionIds(run: SimulationRun): Set<string> {
  const cycles = new Set(run.stages.flatMap(stage => [stage.cycleId, ...(stage.concurrentCycleIds ?? [])]).filter(Boolean));
  const baseline = new Map(run.dream?.before.predictions.map(prediction => [prediction.id, JSON.stringify(prediction)]) ?? []);
  const ids = new Set(run.stages.flatMap(stage => stage.predictionChecks?.map(check => check.predictionId) ?? []));
  for (const stage of run.stages) {
    for (const prediction of stage.predictions) {
      if (!run.dream || cycles.has(prediction.createdCycle) || JSON.stringify(prediction) !== baseline.get(prediction.id)) ids.add(prediction.id);
    }
    for (const prediction of stage.experienced?.prospective ?? []) ids.add(prediction.predictionId);
  }
  return ids;
}

export type EvaluationPacket = {
  version: string; instructions: string; testId: string; evidenceBasis: string; providers: SimulationRun['providers'];
  stages: Record<string, unknown>[];
  objects: { kind: string; value: unknown; sourceReferences: string[]; hash: string }[];
  dream: { keepChanges: boolean; baseline: Record<string, unknown[]>; terminal: Record<string, unknown[]> } | null;
  suppliedReferences: string[]; omittedObjects: Record<string, number>; supplementalEvidence: string[];
};

/** Exact object versions are interned by content, never summarized or overwritten. */
export function evaluationPacket(run: SimulationRun, evidence: SimulationAssessment['evidence'], predictionScope?: Set<string>): EvaluationPacket {
  const predictions = predictionScope ?? evaluationPredictionIds(run);
  const cycles = new Set(evidence.stages.flatMap(stage => [stage.cycleId, ...(stage.concurrentCycleIds ?? [])]).filter(Boolean));
  const memories = new Set<string>(); const dispositions = new Set<string>(); const parts = new Set<string>();
  for (const stage of evidence.stages) {
    for (const thought of stage.thoughts) { parts.add(thought.partId); thought.dispositionIds.forEach(id => dispositions.add(id)); }
    for (const recall of stage.recalls) { recall.memoryIds.forEach(id => memories.add(id)); recall.dispositionIds.forEach(id => dispositions.add(id)); }
    stage.activations.forEach(activation => dispositions.add(activation.dispositionId));
    for (const prediction of stage.predictions.filter(p => predictions.has(p.id))) { if (prediction.memoryId) memories.add(prediction.memoryId); if (prediction.partId) parts.add(prediction.partId); }
  }
  for (const kind of ['memories', 'dispositions'] as const) {
    const baseline = new Map(run.dream?.before[kind].map(item => [item.id, JSON.stringify(item)]) ?? []);
    for (const stage of evidence.stages) for (const item of stage[kind]) {
      if (!run.dream || JSON.stringify(item) !== baseline.get(item.id) || (kind === 'memories' && 'createdCycle' in item && cycles.has(item.createdCycle)))
        (kind === 'memories' ? memories : dispositions).add(item.id);
    }
  }
  // Structural source lineage and memory evidence remain inspectable, including counterevidence.
  for (const stage of evidence.stages) for (const disposition of stage.dispositions.filter(d => dispositions.has(d.id))) {
    disposition.memoryIds.forEach(id => memories.add(id));
    disposition.development?.evidence.forEach(item => memories.add(item.memoryId));
  }
  const selected = { predictions, memories, dispositions, parts };
  const packet: EvaluationPacket = { version: 'evaluation-packet-v1',
    instructions: 'Stages contain exact recorded products and references to deduplicated object versions. objects entries contain exact values and their original frozen-source citation paths. Cite sourceReferences or suppliedReferences, NOT /objects paths. Unused inherited objects and duplicate dream snapshots are excluded; omission counts are not missing cognitive observations. No psychological meaning is synthesized by the packager.',
    testId: run.testId, evidenceBasis: run.evidenceBasis, providers: evidence.providers, stages: [], objects: [],
    dream: run.dream ? { keepChanges: run.dream.keepChanges, baseline: {}, terminal: {} } : null,
    suppliedReferences: [], omittedObjects: {}, supplementalEvidence: evidence.supplementalEvidence };
  const interned = new Map<string, number>();
  const intern = (kind: string, value: unknown, reference: string) => {
    const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex'); const key = `${kind}:${hash}`;
    let index = interned.get(key);
    if (index === undefined) { index = packet.objects.length; interned.set(key, index); packet.objects.push({ kind, value: structuredClone(value), sourceReferences: [], hash }); }
    packet.objects[index]!.sourceReferences.push(reference); packet.suppliedReferences.push(reference);
    return { object: index, sourceReference: reference };
  };
  for (const [index, stage] of evidence.stages.entries()) {
    const compact: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stage)) {
      if (key in selected) {
        const kind = key as keyof typeof selected;
        compact[key] = (stage[kind] as { id: string }[]).flatMap((item, itemIndex) => {
          if (selected[kind].has(item.id)) return [intern(kind, item, `/stages/${index}/${key}/${itemIndex}`)];
          packet.omittedObjects[kind] = (packet.omittedObjects[kind] ?? 0) + 1; return [];
        });
        if ((compact[key] as unknown[]).length === stage[kind].length) packet.suppliedReferences.push(`/stages/${index}/${key}`);
      } else { compact[key] = value; packet.suppliedReferences.push(`/stages/${index}/${key}`); }
    }
    packet.stages.push(compact);
  }
  if (packet.dream && evidence.dream) {
    for (const [snapshotName, target] of [['before', packet.dream.baseline], ['after', packet.dream.terminal]] as const) {
      const snapshot = evidence.dream[snapshotName]; if (!snapshot) continue;
      for (const kind of ['parts', 'memories', 'predictions', 'dispositions'] as const)
        target[kind] = snapshot[kind].flatMap((item, index) => selected[kind].has(item.id) ? [intern(kind, item, `/dream/${snapshotName}/${kind}/${index}`)] : []);
    }
  }
  return packet;
}

export function packetIncludesReference(packet: EvaluationPacket, reference: string): boolean {
  return packet.suppliedReferences.some(prefix => reference === prefix || reference.startsWith(prefix + '/'));
}
