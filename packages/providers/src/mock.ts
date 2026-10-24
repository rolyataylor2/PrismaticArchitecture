import type { ConstructedInput, PartFormationSchema } from '../../core/src/constructed-domain.js';
import { evidenceCatalog } from '../../core/src/evidence-provenance.js';
import type { z } from 'zod';
import { scoreSelf } from '../../core/src/self-scoring.js';
import { scoreAffect } from '../../core/src/affect-scoring.js';
import { projectAffectSelectionContext } from '../../core/src/affect.js';
import { affectInquirySchema, focusedBidSchema } from './affect-schema.js';
import { PartSchema, freeze, type Cognition, type PredictionUpdate, type Proposal, type SelfContext } from '../../core/src/domain.js';
import type { DecisionProvider, EmbeddingProvider, PartContext, ReasoningProvider } from '../../core/src/contracts.js';
import type { ConsolidationContext } from '../../core/src/consolidation-domain.js';

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const overlap = (a: string, b: string): number => {
  const right = new Set(words(b));
  return words(a).filter(w => w.length > 3 && right.has(w)).length;
};

/** Transparent fixture semantics for offline demos. This is not Jev or a learned psychological model. */
export class MockDecisions implements DecisionProvider {
  async chooseAffect(input: Parameters<NonNullable<DecisionProvider['chooseAffect']>>[0]) {
    const context = projectAffectSelectionContext(input);
    return scoreAffect(context, async options => options.map(partId => ({ partId,
      score: partId === 'NO_AFFECT_CHANGE' ? 4 : 0 })));
  }
  readonly label = 'deterministic/mock-decisions-v1 (not Jev)';
  async score(input: Parameters<DecisionProvider['score']>[0]): ReturnType<DecisionProvider['score']> {
    const text = [...input.world.facts.map(f => `${f.source} ${f.text}`), ...(input.world.thoughtHistory ?? []).map(thought => thought.thought)].join(' ');
    const patterns = [/new|unfamiliar|novel|first/i, /sudden|unexpected|crash|scream|abrupt|chainsaw|throw/i,
      /smil|pleasant|nice|happy|gentle/i, /chainsaw|scream|crash|danger|pain|hurt|threat|uncomfortable|throw/i,
      /our action|I caused|we caused/i, /again|repeat|more of/i, /stop|pause|chainsaw|threat/i,
      /look|inspect|curious|detail|crash|scream/i, /hello|smil|person enters|interact/i, /uncertain|unknown|confus|ambiguous|sudden/i];
    const current = input.world.facts.at(-1)?.text ?? '';
    return [...input.candidates.map(p => ({ partId: p.id, score: Math.min(4, 0.5 + overlap(p.triggers.join(' '), text) * 0.8) })),
      ...(input.primitives ?? []).map(primitive => {
        const index = Number(primitive.id.replace('primitive_', '')) - 1;
        return { partId: primitive.id, score: patterns[index]?.test(current) ? 3 : 0.5 };
      })];
  }
  async judge(input: Parameters<NonNullable<DecisionProvider['judge']>>[0]) {
    if (input.task === 'bid_applicability') return input.candidates.map(candidate => ({ partId: candidate.id, score: 2 }));
    const text = JSON.stringify(input.world);
    return input.candidates.map(candidate => {
      const context = candidate.context as { memory?: { content: string; gist: string }; disposition?: { cues: string[] }; baselineActivation?: number; associationSignals?: ({ kind: 'keyword'; keyword: string; effect: 'contribute' | 'inhibit' } | { kind: 'disposition'; baselineActivation: number; effect: 'contribute' | 'inhibit' })[]; relation?: string; interpretation?: string };
      const source = context.memory ? `${context.memory.gist} ${context.memory.content}` : context.disposition?.cues.join(' ') ?? '';
      const influence = (context.associationSignals ?? []).reduce((total, signal) => total + (signal.effect === 'contribute' ? 1 : -1)
        * (signal.kind === 'keyword' ? (text.toLowerCase().includes(signal.keyword.toLowerCase()) ? 1 : 0) : signal.baselineActivation / 4), 0);
      const score = Math.max(0, Math.min(4, (context.baselineActivation ?? overlap(source, text)) + influence));
      return { partId: candidate.id, score };
    });
  }
  async recall(input: Parameters<NonNullable<DecisionProvider['recall']>>[0]) {
    const text = [...input.world.facts.map(fact => fact.text), ...(input.world.thoughtHistory ?? []).map(thought => thought.thought)].join(' ');
    return input.entries.map(entry => ({ partId: entry.memory.id, score: Math.min(4, overlap(`${entry.memory.gist} ${entry.memory.content}`, text)) }));
  }
  async shouldPredict(context: Parameters<DecisionProvider['shouldPredict']>[0]) {
    return !context.prediction && (Boolean(context.part.instance) || ['Social Caution', 'My Fear Of Rejection'].includes(context.part.name))
      && /vulnerab|uncertain|afraid|personal|joke|reject/i.test(context.world.facts.at(-1)?.text ?? '');
  }
  async checkPrediction(context: Parameters<DecisionProvider['checkPrediction']>[0]): ReturnType<DecisionProvider['checkPrediction']> {
    const text = context.laterEvidence.at(-1)?.text ?? '';
    const caring = /thank you|respect you|glad you told|safe to share|appreciate you/i.test(text);
    const rejecting = /pathetic|go away|reject you|do not care/i.test(text);
    if (!caring && !rejecting) return 'incomplete';
    return (context.prediction.expectation.includes('will reject') ? rejecting : caring) ? 'correct' : 'incorrect';
  }
  async checkHypothesis(): Promise<import('../../core/src/domain.js').PredictionOutcome> { return 'incomplete'; }
  async choose(context: SelfContext): ReturnType<DecisionProvider['choose']> {
    const bids = context.contributions.flatMap(c => c.bid ? [c.bid] : []);
    const reference = context.identity.traits.map(trait => trait.answer).join(' ');
    const needsInquiry = !bids.length || (!context.deliberation.length && new Set(bids.map(b => b.action?.kind ?? 'deliberate')).size > 1);
    return scoreSelf(context, async (options, selected) => options.map(option => {
      const bid = bids.find(b => b.id === option);
      const compatible = !selected.length || (bid && selected.every(id => {
        const other = bids.find(b => b.id === id)!;
        return other.action?.kind === bid.action?.kind && other.action?.text !== bid.action?.text;
      }));
      return { partId: option, score: option === 'DELIBERATE' ? (needsInquiry ? 4 : 0) : !bid || !compatible ? 0
        : Math.min(needsInquiry && !selected.length ? 3 : 4, 2 + overlap(bid.identityFit.join(' '), reference)) };
    }));
  }
}
export class MockEmbeddings implements EmbeddingProvider {
  readonly label = 'deterministic/hash-embedding-v1';
  async embed(text: string): Promise<number[]> {
    const vector = Array<number>(128).fill(0);
    for (const word of words(text)) {
      let hash = 2166136261;
      for (const character of word) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      vector[(hash >>> 0) % vector.length]! += 1;
    }
    return vector;
  }
}
function proposal(context: PartContext): Proposal | null {
  const { part } = context;
  if (part.mode === 'recognition') return null;
  const common = { executionOrder: [] as string[] };
  if (['Social Caution', 'My Fear Of Rejection'].includes(part.name)) {
    const learned = part.beliefs.some(b => b.includes('Some people'));
    return { ...common, action: { kind: learned ? 'ask' : 'wait', text: learned
      ? 'Can I share a little uncertainty and see how you respond?' : 'I need a moment before sharing anything personal.' },
    argument: learned ? 'I have a remembered exception, so I can test trust carefully.' : 'I expect rejection and want to protect us.',
    identityFit: learned ? ['honesty', 'curiosity', 'care'] : ['care'] };
  }
  if (['Connection Seeking', 'My Need For Connection'].includes(part.name)) return { ...common, action: { kind: 'say', text: 'I feel unsure, but I would like to stay connected.' },
    argument: 'I want a chance to be understood.', identityFit: ['connection', 'honesty'] };
  if (['Boundary Protection', 'My Need For Boundaries'].includes(part.name)) return { ...common, action: { kind: 'say', text: 'Please ask before making personal jokes about me.' },
    argument: 'I want our boundaries respected.', identityFit: ['respect', 'honesty'] };
  if (['Conflict Avoidance', 'My Fear Of Conflict'].includes(part.name)) return { ...common, action: { kind: 'wait', text: 'Let us pause and give each other some space.' },
    argument: 'I do not want this to escalate.', identityFit: ['care'] };
  if (['Task Completion', 'Need To Complete My Report'].includes(part.name)) return { executionOrder: [...part.strategies], action: { kind: 'say', text: 'I can return to the next step of the report.' },
    argument: 'I still care about completing the report.', identityFit: ['commitment'] };
  return { ...common, action: { kind: 'ask', text: 'What did you mean, and how do you feel about my uncertainty?' },
    argument: 'I would rather ask than assume what someone means.', identityFit: ['curiosity', 'honesty', 'care'] };
}
export class MockReasoning implements ReasoningProvider {
  async affectInquiry(input: Parameters<NonNullable<ReasoningProvider['affectInquiry']>>[0]) {
    const context = projectAffectSelectionContext(input);
    return affectInquirySchema(context).parse({ primary_c: 'curiosity',
      why_deliberate: 'Fixture requests more expressed context without assuming an interpretation.', secondary_c: null,
      missing_information: 'Reasons and alternatives for the proposed orientation.',
      target_parts: context.availableContributors.slice(0, 16).map(contributor => contributor.partId),
      question: 'What would support or weaken this orientation, and what meaningful action might it help?' });
  }
  async reviseFocusedBid(context: Parameters<NonNullable<ReasoningProvider['reviseFocusedBid']>>[0]): ReturnType<NonNullable<ReasoningProvider['reviseFocusedBid']>> {
    return focusedBidSchema(context).parse({ response: 'Deterministic fixture retains the original recommendation; this is not observed psychological regulation.',
      bid_disposition: 'retain', new_bid: null });
  }
  readonly label = 'deterministic/mock-reasoning-v1';
  async renderSpeech(context: Parameters<NonNullable<ReasoningProvider['renderSpeech']>>[0]) {
    return { text: context.commands.map(command => command.text).join('\n\n') };
  }
  async consolidate(context: ConsolidationContext): ReturnType<ReasoningProvider['consolidate']> {
    const meaningful = context.predictions.filter(p => p.evaluation && p.memoryId);
    if (!['Social Caution', 'My Fear Of Rejection'].includes(context.part.name) || meaningful.length < 2) return { proposals: [
      { kind: 'no_change', reason: 'The selected episodes do not yet justify structural change from my perspective.' },
    ] };
    const proposals: Awaited<ReturnType<ReasoningProvider['consolidate']>>['proposals'] = [];
    const strategy = 'test trust in small steps and keep boundaries available';
    if (!context.part.strategies.includes(strategy)) proposals.push({ kind: 'update', reason: 'I have more than one personally evaluated episode of disclosure.',
      patch: { strategies: [...context.part.strategies, strategy], triggers: ['vulnerability uncertain afraid personal reject trust boundaries'] } });
    for (const memory of context.memories.filter(m => m.version === 1).slice(0, 8)) proposals.push({ kind: 'memory_revision', memoryId: memory.id,
      reason: 'I am considering this episode alongside my other experiences.', gist: 'A bounded exception that I can test again',
      content: `${memory.content} I now see this as one relationship-specific experience, not a guarantee about everyone.` });
    const referent = context.repeatedReferents[0];
    if (referent && !context.population.some(p => p.mode === 'recognition' && p.triggers.includes(referent.name))) proposals.push({
      kind: 'formation', reason: 'Repeated personally evaluated disclosures make this relationship meaningful; a specific context perspective can coexist with my general caution.',
      associationMeaning: 'This learned relationship can contextualize my concern about disclosure.',
      draft: { name: referent.name.trim().split(/\s+/).length <= 2 ? `My Trust In ${referent.name}` : 'My Need For Relational Context', mission: `What best serves me is to recognize where I can cautiously trust ${referent.name}.`, beliefs: [`I have experienced care with ${referent.name}, while still allowing uncertainty.`],
        strategies: ['offer relationship context without dictating behavior'], triggers: [referent.name], stickiness: { retained: false, unresolved: false, concern: '' },
        associations: [], provenance: context.memories.map(m => m.id), lineage: [context.part.id], lifecycle: 'active', mode: 'recognition', temporary: false,
        emotionalCharge: 'Tentative trust', cognitiveCharacteristics: [] },
    });
    return { proposals: proposals.length ? proposals : [{ kind: 'no_change', reason: 'These selected episodes are already represented in my current development.' }] };
  }
  async reinterpret(context: Parameters<ReasoningProvider['reinterpret']>[0]): ReturnType<ReasoningProvider['reinterpret']> {
    if (context.part.beliefs.some(b => b.includes('Some people')) && context.memory.version === 1) return {
      reason: 'My current perspective can consider uncertainty without treating the ancestor as a corrected memory.',
      revision: { content: `${context.memory.content} I can now hold this alongside the possibility that some people respond with care.`, gist: 'An earlier interpretation reconsidered' },
    };
    return { reason: 'Reopening this experience does not persuade me to change the current memory.', revision: null };
  }
  async primitive(context: Parameters<NonNullable<ReasoningProvider['primitive']>>[0]): Promise<Cognition> {
    const name = context.primitive.name;
    return { interpretation: `I notice ${name.toLowerCase()} possibilities in the current interaction.`,
      thought: `I am considering ${name.toLowerCase()}.`, evidenceSummary: [`Immediate ${name.toLowerCase()} registration.`],
      proposal: context.primitive.bidsEnabled === false ? null : { action: { kind: name === 'Signal uncertainty' || name === 'Respond' ? 'say' : 'ask', text: name === 'Signal uncertainty' ? 'I do not know yet.' : name === 'Respond' ? 'I hear you.' : name === 'Seek information' ? 'What can you tell me about this?' : name === 'Seek interaction' ? 'Hello. Would you like to interact?' : `Can I learn a little more about this?` },
        argument: context.primitive.aspects[0]!, identityFit: [name === 'Seek interaction' ? 'connection' : 'curiosity'], executionOrder: [] } };
  }
  async primitiveAnswer(context: Parameters<NonNullable<ReasoningProvider['primitiveAnswer']>>[0], _question: string): ReturnType<NonNullable<ReasoningProvider['primitiveAnswer']>> {
    return { response: `I notice this through ${context.primitive.aspects.join('; ')}.`, bid_disposition: 'retain', new_bid: null };
  }
  async consolidateProcedures(_input: Parameters<NonNullable<ReasoningProvider['consolidateProcedures']>>[0]): Promise<unknown> {
    return { candidates: [], reason: 'Deterministic fixture abstains from conditional procedural inference; this is not model evidence.' };
  }
  async constructed(input: Parameters<NonNullable<ReasoningProvider['constructed']>>[0]): Promise<unknown> {
    if (input.task === 'thought_resources') return { difficulty: 'simple', uncertainty: 'low', urgency: 'routine', reason: 'Deterministic workload fixture; not evidence of real task difficulty.' };
    const current = input.world?.facts.filter(fact => fact.originCycleId === input.world!.cycleId).map(fact => fact.text).join(' ') || input.world?.facts.at(-1)?.text || 'No current observation';
    if (input.task === 'part_cognition') {
      const disposition = input.dispositions?.[0];
      const selfDefinition = input.identity?.traits.map(trait => trait.answer).join('; ') || 'I am present in this situation.';
      const construction = { name: disposition ? disposition.name.split(/\s+/).slice(0, 5).join(' ') : 'self',
        interpretation: disposition?.concern ?? `I am considering ${current}`,
        mission: disposition?.concern ?? selfDefinition, beliefs: [],
        strategies: disposition ? [] : ['Use remembered experience and ask when uncertain.'], triggers: disposition?.cues ?? [current], affect: '',
        evidenceMemoryIds: (input.memories ?? []).map(memory => memory.id), counterevidenceMemoryIds: [],
        concern: disposition?.concern ?? current };
      return this.generatePart(input, construction);
    }
    if (input.task === 'sleep_prediction_review') return { relationship: 'unverifiable', evidence: [], coverage: { supportingMemoryIds: [], contradictingMemoryIds: [], undeterminedMemoryIds: (input.memories ?? []).map(memory => memory.id), assessment: 'Deterministic fixture does not establish outcome evidence.' }, interpretation: 'I have no established test in this deterministic fixture.', causalAttribution: 'Not established.', limitations: 'Mock evidence plumbing; not an observation of cognitive learning.' };
    if (input.task === 'hypothesis_reflection') return { operation: 'resolve', evaluation: {
      assessment: input.outcome === 'correct' ? 'confirmed' : 'contradicted',
      interpretation: 'Fixture records the bounded outcome without interpreting psychological meaning.',
      causalAttribution: 'Not assessed by this deterministic fixture.', evidence: (input.laterEvidence ?? []).map(fact => fact.text),
      evidenceWorldId: input.world!.id }, memory: null, reason: 'Deterministic outcome plumbing only' };
    if (input.task === 'cognition_coverage') return { operation: 'SUFFICIENT', reason: 'Deterministic fixture abstains from hypothesis discovery; no model observation.' };
    if (input.task === 'experiential_formation') return { operation: 'NO_CHANGE', reason: 'Deterministic fixture abstains from experiential learning.' };
    if (input.task === 'memory_synthesis') return { synthesis: null, reason: 'Deterministic fixture abstains from memory synthesis; no model learning evidence.' };
    if (input.task === 'memory_reinterpretation') return { revisions: [], reason: 'Fixture preserves prior subjective interpretations.' };
    if (input.task === 'disposition_learning') {
      return { operations: [{ operation: 'INSUFFICIENT_EVIDENCE', reason: 'Deterministic fixture abstains from structural inference.' }], reason: 'Mock structural reconciliation abstains.' };
    }
    return { recollection: [input.memory, ...(input.memories ?? [])].flatMap(memory => memory ? [memory.encoding?.perceivedDetails.join(' ') || memory.content] : []).join(' ').slice(0, 16000) || 'I do not recall details.',
      uncertainty: 'This is subjective recollection, not verified world truth.' };
  }
  /** Local deterministic fixture composition; no additional inference/transport call. */
  async generatePart(input: ConstructedInput, construction: z.infer<typeof PartFormationSchema>) {
    const world = input.world!;
    const partId = input.workingParts?.[0]?.id ?? `preview_${construction.name.replace(/\s+/g, '_')}`;
    const part = PartSchema.parse({ id: partId, agentId: input.agentId, version: 1, schemaVersion: 1,
      name: construction.name, mission: construction.mission, beliefs: construction.beliefs, strategies: construction.strategies,
      triggers: construction.triggers, temporary: true, lifecycle: 'active', mode: 'perspective', emotionalCharge: construction.affect,
      cognitiveCharacteristics: [], associations: [], lineage: [], provenance: [],
      stickiness: { retained: true, unresolved: true, concern: construction.concern },
      instance: { createdCycle: world.cycleId, threadId: null, interpretation: construction.interpretation,
        evidenceMemoryIds: construction.evidenceMemoryIds, counterevidenceMemoryIds: construction.counterevidenceMemoryIds,
        dispositionBindings: input.dispositionBindings ?? [], retirement: null },
    });
    const context: PartContext = freeze({ world, part, memories: input.memories ?? [],
      prediction: input.predictions?.find(prediction => prediction.partId === input.workingParts?.[0]?.id) ?? null,
      activation: { partId, score: 2, previous: 2, delta: 0, active: true, similarity: 0,
        reasons: input.dispositions?.length ? ['disposition_participation'] : ['combined_preview'] },
      recentThoughts: [],
      dispositions: input.dispositions ?? [], availableContributors: (input.workingParts ?? []).map(part => ({ partId: part.id, name: part.name })),
    });
    const current = world.facts.filter(fact => fact.originCycleId === world.cycleId).map(fact => fact.text).join(' ') || world.facts.at(-1)?.text || 'No current observation';
    return { formation: construction,
      memoryReflection: { content: `I experienced ${current}. ${construction.interpretation}. I remain uncertain about what this means.`,
        evidenceCitations: evidenceCatalog(world).filter(source => source.cycleId === world.cycleId).slice(0, 1).map(source => ({ sourceId: source.sourceId, quote: source.text })),
        context: [current], interpretation: construction.interpretation, affect: construction.affect, perceivedDetails: [current] },
      memoryGist: current,
      cognition: await this.cognize(context) };
  }

  async cognize(context: PartContext): Promise<Cognition> {
    const { part } = context;
    const isCaution = ['Social Caution', 'My Fear Of Rejection'].includes(part.name);
    const learned = part.beliefs.some(b => b.includes('Some people'));
    return {
      interpretation: isCaution ? (learned ? 'I can consider a careful exception to my expectation of rejection.' : 'I worry that showing uncertainty will expose us to rejection.') : `I care about this through my concern: ${part.mission}`,
      thought: `I ${part.strategies[0]?.replace(/^I /, '') ?? 'want to understand what this means for my concern'}`,
      evidenceSummary: [part.beliefs[0] ?? part.mission], proposal: proposal(context),
      ...(part.instance ? { beliefs: part.beliefs, affect: part.emotionalCharge ?? '', localGoal: part.stickiness.concern || null,
        prediction: context.prediction || !/uncertain|personal|question/i.test(context.world.facts.at(-1)?.text ?? '') ? null : {
          expectation: 'I expect a response that will help clarify my concern.', confidence: 0.6,
          capsule: { interpretation: part.instance.interpretation, details: [context.world.facts.at(-1)!.text.slice(0, 240)],
            entities: [context.world.facts.at(-1)!.source], activation: context.activation.score, spike: context.activation.delta, sourceIds: [context.world.id] },
          horizon: 'When a later response clarifies this concern', evaluateAfterCycle: context.world.sequence + 1,
        } } : {}),
    };
  }
  async predict(context: Parameters<ReasoningProvider['predict']>[0]): ReturnType<ReasoningProvider['predict']> {
    const { part, world, activation } = context;
    if (context.prediction) throw new Error('Cannot form another open prediction');
    const newest = world.facts.at(-1)!;
    if (part.instance) return { expectation: 'I expect a response that will help clarify my concern.',
      capsule: { interpretation: part.instance.interpretation, details: [newest.text.slice(0, 240)], entities: [newest.source], activation: activation.score, spike: activation.delta, sourceIds: [world.id] },
      confidence: 0.6, horizon: 'When a later response clarifies this concern', evaluateAfterCycle: world.sequence + 1,
    };
    const learned = part.beliefs.some(b => b.includes('Some people'));
    return {
        expectation: learned ? 'Some people may respond with care if I share uncertainty.' : 'If I express vulnerability, people will reject me.',
        capsule: { interpretation: 'I am deciding whether expressing uncertainty is safe.',
          details: [newest.text.slice(0, 240)], entities: [newest.source], activation: activation.score, spike: activation.delta, sourceIds: [world.id] },
        confidence: part.beliefConfidence ?? 1, horizon: 'When this person responds to our uncertainty', evaluateAfterCycle: world.sequence + 1,
      };
  }
  async question(context: SelfContext): ReturnType<ReasoningProvider['question']> {
    return { why_deliberate: 'The available perspectives need clarification.', primary_c: 'curiosity', secondary_c: 'clarity',
      missing_information: 'What these proposals protect and how they express Identity.', target_parts: context.contributions.map(c => c.partId),
      question: 'What does your proposed approach protect, and how does it fit our Identity?' };
  }
  async answer(context: Parameters<ReasoningProvider['answer']>[0], _question: string): ReturnType<ReasoningProvider['answer']> {
    return { response: `I care about ${context.part.mission}. ${context.part.beliefs[0] ?? ''}`, bid_disposition: 'retain', new_bid: null };
  }
  async evaluate(context: Parameters<ReasoningProvider['evaluate']>[0]): Promise<PredictionUpdate> {
    const newest = context.laterEvidence.at(-1);
    if (!newest) throw new Error('Outcome reflection requires later evidence');
    if (context.part.instance) return { operation: 'resolve', revision: null,
      evaluation: { assessment: context.outcome === 'correct' ? 'confirmed' : 'contradicted',
        interpretation: `I expected ${context.prediction.expectation} I heard ${newest.text}`, causalAttribution: 'This response belongs to this particular encounter, not all future interactions.',
        evidence: [newest.text], evidenceWorldId: context.world.id },
      memory: { content: `I expected ${context.prediction.expectation} Later ${newest.source} said: ${newest.text}. I interpreted this from my concern: ${context.part.instance.interpretation}`,
        gist: `My expectation met a later response: ${newest.text.slice(0, 300)}`, context: [newest.text] }, mutation: null, reason: 'I connected later evidence to this temporary interpretation.' };
    const caring = /thank you|respect you|glad you told|safe to share|appreciate you/i.test(newest.text);
    const rejecting = /pathetic|go away|reject you|do not care/i.test(newest.text);
    if (!caring && !rejecting) return { operation: 'continue', revision: null, evaluation: null, memory: null, mutation: null,
      reason: 'I do not yet have a clear response that resolves my expectation.' };
    const feared = context.prediction.expectation.includes('will reject');
    const confirmed = feared ? rejecting : caring;
    return {
      operation: 'resolve', revision: null,
      evaluation: { assessment: confirmed ? 'confirmed' : 'contradicted',
        interpretation: caring ? 'I expected rejection, but this person stayed engaged with me.' : 'I experienced rejection in this encounter.',
        causalAttribution: 'This response belongs to this encounter; it does not establish how everyone will respond.',
        evidence: [`${newest.source} said: ${newest.text}`], evidenceWorldId: context.world.id },
      memory: { content: caring ? 'I risked showing uncertainty and was met with care. I still want to be careful.' : 'I felt dismissed after opening up.',
        gist: caring ? 'A possible exception to rejection' : 'Disclosure met with dismissal', context: [newest.source] },
      mutation: caring && feared ? { beliefs: ['Some people can hear vulnerability without rejecting me; I still need evidence in each relationship.'] } : null,
      reason: 'I connected a later response to my preserved expectation and interpreted the result.',
    };
  }
}
