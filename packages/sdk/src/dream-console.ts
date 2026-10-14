import type { Application } from './application.js';
import type { CognitiveEvent } from '../../core/src/contracts.js';
import { listSimulationRuns } from './simulation-tests.js';

export type DreamConsoleLine = { sequence: number; at: string; eventId: string; stage: string | null; task: string | null;
  level: 'info' | 'warning' | 'error'; message: string };
const taskName = (task: string) => task.replaceAll('_', ' ');

/** Read-only run evidence. Provider request bodies and private context never enter this projection. */
export function dreamConsole(app: Application, runId: string, after = 0) {
  const run = listSimulationRuns(app).find(record => record.id === runId);
  if (!run) throw new Error('Unknown simulation run');
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid console cursor');
  const cycles = new Set(app.store.cycles(run.agentId).filter(cycle => cycle.threadId === run.id).map(cycle => cycle.id));
  const recorded = app.store.events(run.agentId).filter(event => {
    if (event.type.startsWith('simulation.')) return 'runId' in event.payload && event.payload.runId === run.id;
    const scope = event.researchScope ?? ('researchScope' in event.payload ? event.payload.researchScope : undefined);
    if (scope) return scope.runId === run.id;
    return !!event.cycleId && cycles.has(event.cycleId);
  });
  const pending = new Map<string, string>();
  let stage: string | null = null;
  const lines: DreamConsoleLine[] = [];
  for (const event of recorded) {
    if (event.type === 'simulation.stage_started') { stage = event.payload.name; pending.clear(); }
    if (event.type === 'provider.operation') {
      if (event.payload.phase === 'started') pending.set(event.payload.operationId, taskName(event.payload.task));
      else pending.delete(event.payload.operationId);
    }
    const line = describe(event);
    if (line && event.sequence > after) lines.push({ sequence: event.sequence, at: event.at, eventId: event.id, stage, ...line });
    if (event.type === 'simulation.stage_completed' || event.type === 'simulation.stage_failed') pending.clear();
  }
  const page = lines.slice(0, 200);
  return { runId, title: run.title, status: run.status, completedStages: run.stages.length, totalStages: run.totalSteps,
    pauseRequested: run.pauseRequested ?? false, currentStage: run.currentStep,
    currentTask: run.status === 'running' ? [...new Set(pending.values())].join(' · ') || run.currentStep : run.currentStep,
    error: run.error, lines: page, cursor: page.at(-1)?.sequence ?? after, hasMore: lines.length > page.length };
}
export type DreamConsole = ReturnType<typeof dreamConsole>;

function describe(event: CognitiveEvent): Pick<DreamConsoleLine, 'task' | 'level' | 'message'> | null {
  let task: string | null = null; let level: DreamConsoleLine['level'] = 'info'; let message: string;
  switch (event.type) {
    case 'simulation.control': message = event.payload.reason; break;
    case 'simulation.stage_started': message = `Stage ${event.payload.stageIndex + 1}: ${event.payload.name} started`; break;
    case 'simulation.stage_completed': message = `Stage ${event.payload.stageIndex + 1} completed`; break;
    case 'simulation.stage_failed': level = 'error'; message = `Stage ${event.payload.stageIndex + 1} stopped before completion`; break;
    case 'provider.operation': {
      const p = event.payload; task = taskName(p.task); level = p.phase === 'failed' ? 'error' : 'info';
      message = `${task}: ${p.phase === 'started' ? 'started' : p.phase === 'returned' ? 'model response received' : 'failed'} (${p.provider})${p.error ? ` — ${p.error.message}` : ''}`; break;
    }
    case 'runtime.validation': message = `${taskName(event.payload.task)}: ${event.payload.status} output validation`; break;
    case 'worldstate.frozen': message = 'Shared experience snapshot frozen'; break;
    case 'construction.judgment': task = taskName(event.payload.input.task); message = `${task}: ${event.payload.scores.length} independent scores recorded`; break;
    case 'part.thought': message = `${event.payload.partSnapshot.name}: ${event.payload.output.thought}`; break;
    case 'prediction.outcome_checked': message = `Prediction evidence checked: ${event.payload.outcome}`; break;
    case 'memory.episodic_created': message = `Subjective episode recorded: ${event.payload.gist}`; break;
    case 'memory.reconsolidated': message = `Subjective memory revised (version ${event.payload.version})`; break;
    case 'memory.relevance_scored': message = `${event.payload.selectedMemoryIds.length} subjective memories selected for ${event.payload.purpose}`; break;
    case 'self.choice': message = 'Self selection recorded'; break;
    case 'cycle.completed': message = 'Cognitive cycle completed'; break;
    case 'consolidation.started': message = 'Rest: offline consolidation started'; break;
    case 'consolidation.completed': message = 'Rest: offline consolidation completed'; break;
    case 'disposition.reconciliation_rejected': level = 'warning'; message = `${event.payload.operation.operation} blocked; continuing: ${event.payload.reason}`; break;
    case 'disposition.learned': message = `Disposition development recorded: ${event.payload.name} (version ${event.payload.version})`; break;
    case 'infrastructure.error': level = 'error'; message = `${event.payload.stage}: ${event.payload.message}`; break;
    default: return null;
  }
  return { task, level, message };
}
