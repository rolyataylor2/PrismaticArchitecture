import { scoreSelf, selfScoreCriteria } from '../../core/src/self-scoring.js';
import { selfChoices } from '../../core/src/context.js';
import { effectivePrimitive, partActivationCriteria, primitiveActivationCriteria } from '../../core/src/primitives.js';
import { ActivationScoreSchema, ChoiceSchema, PredictionOutcomeSchema, type SelfContext } from '../../core/src/domain.js';
import { InfrastructureError, type DecisionProvider } from '../../core/src/contracts.js';
import { renderPartPrompt, renderTaskPrompt, type PromptResolver } from './prompts.js';

/** Integration contract for an installed Jev SDK/bridge. No undocumented vendor HTTP endpoint is assumed. */
export interface JevTransport {
  readonly label?: string;
  scores(request: { state: string; questions: { id: string; kind: 'Score'; question: string; minimum: 0; maximum: 4; criteria?: string[] }[] }): Promise<unknown>;
  choice(request: { state: string; choices: string[] }): Promise<unknown>;
}
export class JevDecisions implements DecisionProvider {
  readonly label: string;
  constructor(private readonly transport: JevTransport, private readonly promptResolver?: PromptResolver) { this.label = transport.label ?? 'Jev via configured transport'; }
  async score(input: Parameters<DecisionProvider['score']>[0]) {
    const prompt = renderTaskPrompt(input.world.agentId, 'activation', { ...input, primitives: input.primitives ?? [], primitiveSensitivities: input.primitiveSensitivities ?? [], partActivationContext: input.partActivationContext ?? [] }, this.promptResolver);
    return ActivationScoreSchema.array().parse(await this.transport.scores({ state: prompt,
      questions: [...input.candidates.map(p => ({ id: p.id, kind: 'Score' as const, minimum: 0 as const, maximum: 4 as const, criteria: partActivationCriteria,
        question: `Evaluate current activation of candidate ${p.id}, learned Part (${p.name}), independently using its own record and owning-Part context. Apply the task directions in state. Do not judge correctness, rationality, usefulness, morality, Identity alignment or likely selection. Do not discount young Parts. Stickiness and previous activation are context, not automatic activation. Ignore primitive temperament weighting for this Part. Do not compare candidates or normalize activation.` })),
        ...(input.primitives ?? []).map(raw => {
          const primitive = effectivePrimitive(raw);
          return { id: primitive.id, kind: 'Score' as const, minimum: 0 as const, maximum: 4 as const, criteria: primitiveActivationCriteria,
            question: `Evaluate primitive ${primitive.id} (${primitive.name}), family ${primitive.family}, independently. ${primitive.activationPrompt} Aspects: ${primitive.aspects.join('; ')}. Use current WorldState and supplied primitiveSensitivities only. Do not use learned Part beliefs, private memories or predictions to judge immediate registration. Do not assess Identity alignment, rationality or wisdom of action. Do not compare or normalize candidates.` };
        })] }));
  }
  async judge(input: Parameters<NonNullable<DecisionProvider['judge']>>[0]) {
    return ActivationScoreSchema.array().parse(await this.transport.scores({
      state: renderTaskPrompt(input.agentId, input.task, input, this.promptResolver),
      questions: input.candidates.map(candidate => ({ id: candidate.id, kind: 'Score' as const,
        minimum: 0 as const, maximum: 4 as const, question: candidate.question })),
    }));
  }
  async recall(input: Parameters<NonNullable<DecisionProvider['recall']>>[0]) {
    const state = renderTaskPrompt(input.world.agentId, 'memory_relevance', input, this.promptResolver);
    return ActivationScoreSchema.array().parse(await this.transport.scores({ state,
      questions: input.entries.map(entry => ({ id: entry.memory.id, kind: 'Score' as const, minimum: 0 as const, maximum: 4 as const,
        criteria: ['irrelevant', 'slight association', 'potentially useful', 'strongly useful', 'directly recall-worthy'],
        question: `Score functional recall relevance of memory ${entry.memory.id} for its owner ${entry.part.id} independently. Apply the task directions. Relevance is not Part activation.` })) }));
  }
  async shouldPredict(context: Parameters<DecisionProvider['shouldPredict']>[0]) {
    if (context.prediction) return false;
    const state = renderPartPrompt(context.part.agentId, 'prediction_gate', context, this.promptResolver);
    try {
      const result = ChoiceSchema.parse(await this.transport.choice({ state, choices: ['yes', 'no'] }));
      if (!['yes', 'no'].includes(result.choice)) throw new Error('Unavailable prediction gate choice');
      return result.choice === 'yes';
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('provider', 'Jev prediction gate failed or returned invalid output');
    }
  }
  async checkPrediction(context: Parameters<DecisionProvider['checkPrediction']>[0]) {
    const state = renderPartPrompt(context.part.agentId, 'prediction_outcome', context, this.promptResolver);
    try {
      const result = ChoiceSchema.parse(await this.transport.choice({ state, choices: [...PredictionOutcomeSchema.options] }));
      return PredictionOutcomeSchema.parse(result.choice);
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('provider', 'Jev prediction outcome check failed or returned invalid output');
    }
  }
  async checkHypothesis(context: Parameters<NonNullable<DecisionProvider['checkHypothesis']>>[0]) {
    try {
      const state = renderTaskPrompt(context.world.agentId, 'hypothesis_outcome', context, this.promptResolver);
      const result = ChoiceSchema.parse(await this.transport.choice({ state, choices: [...PredictionOutcomeSchema.options] }));
      return PredictionOutcomeSchema.parse(result.choice);
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('provider', 'Jev gap hypothesis outcome check failed or returned invalid output');
    }
  }
  async choose(context: SelfContext) {
    const choices = selfChoices(context);
    const prompt = renderTaskPrompt(context.identity.agentId, 'arbitration', { ...context, choices }, this.promptResolver);
    return scoreSelf(context, async options => this.transport.scores({ state: prompt,
      questions: options.map(option => ({ id: option, kind: 'Score', minimum: 0, maximum: 4, criteria: selfScoreCriteria,
        question: `Score ${option} by relevance, Identity consistency, contextual appropriateness and importance using only mediated context. Discount redundancy, conflict and poor support. Score independently; all external bids above 2 are executed when external behavior is chosen. DELIBERATE measures further inquiry, NOTHING no action, and CONTINUE_EXECUTION exclusively retains the previously selected activity without interruption.` })) }));
  }
}
