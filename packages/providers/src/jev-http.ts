import { z } from 'zod';
import { partActivationCriteria } from '../../core/src/primitives.js';
import { InfrastructureError, ContextLimitError } from '../../core/src/contracts.js';
import type { JevTransport } from './jev.js';

const probability = z.number().min(0).max(1);
const probabilities = z.record(z.string(), probability);
const scoreAnswer = z.object({ type: z.literal('score'), score: z.number().min(0).max(4), probabilities,
  legend: z.record(z.string(), z.string()), confidence: probability });
const choiceAnswer = z.object({ type: z.literal('choice'), choice: z.string(), probabilities, confidence: probability });


function distribution(values: Record<string, number>, expected: string[]) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  // Decimal totals such as 0.99 can exceed the inclusive 0.01 tolerance
  // by floating-point roundoff. Allow only a summation-sized numeric margin.
  const roundoff = Number.EPSILON * Math.max(1, expected.length) * 4;
  if (Object.keys(values).length !== expected.length || expected.some(key => !(key in values))
      || Math.abs(total - 1) > 0.01 + roundoff) {
    throw new InfrastructureError('provider', `Jev returned an invalid probability distribution (${Object.keys(values).length}/${expected.length} options; sum ${total})`);
  }
  return Object.entries(values).map(([label, probability]) => ({ label, probability }));
}

/** Official TypeSafe System One API: https://docs.typesafe.ai/api */
export class JevHttpTransport implements JevTransport {
  readonly label: string;
  constructor(private readonly apiKey: string, private readonly model = 'jev-latest', private readonly transport: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error('JEV_API_KEY (or TYPESAFE_API_KEY) is required for the Jev transport');
    if (!model.trim()) throw new Error('JEV_MODEL must not be empty');
    this.label = `jev/${model}`;
  }
  private async request<T>(state: unknown, questions: Record<string, unknown>, parse: (answers: Record<string, unknown>) => T): Promise<T> {
    try {
      const response = await this.transport('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, state, questions }),
      });
      if (!response.ok) {
        if (response.status === 400) {
          const detail = await response.text();
          if (/context|token/i.test(detail) && /limit|exceed|too long|length/i.test(detail)) throw new ContextLimitError('Jev');
        }
        throw new InfrastructureError('provider', `Jev HTTP ${response.status}`);
      }
      const body = z.object({ answers: z.record(z.string(), z.unknown()) }).parse(await response.json());
      if (Object.keys(body.answers).length !== Object.keys(questions).length || Object.keys(questions).some(key => !(key in body.answers))) {
        throw new InfrastructureError('provider', 'Jev returned missing or unexpected answers');
      }
      return parse(body.answers);
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('provider', 'Jev request failed or returned invalid structured output');
    }
  }
  async scores(request: Parameters<JevTransport['scores']>[0]) {
    if (!request.questions.length) return [];
    return this.request(request.state, Object.fromEntries(request.questions.map(q => [q.id, {
      type: 'score', instructions: `${q.question} Judge this question using the task directions and context in state.`, criteria: q.criteria ?? partActivationCriteria,
    }])), answers => request.questions.map(q => {
      const answer = scoreAnswer.parse(answers[q.id]);
      const levels = q.criteria ?? partActivationCriteria;
      if (levels.some((level, index) => answer.legend[String(index)] !== level)) throw new InfrastructureError('provider', 'Jev returned an unexpected score legend');
      return { partId: q.id, score: answer.score, distribution: distribution(answer.probabilities, levels.map((_, index) => String(index))) };
    }));
  }
  async choice(request: Parameters<JevTransport['choice']>[0]) {
    if (request.choices.length > 255) throw new InfrastructureError('provider', 'Jev supports at most 255 choice options');
    const criteria = Object.fromEntries(request.choices.map(choice => [choice, choice]));
    return this.request(request.state, { selection: {
      type: 'choice', criteria,
      instructions: 'Select one available option using the task directions and context in state. Activation is not authority.',
    } }, answers => {
      const answer = choiceAnswer.parse(answers.selection);
      if (!request.choices.includes(answer.choice)) throw new InfrastructureError('provider', 'Jev selected an unavailable option');
      return { choice: answer.choice,
        explanation: 'Jev selected this option using the task rubric. The API supplies probabilities, not a textual rationale.',
        identityConflict: 'Not assessed: the Jev Choice API does not return an Identity-conflict explanation.',
        distribution: distribution(answer.probabilities, request.choices) };
    });
  }
}
