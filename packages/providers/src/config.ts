import { CompatibleChatProvider } from './compatible-chat.js';
import { InfrastructureError } from '../../core/src/contracts.js';
import { projectEnvironmentValue } from './environment.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from './mock.js';
import { OllamaProvider } from './ollama.js';
import { JevDecisions, type JevTransport } from './jev.js';
import { JevHttpTransport } from './jev-http.js';
import { OpenAIProvider } from './openai.js';
import { XaiProvider } from './xai.js';
import type { PromptResolver } from './prompts.js';

export function configuredProviders(environment: NodeJS.ProcessEnv = process.env, jevTransport?: JevTransport, promptResolver?: PromptResolver) {
  const mode = projectEnvironmentValue('PROVIDER', environment) ?? 'mock';
  if (!['mock', 'ollama', 'openai', 'xai', 'gemini', 'qwen', 'openrouter'].includes(mode)) throw new Error('PRISM_PROVIDER must be mock, ollama, openai, xai, gemini, qwen, or openrouter');
  const reasoning = mode === 'openai' ? new OpenAIProvider(environment.OPENAI_API_KEY ?? '', environment.OPENAI_MODEL, fetch, promptResolver)
    : mode === 'xai' ? new XaiProvider(environment.XAI_API_KEY ?? '', environment.XAI_MODEL, fetch, promptResolver)
    : mode === 'gemini' ? new CompatibleChatProvider('gemini', environment.GEMINI_API_KEY ?? '', environment.GEMINI_MODEL ?? 'gemini-2.5-flash-lite', fetch, promptResolver)
    : mode === 'qwen' ? new CompatibleChatProvider('qwen', environment.QWEN_API_KEY ?? environment.DASHSCOPE_API_KEY ?? '', environment.QWEN_MODEL ?? 'qwen-flash', fetch, promptResolver, undefined, environment.QWEN_BASE_URL)
    : mode === 'openrouter' ? new CompatibleChatProvider('openrouter', environment.OPENROUTER_API_KEY ?? '', environment.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash-lite', fetch, promptResolver)
    : mode === 'ollama' ? new OllamaProvider(environment.OLLAMA_MODEL ?? '', environment.OLLAMA_URL, fetch, promptResolver) : new MockReasoning();
  const decisionMode = projectEnvironmentValue('DECISIONS', environment) ?? (['openai', 'xai', 'gemini', 'qwen', 'openrouter'].includes(mode) ? 'jev' : mode === 'ollama' ? 'ollama' : 'mock');
  if (!['mock', 'ollama', 'jev'].includes(decisionMode)) throw new Error('Unknown decision provider');
  const jevKey = environment.JEV_API_KEY ?? environment.TYPESAFE_API_KEY ?? '';
  const missingJevKey = async (): Promise<never> => { throw new InfrastructureError('provider', 'Set a JEV API key in Agent Classifier settings or JEV_API_KEY / TYPESAFE_API_KEY on the server'); };
  const decisions = decisionMode === 'jev' ? new JevDecisions(jevTransport ?? (jevKey
    ? new JevHttpTransport(jevKey, environment.JEV_MODEL, fetch)
    : { label: `jev/${environment.JEV_MODEL ?? 'jev-latest'}`, scores: missingJevKey, choice: missingJevKey }), promptResolver)
    : decisionMode === 'ollama' ? new OllamaProvider(environment.OLLAMA_MODEL ?? '', environment.OLLAMA_URL, fetch, promptResolver) : new MockDecisions();
  return { reasoning, decisions, embeddings: new MockEmbeddings() };
}
