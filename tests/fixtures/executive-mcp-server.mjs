import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const server = new McpServer({ name: 'executive-protocol-fixture', version: '1.0.0' });
if (process.argv.includes('--many')) for (let index = 0; index < 60; index++) {
  server.registerTool(`catalog_${index}`, { description: `Capability fixture ${index}`, inputSchema: z.object({}) }, async () => ({ content: [] }));
}
const echo = server.registerTool('echo', { description: 'Echo a supplied integer', inputSchema: z.object({ value: z.number().int() }),
  outputSchema: z.object({ value: z.number().int() }) }, async ({ value }) => ({ content: [], structuredContent: { value } }));
server.registerTool('secret', { inputSchema: z.object({}), annotations: { readOnlyHint: true } },
  async () => ({ content: [{ type: 'text', text: 'Private fixture value' }] }));
server.registerTool('error', { inputSchema: z.object({}) }, async () => ({ isError: true, content: [{ type: 'text', text: 'Explicit fixture tool failure' }] }));
server.registerTool('slow', { inputSchema: z.object({}) }, async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return { content: [{ type: 'text', text: 'Side effect may have occurred' }] };
});
server.registerTool('progress', { inputSchema: z.object({ fail: z.boolean().optional() }) }, async ({ fail }, ctx) => {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken !== undefined) {
    await ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress: 1, total: 2, message: 'First fixture stage' } });
    await new Promise(resolve => setTimeout(resolve, 20));
    await ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress: 2, total: 2, message: 'Last fixture stage; not verification' } });
  }
  await new Promise(resolve => setTimeout(resolve, 20));
  if (fail) await new Promise(resolve => setTimeout(resolve, 300));
  return { content: [] };
});
server.registerTool('hold', { description: 'Read-only transport fixture held open for bounded checkpoint tests',
  inputSchema: z.object({ durationMs: z.number().int().min(1).max(2000) }) }, async ({ durationMs }) => {
  await new Promise(resolve => setTimeout(resolve, durationMs));
  return { content: [] };
});
if (process.argv.includes('--dynamic')) server.registerTool('change_catalog', {
  inputSchema: z.object({ mode: z.enum(['schema', 'remove']) }),
}, async ({ mode }) => {
  if (mode === 'schema') {
    echo.update({ paramsSchema: z.object({ value: z.number().int().min(100) }) });
    server.registerTool('new_tool', { inputSchema: z.object({}) }, async () => ({ content: [] }));
  } else echo.remove();
  // Allow the official client's notification handler to run before returning.
  await new Promise(resolve => setTimeout(resolve, 30));
  return { content: [] };
});
await server.connect(new StdioServerTransport());
