import { McpServerConfigSchema, type McpServerConfig } from '../../core/src/mcp-configuration.js';

export type McpRepositoryCandidate = { label: string; source: string; server: McpServerConfig; notes: string[] };
export type McpRepositoryPreview = { repository: string; candidates: McpRepositoryCandidate[]; notes: string[] };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const name = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 100) || 'imported-mcp';

/** Only declared configuration is proposed. No code installation, inference or connection occurs. */
export function parseMcpRepositoryFile(text: string, source: string): McpRepositoryCandidate[] {
  const documents: unknown[] = [];
  if (/\.md$/i.test(source)) {
    for (const match of text.matchAll(/```(?:json|jsonc)?\s*\n([\s\S]*?)```/gi)) {
      try { documents.push(JSON.parse(match[1]!)); } catch { /* Non-JSON examples are not executable declarations. */ }
    }
  } else { try { documents.push(JSON.parse(text)); } catch { return []; } }
  const candidates: McpRepositoryCandidate[] = [];
  const add = (label: string, value: unknown, notes: string[] = []) => {
    const parsed = McpServerConfigSchema.safeParse(value);
    if (parsed.success) candidates.push({ label, source, server: parsed.data, notes });
  };
  for (const document of documents) {
    const root = object(document); if (!root) continue;
    const servers = object(root.mcpServers);
    if (servers) for (const [id, raw] of Object.entries(servers)) {
      const config = object(raw); if (!config) continue;
      if (config.type === 'sse') continue;
      if (typeof config.command === 'string' && (!config.args || list(config.args).every(arg => typeof arg === 'string'))) {
        const env = object(config.env) ?? {};
        add(id, { id: name(id), transport: 'stdio', command: config.command, args: config.args ?? [],
          envSecretRefs: Object.fromEntries(Object.keys(env).map(key => [key, `env:${key}`])), ...(typeof config.cwd === 'string' ? { cwd: config.cwd } : {}) },
        Object.keys(env).length ? ['Environment values were replaced with secret references. Review them before registering.'] : []);
      } else if (typeof config.url === 'string') {
        const headers = object(config.headers) ?? {};
        // The native HTTP adapter supports bearer authentication, not arbitrary headers.
        if (Object.keys(headers).some(key => key.toLowerCase() !== 'authorization')) continue;
        const authorization = Object.values(headers)[0];
        const reference = typeof authorization === 'string' ? /^Bearer\s+\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(authorization)?.[1] : undefined;
        add(id, { id: name(id), transport: 'http', url: config.url, ...(authorization ? { bearerSecretRef: `env:${reference ?? 'MCP_SERVER_TOKEN'}` } : {}) },
          authorization ? ['Review the bearer secret reference; imported credential values are never retained.'] : []);
      }
    }
    if (typeof root.name !== 'string') continue;
    for (const [index, raw] of list(root.remotes).entries()) {
      const remote = object(raw);
      if (remote?.type !== 'streamable-http' || typeof remote.url !== 'string' || list(remote.headers).length) continue;
      add(`${root.name} · HTTP`, { id: name(`${root.name}-http-${index + 1}`), transport: 'http', url: remote.url });
    }
    for (const [index, raw] of list(root.packages).entries()) {
      const pkg = object(raw);
      if (!pkg || object(pkg.transport)?.type !== 'stdio' || typeof pkg.identifier !== 'string') continue;
      const runtime = pkg.registryType === 'npm' ? 'npx' : pkg.registryType === 'pypi' ? 'uvx' : null;
      if (!runtime || (pkg.runtimeHint && pkg.runtimeHint !== runtime)) continue;
      const args: string[] = []; let supported = true;
      const appendArguments = (items: unknown) => {
        for (const rawArgument of list(items)) {
          const argument = object(rawArgument); if (!argument) { supported = false; continue; }
          if (argument.isSecret) { supported = false; continue; }
          const value = argument.value ?? argument.default;
          if (typeof value !== 'string' || /\$\{|\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)) {
            if (argument.isRequired || argument.value !== undefined) supported = false;
            continue;
          }
          if (argument.type === 'named') { if (typeof argument.name !== 'string') { supported = false; continue; } args.push(argument.name); }
          else if (argument.type !== 'positional') { supported = false; continue; }
          args.push(value);
        }
      };
      appendArguments(pkg.runtimeArguments);
      const version = typeof pkg.version === 'string' ? pkg.version : '';
      args.push(runtime === 'npx' ? `${pkg.identifier}${version ? `@${version}` : ''}` : `${pkg.identifier}${version ? `==${version}` : ''}`);
      appendArguments(pkg.packageArguments); if (!supported) continue;
      const environment = list(pkg.environmentVariables).map(item => object(item)?.name).filter((item): item is string => typeof item === 'string');
      add(`${root.name} · ${pkg.registryType}`, { id: name(`${root.name}-${pkg.registryType}-${index + 1}`), transport: 'stdio', command: runtime, args,
        envSecretRefs: Object.fromEntries(environment.map(key => [key, `env:${key}`])) }, ['Review package arguments and environment references. Registration does not install or run this package.']);
    }
  }
  return candidates;
}

async function boundedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 450000) throw new Error('Repository configuration exceeds the import size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function previewMcpRepository(input: string, fetcher: typeof fetch = fetch): Promise<McpRepositoryPreview> {
  const url = new URL(input);
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match)
    throw new Error('Enter a public GitHub repository URL, such as https://github.com/owner/repository');
  const owner = match[1]!; const repositoryName = match[2]!.replace(/\.git$/, '');
  const repository = `https://github.com/${owner}/${repositoryName}`;
  const files = ['.mcp.json', 'mcp.json', 'server.json', 'README.md'];
  const results = await Promise.all(files.map(async file => {
    const response = await fetcher(`https://api.github.com/repos/${owner}/${repositoryName}/contents/${file}`, {
      headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Public repository lookup failed (HTTP ${response.status})`);
    const document = object(JSON.parse(await boundedText(response)));
    if (document?.encoding !== 'base64' || typeof document.content !== 'string' || document.type !== 'file') return [];
    const content = Buffer.from(document.content, 'base64');
    if (content.length > 256000) throw new Error('Repository configuration exceeds the import size limit');
    return parseMcpRepositoryFile(content.toString('utf8'), `${repository}/blob/HEAD/${file}`);
  }));
  const candidates = [...new Map(results.flat().map(candidate => [JSON.stringify(candidate.server), candidate])).values()].slice(0, 30);
  if (!candidates.length) throw new Error('No supported connection settings found. Check that the repository is public, or use its setup instructions to specify the connection manually.');
  return { repository, candidates, notes: ['Imports support mcpServers JSON, README JSON examples and simple npm, PyPI or Streamable HTTP server.json declarations. Unsupported transports or required dynamic settings must be specified manually.'] };
}

/** Official MCP Registry metadata only; loading entries never starts a server. */
export async function searchMcpRegistry(query: string, fetcher: typeof fetch = fetch): Promise<McpRepositoryPreview> {
  const url = new URL('https://registry.modelcontextprotocol.io/v0.1/servers');
  url.searchParams.set('search', query.trim()); url.searchParams.set('version', 'latest'); url.searchParams.set('limit', '20');
  const response = await fetcher(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Official registry lookup failed (HTTP ${response.status})`);
  const document = object(JSON.parse(await boundedText(response)));
  if (!Array.isArray(document?.servers)) throw new Error('Unexpected official registry response');
  const candidates: McpRepositoryCandidate[] = [];
  for (const entry of document.servers) {
    const item = object(entry); const metadata = object(object(item?._meta)?.['io.modelcontextprotocol.registry/official']);
    if (metadata?.status !== 'active') continue;
    const server = object(item?.server); if (!server) continue;
    const source = `https://registry.modelcontextprotocol.io/?q=${encodeURIComponent(String(server.name))}`;
    const parsed = parseMcpRepositoryFile(JSON.stringify(server), source);
    for (const candidate of parsed) candidate.notes.unshift(String(server.description ?? ''));
    candidates.push(...parsed);
  }
  return { repository: 'https://registry.modelcontextprotocol.io/', candidates: candidates.slice(0, 30),
    notes: ['Official MCP Registry results. Only supported connection declarations are shown; use manual entry for other setup requirements. Credentials and tool grants are configured locally.'] };
}
