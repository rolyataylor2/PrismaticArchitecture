import { Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv';
import { freeze, id, now } from '../../core/src/domain.js';
import { McpServerConfigSchema, type McpServerConfig, type ToolPermission } from '../../core/src/mcp-configuration.js';
export { McpServerConfigSchema, type McpServerConfig, type ToolPermission } from '../../core/src/mcp-configuration.js';
export type McpCatalogTool = ToolPermission & { key: string; description: string; inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> };
export type McpCallOutcome = { status: 'succeeded' | 'reported_error'; result: Record<string, unknown>; traceId: string }
  | { status: 'blocked' | 'unverified'; code: 'permission_denied' | 'invalid_arguments' | 'unavailable' | 'invalid_output' | 'transport_error' | 'budget_exhausted'; traceId: string };
export type McpTrace = { id: string; contractId: string; agentId: string; serverId: string; toolName: string;
  timestamp: string; phase: 'submitted' | 'progress' | 'finished'; progress?: { progress: number; total?: number; message?: string };  arguments?: Record<string, unknown>; outcome?: McpCallOutcome };
export type ToolGateway = { catalog(): Promise<McpCatalogTool[]>;
  call(tool: ToolPermission, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallOutcome> };
type Connection = { client: Client; tools: Tool[]; discoveredAt: number;
  catalogGeneration: number; discoveredGeneration: number; refresh?: Promise<void> };
const key = (tool: ToolPermission) => JSON.stringify([tool.serverId, tool.toolName]);
// Wire schemas are JSON; remove SDK optional-undefined typings at the validator adapter boundary.
const wireSchema = (schema: unknown) => JSON.parse(JSON.stringify(schema)) as Parameters<AjvJsonSchemaValidator['getValidator']>[0];

/** Shared framework service. Only scoped gateways, never this manager, go to runtime adapters. */
export class McpClientManager {
  readonly #servers = new Map<string, McpServerConfig>();
  readonly #grants = new Map<string, Set<string>>();
  readonly #connections = new Map<string, Promise<Connection>>();
  readonly #health = new Map<string, 'disconnected' | 'connecting' | 'connected' | 'error'>();
  readonly #validator = new AjvJsonSchemaValidator();
  constructor(private readonly secrets: (reference: string) => Promise<string>,
    private readonly trace: (event: McpTrace) => void = () => {}, private readonly catalogTtlMs = 30000) {}

  register(input: unknown): McpServerConfig {
    const config = freeze(McpServerConfigSchema.parse(input));
    if (this.#servers.has(config.id)) throw new Error('MCP server already registered; disconnect and remove before replacing');
    this.#servers.set(config.id, config); this.#health.set(config.id, 'disconnected');
    return structuredClone(config);
  }
  configurations(): McpServerConfig[] { return [...this.#servers.values()].map(config => structuredClone(config)); }
  health(serverId: string) { return this.#health.get(serverId) ?? 'disconnected'; }
  /** Privileged capability inspection, separate from runtime access and tool calls. */
  async discover(serverId: string): Promise<McpCatalogTool[]> {
    const connection = await this.#connection(serverId);
    return connection.tools.map(tool => ({ serverId, toolName: tool.name, key: `${serverId}/${encodeURIComponent(tool.name)}`,
      description: tool.description ?? '', inputSchema: structuredClone(tool.inputSchema),
      ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
      ...(tool.annotations ? { annotations: structuredClone(tool.annotations) } : {}),
    }));
  }
  setAgentPermissions(agentId: string, permissions: ToolPermission[]): void {
    if (!agentId.trim() || permissions.some(tool => !this.#servers.has(tool.serverId) || !tool.toolName.trim()))
      throw new Error('Agent permissions require known servers and explicit tool names');
    this.#grants.set(agentId, new Set(permissions.map(key)));
  }
  /** The host supplies selected-contract grants; no wildcard or annotation-derived permissions. */
  gateway(agentId: string, contractId: string, selectedTools: ToolPermission[]): ToolGateway {
    if (!agentId.trim() || !contractId.trim()) throw new Error('Tool access requires Agent and contract attribution');
    const allowed = new Set(selectedTools.map(key));
    const permits = (tool: ToolPermission) => allowed.has(key(tool)) && Boolean(this.#grants.get(agentId)?.has(key(tool)));
    return Object.freeze({
      catalog: async () => {
        const tools: McpCatalogTool[] = [];
        for (const serverId of this.#servers.keys()) {
          const granted = selectedTools.some(tool => tool.serverId === serverId && permits(tool));
          if (!granted) continue;
          const connection = await this.#connection(serverId);
          for (const tool of connection.tools) if (permits({ serverId, toolName: tool.name })) tools.push({
            serverId, toolName: tool.name, key: `${serverId}/${encodeURIComponent(tool.name)}`,
            description: tool.description ?? '', inputSchema: structuredClone(tool.inputSchema),
            ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
            ...(tool.annotations ? { annotations: structuredClone(tool.annotations) } : {}),
          });
        }
        return tools;
      },
      call: async (requested: ToolPermission, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallOutcome> => {
        const tool = { ...requested }; const traceId = id('mcp_trace');
        let closed = false; let emitted = 0; let lastEmittedAt = -Infinity;
        let latest: McpTrace['progress']; let recorded: McpTrace['progress'];
        const emitProgress = () => {
          if (!latest || latest === recorded || emitted >= 200) return;
          this.trace({ id: traceId, contractId, agentId, ...tool, timestamp: now(), phase: 'progress', progress: latest });
          recorded = latest; emitted++; lastEmittedAt = Date.now();
        };
        const finish = (outcome: McpCallOutcome) => {
          closed = true; emitProgress();
          this.trace({ id: traceId, contractId, agentId, ...tool, timestamp: now(), phase: 'finished', outcome });
          return outcome;
        };
        if (!permits(tool)) return finish({ status: 'blocked', code: 'permission_denied', traceId });
        let connection: Connection;
        try { connection = await this.#connection(tool.serverId); }
        catch { return finish({ status: 'blocked', code: 'unavailable', traceId }); }
        if (!permits(tool)) return finish({ status: 'blocked', code: 'permission_denied', traceId });
        const definition = connection.tools.find(item => item.name === tool.toolName);
        if (!definition) return finish({ status: 'blocked', code: 'unavailable', traceId });
        let submitted: Record<string, unknown>;
        try {
          submitted = structuredClone(args);
          if (!this.#validator.getValidator(wireSchema(definition.inputSchema))(submitted).valid)
            return finish({ status: 'blocked', code: 'invalid_arguments', traceId });
          if (definition.outputSchema) this.#validator.getValidator(wireSchema(definition.outputSchema));
        } catch { return finish({ status: 'blocked', code: 'invalid_arguments', traceId }); }
        if (signal?.aborted) return finish({ status: 'blocked', code: 'unavailable', traceId });
        // Persist submission before a possibly consequential request. This layer cannot infer safe retries.
        this.trace({ id: traceId, contractId, agentId, ...tool, timestamp: now(), phase: 'submitted', arguments: structuredClone(submitted) });
        try {
          const result = await connection.client.callTool({ name: tool.toolName, arguments: submitted }, {
            resetTimeoutOnProgress: false,
            onprogress: progress => {
              if (closed || !Number.isFinite(progress.progress) || progress.progress < 0
                || (latest && progress.progress <= latest.progress)) return;
              latest = { progress: progress.progress,
                ...(progress.total !== undefined && Number.isFinite(progress.total) ? { total: progress.total } : {}),
                ...(progress.message ? { message: progress.message.slice(0, 4000) } : {}) };
              if (emitted < 199 && Date.now() - lastEmittedAt >= 250) emitProgress();
            },
            timeout: this.#servers.get(tool.serverId)!.timeoutMs, ...(signal ? { signal } : {}),
          });
          if (!result.isError && definition.outputSchema
            && !this.#validator.getValidator(wireSchema(definition.outputSchema))(result.structuredContent).valid)
            return finish({ status: 'unverified', code: 'invalid_output', traceId });
          return finish({ status: result.isError ? 'reported_error' : 'succeeded', result: structuredClone(result), traceId });
        } catch {
          // Includes response loss, timeout and SDK schema rejection after a submitted side effect.
          return finish({ status: 'unverified', code: 'transport_error', traceId });
        }
      },
    });
  }
  async #connection(serverId: string): Promise<Connection> {
    const config = this.#servers.get(serverId);
    if (!config) throw new Error('Unknown MCP server');
    let pending = this.#connections.get(serverId);
    if (!pending) {
      pending = this.#connect(config);
      this.#connections.set(serverId, pending);
      pending.catch(() => { if (this.#connections.get(serverId) === pending) this.#connections.delete(serverId); });
    }
    const connection = await pending;
    if (connection.catalogGeneration !== connection.discoveredGeneration || Date.now() - connection.discoveredAt > this.catalogTtlMs) {
      if (!connection.refresh) {
        const generation = connection.catalogGeneration;
        connection.refresh = (async () => {
          const tools = (await connection.client.listTools(undefined, { timeout: config.timeoutMs, cacheMode: 'bypass' })).tools;
          connection.tools = tools; connection.discoveredAt = Date.now(); connection.discoveredGeneration = generation;
        })();
      }
      const refresh = connection.refresh;
      try { await refresh; } finally { if (connection.refresh === refresh) delete connection.refresh; }
    }
    return connection;
  }
  async #connect(config: McpServerConfig): Promise<Connection> {
    this.#health.set(config.id, 'connecting');
    let generation = 0;
    let connection: Connection | undefined;
    const client = new Client({ name: 'ontoagentic-executive', version: '0.1.0' }, {
      versionNegotiation: { mode: 'auto' }, jsonSchemaValidator: this.#validator,
      listChanged: { tools: { autoRefresh: false, debounceMs: 0, onChanged: () => {
        generation++; if (connection) connection.catalogGeneration = generation;
      } } },
    });
    try {
      if (config.transport === 'stdio') {
        const env: Record<string, string> = {};
        for (const [name, ref] of Object.entries(config.envSecretRefs)) env[name] = await this.secrets(ref);
        await client.connect(new StdioClientTransport({ command: config.command, args: config.args, env, stderr: 'ignore',
          ...(config.cwd ? { cwd: config.cwd } : {}) }), { timeout: config.timeoutMs });
      } else {
        const ref = config.bearerSecretRef;
        await client.connect(new StreamableHTTPClientTransport(new URL(config.url), ref
          ? { authProvider: { token: () => this.secrets(ref) } } : {}), { timeout: config.timeoutMs });
      }
      const discoveredGeneration = generation;
      const tools = (await client.listTools(undefined, { timeout: config.timeoutMs })).tools;
      connection = { client, tools, discoveredAt: Date.now(), catalogGeneration: generation, discoveredGeneration };
      this.#health.set(config.id, 'connected');
      client.onclose = () => {
        // A late close notification from an old connection must not remove its replacement.
        const pending = this.#connections.get(config.id);
        if (pending) void pending.then(connection => {
          if (connection.client === client && this.#connections.get(config.id) === pending) {
            this.#connections.delete(config.id); this.#health.set(config.id, 'disconnected');
          }
        }).catch(() => {});
      };
      return connection;
    } catch {
      await client.close().catch(() => {}); this.#health.set(config.id, 'error');
      throw new Error('MCP connection or discovery failed');
    }
  }
  async disconnect(serverId: string): Promise<void> {
    const pending = this.#connections.get(serverId); this.#connections.delete(serverId);
    if (pending) await pending.then(connection => connection.client.close()).catch(() => {});
    this.#health.set(serverId, 'disconnected');
  }
  async close(): Promise<void> { await Promise.all([...this.#servers.keys()].map(serverId => this.disconnect(serverId))); }
  async remove(serverId: string): Promise<void> {
    await this.disconnect(serverId); this.#servers.delete(serverId); this.#health.delete(serverId);
    for (const grants of this.#grants.values()) for (const grant of grants) if (JSON.parse(grant)[0] === serverId) grants.delete(grant);
  }
}
