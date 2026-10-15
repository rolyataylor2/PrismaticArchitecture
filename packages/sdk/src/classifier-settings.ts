import { providerApiKey } from './provider-connections.js';
import type { DecisionProvider, Store } from '../../core/src/contracts.js';
import { JevDecisions } from '../../providers/src/jev.js';
import { JevHttpTransport } from '../../providers/src/jev-http.js';
import type { SecretVault } from '../../providers/src/secret-vault.js';
import { promptResolver } from './prompt-settings.js';
import { observeProvider } from './provider-observation.js';

/** Route existing bounded tasks without expanding their cognitive input. */
export function agentClassifiers(store: Store, fallback: DecisionProvider, vault: SecretVault): DecisionProvider {
  const resolve = (agentId: string) => {
    const saved = store.agentClassifierSettings(agentId);
    if (!saved) return observeProvider(store, fallback, 'decisions', fallback.label);
    const key = providerApiKey(store, vault, agentId, 'jev');
    const provider = new JevDecisions(new JevHttpTransport(key, saved.model), promptResolver(store));
    return observeProvider(store, provider, 'decisions', provider.label);
  };
  const labelForAgent = (agentId: string) => {
    const saved = store.agentClassifierSettings(agentId);
    return saved ? `jev/${saved.model}` : fallback.label;
  };
  return new Proxy(fallback, { get(target, property) {
    if (property === 'labelForAgent') return labelForAgent;
    const method = Reflect.get(target, property, target) as unknown;
    if (typeof method !== 'function') return method;
    return (...args: unknown[]) => {
      const context = args[0] as { agentId?: string; world?: { agentId: string }; part?: { agentId: string }; identity?: { agentId: string } } | undefined;
      const agentId = context?.agentId ?? context?.world?.agentId ?? context?.part?.agentId ?? context?.identity?.agentId;
      const provider = agentId ? resolve(agentId) : target;
      const selected = Reflect.get(provider, property, provider) as (...args: unknown[]) => unknown;
      return selected.apply(provider, args);
    };
  } });
}
