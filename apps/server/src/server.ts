import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { api } from '../../../packages/sdk/src/api.js';
import { ConflictError } from '../../../packages/core/src/contracts.js';
import type { Application } from '../../../packages/sdk/src/application.js';

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024) throw new Error('Request exceeds 1 MB');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
}
const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value));
};
export type ResearchDatabase = { id: string; label: string; app: Application };
export function createResearchServer(app: Application, root = process.cwd(), databases: ResearchDatabase[] = []) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const method = request.method ?? 'GET';
      if (!['GET', 'HEAD'].includes(method)) {
        if (request.headers.origin && request.headers.origin !== url.origin) { json(response, 403, { error: 'Cross-origin research edits are forbidden' }); return; }
        if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: 'Use application/json' }); return; }
      }
      if (url.pathname === '/api/agent-catalog' && method === 'GET') {
        json(response, 200, [{ id: '', label: 'Main', app }, ...databases].flatMap(database =>
          database.app.store.list('agent').map(agent => ({ ...agent, databaseId: database.id, databaseLabel: database.label }))));
        return;
      }
      let target = app;
      let apiPath = url.pathname;
      const databaseRoute = /^\/api\/research\/([^/]+)(\/.*)$/.exec(apiPath);
      if (databaseRoute) {
        const database = databases.find(item => item.id === decodeURIComponent(databaseRoute[1]!));
        if (!database) { json(response, 404, { error: 'Research database not found' }); return; }
        target = database.app;
        apiPath = `/api${databaseRoute[2]}`;
      }
      const stream = /^\/api\/agents\/([^/]+)\/stream$/.exec(apiPath);
      if (stream && method === 'GET') {
        const agentId = decodeURIComponent(stream[1]!); target.store.get('agent', agentId);
        let after = Number(request.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid event cursor');
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        response.write(': connected\n\n');
        const poll = (): void => {
          for (const event of target.store.events(agentId, after)) {
            response.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`); after = event.sequence;
          }
        };
        poll(); const timer = setInterval(poll, 250);
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
        response.on('close', () => { clearInterval(timer); clearInterval(heartbeat); });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        json(response, 200, await api(target, method, apiPath, method === 'GET' ? null : await readBody(request))); return;
      }
      const assets: Record<string, [string, string]> = {
        '/': ['apps/web/index.html', 'text/html'], '/style.css': ['apps/web/style.css', 'text/css'],
        '/app.js': ['dist/apps/web/src/app.js', 'text/javascript'],
        '/executive.js': ['dist/apps/web/src/executive.js', 'text/javascript'],
        '/mcp-registration.js': ['dist/apps/web/src/mcp-registration.js', 'text/javascript'],
        '/affect-analysis.js': ['dist/apps/web/src/affect-analysis.js', 'text/javascript'],
        '/disposition-activation-chart.js': ['dist/apps/web/src/disposition-activation-chart.js', 'text/javascript'],
        '/packages/sdk/src/cognition-timeline.js': ['dist/packages/sdk/src/cognition-timeline.js', 'text/javascript'],
        '/sleep-dashboard.js': ['dist/apps/web/src/sleep-dashboard.js', 'text/javascript'],
        '/simulation-dashboard.js': ['dist/apps/web/src/simulation-dashboard.js', 'text/javascript'],
        '/simulation-metrics.js': ['dist/apps/web/src/simulation-metrics.js', 'text/javascript'],
        '/simulation-observatory.js': ['dist/apps/web/src/simulation-observatory.js', 'text/javascript'],
        '/skill-inspector.js': ['dist/apps/web/src/skill-inspector.js', 'text/javascript'],
      };
      const asset = assets[url.pathname];
      if (!asset || method !== 'GET') { json(response, 404, { error: 'Not found' }); return; }
      response.writeHead(200, { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
      response.end(await readFile(resolve(root, asset[0])));
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const message = error instanceof Error ? error.message : String(error);
      json(response, error instanceof ConflictError ? 409 : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500,
        { error: message, category: 'infrastructure_or_validation' });
    }
  });
}
