import { z } from 'zod';
import type { Store } from '../../core/src/contracts.js';
import { McpServerConfigSchema } from '../../core/src/mcp-configuration.js';

const Input = z.strictObject({
  expectedRegistryRevision: z.number().int().nonnegative(), expectedPermissionRevision: z.number().int().nonnegative(),
  server: McpServerConfigSchema.optional(), serverId: z.string().optional(),
}).refine(value => Boolean(value.server) !== Boolean(value.serverId), 'Choose new settings or an existing connection');

/** Membership is configuration, never a tool grant or cognitive instruction. */
export function registerAgentMcp(store: Store, agentId: string, body: unknown) {
  const input = Input.parse(body);
  return store.transaction(() => {
    const registry = store.mcpRegistry(); const permissions = store.mcpPermissions(agentId);
    if (registry.revision !== input.expectedRegistryRevision || permissions.revision !== input.expectedPermissionRevision)
      throw new Error('MCP configuration changed; refresh before registering');
    const serverId = input.server?.id ?? input.serverId!;
    if (input.server) {
      if (registry.servers.some(server => server.id === serverId)) throw new Error('This server name is already registered; use an existing connection or choose another name');
      store.saveMcpRegistry({ revision: registry.revision + 1, servers: [...registry.servers, input.server] }, registry.revision);
    } else if (!registry.servers.some(server => server.id === serverId)) throw new Error('This connection is no longer registered');
    const serverIds = [...new Set([...(permissions.serverIds ?? []), ...permissions.tools.map(tool => tool.serverId), serverId])];
    store.saveMcpPermissions(agentId, { ...permissions, revision: permissions.revision + 1, serverIds }, permissions.revision);
    return { registry: store.mcpRegistry(), permissions: store.mcpPermissions(agentId) };
  });
}
