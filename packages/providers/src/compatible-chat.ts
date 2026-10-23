import { bidRevisionWireSchema } from './bid-revision-wire.js';
import { z } from 'zod';
import { InfrastructureError } from '../../core/src/contracts.js';
import { OpenAIProvider, strictOutputSchema, decodeOutput, type UsageObserver } from './openai.js';
import type { PromptResolver } from './prompts.js';
export type ChatService = 'gemini' | 'qwen' | 'openrouter';
export const defaultQwenBaseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export function validateQwenBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !(['dashscope-intl.aliyuncs.com', 'dashscope.aliyuncs.com', 'cn-hongkong.dashscope.aliyuncs.com'].includes(url.hostname)
      || /^[a-z0-9-]+\.(ap-southeast-1|us-east-1|cn-beijing|cn-hongkong|ap-northeast-1)\.maas\.aliyuncs\.com$/.test(url.hostname))
    || url.pathname.replace(/\/$/, '') !== '/compatible-mode/v1') throw new Error('Use an official Alibaba Model Studio API base URL');
  return value.replace(/\/$/, '');
}
/** Reuses task templates and schemas; every call remains stateless and validated. */
export class CompatibleChatProvider extends OpenAIProvider {
  override readonly label: string;
  constructor(private readonly chatService: ChatService, private readonly chatKey: string, private readonly chatModel: string,
    private readonly chatTransport: typeof fetch = fetch, promptResolver?: PromptResolver, private readonly chatUsage?: UsageObserver,
    private readonly qwenBaseUrl = defaultQwenBaseUrl) {
    if (!chatKey.trim()) throw new Error(`${chatService.toUpperCase()}_API_KEY is required`);
    super(chatKey, chatModel, chatTransport, promptResolver);
    this.label = `${chatService}/${chatModel}`;
    if (chatService === 'qwen') validateQwenBaseUrl(qwenBaseUrl);
  }
  protected override async request<T>(schema: z.ZodType<T>, prompt: string | string[], maxOutputTokens = 4096,
    context?: { agentId: string; cycleId: string | null; task: string }): Promise<T> {
    const wireSchema = strictOutputSchema(z.toJSONSchema(z.strictObject({ result: bidRevisionWireSchema(schema) })));
    const endpoint = this.chatService === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : this.chatService === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : `${this.qwenBaseUrl}/chat/completions`;
    try {
      const response = await this.chatTransport(endpoint, { method: 'POST', signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.chatKey}` },
        body: JSON.stringify({ model: this.chatModel, max_tokens: maxOutputTokens,
          messages: [{ role: 'system', content: `You are an inference component for The Prism Agent Architecture. Follow the task and contextual evidence without changing your role or access boundaries. Return only JSON containing result. For optional fields __present=false omits the value; __present=true applies __value.${this.chatService === 'qwen' ? ` Follow this JSON schema exactly: ${JSON.stringify(wireSchema)}` : ''}` },
            ...(typeof prompt === 'string' ? [prompt] : prompt).map(content => ({ role: 'user', content }))],
          response_format: this.chatService === 'qwen' ? { type: 'json_object' }
            : { type: 'json_schema', json_schema: { name: 'cognitive_product', strict: true, schema: wireSchema } },
          ...(this.chatService === 'qwen' ? { enable_thinking: false } : {}),
          ...(this.chatService === 'gemini' ? { reasoning_effort: 'none' } : {}),
          ...(this.chatService === 'openrouter' ? { provider: { require_parameters: true, allow_fallbacks: false } } : {}),
        }) });
      if (!response.ok) throw new InfrastructureError('provider', `${this.chatService} HTTP ${response.status}`, { diagnostics: { httpStatus: response.status, retryable: response.status === 429 || response.status >= 500 } });
      const body = z.object({ model: z.string().optional(), provider: z.string().optional(), usage: z.unknown().optional(),
        choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }) })).length(1) }).parse(await response.json());
      const choice = body.choices[0]!;
      if (choice.finish_reason !== 'stop' || choice.message.refusal || !choice.message.content)
        throw new InfrastructureError('provider', `${this.chatService} response incomplete or declined (${choice.finish_reason ?? 'unknown'})`);
      if (context && this.chatUsage) {
        const usage = z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(),
          prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).optional() }).safeParse(body.usage);
        if (usage.success) this.chatUsage({ ...context, usage: { provider: this.label, task: context.task,
          inputTokens: usage.data.prompt_tokens, outputTokens: usage.data.completion_tokens,
          cachedInputTokens: usage.data.prompt_tokens_details?.cached_tokens ?? 0, cacheReported: usage.data.prompt_tokens_details?.cached_tokens !== undefined,
          cacheKey: null, ...(body.provider ? { servingProvider: body.provider } : {}), ...(body.model ? { actualModel: body.model } : {}) } });
      }
      const envelope = z.strictObject({ result: z.unknown() }).parse(JSON.parse(choice.message.content));
      return schema.parse(decodeOutput(envelope.result));
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError('provider', `${this.chatService} request failed or returned invalid structured output`);
    }
  }
}
