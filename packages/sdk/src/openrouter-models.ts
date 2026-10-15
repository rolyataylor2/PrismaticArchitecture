import { z } from 'zod';
import { modelProvider } from '../../core/src/generative-models.js';
import { InfrastructureError } from '../../core/src/contracts.js';

/** Public metadata only. Credentials and cognitive state never enter this request. */
export async function openRouterModels() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new InfrastructureError('provider', `OpenRouter catalog HTTP ${response.status}`);
    const body = z.object({ data: z.array(z.object({ id: z.string(), name: z.string(), supported_parameters: z.array(z.string()).optional(),
      architecture: z.object({ output_modalities: z.array(z.string()) }).optional() })) }).parse(await response.json());
    return body.data.flatMap(item => {
      if (!item.supported_parameters?.includes('structured_outputs') || !item.architecture?.output_modalities.includes('text')) return [];
      const id = `openrouter:${item.id}`;
      if (id.length > 100) return [];
      try { modelProvider(id); } catch { return []; }
      return [{ id, label: `${item.name} · OpenRouter`, provider: 'openrouter' as const }];
    }).sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    if (error instanceof InfrastructureError) throw error;
    throw new InfrastructureError('provider', 'OpenRouter catalog could not be loaded');
  }
}
