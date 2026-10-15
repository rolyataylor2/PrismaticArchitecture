import { commitmentProposals, recentCommitments } from './commitments.js';
import { BidPool, contributionScope, type PoolEntry } from './bid-pool.js';
import { ordinaryDisposition } from './domain.js';
import { ConstructedCognition, type ConstructedCycle, type DispositionAssessment } from './constructed.js';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { ExecutiveSkill } from './executive-skill.js';
import { AffectDeliberationAnswerSchema, CognitionSchema, PredictionDraftSchema, PredictionOutcomeSchema, ExecutionSchema, FactSchema, WorldStateSchema, freeze, id, now, type Contribution, type Cycle, type Execution, type Fact, type ActionBid, type WorldState } from './domain.js';
import { InfrastructureError, type DecisionProvider, type EmbeddingProvider, type Executor, type PartContext, type ReasoningProvider, type Store } from './contracts.js';
import { defaultActivationPolicy, type ActivationPolicy } from './activation.js';
import { partContext, thoughtHistory } from './context.js';
import { Inspection } from './inspection.js';
import { PartMutations } from './mutations.js';
import { Predictions } from './predictions.js';
import { select } from './self.js';
import { currentAffect } from './affect-history.js';
import { AffectCycleSchema, type AffectDecision } from './affect-domain.js';
import { experiencedState, factualWorld } from './experienced.js';
import { compileExecutionContract } from './execution-contract.js';
import { prepareGuidanceContinuation, acceptGuidanceContinuation, currentExecutionRequests, GuidanceResponseError } from './guidance-continuation.js';
import type { ExternalCapabilities } from './mcp-configuration.js';
import { publicSkills, selectSkillMethod, SkillInvocationError } from './skill-invocation.js';
import type { RemainderAuthority } from './remainder-authority.js';
import { createHash } from 'node:crypto';
import { selectedActivity, type SelectedActivity } from './execution-review.js';
import { ExecutiveCheckpointKindSchema, ExecutiveCompetenceSchema, evaluateExecutiveAttention, type ExecutiveCompetence } from './executive-attention.js';

export type RuntimeOptions = { activation: ActivationPolicy; recentFactLimit: number | null; thoughtDecay?: { ordinary: number; selected: number }; maxDeliberationRounds: number; maxTemporaryParts?: number; maxGuidanceContexts?: number; maxSkillContexts?: number; coverage?: { maxHypothesesPerCycle: number; maxOpenHypotheses: number } };
export const defaultRuntimeOptions: RuntimeOptions = { activation: defaultActivationPolicy, recentFactLimit: null, thoughtDecay: { ordinary: 0.2, selected: 0.1 }, maxDeliberationRounds: 2 };
type AttentionStream = { agentId: string; threadId: string | null; rootWorldId: string; passCount: number;
  activeCycles: Set<string>; seenThoughts: Set<string>; passLimit: number | null; status: 'running' | 'paused' | 'settled' | 'superseded' | 'failed'; queued: boolean; lastWorld: WorldState };
export class CognitiveRuntime {
  private readonly streams = new Map<string, AttentionStream>();
  private readonly streamCycles = new Map<string, AttentionStream>();
  private readonly continuationTasks = new Map<Promise<unknown>, string>();
  private closing = false;
  private readonly admitted = new Map<Promise<unknown>, string>();
  private track<T>(agentId: string, task: Promise<T>): Promise<T> {
    this.admitted.set(task, agentId);
    void task.then(() => this.admitted.delete(task), () => this.admitted.delete(task));
    return task;
  }
  private streamKey(agentId: string, threadId: string | null) { return JSON.stringify([agentId, threadId]); }
  private recordStream(stream: AttentionStream, reason: string) {
    this.inspection.emit(stream.agentId, stream.lastWorld.cycleId, 'cognition.stream', {
      rootWorldId: stream.rootWorldId, threadId: stream.threadId, passCount: stream.passCount,
      passLimit: stream.passLimit, status: stream.status, reason });
  }
  streamStatus(agentId: string, threadId: string | null) {
    return this.store.eventsByType(agentId, ['cognition.stream']).flatMap(event => event.type === 'cognition.stream'
      && event.payload.threadId === threadId ? [event.payload] : []).at(-1) ?? null;
  }
  pauseThinking(agentId: string, threadId: string | null) {
    const stream = this.streams.get(this.streamKey(agentId, threadId));
    if (stream) { stream.status = 'paused'; this.recordStream(stream, 'Researcher paused further activation; admitted thoughts finish unchanged'); }
    return this.streamStatus(agentId, threadId);
  }
  resumeThinking(agentId: string, threadId: string | null) {
    if (this.closing) throw new Error('Cognitive runtime is closing');
    const key = this.streamKey(agentId, threadId);
    let stream = this.streams.get(key);
    if (!stream) {
      const saved = this.streamStatus(agentId, threadId);
      if (!saved) throw new Error('No observation stream to resume');
      const world = this.store.world(saved.rootWorldId);
      stream = { ...saved, agentId, lastWorld: world, queued: false, activeCycles: new Set(), seenThoughts: new Set() };
      this.streams.set(key, stream);
    }
    const allowance = this.store.agentActivationSettings(agentId).activationPassLimit ?? 1;
    stream.passLimit = this.store.agentActivationSettings(agentId).activationPassLimit === null ? null : stream.passCount + allowance;
    stream.status = 'running'; this.recordStream(stream, 'Researcher resumed activation with another configured allowance');
    this.scheduleThoughtAttention(stream);
    return this.streamStatus(agentId, threadId);
  }
  private scheduleThoughtAttention(stream: AttentionStream) {
    if (this.closing || stream.queued || stream.status !== 'running'
      || this.streams.get(this.streamKey(stream.agentId, stream.threadId)) !== stream) return;
    if (stream.passLimit !== null && stream.passCount >= stream.passLimit) {
      stream.status = 'paused'; this.recordStream(stream, 'Activation-pass allowance exhausted; admitted thoughts may finish'); return;
    }
    stream.queued = true;
    const task = Promise.resolve().then(async () => {
      stream.queued = false;
      if (stream.status !== 'running' || this.closing) return;
      try { await this.runObservation(stream.agentId, [], stream.threadId ?? undefined,
        stream.lastWorld.externalCapabilities, undefined, stream); }
      catch (error) { stream.status = 'failed'; this.recordStream(stream, error instanceof Error ? error.message : String(error)); }
    });
    this.continuationTasks.set(task, stream.agentId);
    void task.finally(() => this.continuationTasks.delete(task));
  }
  async idle(agentId?: string): Promise<void> {
    const pending = () => [...this.continuationTasks, ...this.admitted].filter(([, owner]) => agentId === undefined || owner === agentId).map(([task]) => task);
    while (pending().length) await Promise.allSettled(pending());
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const stream of this.streams.values()) if (stream.status === 'running') { stream.status = 'paused'; this.recordStream(stream, 'Runtime shutdown; accepted thoughts drain without automatic replay'); }
    await this.idle();
    await this.constructed.close();
  }
  readonly constructed: ConstructedCognition;
  readonly mutations: PartMutations;
  readonly predictions: Predictions;
  constructor(private readonly store: Store, private readonly decisions: DecisionProvider,
    private readonly reasoning: ReasoningProvider, _embeddings: EmbeddingProvider, private readonly executor: Executor,
    readonly inspection: Inspection, private readonly options = defaultRuntimeOptions,
    private readonly loadSkillPackage?: (agentId: string, skillId: string, version: number) => Promise<{ skill: ExecutiveSkill; digest: string }>,
    private readonly checkRemainder?: (input: { agentId: string; threadId: string | null; cycleId: string; bid: ActionBid }) => RemainderAuthority | undefined) {
    z.number().int().min(0).max(50).nullable().parse(options.recentFactLimit);
    if (options.thoughtDecay) {
      z.number().positive().max(1).parse(options.thoughtDecay.ordinary);
      z.number().positive().max(options.thoughtDecay.ordinary).parse(options.thoughtDecay.selected);
    }
    z.number().int().min(0).max(8).parse(options.maxDeliberationRounds);
    z.number().int().min(0).max(100).parse(options.maxTemporaryParts ?? 12);
    z.number().int().min(0).max(100).parse(options.maxGuidanceContexts ?? 20);
    z.number().int().min(0).max(100).parse(options.maxSkillContexts ?? 20);
    if (options.coverage) {
      z.number().int().min(0).max(3).parse(options.coverage.maxHypothesesPerCycle);
      z.number().int().min(0).max(30).parse(options.coverage.maxOpenHypotheses);
    }
    this.mutations = new PartMutations(store, inspection);
    this.constructed = new ConstructedCognition(store, decisions, reasoning, this.mutations, inspection, options.maxTemporaryParts ?? 12);
    this.predictions = new Predictions(store, inspection, this.mutations);
    inspection.subscribe(event => {
      if (event.type !== 'part.thought' || !event.cycleId) return;
      const source = this.store.cycle(event.cycleId);
      const stream = this.streams.get(this.streamKey(event.agentId, source.threadId ?? null));
      if (stream) {
        const signature = createHash('sha256').update(JSON.stringify([event.payload.partSnapshot.instance?.dispositionBindings, event.payload.output])).digest('hex');
        if (stream.seenThoughts.has(signature)) return;
        stream.seenThoughts.add(signature);
        this.scheduleThoughtAttention(stream);
      }
    });
  }
  async run(agentId: string, facts: Fact[], threadId?: string, externalCapabilities?: ExternalCapabilities,
    externalSkillDocuments?: WorldState['externalSkillDocuments'], clientMessageId?: string): Promise<{ cycle: Cycle; execution: Execution | null; executions: Execution[] }> {
    if (this.closing) throw new Error('Cognitive runtime is closing');
    z.array(FactSchema).min(1).max(50).parse(facts);
    return this.track(agentId, this.runObservation(agentId, facts, threadId, externalCapabilities, externalSkillDocuments, undefined, clientMessageId));
  }
  private async runObservation(agentId: string, facts: Fact[], threadId?: string, externalCapabilities?: ExternalCapabilities,
    externalSkillDocuments?: WorldState['externalSkillDocuments'], continuation?: AttentionStream, clientMessageId?: string): Promise<{ cycle: Cycle; execution: Execution | null; executions: Execution[] }> {
    const incoming = z.array(FactSchema).max(50).parse(facts);
    const correlation = clientMessageId === undefined ? undefined : z.string().min(1).max(200).parse(clientMessageId);
    let cycle = this.store.startCycle(agentId, threadId);
    if (correlation) { cycle = { ...cycle, clientMessageId: correlation }; this.store.saveCycle(cycle); }
    let stage = 'worldstate';
    try {
      this.inspection.emit(agentId, cycle.id, 'cycle.started', cycle);
      const executiveEnabled = this.store.executiveProfile(agentId).enabled;
      const externalExecutionRequests = executiveEnabled ? currentExecutionRequests(this.store, agentId, threadId ?? null, this.options.maxGuidanceContexts ?? 20) : [];
      const externalSkills = executiveEnabled ? publicSkills(this.store, agentId, threadId ?? null, this.options.maxSkillContexts ?? 20) : [];
      const world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId, cycleId: cycle.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt, facts: [...this.store.recentFacts(agentId, this.options.recentFactLimit, threadId), ...incoming.map(fact => ({ ...fact, timestamp: fact.timestamp ?? cycle.startedAt, originCycleId: cycle.id }))],
        ...(executiveEnabled && externalCapabilities ? { externalCapabilities } : {}),
        ...(externalExecutionRequests.length ? { externalExecutionRequests } : {}),
        ...(externalSkills.length ? { externalSkills } : {}),
        ...(executiveEnabled && externalSkillDocuments?.length ? { externalSkillDocuments } : {}),
        thoughtHistory: thoughtHistory(this.store, cycle, this.options.thoughtDecay),
        experienced: experiencedState(this.store, cycle, continuation?.rootWorldId ?? cycle.worldId) }));
      this.store.saveWorld(world);
      this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
      this.pool(agentId, threadId ?? null);
      const key = this.streamKey(agentId, threadId ?? null);
      const stream = continuation ?? { agentId, threadId: threadId ?? null, rootWorldId: world.id,
        passCount: 0, passLimit: this.store.agentActivationSettings(agentId).activationPassLimit === null ? null
          : this.store.agentActivationSettings(agentId).activationPassLimit ?? 1,
        status: 'running' as const, queued: false, lastWorld: world, activeCycles: new Set<string>(), seenThoughts: new Set<string>() };
      if (!continuation) {
        const previous = this.streams.get(key);
        if (previous?.status === 'running') { previous.status = 'superseded'; this.recordStream(previous, 'A newer external observation owns subsequent activation'); }
        this.streams.set(key, stream);
      }
      stream.passCount++; stream.lastWorld = world; stream.activeCycles.add(cycle.id); this.streamCycles.set(cycle.id, stream);
      this.recordStream(stream, continuation ? 'Expressed thought triggered a later immutable snapshot' : 'External observation admitted');
      const result = await this.cognize(cycle, world, threadId);
      stream.activeCycles.delete(cycle.id);
      if (stream.status === 'running' && !stream.queued && !stream.activeCycles.size) {
        stream.status = stream.passLimit !== null && stream.passCount >= stream.passLimit ? 'paused' : 'settled';
        this.recordStream(stream, stream.status === 'paused' ? 'Activation-pass allowance exhausted' : 'No new expressed thought requiring activation');
      }
      this.streamCycles.delete(cycle.id);
      return result;
    } catch (error) {
      const stream = this.streamCycles.get(cycle.id);
      if (stream) { stream.activeCycles.delete(cycle.id); stream.status = 'failed'; this.recordStream(stream, 'An accepted cognition job failed; inspect infrastructure evidence'); this.streamCycles.delete(cycle.id); }
      const current = this.store.cycle(cycle.id);
      if (current.status === 'failed') throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.store.saveCycle({ ...current, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage, message });
      throw new InfrastructureError(stage, message, { cause: error });
    }
  }

  private readonly contributionPools = new Map<string, BidPool>();
  private pool(agentId: string, threadId: string | null): BidPool {
    const key = this.streamKey(agentId, threadId);
    let pool = this.contributionPools.get(key);
    if (!pool) {
      pool = new BidPool(record => this.inspection.emit(agentId, record.sourceCycleId, 'cognition.bid', record),
        (partId, retained) => this.constructed.holdBidOwner(partId, retained));
      this.contributionPools.set(key, pool);
      const latest = new Map<string, import('./bid-pool.js').PendingBidRecord>();
      for (const event of this.store.eventsByType(agentId, ['cognition.bid']))
        if (event.type === 'cognition.bid' && event.payload.threadId === threadId) latest.set(event.payload.bidId, event.payload);
      const pending = [...latest.values()].filter(record => ['available', 'needs_review'].includes(record.status));
      for (const record of pending) {
        const part = this.store.get('part', record.partId);
        if (part.lifecycle !== 'active' || part.instance?.retirement) continue;
        const world = this.store.world(record.sourceWorldId);
        const prior = pool.get(record.scopeId);
        if (prior && prior.context.world.sequence > world.sequence) continue;
        const context = freeze({ ...partContext(this.store, world, part, { partId: part.id, score: 0, previous: 0, delta: 0,
          similarity: 0, reasons: ['pending_bid_recovery; activation unmeasured'], active: false }),
          dispositions: this.store.list('disposition', agentId).filter(disposition => disposition.id === record.scopeId).map(ordinaryDisposition) });
        pool.restore(context, record);
      }
    }
    return pool;
  }
  private latestWorld(world: WorldState, threadId: string | null): WorldState {
    const streamWorld = this.streams.get(this.streamKey(world.agentId, threadId))?.lastWorld;
    let latest = streamWorld && streamWorld.sequence > world.sequence ? streamWorld : world;
    const newer = this.store.cycles(world.agentId).filter(cycle => (cycle.threadId ?? null) === threadId && cycle.sequence > latest.sequence);
    if (newer.length) for (const event of this.store.eventsByType(world.agentId, ['worldstate.frozen'], newer.map(cycle => cycle.id)))
      if (event.type === 'worldstate.frozen' && event.payload.sequence > latest.sequence) latest = freeze(event.payload);
    return latest;
  }
  private readonly reviewJobs = new WeakMap<PoolEntry, Map<string, Promise<void>>>();
  private reviewPending(pool: BidPool, entry: PoolEntry, world: WorldState, cycleId: string): Promise<void> {
    let jobs = this.reviewJobs.get(entry);
    if (!jobs) { jobs = new Map(); this.reviewJobs.set(entry, jobs); }
    const existing = jobs.get(world.id); if (existing) return existing;
    const task = this.performPendingReview(pool, entry, world, cycleId); jobs.set(world.id, task);
    void task.then(() => jobs!.delete(world.id), () => jobs!.delete(world.id));
    return task;
  }
  private async performPendingReview(pool: BidPool, entry: PoolEntry, world: WorldState, cycleId: string): Promise<void> {
    if ((entry.context.world.id === world.id && entry.record?.status !== 'needs_review') || (!entry.contribution.bid && !entry.contribution.affectProposals?.length)) return;
    const scopeId = contributionScope(entry.context);
    if (entry.record?.status === 'available') pool.transition(entry, 'needs_review', 'A later experience requires owning-Part applicability review');
    const part = this.store.get('part', entry.context.part.id);
    const disposition = entry.context.dispositions?.[0];
    const live = disposition ? this.store.list('disposition', world.agentId).find(current => current.id === disposition.id) : null;
    if (part.instance?.retirement || part.lifecycle !== 'active' || (disposition && (!live?.active
      || (live.temporary && !this.store.list('prediction', world.agentId).some(prediction => prediction.id === live.sourcePredictionId && prediction.status === 'open'))))) {
      pool.transition(entry, 'expired', 'The source perspective or investigation no longer participates'); return;
    }
    const context = freeze({ ...partContext(this.store, world, part, entry.context.activation),
      memories: [...entry.context.memories], dispositions: live ? [ordinaryDisposition(live)] : [],
      availableContributors: pool.values().map(other => ({ partId: other.context.part.id, name: other.contribution.name })) });
    const result = await this.constructed.scheduleJob({ agentId: world.agentId, threadId: part.instance?.threadId ?? null,
      dispositionId: scopeId, purpose: 'bid_review', worldId: world.id, run: async () => {
        if (pool.get(scopeId) !== entry || this.store.get('part', part.id).version !== part.version) return null;
        const raw = await this.reasoning.answer(freeze({
          ...context, currentBid: entry.contribution.bid, currentAffectProposals: entry.contribution.affectProposals ?? [], deliberation: [],
        }), 'New experience arrived after my recommendation began. Against this immutable current experience, do my recommendation and any offered focus still apply? Consider its validWhile conditions, changed circumstances and prior selected behavior. Retain, replace or withdraw my own bid; do not assume it was chosen or executed.');
        if (this.store.get('part', part.id).version !== part.version) return null;
        return { response: AffectDeliberationAnswerSchema.parse(raw), source: this.reasoning.sourceFor?.(raw) };
      } });
    if (result.status !== 'completed' || !result.value || pool.get(scopeId) !== entry) return;
    const { response, source } = result.value;
    this.inspection.emit(world.agentId, cycleId, 'part.deliberation_response', { partId: part.id, ...response });
    const previous = entry.contribution.bid;
    const bid = response.bid_disposition === 'replace' ? { ...response.new_bid!, id: id('bid'), partId: part.id,
      ...(previous ? { replacesBidId: previous.id } : {}) } : response.bid_disposition === 'withdraw' ? null : previous;
    if (bid && bid.id !== previous?.id) {
      this.inspection.emit(world.agentId, cycleId, 'part.bid_created', bid);
      if (source) this.inspection.emit(world.agentId, cycleId, 'cognition.bid_source', { bidId: bid.id, partId: part.id, inferenceSource: source });
    }
    if (response.bid_disposition === 'withdraw') this.inspection.emit(world.agentId, cycleId, 'part.bid_withdrawn', { partId: part.id, bidId: previous?.id ?? null });
    const contribution = { ...entry.contribution, thought: response.response, bid,
      ...(response.affectProposals ? { affectProposals: response.affectProposals.map(proposal => ({ ...proposal, id: id('affect_bid'), partId: part.id, name: part.name })) } : {}) };
    if (response.bid_disposition === 'retain') {
      pool.reviewed(entry, context, contribution);
    } else {
      pool.transition(entry, response.bid_disposition === 'withdraw' ? 'withdrawn' : 'superseded', response.response);
      pool.publish(context, contribution, null, entry.record?.activationEventId ?? null);
    }
  }
  private readonly predictionPasses = new Set<string>();
  private readonly decisionsInFlight = new Map<string, Promise<void>>();
  private readonly predictionsInFlight = new Map<string, Promise<void>>();
  private async acquireDecision(agentId: string, lane = this.decisionsInFlight): Promise<() => void> {
    const prior = lane.get(agentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    lane.set(agentId, current);
    await prior;
    return () => { release(); if (lane.get(agentId) === current) lane.delete(agentId); };
  }
  private async cognize(cycle: Cycle, world: WorldState, threadId?: string, assessment?: DispositionAssessment, activity?: SelectedActivity) {
    const completions: Promise<{ cycle: Cycle; execution: Execution | null; executions: Execution[] }>[] = [];
    let preparationError: unknown;
    try {
      const prepared = await this.constructed.prepare(world, threadId, undefined, assessment, state => {
        const completion = this.consume(cycle, world, state, threadId, activity);
        // Attach immediately: a provider failure can occur while another thought is still running.
        void completion.catch(() => {});
        completions.push(completion);
      });
      // Evidence and pending expressions remain eligible even when every scope is busy or deferred.
      if (!completions.length) completions.push(this.consume(cycle, world, prepared, threadId, activity));
    } catch (error) { preparationError = error; }
    const settled = await Promise.allSettled(completions);
    const failed = settled.find(result => result.status === 'rejected');
    if (preparationError || failed?.status === 'rejected') {
      this.predictionPasses.delete(cycle.id);
      const error = preparationError ?? (failed as PromiseRejectedResult).reason;
      this.store.saveCycle({ ...this.store.cycle(cycle.id), status: 'failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    this.predictionPasses.delete(cycle.id);
    const executions = settled.flatMap(result => result.status === 'fulfilled' ? result.value.executions : []);
    const completed = { ...this.store.cycle(cycle.id), status: 'completed' as const };
    this.store.saveCycle(completed); this.inspection.emit(world.agentId, cycle.id, 'cycle.completed', completed);
    return { cycle: completed, execution: executions[0] ?? null, executions };
  }

  private async consume(cycle: Cycle, world: WorldState, constructedState: ConstructedCycle, threadId?: string, activity?: SelectedActivity) {
    const agentId = world.agentId; let stage = 'part_cognition';
    let releaseDecision: (() => void) | undefined;
    let predictionEvaluation: Promise<PromiseSettledResult<void>> | undefined;
    let reviewWork: Promise<PromiseSettledResult<void>> | undefined;
    const drainReviews = async () => { const result = await reviewWork; if (result?.status === 'rejected') throw result.reason; };
    const drainLearning = async () => { const result = await predictionEvaluation; if (result?.status === 'rejected') throw result.reason; };
    try {
      stage = 'part_cognition';

      const recalledContext = async (snapshot: typeof world, part: import('./domain.js').Part, activation: import('./domain.js').Activation): Promise<PartContext> => {
        const context = partContext(this.store, snapshot, part, activation);
        return freeze({ ...context,
          dispositions: constructedState.dispositions.filter(disposition => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === disposition.id)).map(ordinaryDisposition),
          memories: context.memories.filter(memory => constructedState.recalledMemoryIds[part.id]?.includes(memory.id) ?? true) });
      };
      stage = 'activation';
      const parts = this.store.list('part', agentId).map(part => this.store.partForThread(part.id, threadId));
      const identity = structuredClone(this.store.get('identity', agentId));
      if (identity.mask && cycle.sequence > identity.mask.expiresAfterCycle) identity.mask = null;
      const results = constructedState.parts.map(part => ({ partId: part.id, score: 2, previous: 2, delta: 0,
        similarity: 0, reasons: [part.instance?.dispositionBindings?.length ? 'disposition_participation' : 'identity_fallback_participation'], active: true }));
      this.inspection.emit(agentId, cycle.id, 'activation.scored', { results, primitives: [], provider: 'code/assembly participation' });
      stage = 'part_cognition';
      const contexts = new Map<string, PartContext>();
      const availableContributors = constructedState.parts.map(part => ({ partId: part.id, name: part.name }));
      for (const activation of results) {
        const part = this.store.get('part', activation.partId);
        contexts.set(part.id, freeze({ ...await recalledContext(world, part, activation), availableContributors }));
      }
      const contributions: Contribution[] = [];
      // Generations already completed in parallel; publication and persistence remain deterministic.
      const publish = (context: PartContext, generated: typeof constructedState.generatedCognition[string]): Contribution => {
        if (!generated || generated.worldId !== context.world.id) throw new InfrastructureError('part_cognition', 'Missing assembled Part generation');
        const output = CognitionSchema.parse(generated.output);
        if (output.affectProposals?.some(proposal => proposal.supportingPredictionIds.some(predictionId => predictionId !== context.prediction?.id))) {
          throw new InfrastructureError('part_cognition', 'Affect proposal refers to an unavailable owning-Part prediction');
        }
        const thoughtEvent = this.inspection.emit(agentId, context.world.cycleId, 'part.thought', { ...(generated.inferenceSource ? { inferenceSource: generated.inferenceSource } : {}), partId: context.part.id, partSnapshot: context.part, recalledMemoryIds: context.memories.map(memory => memory.id),
          predictionSnapshot: context.prediction, output, durationMs: generated.durationMs });
        let formedPrediction = null;
        if (output.prediction) {
          if (context.prediction) throw new InfrastructureError('part_cognition', 'Cannot stack another unresolved prediction');
          formedPrediction = this.predictions.form(context.part.id, context.world, PredictionDraftSchema.parse(output.prediction), thoughtEvent.id);
          if (context.world.experienced?.selectedFocus) this.inspection.emit(agentId, context.world.cycleId, 'self.affect_prediction_origin', {
            predictionId: formedPrediction.id, periodId: context.world.experienced.selectedFocus.periodId, stage: 'part_cognition', sourceWorldId: context.world.id });
        }
        const current = this.store.get('part', context.part.id);
        this.mutations.patch(current.id, current.version, {
          instance: { ...current.instance!, interpretation: output.interpretation },
          ...(output.beliefs ? { beliefs: output.beliefs } : {}),
          ...(output.affect !== undefined ? { emotionalCharge: output.affect || null } : {}),
          ...(output.localGoal !== undefined ? { stickiness: { retained: output.localGoal !== null, unresolved: output.localGoal !== null, concern: output.localGoal ?? '' } } : {}),
        }, { origin: 'organic_cognition', reason: 'Updated scoped perspective from independent cognition', sourceIds: [context.world.id] }, cycle.id);
        const bid = output.proposal ? { ...output.proposal, id: id('bid'), partId: context.part.id } : null;
        if (bid) this.inspection.emit(agentId, context.world.cycleId, 'part.bid_created', bid);
        if (generated.inferenceSource) this.inspection.emit(agentId, context.world.cycleId, 'cognition.source',
          { thoughtEventId: thoughtEvent.id, bidId: bid?.id ?? null, inferenceSource: generated.inferenceSource });
        const affectProposals = (output.affectProposals ?? []).map(proposal => ({
          ...proposal, id: id('affect_bid'), partId: context.part.id, name: context.part.name,
        }));
        if (affectProposals.length) this.inspection.emit(agentId, context.world.cycleId, 'part.affect_proposals', { partId: context.part.id, proposals: affectProposals });
        return { partId: context.part.id, name: context.part.name, thought: output.thought,
          interpretation: output.interpretation, evidenceSummary: output.evidenceSummary,
          affect: output.affect ?? '',
          ...(affectProposals.length ? { affectProposals } : {}),
          prediction: formedPrediction?.expectation ?? context.prediction?.expectation ?? null, bid };
      };
      const register = (context: PartContext, contribution: Contribution) => {
        // Publication has committed this scope's own cognition. Later inquiry captures that resulting version.
        context = freeze({ ...context, part: this.store.get('part', context.part.id),
          prediction: this.store.list('prediction', agentId).find(prediction => prediction.partId === context.part.id && prediction.status === 'open') ?? null });
        const sourceJob = this.store.eventsByType(agentId, ['cognition.job'], [context.world.cycleId]).findLast(event =>
          event.type === 'cognition.job' && event.payload.dispositionId === contributionScope(context) && event.payload.status === 'started');
        const activationEvent = this.store.eventsByType(agentId, ['construction.judgment'], [context.world.cycleId]).findLast(event =>
          event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation'
          && event.payload.scores.some(score => score.partId === contributionScope(context)));
        this.pool(agentId, threadId ?? null).publish(context, contribution,
          sourceJob?.type === 'cognition.job' ? sourceJob.payload.jobId : null, activationEvent?.id ?? null);
      };
      for (const context of contexts.values()) {
        const contribution = publish(context, constructedState.generatedCognition[context.part.id]!);
        contributions.push(contribution);
        register(context, contribution);
      }
      const evaluatePredictions = async () => {
      if (this.predictionPasses.has(cycle.id)) return;
      this.predictionPasses.add(cycle.id);
      const releaseEvaluation = await this.acquireDecision(agentId, this.predictionsInFlight);
      try {
      const cycleSequences = new Map(this.store.cycles(agentId).map(record => [record.id, record.sequence]));
      for (const prediction of this.store.list('prediction', agentId).filter(p => p.status === 'open' && p.createdCycle !== cycle.id)) {
        if (prediction.gapOrigin) {
          if (prediction.gapOrigin.threadId !== (threadId ?? null)) continue;
          if (!this.decisions.checkHypothesis) throw new InfrastructureError('hypothesis_outcome', 'Decision provider lacks gap hypothesis checks');
          const createdSequence = prediction.committedAfterSequence ?? cycleSequences.get(prediction.createdCycle) ?? world.sequence;
          const laterEvidence = world.facts.filter(fact => fact.originCycleId && (cycleSequences.get(fact.originCycleId) ?? 0) > createdSequence);
          if (!laterEvidence.length) continue;
          const factual = freeze({ ...factualWorld(world), facts: laterEvidence });
          const outcome = PredictionOutcomeSchema.parse(await this.decisions.checkHypothesis(freeze({ world: factual, prediction, laterEvidence })));
          this.inspection.emit(agentId, cycle.id, 'prediction.outcome_checked', { partId: null, predictionId: prediction.id, outcome, provider: this.decisions.label });
          if (outcome === 'incomplete') continue;
          const update = outcome === 'irrelevant' ? { operation: 'invalidate' as const, revision: null, evaluation: null,
            memory: null, mutation: null, reason: 'Gap hypothesis no longer relevant to its original context' }
            : { ...await this.constructed.infer('hypothesis_reflection', { agentId, world: factual,
                hypothesis: prediction, laterEvidence, outcome }), revision: null, mutation: null };
          this.predictions.apply(prediction, world, update, outcome === 'correct' || outcome === 'incorrect' ? outcome : undefined);
          continue;
        }
        const part = parts.find(p => p.id === prediction.partId);
        if (!part?.instance) continue; // Legacy forecasts remain offline history, not online Part learning.
        const sourceCycle = this.store.cycles(agentId).find(cycle => cycle.id === prediction.createdCycle);
        if ((sourceCycle?.threadId ?? part.instance?.threadId ?? undefined) !== threadId) continue;
        // Evidence can resolve early; the owning Part decides whether the horizon/evidence permits evaluation.
        const activation = results.find(r => r.partId === part.id) ?? { partId: part.id, similarity: 0, reasons: ['prediction_evidence'], score: 0, previous: 0, delta: 0, active: false };
        const createdSequence = prediction.committedAfterSequence ?? cycleSequences.get(prediction.createdCycle) ?? world.sequence;
        const laterEvidence = world.facts.filter(fact => fact.originCycleId && (cycleSequences.get(fact.originCycleId) ?? 0) > createdSequence);
        if (!laterEvidence.length) continue;
        const owner = this.store.get('part', part.id);
        const evidenceWorld = freeze({ ...factualWorld(world), facts: laterEvidence });
        const context = freeze({ ...await recalledContext(evidenceWorld, owner, activation), prediction, laterEvidence,
          recentThoughts: [] });
        let update;
        let resolvedOutcome: 'correct' | 'incorrect' | undefined;
        try {
          const outcome = PredictionOutcomeSchema.parse(await this.decisions.checkPrediction(context));
          this.inspection.emit(agentId, cycle.id, 'prediction.outcome_checked', { partId: part.id, predictionId: prediction.id, outcome, provider: this.decisions.label });
          if (outcome === 'incomplete') continue;
          if (outcome === 'irrelevant') {
            update = { operation: 'invalidate' as const, revision: null, evaluation: null, memory: null, mutation: null,
              reason: 'Bounded outcome check found the prediction irrelevant to its original context.' };
          } else {
            resolvedOutcome = outcome;
            const reflected = await this.constructed.scheduleJob({ agentId, threadId: threadId ?? null,
              dispositionId: contributionScope(context), purpose: `prediction:${prediction.id}`, worldId: world.id, run: async () => {
                if (this.store.get('prediction', prediction.id).version !== prediction.version) return undefined;
                const reflectionOwner = this.store.get('part', owner.id);
                const reflectionContext = freeze({ ...await recalledContext(evidenceWorld, reflectionOwner, activation), prediction, laterEvidence, recentThoughts: [], outcome });
                const product = await this.reasoning.evaluate(reflectionContext);
                return this.store.get('part', owner.id).version === reflectionOwner.version ? product : undefined;
              } });
            if (reflected.status !== 'completed' || !reflected.value) {
              this.inspection.emit(agentId, cycle.id, 'cognition.inquiry_deferred', { partId: owner.id, worldId: world.id,
                reason: 'Prediction reflection was deferred or its owning version changed; prediction remains unresolved' });
              continue;
            }
            update = reflected.value;
            if (update.operation !== 'resolve') throw new InfrastructureError('prediction_evaluation', 'Correct/incorrect outcome reflection must resolve the prediction');
          }
        } catch (error) {
          if (!(error instanceof InfrastructureError)) throw error;
          const message = error.message;
          this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage: 'prediction_evaluation',
            message: `Prediction evaluation failed; the cycle will continue without updating this prediction. ${message}` });
          continue;
        }
        if (this.store.get('prediction', prediction.id).version !== prediction.version) continue;
        this.predictions.apply(prediction, world, update, resolvedOutcome);
      }
      } finally { releaseEvaluation(); }
      };
      predictionEvaluation = Promise.allSettled([evaluatePredictions()]).then(results => results[0]!);
      const pool = this.pool(agentId, threadId ?? null);
      const reviewWorld = this.latestWorld(world, threadId ?? null);
      const revisionBeforeReviews = pool.revision;
      const reconsider = async () => {
        await Promise.all(pool.values().map(entry => this.reviewPending(pool, entry, reviewWorld, cycle.id)));
        if (pool.revision > revisionBeforeReviews) await this.consume(this.store.cycle(cycle.id), world,
          { ...constructedState, parts: [], generatedCognition: {}, recalledMemoryIds: {} }, threadId, activity);
      };
      reviewWork = Promise.allSettled([reconsider()]).then(results => results[0]!);
      releaseDecision = await this.acquireDecision(agentId);
      cycle = this.store.cycle(cycle.id);
      const decisionWorld = this.latestWorld(world, threadId ?? null);
      const poolSnapshot = pool.snapshot(decisionWorld.id);
      if (pool.consideredRevision >= poolSnapshot.revision) {
        releaseDecision(); releaseDecision = undefined;
        await drainLearning();
        await drainReviews();
        await this.constructed.formFromExperience(agentId, cycle.id);
        return { cycle, execution: null, executions: [] as Execution[] };
      }
      contributions.splice(0, contributions.length, ...poolSnapshot.contributions);
      contexts.clear();
      for (const [partId, context] of poolSnapshot.contexts) contexts.set(partId, context);
      if (this.store.executiveProfile(agentId).enabled) activity ??= this.store.executions(agentId).filter(execution => execution.status === 'running')
        .map(execution => selectedActivity(this.store, agentId, execution.id, threadId ?? null)).find(value => value !== null) ?? undefined;
      stage = 'self';
      const currentStream = this.streams.get(this.streamKey(agentId, threadId ?? null));
      const affectState = currentAffect(this.store, cycle, currentStream && currentStream.lastWorld.sequence >= decisionWorld.sequence ? currentStream.rootWorldId : decisionWorld.id);
      const affectDecisions: AffectDecision[] = [];
      let finalFocus = affectState.activeFocus;
      let usedFocus = affectState.activeFocus;
      const beforeSelfPredictionIds = this.store.list('prediction', agentId).filter(prediction => prediction.status === 'open'
        && this.store.cycle(prediction.createdCycle).threadId === cycle.threadId).map(prediction => prediction.id);
      let baselinePredictionIds = beforeSelfPredictionIds;
      let navigation: import('./domain.js').NavigationBid | undefined;
      let finalContributions = contributions;
      let continued = false;
      const thoughtsOnly = !contributions.some(contribution => contribution.bid || contribution.affectProposals?.length)
        && !affectState.focusBefore;
      const selected = thoughtsOnly ? null : await select({ world: decisionWorld, decisionCycleId: cycle.id, commitments: recentCommitments(this.store, agentId, threadId ?? null), identity, contributions, contexts, decisions: this.decisions,
        reasoning: this.reasoning, inspection: this.inspection,
        ...(affectState.shouldReconsider ? { affect: { sequence: affectState.sequence, threadId: threadId ?? null, currentFocus: affectState.focusBefore,
          feedback: affectState.feedback, onDecision: decision => {
            affectDecisions.push(decision); finalFocus = decision.resultingFocus; usedFocus = decision.resultingFocus;
            if (decision.boundary === 'started' || decision.boundary === 'switched') baselinePredictionIds = this.store.list('prediction', agentId)
              .filter(prediction => prediction.status === 'open' && this.store.cycle(prediction.createdCycle).threadId === cycle.threadId).map(prediction => prediction.id);
          } } } : affectState.activeFocus ? { selectedFocus: affectState.activeFocus } : {}),
        onSelection: items => { finalContributions = items; },
        ...(activity ? { ongoingActivity: activity, onContinue: () => { continued = true; } } : {}),
        onNavigation: bid => { navigation = bid; finalFocus = null; },
        runPartInference: async <T>(context: PartContext, run: () => Promise<T>): Promise<T | undefined> => {
          const current = () => {
            const owner = this.store.get('part', context.part.id);
            return owner.version === context.part.version && owner.lifecycle === 'active' && !owner.instance?.retirement;
          };
          const result = await this.constructed.scheduleJob({ agentId, threadId: threadId ?? null,
            dispositionId: contributionScope(context), purpose: 'self_inquiry', worldId: context.world.id,
            run: async () => {
              if (!current()) return undefined;
              const product = await run();
              return current() ? product : undefined;
            } });
          if (result.status === 'completed' && result.value !== undefined) return result.value;
          this.inspection.emit(agentId, cycle.id, 'cognition.inquiry_deferred', { partId: context.part.id, worldId: context.world.id,
            reason: result.status === 'completed' ? 'Owning Part version changed; no replacement response committed' : `Scope inference ${result.status}; existing expression retained` });
          return undefined;
        },
        answerContext: async (context: PartContext, question: string): Promise<PartContext> => {
          if (!context.memories.length) return context;
          const recollection = await this.constructed.infer('effortful_recall', { agentId, question,
            memories: context.memories.map(memory => this.store.get('memory', memory.id)) });
          return freeze({ ...context, effortfulRecollections: [recollection] });
        },
        afterDeliberation: async (current, _messages, inquiry) => {
          const question = inquiry.question;
          if (!question) return;
          const stream = this.streams.get(this.streamKey(agentId, threadId ?? null));
          if (stream && (stream.status !== 'running' || (stream.passLimit !== null && stream.passCount >= stream.passLimit))) return;
          if (stream) {
            stream.passCount++;
            this.recordStream(stream, 'Self inquiry admitted an additional activation assessment under the same observation allowance');
          }
          const admitted = this.store.eventsByType(agentId, ['construction.admission'], [cycle.id]).flatMap(event => event.type === 'construction.admission' ? event.payload.scopes.filter(scope => scope.status === 'admitted').map(scope => scope.dispositionId) : []);
          const participatingDispositionIds = [...new Set([...admitted, ...[...contexts.values()].flatMap(context => context.part.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [])])];
          const recruited = await this.constructed.prepare(decisionWorld, threadId, { question, participatingDispositionIds, temporaryBudget: Math.max(0, (this.options.maxTemporaryParts ?? 12)
            - [...contexts.values()].filter(context => context.dispositions?.some(disposition => disposition.temporary)).length) });
          for (const part of recruited.parts) {
            if (contexts.has(part.id)) throw new InfrastructureError('self', 'Recruitment duplicated a participating Part');
            const activation = { partId: part.id, score: 2, previous: 0, delta: 2, similarity: 0,
              reasons: ['deliberation_recruitment'], active: true };
            const context = freeze({ ...partContext(this.store, decisionWorld, part, activation),
              dispositions: recruited.dispositions.filter(disposition => part.instance?.dispositionBindings?.some(binding => binding.dispositionId === disposition.id)).map(ordinaryDisposition),
              memories: partContext(this.store, decisionWorld, part, activation).memories.filter(memory => recruited.recalledMemoryIds[part.id]?.includes(memory.id)),
              availableContributors: [...current.map(contribution => ({ partId: contribution.partId, name: contribution.name })),
                ...recruited.parts.map(item => ({ partId: item.id, name: item.name }))] });
            contexts.set(part.id, context);
            const contribution = publish(context, recruited.generatedCognition[part.id]!);
            const before = pool.revision; register(context, contribution);
            poolSnapshot.entries.set(contributionScope(context), pool.get(contributionScope(context))!);
            if (poolSnapshot.revision === before) poolSnapshot.revision = pool.revision;
            current.push(contribution);
          }
        },
        maxDeliberationRounds: this.options.maxDeliberationRounds,
      });
      pool.settle(finalContributions, new Set([...(selected?.map(bid => bid.id) ?? []), ...(navigation ? [navigation.id] : [])]), poolSnapshot, affectState.shouldReconsider || Boolean(navigation));
      const chosenStances = (navigation ? [navigation] : selected ?? []).flatMap(bid => {
        const contribution = finalContributions.find(item => item.partId === bid.partId);
        return contribution ? [{ partId: contribution.partId, name: contribution.name,
          interpretation: contribution.interpretation, affect: contribution.affect ?? '', thought: contribution.thought }] : [];
      });
      const resultingStances = navigation
        ? decisionWorld.experienced!.stanceHistory!.find(record => record.id === navigation!.stateId)!.posture
        : (selected ?? []).flatMap(bid => {
          const stance = chosenStances.find(item => item.partId === bid.partId);
          return stance ? [{ ...stance, ...(bid.resultingPosture ?? {}) }] : [];
        });
      if (navigation) {
        cycle = { ...cycle, selectedBidId: navigation.id, selectedBidIds: [...new Set([...(cycle.selectedBidIds ?? []), navigation.id])] };
        this.store.saveCycle(cycle);
      }
      this.inspection.emit(agentId, cycle.id, 'self.experienced_transition', { id: id('stance'), cycleId: cycle.id,
        threadId: threadId ?? null, before: decisionWorld.experienced?.posture ?? [], chosen: chosenStances,
        resulting: navigation || resultingStances.length ? resultingStances : decisionWorld.experienced?.posture ?? [],
        selectedBidIds: navigation ? [navigation.id] : selected?.map(bid => bid.id) ?? [], revisitedStateId: navigation?.stateId ?? null });
      let execution: Execution | null = null;
      const executions: Execution[] = [];
      const handoffs: (() => Promise<void>)[] = [];
      if (selected) {
        this.inspection.emit(agentId, cycle.id, 'self.commitment', { id: id('commitment'), cycleId: cycle.id, threadId: threadId ?? null,
          selectedAt: now(), proposals: commitmentProposals(selected), status: 'selected' });
        stage = 'execution';
        cycle = { ...cycle, selectedBidId: selected[0]!.id, selectedBidIds: [...new Set([...(cycle.selectedBidIds ?? []), ...selected.map(bid => bid.id)])] };
        this.store.saveCycle(cycle);
        for (let index = 0; this.store.executiveProfile(agentId).enabled && index < selected.length; index++) {
          const selectedBid = selected[index]!;
          const group = [selectedBid];
          if (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')) {
            while (selected[index + 1]?.action.kind === 'say' || selected[index + 1]?.action.kind === 'ask') group.push(selected[++index]!);
          }
          const applicable = () => {
            const currentWorld = this.latestWorld(decisionWorld, threadId ?? null);
            if (currentWorld.id === decisionWorld.id && group.every(bid => pool.selectedAt(bid.id, decisionWorld.id))) return true;
            const reason = 'Experience or the selected bid version changed before submission; renewed owning-Part review is required';
            this.inspection.emit(agentId, cycle.id, 'execution.bid_rejected', { bidIds: group.map(bid => bid.id), reviewedWorldId: decisionWorld.id, currentWorldId: currentWorld.id, reason });
            for (const bid of group) pool.rejectSelection(bid.id, reason);
            return false;
          };
          if (!applicable()) continue;
          let packagedSelection: ReturnType<typeof selectSkillMethod>; let packageRejection: string | undefined;
          if (this.loadSkillPackage) {
            try {
              const reference = selectSkillMethod(this.store, agentId, threadId ?? null, selectedBid);
              if (reference) {
                const parent = await this.loadSkillPackage(agentId, reference.skillId, reference.version);
                const member = reference.memberSkillId
                  ? await this.loadSkillPackage(agentId, reference.memberSkillId, reference.memberVersion!) : parent;
                const current = this.store.executiveSkills(agentId);
                if (!isDeepStrictEqual(current.find(skill => skill.id === parent.skill.id), parent.skill)
                  || !isDeepStrictEqual(current.find(skill => skill.id === member.skill.id), member.skill))
                  throw new Error('Stored package does not match the current approved skill version');
                packagedSelection = { ...reference, procedure: member.skill.procedure, packageDigest: parent.digest,
                  ...(reference.memberSkillId ? { memberPackageDigest: member.digest } : {}) };
              }
            } catch (error) {
              packageRejection = `Skill package selection rejected: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
          if (!this.store.executiveProfile(agentId).enabled) break;
          if (!applicable()) continue;
          const conditionChecks = await this.constructed.checkBidConditions(factualWorld(decisionWorld), group);
          let supported = true;
          for (const check of conditionChecks) {
            if (!check.conditions.length) continue;
            const admitted = check.conditions.every(condition => condition.score !== null && condition.score > 2);
            this.inspection.emit(agentId, cycle.id, 'execution.applicability_checked', { ...check, worldId: decisionWorld.id,
              provider: this.decisions.label, admitted });
            if (!admitted) supported = false;
          }
          if (!supported) {
            const reason = 'Declared external conditions are contradicted, unknown or unassessed; no action was submitted';
            this.inspection.emit(agentId, cycle.id, 'execution.bid_rejected', { bidIds: group.map(bid => bid.id),
              reviewedWorldId: decisionWorld.id, currentWorldId: this.latestWorld(decisionWorld, threadId ?? null).id, reason });
            for (const bid of group) pool.rejectSelection(bid.id, reason);
            continue;
          }
          if (!applicable()) continue;
          const contract = this.inspection.atomic(() => {
            let continuation; let guidanceRejection; let selectedSkill; let skillRejection; let remainderRejection; let remainder;
            if (selectedBid.action.kind === 'operate' && selectedBid.action.operation.remainderCorrection) {
              try { remainder = this.checkRemainder?.({ agentId, threadId: threadId ?? null, cycleId: cycle.id, bid: selectedBid }); }
              catch (error) { remainderRejection = error instanceof Error ? error.message : String(error); }
            }
            try { selectedSkill = selectSkillMethod(this.store, agentId, threadId ?? null, selectedBid); }
            catch (error) { if (!(error instanceof SkillInvocationError)) throw error; skillRejection = error.message; }
            if (this.loadSkillPackage && selectedSkill) {
              const { packageDigest: _packageDigest, memberPackageDigest: _memberPackageDigest, ...reference } = packagedSelection ?? {};
              if (packageRejection || !packagedSelection || !isDeepStrictEqual(selectedSkill, reference)) {
                skillRejection = packageRejection ?? 'Skill selection changed during package loading'; selectedSkill = undefined;
              } else selectedSkill = packagedSelection;
            }
            try { if (!skillRejection) continuation = prepareGuidanceContinuation(this.store, agentId, cycle.id, threadId ?? null, selectedBid); }
            catch (error) { if (!(error instanceof GuidanceResponseError)) throw error; guidanceRejection = error.message; }
            const compiled = compileExecutionContract({ agentId, cycleId: cycle.id,
              ...(threadId ? { threadId } : {}), bids: group, predictions: this.store.list('prediction', agentId),
              profile: this.store.executiveProfile(agentId), ...(continuation ? { continuation } : {}),
              ...(guidanceRejection ? { guidanceRejection } : {}), ...(remainderRejection ? { remainderRejection } : {}), ...(remainder ? { remainder } : {}), ...(selectedSkill && !guidanceRejection ? { selectedSkill } : {}),
              ...(skillRejection ? { skillRejection } : {}) });
            this.inspection.emit(agentId, cycle.id, 'execution.contract', compiled);
            acceptGuidanceContinuation(this.store, this.inspection, compiled);
            return compiled;
          });
          if (!this.store.executiveProfile(agentId).enabled) break;
          if (!applicable()) continue;
          handoffs.push(async () => {
            if (!applicable()) return;
          for (const bid of group) this.inspection.emit(agentId, cycle.id, 'execution.handoff', { bid });
          execution = ExecutionSchema.parse(await (this.executor.executeSay && (selectedBid.action.kind === 'say' || selectedBid.action.kind === 'ask')
            ? this.executor.executeSay({ agentId, cycleId: cycle.id, bids: group, contract })
            : contract.continuation && this.executor.resume
              ? this.executor.resume({ agentId, cycleId: cycle.id, bid: selectedBid, contract })
              : this.executor.execute({ agentId, cycleId: cycle.id, bid: selectedBid, contract })));
          if (execution.contractId && execution.contractId !== contract.id)
            throw new InfrastructureError('execution', 'External handoff changed the execution contract reference');
          execution = { ...execution, contractId: contract.id };
          if (execution.agentId !== agentId || execution.cycleId !== cycle.id
            || JSON.stringify(execution.action) !== JSON.stringify(selectedBid.action)) throw new InfrastructureError('execution', 'External handoff changed the selected action or owner');
          if ((group.length > 1 && !execution.speech) || (execution.speech && ((selectedBid.action.kind !== 'say' && selectedBid.action.kind !== 'ask')
            || JSON.stringify(execution.speech.bidIds) !== JSON.stringify(group.map(bid => bid.id))))) {
            throw new InfrastructureError('execution', 'Speech execution changed the selected command references');
          }
          this.store.saveExecution(execution);
          executions.push(execution);
          this.inspection.emit(agentId, cycle.id, 'execution.status', execution);
          if (execution.guidance) this.inspection.emit(agentId, cycle.id, 'execution.guidance', execution.guidance);
          this.executor.recorded?.(execution);
          });
        }
      }
      if (affectDecisions.length || navigation || affectState.focusBefore) {
        const cyclePredictions = this.store.list('prediction', agentId).filter(prediction => prediction.createdCycle === cycle.id);
        this.inspection.emit(agentId, cycle.id, 'self.affect_committed', { rootWorldId: affectState.rootWorldId,
          offersConsidered: affectDecisions.length > 0 || Boolean(navigation) || !affectState.shouldReconsider,
          record: AffectCycleSchema.parse({ cycleId: cycle.id, threadId: threadId ?? null, sequence: affectState.sequence,
            focusBefore: affectState.focusBefore, focusAfter: finalFocus, usedFocus, decisions: affectDecisions,
            baselinePredictionIds, originated: cyclePredictions.flatMap(prediction => this.store.eventsByType(agentId, ['self.affect_prediction_origin'])
              .flatMap(event => event.type === 'self.affect_prediction_origin' && event.payload.predictionId === prediction.id
                ? [{ predictionId: prediction.id, periodId: event.payload.periodId, stage: event.payload.stage }] : [])),
            selectedBidIds: navigation ? [navigation.id] : selected?.map(bid => bid.id) ?? [], navigationStateId: navigation?.stateId ?? null }) });
      }
      releaseDecision?.(); releaseDecision = undefined;
      for (const handoff of handoffs) await handoff();
      stage = 'cognition_coverage';
      const coverageBudget = this.options.coverage ?? { maxHypothesesPerCycle: 3, maxOpenHypotheses: 6 };
      const predictions = this.store.list('prediction', agentId).filter(prediction =>
        prediction.gapOrigin ? prediction.gapOrigin.threadId === (threadId ?? null)
          : prediction.partId && this.store.get('part', prediction.partId).instance?.threadId === (threadId ?? null));
      const capacity = Math.max(0, coverageBudget.maxOpenHypotheses - predictions.filter(prediction => prediction.gapOrigin && prediction.status === 'open').length);
      if (coverageBudget.maxHypothesesPerCycle) {
        const coverage = await this.constructed.infer('cognition_coverage', { agentId, world, hypothesisLimit: Math.min(capacity, coverageBudget.maxHypothesesPerCycle),
          dispositions: constructedState.dispositions,
          coverageProducts: finalContributions.map(contribution => ({ partId: contribution.partId,
            dispositionIds: contexts.get(contribution.partId)?.part.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? [],
            interpretation: contribution.interpretation, thought: contribution.thought,
            evidenceSummary: contribution.evidenceSummary, prediction: contribution.prediction, proposal: contribution.bid ?
              (({ id: _id, partId: _partId, sourceKind: _sourceKind, replacesBidId: _replaces, ...proposal }) => proposal)(contribution.bid) : null })),
          predictions: predictions.filter(prediction => prediction.status === 'open' || prediction.evaluation?.evidenceWorldId === world.id) });
        this.inspection.emit(agentId, cycle.id, 'cognition.coverage', coverage);
        const adjustments = coverage.adjustments ?? [];
        if (new Set(adjustments.map(adjustment => adjustment.predictionId)).size !== adjustments.length)
          throw new InfrastructureError('cognition_coverage', 'A hypothesis can be adjusted at most once per coverage pass');
        for (const adjustment of adjustments) {
          const source = predictions.find(prediction => prediction.id === adjustment.predictionId);
          if (!source?.gapOrigin || source.status !== 'open') throw new InfrastructureError('cognition_coverage', 'Coverage can adjust only supplied open original-thread gap hypotheses');
          if ((adjustment.revision?.scaffolds ?? []).some(scaffold => scaffold.relevantMemoryIds.length))
            throw new InfrastructureError('cognition_coverage', 'Gap revision cannot fabricate recalled memory');
        }
        if (coverage.operation === 'INVESTIGATE') {
          if (coverage.hypotheses.length > Math.min(capacity, coverageBudget.maxHypothesesPerCycle))
            throw new InfrastructureError('cognition_coverage', 'Hypothesis proposal exceeds the remaining investigation budget');
          this.inspection.atomic(() => {
            for (const adjustment of adjustments) this.predictions.apply(predictions.find(prediction => prediction.id === adjustment.predictionId)!, world,
              { operation: adjustment.operation, revision: adjustment.revision, reason: adjustment.reason, evaluation: null, memory: null, mutation: null });
            for (const hypothesis of coverage.hypotheses) {
            const formed = this.predictions.formGap(world, hypothesis.prediction, {
              threadId: threadId ?? null, gap: coverage.gap, consequentialValue: coverage.consequentialValue,
              futureInference: hypothesis.futureInference, existingStructureInsufficient: hypothesis.existingStructureInsufficient });
            if (usedFocus) this.inspection.emit(agentId, cycle.id, 'self.affect_prediction_origin', { predictionId: formed.id,
              periodId: usedFocus.periodId, stage: 'coverage', sourceWorldId: world.id });
            }
          });
        } else this.inspection.atomic(() => {
          for (const adjustment of adjustments) this.predictions.apply(predictions.find(prediction => prediction.id === adjustment.predictionId)!, world,
            { operation: adjustment.operation, revision: adjustment.revision, reason: adjustment.reason, evaluation: null, memory: null, mutation: null });
        });
      }
      if (activity) this.inspection.emit(agentId, cycle.id, 'execution.review_completed', {
        executionId: activity.executionId, outcome: thoughtsOnly ? 'thoughts_only' : continued ? 'continued' : selected ? 'selected' : 'no_external_selection',
        selectedBidIds: selected?.map(bid => bid.id) ?? [],
      });
      stage = 'prediction_evaluation';
      await drainLearning();
      await drainReviews();
      stage = 'experiential_formation';
      await this.constructed.formFromExperience(agentId, cycle.id);
      cycle = this.store.cycle(cycle.id);
      this.inspection.atomic(() => {
        if (affectState.focusBefore || affectDecisions.length || contributions.some(contribution => contribution.affectProposals?.length)) {
          const cyclePredictions = this.store.list('prediction', agentId).filter(prediction => prediction.createdCycle === cycle.id);
          this.inspection.emit(agentId, cycle.id, 'self.affect_cycle', AffectCycleSchema.parse({ cycleId: cycle.id,
            threadId: threadId ?? null, sequence: affectState.sequence, focusBefore: affectState.focusBefore, focusAfter: finalFocus, usedFocus,
            decisions: affectDecisions, baselinePredictionIds,
            originated: [...(affectState.activeFocus ? cyclePredictions.filter(prediction => !prediction.gapOrigin).map(prediction => ({ predictionId: prediction.id, periodId: affectState.activeFocus!.periodId, stage: 'part_cognition' })) : []),
              ...(usedFocus ? cyclePredictions.filter(prediction => prediction.gapOrigin).map(prediction => ({ predictionId: prediction.id, periodId: usedFocus!.periodId, stage: 'coverage' })) : [])],
            selectedBidIds: navigation ? [navigation.id] : selected?.map(bid => bid.id) ?? [], navigationStateId: navigation?.stateId ?? null }));
        }
        this.store.saveCycle(cycle);

      });
      return { cycle, execution, executions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.saveCycle({ ...cycle, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage, message });
      throw new InfrastructureError(stage, message, { cause: error });
    } finally { releaseDecision?.(); await Promise.all([predictionEvaluation, reviewWork]); }
  }

  /** Persist an advisory checkpoint, with ordinary activation but no recall, Parts or selection. */
  async monitorExecution(agentId: string, executionId: string, facts: Fact[], checkpoint: 'tool_result' | 'environment',
    competence: ExecutiveCompetence, externalCapabilities?: ExternalCapabilities, consultationReason?: string) {
    if (this.closing) throw new Error('Cognitive runtime is closing');
    return this.track(agentId, this.monitorObservation(agentId, executionId, facts, checkpoint, competence, externalCapabilities, consultationReason));
  }
  private async monitorObservation(agentId: string, executionId: string, facts: Fact[], checkpoint: 'tool_result' | 'environment',
    competence: ExecutiveCompetence, externalCapabilities?: ExternalCapabilities, consultationReason?: string) {
    if (!this.store.executiveProfile(agentId).enabled) {
      if (consultationReason !== undefined) throw new Error('Executive is disabled');
      return null;
    }
    const incoming = z.array(FactSchema).min(1).max(50).parse(facts);
    ExecutiveCheckpointKindSchema.parse(checkpoint); ExecutiveCompetenceSchema.parse(competence);
    const execution = this.store.executions(agentId).find(item => item.id === executionId);
    if (!execution?.contractId || execution.action.kind !== 'operate') throw new Error('Monitoring requires an attributed operational execution');
    const origin = this.store.cycle(execution.cycleId);
    if (origin.agentId !== agentId) throw new Error('Monitoring execution ownership mismatch');
    const contract = this.store.eventsByType(agentId, ['execution.contract'], [origin.id]).find(event =>
      event.type === 'execution.contract' && event.payload.id === execution.contractId);
    if (!contract || contract.type !== 'execution.contract' || origin.status === 'failed'
      || contract.payload.commands.some(command => !origin.selectedBidIds?.includes(command.bidId)))
      throw new Error('Monitoring requires a nonfailed Self-selected source contract');
    const profile = this.store.executiveProfile(agentId);
    const requestedReason = consultationReason === undefined ? undefined : z.string().trim().min(1).max(4000).parse(consultationReason);
    if (requestedReason && !selectedActivity(this.store, agentId, executionId, origin.threadId ?? null))
      throw new Error('Explicit consultation requires a currently running Self-selected activity');
    if (!requestedReason && (!profile.attention.enabled || !profile.attention.checkpoints.includes(checkpoint))) return null;
    let cycle: Cycle = { ...this.store.startCycle(agentId, origin.threadId), kind: 'attention_monitor' };
    this.store.saveCycle(cycle);
    try {
      this.inspection.emit(agentId, cycle.id, 'cycle.started', cycle);
      if (requestedReason) this.inspection.emit(agentId, cycle.id, 'execution.consultation_requested', {
        executionId, contractId: execution.contractId, reason: requestedReason,
      });
      const activity = selectedActivity(this.store, agentId, executionId, origin.threadId ?? null);
      const world = freeze(WorldStateSchema.parse({ id: cycle.worldId, agentId, cycleId: cycle.id,
        sequence: cycle.sequence, capturedAt: cycle.startedAt,
        ...(activity ? { selectedActivity: activity } : {}),
        facts: [...this.store.recentFacts(agentId, this.options.recentFactLimit, origin.threadId),
          ...incoming.map(fact => ({ ...fact, timestamp: fact.timestamp ?? cycle.startedAt, originCycleId: cycle.id })),
          ...(requestedReason ? [{ source: 'External execution consultation', kind: 'observes' as const,
            text: requestedReason, referenceId: null, timestamp: cycle.startedAt, originCycleId: cycle.id }] : [])],
        ...(externalCapabilities ? { externalCapabilities } : {}),
        externalExecutionRequests: currentExecutionRequests(this.store, agentId, origin.threadId ?? null, this.options.maxGuidanceContexts ?? 20),
        externalSkills: publicSkills(this.store, agentId, origin.threadId ?? null, this.options.maxSkillContexts ?? 20),
        thoughtHistory: thoughtHistory(this.store, cycle, this.options.thoughtDecay), experienced: experiencedState(this.store, cycle) }));
      this.store.saveWorld(world); this.inspection.emit(agentId, cycle.id, 'worldstate.frozen', world);
      const assessment = await this.constructed.assess(world, origin.threadId);
      const relevance = Math.max(0, ...assessment.scores.map(score => score.score));
      const evidenceKey = createHash('sha256').update(JSON.stringify({
        observations: [...new Set(world.facts.map(fact => JSON.stringify([fact.source, fact.kind, fact.text, fact.referenceId])))].sort(),
        competence, dispositions: assessment.dispositions.map(disposition => [disposition.id, disposition.version]),
        experienced: world.experienced, tools: externalCapabilities, settings: profile.attention,
      })).digest('hex');
      // Suppressed records must not extend the review cooldown or erase its hysteresis state.
      const previous = this.store.eventsByType(agentId, ['execution.attention']).filter(event =>
        event.type === 'execution.attention' && event.payload.executionId === executionId && !event.payload.suppressed).at(-1);
      const attention = { executionId, contractId: execution.contractId, checkpoint, relevance, competence, evidenceKey,
        at: cycle.startedAt, profileRevision: profile.revision,
        ...evaluateExecutiveAttention({ settings: profile.attention, relevance, competence, evidenceKey, at: cycle.startedAt,
          ...(previous?.type === 'execution.attention' ? { previous: previous.payload } : {}) }) };
      this.inspection.emit(agentId, cycle.id, 'execution.attention', attention);
      if (this.store.executiveProfile(agentId).enabled && (requestedReason || (profile.attention.reviewInterested && attention.state === 'interested')) && activity
        && selectedActivity(this.store, agentId, executionId, origin.threadId ?? null)) {
        cycle = { ...cycle, kind: 'attention_review' };
        this.store.saveCycle(cycle);
        this.inspection.emit(agentId, cycle.id, 'execution.review_started', { executionId, activity });
        const reviewed = await this.cognize(cycle, world, origin.threadId, assessment, activity);
        return { cycle: reviewed.cycle, attention, ...(requestedReason ? { consultation: 'reviewed' as const } : {}) };
      }
      cycle = { ...cycle, status: 'completed' };
      this.store.saveCycle(cycle); this.inspection.emit(agentId, cycle.id, 'cycle.completed', cycle);
      return { cycle, attention, ...(requestedReason ? { consultation: 'activity_ended' as const } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.store.cycle(cycle.id).status === 'failed') throw error;
      this.store.saveCycle({ ...cycle, status: 'failed', error: message });
      this.inspection.emit(agentId, cycle.id, 'infrastructure.error', { stage: 'executive_attention', message });
      throw new InfrastructureError('executive_attention', message, { cause: error });
    }
  }
}
