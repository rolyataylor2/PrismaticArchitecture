import type { ReasoningProvider } from '../../core/src/contracts.js';

/** Per-Agent model selection is routing configuration, never persistent psychology. */
export class AgentReasoningProvider implements ReasoningProvider {
  readonly label: string;
  constructor(fallback: ReasoningProvider, private readonly resolveAgent: (agentId: string) => ReasoningProvider) {
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
  constructed(input: Parameters<NonNullable<ReasoningProvider['constructed']>>[0]) {
    const provider = this.provider(input.agentId);
    if (!provider.constructed) throw new Error('Reasoning provider does not support constructed cognition');
    return provider.constructed(input);
  }
  cognize(context: Parameters<ReasoningProvider['cognize']>[0]) { return this.provider(context.part.agentId).cognize(context); }
  predict(context: Parameters<ReasoningProvider['predict']>[0]) { return this.provider(context.part.agentId).predict(context); }
  question(context: Parameters<ReasoningProvider['question']>[0]) { return this.provider(context.identity.agentId).question(context); }
  affectInquiry(context: Parameters<NonNullable<ReasoningProvider['affectInquiry']>>[0]) {
    const provider = this.provider(context.identity.agentId);
    if (!provider.affectInquiry) throw new Error('Reasoning provider does not support affect inquiry');
    return provider.affectInquiry(context);
  }
  reviseFocusedBid(context: Parameters<NonNullable<ReasoningProvider['reviseFocusedBid']>>[0]) {
    const provider = this.provider(context.part.agentId);
    if (!provider.reviseFocusedBid) throw new Error('Reasoning provider does not support focused bid revision');
    return provider.reviseFocusedBid(context);
  }
  answer(context: Parameters<ReasoningProvider['answer']>[0], question: string) { return this.provider(context.part.agentId).answer(context, question); }
  evaluate(context: Parameters<ReasoningProvider['evaluate']>[0]) { return this.provider(context.part.agentId).evaluate(context); }
  consolidate(context: Parameters<ReasoningProvider['consolidate']>[0]) { return this.provider(context.part.agentId).consolidate(context); }
  reinterpret(context: Parameters<ReasoningProvider['reinterpret']>[0]) { return this.provider(context.part.agentId).reinterpret(context); }
}
