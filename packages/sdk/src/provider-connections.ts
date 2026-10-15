import type { Store } from '../../core/src/contracts.js';
import type { SecretVault } from '../../providers/src/secret-vault.js';

export const supportedProviders = [
  { id: 'openai', label: 'OpenAI', purpose: 'Generative models' },
  { id: 'xai', label: 'xAI', purpose: 'Generative models' },
  { id: 'jev', label: 'JEV', purpose: 'Classifier' },
  { id: 'cloudflare', label: 'Cloudflare', purpose: 'Image generation' },
] as const;
export type ConnectedProvider = typeof supportedProviders[number]['id'];
export function serverProviderKey(provider: ConnectedProvider): string {
  return (provider === 'openai' ? process.env.OPENAI_API_KEY : provider === 'xai' ? process.env.XAI_API_KEY
    : provider === 'jev' ? process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY : undefined) ?? '';
}
export function encryptedProviderKey(store: Store, agentId: string, provider: ConnectedProvider): string | null {
  const connected = store.agentProviderConnections(agentId).find(item => item.provider === provider);
  if (connected) return connected.encryptedApiKey;
  if (provider === 'jev') return store.agentClassifierSettings(agentId)?.encryptedApiKey ?? null;
  if (provider === 'cloudflare') return store.agentImageSettings(agentId)?.encryptedApiKey ?? null;
  const legacy = store.agentProviderSettings(agentId);
  return legacy && (legacy.model === 'grok-4.3' ? 'xai' : 'openai') === provider ? legacy.encryptedApiKey : null;
}
export function providerApiKey(store: Store, vault: SecretVault, agentId: string, provider: ConnectedProvider): string {
  const encrypted = encryptedProviderKey(store, agentId, provider);
  return encrypted ? vault.decrypt(encrypted) : serverProviderKey(provider);
}
export function providerConnections(store: Store, agentId: string) {
  return { supportedProviders, providers: supportedProviders.flatMap(provider => {
    const hasAgentKey = Boolean(encryptedProviderKey(store, agentId, provider.id));
    const hasServerKey = Boolean(serverProviderKey(provider.id));
    return hasAgentKey || hasServerKey ? [{ ...provider, hasAgentKey, hasServerKey, ...(provider.id === 'cloudflare' ? { accountId: store.agentImageSettings(agentId)?.accountId ?? '' } : {}) }] : [];
  }) };
}
/** Remove credentials only; model selection and unrelated provider keys stay intact. */
export function removeProviderConnection(store: Store, agentId: string, provider: ConnectedProvider): void {
  store.transaction(() => {
    store.deleteAgentProviderConnection(agentId, provider);
    if (provider === 'jev') {
      const previous = store.agentClassifierSettings(agentId);
      if (previous) store.saveAgentClassifierSettings(agentId, { ...previous, encryptedApiKey: null });
    } else if (provider === 'cloudflare') {
      const previous = store.agentImageSettings(agentId);
      if (previous) store.saveAgentImageSettings(agentId, previous.accountId, null);
    } else {
      const previous = store.agentProviderSettings(agentId);
      if (previous && (previous.model === 'grok-4.3' ? 'xai' : 'openai') === provider)
        store.saveAgentProviderSettings(agentId, { ...previous, encryptedApiKey: null });
    }
  });
}
