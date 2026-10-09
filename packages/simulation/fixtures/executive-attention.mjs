// External read-only apparatus. No Agent state, psychological interpretation or provider access.
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const server = new McpServer({ name: 'executive-attention-apparatus', version: '1.0.0' });
server.registerTool('read_tick', { description: 'Read the fixed external apparatus tick', annotations: { readOnlyHint: true },
  inputSchema: z.object({}), outputSchema: z.object({ tick: z.number().int() }) }, async () => ({ content: [], structuredContent: { tick: 0 } }));
server.registerTool('hold', { description: 'Hold a read-only apparatus observation open for a bounded interval', annotations: { readOnlyHint: true },
  inputSchema: z.object({ durationMs: z.number().int().min(1).max(30000) }), outputSchema: z.object({ tick: z.number().int() }) }, async ({ durationMs }) => {
  await new Promise(resolve => setTimeout(resolve, durationMs));
  return { content: [], structuredContent: { tick: 0 } };
});
await server.connect(new StdioServerTransport());
