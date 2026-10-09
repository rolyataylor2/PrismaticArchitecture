import { id, now, freeze, PartDraftSchema, type Part, type Prediction, type Memory } from '../../core/src/domain.js';
import type { Application } from './application.js';

export const experimentNames = ['activation-stability', 'stickiness', 'prediction-correction', 'memory-formation', 'sleep-consolidation', 'therapy'] as const;
export type ExperimentName = typeof experimentNames[number];
export type ExperimentStage = { name: string; cycleId: string | null; parts: Part[]; predictions: Prediction[]; memories: Memory[]; action: string | null };
export type ExperimentRun = { id: string; name: ExperimentName; agentId: string; createdAt: string; status: 'running' | 'completed' | 'failed';
  stages: ExperimentStage[]; observations: string[]; error: string | null };

/** Research harness may inspect psychology. The external therapeutic participant only sends ordinary utterances. */
export async function runExperiment(app: Application, name: ExperimentName): Promise<ExperimentRun> {
  const agent = app.createAgent(`${name} persistent experiment`, 'persistent');
  const run: ExperimentRun = { id: id('experiment'), name, agentId: agent.id, createdAt: now(), status: 'running', stages: [], observations: [], error: null };
  const snapshot = (name: string, cycleId: string | null = null, action: string | null = null): void => {
    run.stages.push({ name, cycleId, action, parts: app.store.list('part', agent.id),
      predictions: app.store.list('prediction', agent.id), memories: app.store.list('memory', agent.id) });
    app.store.saveExperiment(run);
  };
  const turn = async (stage: string, text: string, source = 'Bill'): Promise<void> => {
    const result = await app.message(agent.id, text, source);
    snapshot(stage, result.cycle.id, result.executions.map(execution => execution.speech?.text ?? execution.action.text).join('\n\n') || null);
  };
  try {
    snapshot('baseline state');
    if (name === 'stickiness') {
      const part = app.store.list('part', agent.id).find(p => ['Task Completion', 'Need To Complete My Report'].includes(p.name))!;
      app.runtime.mutations.patch(part.id, part.version, { stickiness: { retained: true, unresolved: true, concern: 'Finish the report' } },
        { origin: 'researcher_edit', reason: 'Experimental stickiness condition', sourceIds: [run.id] });
      await turn('task context', 'The report deadline requires results and conclusion.', 'colleague');
      await turn('interruption', 'A friend asks a personal question about vulnerability.', 'friend');
      run.observations.push('Candidate reasons and scores expose whether unresolved stickiness retained consideration during interruption.');
    } else if (name === 'activation-stability') {
      await turn('original population', 'I am uncertain about a personal conversation.');
      const original = app.store.events(agent.id).filter(e => e.type === 'activation.scored').at(-1)!;
      const newPart = app.runtime.mutations.create(agent.id, PartDraftSchema.strip().parse({ ...app.store.list('part', agent.id)[0]!, name: 'Astronomy context', mission: 'Recognize constellations',
        beliefs: ['I recognize stars.'], triggers: ['astronomy stars telescope'], strategies: [], provenance: ['experimental perturbation'], lineage: [], associations: [] },
      ), { origin: 'researcher_edit', reason: 'Irrelevant candidate perturbation', sourceIds: [run.id] });
      const world = app.store.world(app.store.cycles(agent.id)[0]!.worldId);
      const base = app.store.list('part', agent.id).filter(p => p.id !== newPart.id);
      const baseline = await app.providers.decisions.score(freeze({ world, candidates: base }));
      const perturbed = await app.providers.decisions.score(freeze({ world, candidates: [...base, newPart] }));
      snapshot('candidate-set perturbation with identical WorldState');
      run.observations.push(`Shared WorldState ${world.id}; original cycle event ${original.id}. Independent score differences: ${JSON.stringify(baseline.map(a => ({ partId: a.partId, before: a.score, after: perturbed.find(b => b.partId === a.partId)?.score })))}`);
    } else {
      await turn('baseline prediction', 'I am afraid that sharing vulnerability and uncertainty in a personal conversation will lead to rejection.');
      await turn('ordinary therapeutic interaction', 'Thank you for sharing. I respect you, and I am glad you told me.');
      await turn('immediate retest', 'I am uncertain about sharing another personal vulnerability.');
      await turn('later response', 'Thank you for sharing again. I appreciate you.');
      if (name === 'sleep-consolidation' || name === 'therapy') {
        await app.consolidation.run(agent.id); snapshot('after sleep');
        await turn('same-context retest', 'I am uncertain about another personal vulnerability.');
        await turn('same-context response', 'I respect you. Thank you for sharing.');
        await turn('novel analogous context', 'A new friend asks about a personal uncertainty and vulnerability.', 'Alex');
        await turn('novel response', 'Thank you for sharing. I appreciate you.', 'Alex');
        await turn('durability after unrelated experience', 'The report has results and the deadline is tomorrow.', 'colleague');
        await turn('delayed retest', 'I am uncertain about sharing a personal vulnerability again.', 'Alex');
      }
      run.observations.push('Inspect expectation wording, causal attribution, persistent memories, version origins and later behavior. Mock mode demonstrates measurable fixture development, not therapeutic efficacy.');
    }
    run.status = 'completed'; app.store.saveExperiment(run); return run;
  } catch (error) {
    run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); app.store.saveExperiment(run); throw error;
  }
}
