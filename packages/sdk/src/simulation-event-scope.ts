import type { CognitiveEvent } from '../../core/src/contracts.js';
import type { ResearchStageReference } from '../../core/src/provider-operation.js';
/** Scope supplied by the invoking SDK code; no chronological or psychological attribution. */
export function simulationEventScope(event: CognitiveEvent): ResearchStageReference | null {
  if (event.type === 'provider.operation' || event.type === 'provider.usage') return event.payload.researchScope ?? null;
  if (event.type === 'simulation.stage_started') return { runId: event.payload.runId, stageId: event.payload.stageId, stageIndex: event.payload.stageIndex, startEventId: event.id };
  if (event.type === 'simulation.stage_completed' || event.type === 'simulation.stage_failed') return event.payload;
  return null;
}
