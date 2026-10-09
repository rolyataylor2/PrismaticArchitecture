import { MockDecisions, MockEmbeddings, MockReasoning } from './mock.js';
import { OllamaProvider } from './ollama.js';
import { JevDecisions, type JevTransport } from './jev.js';
import { JevHttpTransport } from './jev-http.js';
import { OpenAIProvider } from './openai.js';
import { XaiProvider } from './xai.js';
import type { PromptResolver } from './prompts.js';

export function configuredProviders(environment: NodeJS.ProcessEnv = process.env, jevTransport?: JevTransport, promptResolver?: PromptResolver) {
  const mode = environment.ONTOAGENTIC_PROVIDER ?? 'mock';
  if (!['mock', 'ollama', 'openai', 'xai'].includes(mode)) throw new Error('ONTOAGENTIC_PROVIDER must be mock, ollama, openai, or xai');
  const reasoning = mode === 'openai' ? new OpenAIProvider(environment.OPENAI_API_KEY ?? '', environment.OPENAI_MODEL, fetch, promptResolver)
    : mode === 'xai' ? new XaiProvider(environment.XAI_API_KEY ?? '', environment.XAI_MODEL, fetch, promptResolver)
    : mode === 'ollama' ? new OllamaProvider(environment.OLLAMA_MODEL ?? '', environment.OLLAMA_URL, fetch, promptResolver) : new MockReasoning();
  const decisionMode = environment.ONTOAGENTIC_DECISIONS ?? ((mode === 'openai' || mode === 'xai') ? 'jev' : mode === 'ollama' ? 'ollama' : 'mock');
  if (!['mock', 'ollama', 'jev'].includes(decisionMode)) throw new Error('Unknown decision provider');
  const decisions = decisionMode === 'jev' ? new JevDecisions(jevTransport ?? new JevHttpTransport(environment.JEV_API_KEY ?? environment.TYPESAFE_API_KEY ?? '', environment.JEV_MODEL, fetch), promptResolver)
    : decisionMode === 'ollama' ? new OllamaProvider(environment.OLLAMA_MODEL ?? '', environment.OLLAMA_URL) : new MockDecisions();
  return { reasoning, decisions, embeddings: new MockEmbeddings() };
}
