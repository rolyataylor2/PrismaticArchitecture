import { factualWorld } from '../../core/src/experienced.js';
import { affectSelectionContext, projectAffectSelectionContext } from '../../core/src/affect.js';
import { affectChoices } from '../../core/src/affect-scoring.js';
import { referencesMemory } from '../../core/src/domain.js';
import { memoryEntries } from '../../core/src/memory-recall.js';
import { speechContext } from '../../core/src/speech.js';
import { effectivePrimitive, primitiveSensitivities } from '../../core/src/primitives.js';
import { identityAnswerGuidance, identityQuestionLibrary } from './identity-questions.js';
import { randomInt } from 'node:crypto';
import type { Store } from '../../core/src/contracts.js';
import { partContext, selfContext, selfChoices } from '../../core/src/context.js';
import { type PromptTask } from '../../core/src/domain.js';
import { renderTaskPrompt, validatePromptTemplate } from '../../providers/src/prompts.js';

function sample<T>(items: T[], missing: string): T {
  if (!items.length) throw new Error(missing);
  return items[randomInt(items.length)]!;
}

/** Read-only researcher preview; never sends a request to a cognitive provider. */
export function previewPrompt(store: Store, agentId: string, task: PromptTask, text: string) {
  store.get('agent', agentId); validatePromptTemplate(text);
  if (task === 'affect_selection' || task === 'affect_inquiry') {
    const type = task === 'affect_selection' ? 'self.affect_selection_started' : 'self.affect_inquiry_started';
    const recorded = store.eventsByType(agentId, [type]).flatMap(event =>
      event.type === 'self.affect_selection_started' || event.type === 'self.affect_inquiry_started' ? [event] : []).at(-1);
    const input = recorded ? projectAffectSelectionContext(recorded.payload)
      : affectSelectionContext({ identity: store.get('identity', agentId), contributions: [], proposals: [] });
    const context = task === 'affect_selection' ? { ...input, choices: affectChoices(input), selectedBefore: [] } : input;
    return { text: renderTaskPrompt(agentId, task, context, () => text), worldId: null, cycleId: recorded?.cycleId ?? null,
      capturedAt: recorded?.at ?? null, partName: null,
      note: recorded ? 'Recorded world-blind affect input; no activation, experienced affect, raw memories or WorldState.'
        : 'Empty world-blind example using current Identity; no proposal or focus is fabricated.' };
  }
  if (task === 'focused_bid_revision') {
    const recorded = store.eventsByType(agentId, ['part.focused_bid_revision_started']).flatMap(event =>
      event.type === 'part.focused_bid_revision_started' ? [event] : []).at(-1);
    if (!recorded) throw new Error('No recorded focused bid revision yet. Run cognition with a selected affect proposal first.');
    return { text: renderTaskPrompt(agentId, task, recorded.payload, () => text), worldId: recorded.payload.world.id,
      cycleId: recorded.cycleId, capturedAt: recorded.at, partName: recorded.payload.part.name,
      note: 'Recorded owning-Part revision against the original immutable snapshot; not a new formation or memory request.' };
  }
  if (task === 'executive_skill_consolidation') {
    const record = store.experiments().filter(run => run.kind === 'executive_consolidation' && run.agentId === agentId).at(-1) as import('./procedure-consolidation.js').ProcedureConsolidationRun | undefined;
    return { text: renderTaskPrompt(agentId, task, record?.input ?? { agentId, episodes: [] }, () => text), worldId: null, cycleId: null,
      capturedAt: record?.createdAt ?? null, partName: null, note: record ? 'Recorded external procedural inference; no Self, raw WorldState or private Part state.' : 'Empty procedural example; consolidate ended operational experience to inspect recorded input.' };
  }
  if (task === 'simulation_evaluation') {
    const recorded = store.experiments().filter(run => run.kind === 'simulation_test').flatMap(run => (run as unknown as import('./simulation-tests.js').SimulationRun).assessments ?? [])
      .filter(assessment => assessment.evaluatorAgentId === agentId).at(-1);
    const context = recorded ? { rubric: recorded.rubric, evidence: recorded.packet ?? recorded.evidence } : { rubric: { version: 'preview', criteria: [] }, evidence: { stages: [] } };
    return { text: renderTaskPrompt(agentId, task, context, () => text), worldId: null, cycleId: null, capturedAt: recorded?.createdAt ?? null, partName: null,
      note: recorded ? 'Recorded researcher evaluator input; never supplied to Agent cognition.' : 'Empty researcher evaluator example; run or assess a simulation to preview recorded evidence.' };
  }
  if (task === 'researcher_authoring') return { text: renderTaskPrompt(agentId, task, { kind: 'memory', description: 'I felt encouraged when my question was welcomed.' }, () => text), worldId: null, cycleId: null, capturedAt: null, partName: null, note: 'Example researcher authoring input; no cognitive state accessed.' };
  if (task === 'identity_clarification' || task === 'identity_answers') {
    const context = { name: 'Sherlock Holmes', version: 'Arthur Conan Doyle’s original stories', details: '', guidance: identityAnswerGuidance, questions: identityQuestionLibrary[0]!.questions.slice(0, 8) };
    return { text: renderTaskPrompt(agentId, task, context, () => text), worldId: null, cycleId: null, capturedAt: null, partName: null, note: 'Example researcher authoring input. No Agent cognitive state or WorldState is accessed.' };
  }
  if (task === 'speech') {
    const recorded = store.eventsByType(agentId, ['speech.realization_started']).flatMap(event => event.type === 'speech.realization_started' ? [event] : []).at(-1);
    const context = recorded?.payload ?? speechContext(store.get('identity', agentId), [{ id: 'preview_say', partId: 'preview',
      action: { kind: 'say', text: 'I am uncertain, but I would like to understand you.' }, argument: 'Express uncertainty and curiosity.', identityFit: [], executionOrder: [] }]);
    return { text: renderTaskPrompt(agentId, task, context, () => text), worldId: null, cycleId: recorded?.cycleId ?? null,
      capturedAt: recorded?.at ?? null, partName: null,
      note: recorded ? 'Recorded speech execution input; only selected Say commands and speech-tagged Traits.' : 'Example Say command with current speech-tagged Traits; no WorldState or Part state.' };
  }
  const executions = new Map(store.executions(agentId).map(execution => [execution.id, execution]));
  const worlds = store.eventsByType(agentId, ['worldstate.frozen']).flatMap(event => {
    if (event.type !== 'worldstate.frozen') return [];
    const snapshot = store.world(event.payload.id);
    return [{ ...snapshot, facts: snapshot.facts.flatMap((fact, index) => {
      if (fact.source === 'external execution status') return [];
      const oldDialogue = fact.source === 'agent chat output';
      const action = fact.referenceId ? executions.get(fact.referenceId)?.action : undefined;
      return [{ ...fact, source: oldDialogue ? 'Agent' : fact.source,
        kind: oldDialogue && action?.kind !== 'wait' ? 'says' as const : fact.kind,
        timestamp: fact.timestamp ?? (String(event.payload.facts[index]?.kind) === 'utterance' ? snapshot.capturedAt : null) }];
    }) }];
  });
  const selfInputs = store.eventsByType(agentId, ['self.arbitration_started']).flatMap(event => event.type === 'self.arbitration_started' ? [{ cycleId: event.cycleId, context: event.payload }] : []);
  let world = sample(worlds.filter(world => !['arbitration', 'deliberation'].includes(task) || selfInputs.some(input => input.cycleId === world.cycleId)), 'No suitable saved WorldState yet. Send a message to this Agent first.');
  const events = store.eventsByType(agentId, ['activation.scoring_started', 'activation.scored', 'part.thought', 'self.question'], [world.cycleId]);
  const population = store.list('part', agentId);
  let context: object;
  let owner: string | null = null;
  let note = 'Saved WorldState with current Part state and owner-scoped memories. This is a sample, not an exact historical request.';
  if (['sleep_prediction_review', 'part_cognition', 'cognition_coverage', 'hypothesis_reflection', 'experiential_formation', 'disposition_learning', 'memory_reinterpretation', 'memory_synthesis', 'effortful_recall'].includes(task)) {
    const requests = store.eventsByType(agentId, ['construction.inference_started']).flatMap(event => event.type === 'construction.inference_started' && event.payload.task === task ? [event.payload] : []);
    context = sample(requests, 'No recorded request for this task yet. Run constructed cognition, consolidation or deliberate recall first.');
    note = 'Recorded permitted constructed-task input; no inference call. Offline learning and effortful recall do not receive WorldState.';
  } else if (task === 'hypothesis_outcome') {
    const prediction = sample(store.list('prediction', agentId).filter(prediction => prediction.gapOrigin), 'No gap hypothesis yet.');
    const sourceSequence = store.cycle(prediction.createdCycle).sequence;
    world = sample(worlds.filter(snapshot => store.cycle(snapshot.cycleId).threadId === (prediction.gapOrigin!.threadId ?? undefined)
      && snapshot.sequence > sourceSequence), 'No later original-thread evidence yet.');
    context = { world: factualWorld(world), prediction, laterEvidence: world.facts.filter(fact => fact.originCycleId
      && store.cycle(fact.originCycleId).sequence > sourceSequence) };
    note = 'Gap hypothesis capsule and later factual-only original-thread evidence. No owning Part or imagined future.';
  } else if (['memory_accessibility', 'disposition_activation'].includes(task)) {
    const requests = store.eventsByType(agentId, ['construction.judgment']).flatMap(event => event.type === 'construction.judgment' && event.payload.input.task === task ? [event.payload.input] : []);
    context = sample(requests, 'No recorded judgment for this task yet.');
    note = task === 'disposition_activation' ? 'Recorded direct or associated judgment input. Associated judgments use frozen direct scores and soft contributing/inhibiting cues; this context is never supplied to Self.' : 'Recorded independent bounded judgment input. This scorer context is never supplied to Self.';
  } else if (task === 'memory_relevance') {
    const part = sample(population, 'This Agent has no Parts to preview.');
    owner = part.name;
    context = { world, purpose: 'recall', entries: memoryEntries(store, world, [part]) };
    note = 'Current owning Part memory relevance sample; no inference call. Includes current subjective versions only.';
  } else if (task === 'activation') {
    const recorded = events.find(event => event.type === 'activation.scoring_started');
    context = recorded?.type === 'activation.scoring_started' ? recorded.payload : { world, candidates: population.filter(part => part.lifecycle === 'active'), primitives: store.primitiveSettings(agentId).items.map(effectivePrimitive), primitiveSensitivities: primitiveSensitivities(store.get('identity', agentId)), partActivationContext: [] };
    note = recorded ? 'Recorded shared Part/primitive activation input from this cycle; scorer-only context is retained.' : 'Legacy saved WorldState with current active Parts, primitive definitions and explicit temperament Traits. No historical request reconstruction.';
  } else if (task === 'arbitration' || task === 'deliberation') {
    const input = sample(selfInputs.filter(input => input.cycleId === world.cycleId), 'No recorded Self input is available.');
    context = { ...selfContext(store.get('identity', agentId), input.context.contributions, input.context.deliberation ?? (input.context as unknown as { debate?: typeof input.context.deliberation }).debate ?? [], input.context), choices: selfChoices(input.context) };
    note = 'Current self-definition Identity Traits with recorded contributions and deliberation from this cycle. This is a sample, not an exact historical request. WorldState is excluded from the rendering context.';
  } else {
    const memories = store.list('memory', agentId);
    const predictions = store.list('prediction', agentId);
    const prediction = ['evaluation', 'prediction_outcome'].includes(task) ? sample(predictions, 'No saved prediction is available to preview evaluation.') : null;
    const memory = task === 'replay' ? sample(memories.filter(item => item.ancestorIds.length), 'No memory with an ancestor experience is available to preview replay.') : null;
    const part = prediction?.partId ? store.get('part', prediction.partId) : memory?.partId ? store.get('part', memory.partId) : sample(population, 'This Agent has no Parts to preview.');
    owner = part.name;
    const activation = events.flatMap(event => event.type === 'activation.scored' ? event.payload.results.filter(item => item.partId === part.id) : [])[0]
      ?? { partId: part.id, score: 0, similarity: 0, previous: 0, delta: 0, active: false, reasons: [], distribution: [] };
    const ownMemories = memories.filter(item => referencesMemory(item, part.id));
    if (['consolidation', 'reconsolidation', 'formation'].includes(task)) {
      context = { part, memories: ownMemories.filter(item => item.partId === part.id && item.createdCycle === world.cycleId),
        predictions: predictions.filter(item => item.partId === part.id && item.createdCycle === world.cycleId),
        activations: [{ cycleId: world.cycleId, activation }],
        thoughts: events.flatMap(event => event.type === 'part.thought' && event.payload.partId === part.id ? [{ cycleId: world.cycleId, interpretation: event.payload.output.interpretation, thought: event.payload.output.thought }] : []),
        coactivated: [], repeatedReferents: [], population: population.map(item => ({ id: item.id, name: item.name, mode: item.mode, triggers: item.triggers })) };
      note = 'Sample offline context: current owning Part and its traces from the selected cycle. WorldState is excluded.';
    } else if (memory) {
      world = worlds.find(snapshot => snapshot.id === memory.ancestorIds[0]) ?? store.world(memory.ancestorIds[0]!);
      context = { part, memory, ancestor: world, reason: 'Researcher prompt preview of a saved ancestor experience.' };
      note = 'Current owning Part and saved memory with its ancestor WorldState.';
    } else {
      const assembled = partContext(store, world, part, activation);
      const recall = store.eventsByType(agentId, ['memory.relevance_scored'], [world.cycleId])
        .flatMap(event => event.type === 'memory.relevance_scored' && event.payload.purpose === 'recall'
          && event.payload.worldId === world.id && event.payload.scores.some(score => score.partId === part.id) ? [event.payload] : []).at(-1);
      const ownContext = { ...assembled, memories: recall
        ? assembled.memories.filter(memory => recall.selectedMemoryIds.includes(memory.id))
          .sort((a, b) => recall.selectedMemoryIds.indexOf(a.id) - recall.selectedMemoryIds.indexOf(b.id)) : [] };
      note += recall ? ' Recall selection uses recorded memory IDs with current stored versions.' : ' No recorded recall selection for this owner/snapshot; memory input is empty.';
      const question = events.flatMap(event => event.type === 'self.question' && event.payload.partId === part.id ? [event.payload.question] : [])[0];
      const savedCognition = events.flatMap(event => event.type === 'part.thought' && event.payload.partId === part.id ? [event.payload.output] : [])[0];
      const cognition = savedCognition ? { interpretation: savedCognition.interpretation, thought: savedCognition.thought,
        evidenceSummary: savedCognition.evidenceSummary, proposal: savedCognition.proposal }
        : { interpretation: 'Sample interpretation for preview.', thought: 'Sample thought for preview.', evidenceSummary: [], proposal: null };
      context = { ...ownContext, availableContributors: [{ partId: part.id, name: part.name }],
        activation: { ...activation, distribution: activation.distribution ?? [] },
        ...(prediction ? { prediction } : {}),
        ...(['evaluation', 'prediction_outcome'].includes(task) ? { laterEvidence: world.facts.filter(fact => fact.originCycleId && (store.cycles(agentId).find(cycle => cycle.id === fact.originCycleId)?.sequence ?? 0) > (store.cycles(agentId).find(cycle => cycle.id === prediction?.createdCycle)?.sequence ?? world.sequence)) } : {}),
        ...(task === 'evaluation' ? { outcome: 'incorrect' } : {}),
        ...(['prediction', 'prediction_gate'].includes(task) ? { cognition } : {}), ...(task === 'answer' ? { question: question ?? 'What matters to you in this situation?', currentBid: null, deliberation: [] } : {}) };
      if (task === 'answer' && !question) note += ' Includes an example deliberation question.';
    }
  }
  return { text: renderTaskPrompt(agentId, task, context, () => text), worldId: world.id, cycleId: world.cycleId, capturedAt: world.capturedAt, partName: owner, note };
}
