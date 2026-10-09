import { OpenAIProvider, type UsageObserver } from './openai.js';
import type { PromptResolver } from './prompts.js';

/** xAI's Responses-compatible transport; never accepts an OpenAI credential fallback. */
export class XaiProvider extends OpenAIProvider {
  constructor(apiKey: string, model = 'grok-4.3', transport: typeof fetch = fetch, promptResolver?: PromptResolver, usageObserver?: UsageObserver) {
    super(apiKey, model, transport, promptResolver, 'xai', usageObserver);
  }
}
