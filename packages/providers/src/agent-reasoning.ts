import type { ReasoningProvider, InferenceSource, PartContext } from '../../core/src/contracts.js';
import { ThoughtResourcesSchema, ThoughtRoutingSettingsSchema, thoughtResourceModel, type ThoughtRoutingSettings, type ThoughtResources } from '../../core/src/thought-resources.js';
import type { ConstructedInput } from '../../core/src/constructed-domain.js';

export type ThoughtRouting = { settings: (agentId: string) => ThoughtRoutingSettings | null;
  historyEscalation?: (input: ConstructedInput, provider: string, threshold: number) => boolean;
  record: (input: ConstructedInput, assessment: ThoughtResources, model: string, reason: 'workload' | 'repeated_prediction_contradiction', purpose: 'part_cognition' | 'answer' | 'focused_bid_revision') => void };

/** Per-Agent model selection is routing configuration, never persistent psychology. */
export class AgentReasoningProvider implements ReasoningProvider {
  readonly label: string;
  private readonly sources = new WeakMap<object, InferenceSource>();
  sourceFor(product: unknown): InferenceSource | undefined { return product && typeof product === 'object' ? this.sources.get(product) : undefined; }
  constructor(fallback: ReasoningProvider, private readonly resolveAgent: (agentId: string, model?: string) => ReasoningProvider, private readonly routing?: ThoughtRouting) {
    this.label = fallback.label;
  }
  private provider(agentId: string): ReasoningProvider { return this.resolveAgent(agentId); }
  labelForAgent(agentId: string): string { return this.provider(agentId).label; }
  primitive(context: Parameters<NonNullable<ReasoningProvider['primitive']>>[0]) {
    const provider = this.provider(context.world.agentId);
    if (!provider.primitive) throw new Error('Reasoning provider does not support primitive cognition');
    return provider.primitive(context);
  }
  primitiveAnswer(context: Parameters<NonNullable<ReasoningProvider['primitiveAnswer']>>[0], question: string) {
    const provider = this.provider(context.world.agentId);
    if (!provider.primitiveAnswer) throw new Error('Reasoning provider does not support primitive inquiry responses');
    return provider.primitiveAnswer(context, question);
  }
  renderSpeech(context: Parameters<NonNullable<ReasoningProvider['renderSpeech']>>[0]) {
    const provider = this.provider(context.agentId);
    if (!provider.renderSpeech) throw new Error('Reasoning provider does not support speech realization');
    return provider.renderSpeech(context);
  }
  consolidateProcedures(input: Parameters<NonNullable<ReasoningProvider['consolidateProcedures']>>[0]) {
    const provider = this.provider(input.agentId);
    if (!provider.consolidateProcedures) throw new Error('Reasoning provider does not support procedural consolidation');
    return provider.consolidateProcedures(input);
  }
  private async thoughtProvider(input: ConstructedInput, purpose: 'part_cognition' | 'answer' | 'focused_bid_revision') {
    const configured = this.routing?.settings(input.agentId);
    if (!configured?.enabled) return this.provider(input.agentId);
    const settings = ThoughtRoutingSettingsSchema.parse(configured);
    const assessor = this.resolveAgent(input.agentId, settings.intuitiveModel);
    if (!assessor.constructed) throw new Error('Reasoning provider does not support workload assessment');
    const assessment = ThoughtResourcesSchema.parse(await assessor.constructed({ ...input, task: 'thought_resources' }));
    let model = thoughtResourceModel(settings, assessment);
    const escalated = model === settings.intuitiveModel && settings.intuitiveModel !== settings.deliberativeModel
      && this.routing?.historyEscalation?.(input, assessor.label, settings.escalateAfterIncorrectPredictions ?? 2);
    if (escalated) model = settings.deliberativeModel;
    this.routing!.record(input, assessment, model, escalated ? 'repeated_prediction_contradiction' : 'workload', purpose);
    return this.resolveAgent(input.agentId, model);
  }
  private workload(context: PartContext, question: string): ConstructedInput {
    return { task: 'part_cognition', agentId: context.part.agentId, world: context.world,
      dispositions: context.dispositions ?? [], dispositionBindings: context.part.instance?.dispositionBindings ?? [],
      memories: context.memories, workingParts: [context.part], predictions: context.prediction ? [context.prediction] : [], question };
  }
  private async attributed<T>(provider: ReasoningProvider, pending: Promise<T>): Promise<T> {
    const result = await pending;
    const source = provider.sourceFor?.(result);
    if (source && result && typeof result === 'object') this.sources.set(result, source);
    return result;
  }
  async constructed(input: Parameters<NonNullable<ReasoningProvider['constructed']>>[0]) {
    const provider = input.task === 'part_cognition' ? await this.thoughtProvider(input, 'part_cognition') : this.provider(input.agentId);
    if (!provider.constructed) throw new Error('Reasoning provider does not support constructed cognition');
    return this.attributed(provider, provider.constructed(input));
  }
  cognize(context: Parameters<ReasoningProvider['cognize']>[0]) { return this.provider(context.part.agentId).cognize(context); }
  predict(context: Parameters<ReasoningProvider['predict']>[0]) { return this.provider(context.part.agentId).predict(context); }
  question(context: Parameters<ReasoningProvider['question']>[0]) { return this.provider(context.identity.agentId).question(context); }
  affectInquiry(context: Parameters<NonNullable<ReasoningProvider['affectInquiry']>>[0]) {
    const provider = this.provider(context.identity.agentId);
    if (!provider.affectInquiry) throw new Error('Reasoning provider does not support affect inquiry');
    return provider.affectInquiry(context);
  }
  async reviseFocusedBid(context: Parameters<NonNullable<ReasoningProvider['reviseFocusedBid']>>[0]) {
    const provider = await this.thoughtProvider(this.workload(context, `Reconsider my expressed recommendation under this selected voluntary focus: ${JSON.stringify(context.selectedFocus.proposals)}`), 'focused_bid_revision');
    if (!provider.reviseFocusedBid) throw new Error('Reasoning provider does not support focused bid revision');
    return this.attributed(provider, provider.reviseFocusedBid(context));
  }
  async answer(context: Parameters<ReasoningProvider['answer']>[0], question: string) {
    const provider = await this.thoughtProvider(this.workload(context, question), 'answer');
    return this.attributed(provider, provider.answer(context, question));
  }
  evaluate(context: Parameters<ReasoningProvider['evaluate']>[0]) { return this.provider(context.part.agentId).evaluate(context); }
  consolidate(context: Parameters<ReasoningProvider['consolidate']>[0]) { return this.provider(context.part.agentId).consolidate(context); }
  reinterpret(context: Parameters<ReasoningProvider['reinterpret']>[0]) { return this.provider(context.part.agentId).reinterpret(context); }
}
