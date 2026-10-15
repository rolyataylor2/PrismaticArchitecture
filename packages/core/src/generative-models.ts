/** Provider identity is configuration, independent of cognitive roles. */
export type GenerativeProvider = 'openai' | 'xai' | 'gemini' | 'qwen' | 'openrouter';
export const generativeModels = [
  { id: 'gpt-5-nano', label: 'GPT-5 nano', provider: 'openai' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', provider: 'openai' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', provider: 'openai' },
  { id: 'grok-4.3', label: 'Grok 4.3 · xAI', provider: 'xai' },
  { id: 'gemini:gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite · Google', provider: 'gemini' },
  { id: 'gemini:gemini-2.5-flash', label: 'Gemini 2.5 Flash · Google', provider: 'gemini' },
  { id: 'qwen:qwen-flash', label: 'Qwen Flash · Alibaba', provider: 'qwen' },
  { id: 'qwen:qwen-plus', label: 'Qwen Plus · Alibaba', provider: 'qwen' },
  { id: 'openrouter:google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite · OpenRouter', provider: 'openrouter' },
  { id: 'openrouter:qwen/qwen3.6-flash', label: 'Qwen3.6 Flash · OpenRouter', provider: 'openrouter' },
] as const;
export function modelProvider(model: string): GenerativeProvider {
  const known = generativeModels.find(item => item.id === model);
  if (known) return known.provider;
  if (/^openrouter:[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(model)
    && !model.endsWith(':batch') && !/^openrouter:openrouter\/(auto|free)$/.test(model)) return 'openrouter';
  throw new Error('Choose a supported inference model');
}
export const vendorModel = (model: string): string => model.includes(':') ? model.slice(model.indexOf(':') + 1) : model;
export const modelLabel = (model: string): string => `${modelProvider(model)}/${vendorModel(model)}`;
