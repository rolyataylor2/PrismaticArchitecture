import { modelProvider, vendorModel } from '../../core/src/generative-models.js';
import { OpenAIProvider, type UsageObserver } from './openai.js';
import { XaiProvider } from './xai.js';
import { CompatibleChatProvider } from './compatible-chat.js';
import type { PromptResolver } from './prompts.js';
export function generativeProvider(model: string, key: string, resolver?: PromptResolver, usage?: UsageObserver, qwenBaseUrl?: string) {
  const provider = modelProvider(model);
  if (provider === 'openai') return new OpenAIProvider(key, model, fetch, resolver, 'openai', usage);
  if (provider === 'xai') return new XaiProvider(key, model, fetch, resolver, usage);
  return new CompatibleChatProvider(provider, key, vendorModel(model), fetch, resolver, usage, qwenBaseUrl);
}
