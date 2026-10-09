import { ComponentDraftSchema } from '../../providers/src/component-authoring.js';
import { z } from 'zod';
import { DispositionDraftSchema, DispositionSchema, MemorySchema, PredictionSchema, Text, Id, id } from '../../core/src/domain.js';
import type { Application } from './application.js';
import { renderTaskPrompt } from '../../providers/src/prompts.js';
import { promptResolver } from './prompt-settings.js';

export async function draftComponent(app: Application, agentId: string, body: unknown) {
  const input = z.strictObject({ kind: z.enum(['memory', 'prediction']), description: Text }).parse(body);
  app.store.get('agent', agentId);
  return app.researcherAuthoringProvider(agentId).author(ComponentDraftSchema,
    renderTaskPrompt(agentId, 'researcher_authoring', input, promptResolver(app.store)));
}
export function createComponent(app: Application, agentId: string, kind: 'disposition' | 'memory' | 'prediction', body: unknown) {
  return app.store.transaction(() => {
    app.store.get('agent', agentId);
    const metadata = { origin: 'researcher_edit' as const, reason: `Researcher created ${kind}`, sourceIds: [] as string[] };
    const version = { id: id(kind), agentId, version: 1, schemaVersion: 1 as const };
    if (kind === 'disposition') {
      const input = DispositionDraftSchema.parse(body);
      for (const parent of input.prerequisites) if (app.store.get('disposition', parent).agentId !== agentId) throw new Error('Disposition prerequisite belongs to another Agent');
      if (input.memoryIds.length || input.sourcePredictionId || input.temporary) throw new Error('Manual dispositions cannot invent learning evidence or prediction attention');
      const result = DispositionSchema.parse({ ...input, ...version, active: true });
      app.store.save('disposition', result, 0, metadata); return result;
    }
    const common = { partId: Id, createdCycle: Id, context: z.array(Text).max(kind === 'prediction' ? 12 : 30) };
    const input = kind === 'memory'
      ? z.strictObject({ ...common, content: Text, gist: Text }).parse(body)
      : z.strictObject({ ...common, expectation: Text, horizon: Text, confidence: z.number().min(0).max(1) }).parse(body);
    const part = app.store.get('part', input.partId);
    if (part.agentId !== agentId) throw new Error('Owning Part belongs to another Agent');
    const cycle = app.store.cycles(agentId).find(item => item.id === input.createdCycle);
    if (!cycle || cycle.status === 'running') throw new Error('Choose an existing completed or failed Agent cycle for provenance');
    if (kind === 'memory' && 'content' in input) {
      const result = MemorySchema.parse({ ...input, ...version, ancestorIds: [], predictionId: null });
      app.store.save('memory', result, 0, { ...metadata, sourceIds: [cycle.id] }); return result;
    }
    if (!('expectation' in input)) throw new Error('Invalid prediction draft');
    if (app.store.cycles(agentId).some(item => item.status === 'running')) throw new Error('Wait for ongoing cognition to finish before creating a prediction');
    if (part.instance && (cycle.threadId ?? null) !== part.instance.threadId) throw new Error('Prediction provenance must belong to the owning Part’s thread');
    if (app.store.list('prediction', agentId).some(item => item.partId === part.id && item.status === 'open')) throw new Error('This Part already has an open prediction');
    const result = PredictionSchema.parse({ ...version, partId: part.id, createdCycle: cycle.id,
      expectation: input.expectation, horizon: input.horizon, confidence: input.confidence,
      capsule: { interpretation: input.expectation, details: input.context, entities: [], activation: 0, spike: 0, sourceIds: [cycle.id] },
      evaluateAfterCycle: null, status: 'open', evaluation: null, memoryId: null });
    app.store.save('prediction', result, 0, { ...metadata, sourceIds: [cycle.id] }); return result;
  });
}
