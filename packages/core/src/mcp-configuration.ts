import { z } from 'zod';

const Name = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/);
const common = { id: Name, timeoutMs: z.number().int().min(10).max(300000).default(30000) };
/** External configuration only; credential values never belong in these records. */
export const McpServerConfigSchema = z.discriminatedUnion('transport', [
  z.strictObject({ ...common, transport: z.literal('stdio'), command: z.string().min(1),
    args: z.array(z.string()).max(100).default([]), cwd: z.string().min(1).optional(),
    envSecretRefs: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().min(1)).default({}) }),
  z.strictObject({ ...common, transport: z.literal('http'), url: z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'MCP endpoint must use HTTP(S) without embedded credentials'), bearerSecretRef: z.string().min(1).optional() }),
]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export const ToolPermissionSchema = z.strictObject({ serverId: Name, toolName: z.string().min(1).max(200) });
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;
export const McpRegistrySchema = z.strictObject({ revision: z.number().int().nonnegative(),
  servers: z.array(McpServerConfigSchema).max(100).refine(servers => new Set(servers.map(server => server.id)).size === servers.length) });
export type McpRegistry = z.infer<typeof McpRegistrySchema>;
export const McpPermissionsSchema = z.strictObject({ revision: z.number().int().nonnegative(),
  tools: z.array(ToolPermissionSchema).max(1000).refine(tools => new Set(tools.map(tool => JSON.stringify(tool))).size === tools.length) });
export type McpPermissions = z.infer<typeof McpPermissionsSchema>;
export const CapabilityToolSchema = ToolPermissionSchema.extend({ key: z.string().min(1).max(500),
  description: z.string(), inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(), annotations: z.record(z.string(), z.unknown()).optional() });
export const ExternalCapabilitiesSchema = z.strictObject({ status: z.enum(['available', 'unavailable']),
  permissionRevision: z.number().int().nonnegative(), tools: z.array(CapabilityToolSchema).max(1000) })
  .refine(value => value.status !== 'unavailable' || !value.tools.length, 'Unavailable capabilities cannot declare usable tools');
export type ExternalCapabilities = z.infer<typeof ExternalCapabilitiesSchema>;
/** Compatibility projection only: old saved snapshots remain unchanged. */
export function isLegacyCapabilityFact(fact: { source: string; kind: string; text: string; referenceId: string | null }): boolean {
  return fact.source === 'External capabilities' && fact.kind === 'observes' && fact.referenceId === null
    && (fact.text.startsWith('Available permitted tool: ')
      || fact.text === 'Configured external tool capabilities could not be discovered for this encounter.');
}
