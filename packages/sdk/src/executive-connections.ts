import type { Store } from '../../core/src/contracts.js';
import { McpClientManager, type McpTrace } from '../../executive/src/mcp-client-manager.js';
import { ExecutionContractSchema, type ExecutionContract } from '../../core/src/execution-contract.js';
import type { ToolGateway } from '../../executive/src/mcp-client-manager.js';
import { freeze, id } from '../../core/src/domain.js';
import { isDeepStrictEqual } from 'node:util';
import { verifyRemainderHandoff } from '../../core/src/remainder-handoff.js';
import { verifyGuidanceContinuation } from '../../core/src/guidance-continuation.js';
import { executionProcedure, verifySelectedSkill } from '../../core/src/skill-invocation.js';

/** Researcher capability administration. It never turns a configuration grant into a cognitive choice. */
export class ExecutiveConnections {
  readonly #manager: McpClientManager;
  #revision = -1;
  #sync: Promise<void> = Promise.resolve();
  readonly #cycles = new Map<string, string>();
  constructor(private readonly store: Store, checkpoint?: (trace: McpTrace) => void) {
    this.#manager = new McpClientManager(async reference => {
      const match = /^env:([A-Za-z_][A-Za-z0-9_]*)$/.exec(reference);
      const value = match ? process.env[match[1]!] : undefined;
      if (!value) throw new Error('MCP credential reference is unavailable');
      return value;
    }, event => {
      const cycleId = this.#cycles.get(event.contractId);
      if (!cycleId) throw new Error('Tool submission has no recorded selected contract');
      this.store.appendEvent(event.agentId, cycleId, 'execution.tool_trace', {
        traceId: event.id, contractId: event.contractId, serverId: event.serverId, toolName: event.toolName,
        phase: event.phase, ...(event.arguments ? { arguments: event.arguments } : {}),
        ...(event.outcome ? { outcome: event.outcome } : {}),
        ...(event.progress ? { progress: event.progress } : {}),
      });
      if (event.phase === 'finished') checkpoint?.(event);
    });
  }
  async #refresh(): Promise<void> {
    const refresh = this.#sync.then(async () => {
      const registry = this.store.mcpRegistry();
      if (registry.revision === this.#revision) return;
      const current = this.#manager.configurations();
      for (const config of current) {
        const next = registry.servers.find(server => server.id === config.id);
        if (!next || JSON.stringify(next) !== JSON.stringify(config)) await this.#manager.remove(config.id);
      }
      const retained = new Set(this.#manager.configurations().map(server => server.id));
      for (const config of registry.servers) if (!retained.has(config.id)) this.#manager.register(config);
      this.#revision = registry.revision;
    });
    this.#sync = refresh.catch(() => {});
    return refresh;
  }
  async status() {
    await this.#refresh();
    return { ...this.store.mcpRegistry(), health: Object.fromEntries(this.#manager.configurations().map(server => [server.id, this.#manager.health(server.id)])) };
  }
  async discover(serverId: string) { await this.#refresh(); return this.#manager.discover(serverId); }
  async agentCatalog(agentId: string) {
    await this.#refresh();
    const permissions = this.store.mcpPermissions(agentId);
    this.#manager.setAgentPermissions(agentId, permissions.tools);
    const tools = await this.#manager.gateway(agentId, 'researcher_capability_inspection', permissions.tools).catalog();
    // Permission edits during network discovery must also remove stale returned entries.
    const latest = this.store.mcpPermissions(agentId);
    return { revision: latest.revision, tools: tools.filter(tool => latest.tools.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName)) };
  }
  async disconnect(serverId: string) { await this.#refresh(); await this.#manager.disconnect(serverId); }
  async executionGateway(input: ExecutionContract): Promise<ToolGateway> {
    const contract = freeze(ExecutionContractSchema.parse(input));
    if (contract.authority.capabilities.includes('execution_control')) throw new Error('Execution-control contracts grant no MCP gateway');
    if (contract.authority.capabilities.includes('procedure_review')) throw new Error('Procedure-review contracts grant no MCP gateway');
    if (contract.guidanceRejection) throw new Error('Rejected guidance contracts grant no tool access');
    verifyRemainderHandoff(this.store, contract);
    if (contract.remainderRejection) throw new Error('Rejected remainder contracts grant no tool access');
    if (contract.skillRejection) throw new Error('Rejected skill contracts grant no tool access');
    verifyGuidanceContinuation(this.store, contract);
    verifySelectedSkill(this.store, contract);
    const cycle = this.store.cycle(contract.cycleId);
    const canSubmit = () => {
      const current = this.store.cycle(contract.cycleId);
      const execution = this.store.executions(contract.agentId).find(item => item.contractId === contract.id);
      const consumed = this.store.eventsByType(contract.agentId, ['execution.remainder_claim']).some(event =>
        event.type === 'execution.remainder_claim' && event.payload.authority.parentContractId === contract.id);
      return this.store.executiveProfile(contract.agentId).enabled && !consumed && current.status !== 'failed' && (execution ? execution.status === 'running' : current.status === 'running');
    };
    const recorded = this.store.eventsByType(contract.agentId, ['execution.contract'], [cycle.id])
      .find(event => event.type === 'execution.contract' && JSON.stringify(event.payload) === JSON.stringify(contract));
    if (cycle.agentId !== contract.agentId || !canSubmit() || !recorded
      || contract.commands.some(command => !cycle.selectedBidIds?.includes(command.bidId)))
      throw new Error('Tool access requires a recorded Self-selected contract');
    const startedAt = Date.parse(recorded.at);
    if (!Number.isFinite(startedAt)) throw new Error('Execution contract has no valid deadline origin');
    const deadline = Math.min(startedAt + contract.limits.maxDurationMs, contract.remainder?.deadlineAt ?? Infinity);
    this.#cycles.set(contract.id, cycle.id);
    const refresh = async () => {
      await this.#refresh();
      this.#manager.setAgentPermissions(contract.agentId, this.store.mcpPermissions(contract.agentId).tools);
      return this.#manager.gateway(contract.agentId, contract.id, contract.authority.tools);
    };
    const gateway: ToolGateway = { catalog: async () => (await refresh()).catalog(),
      call: async (tool, args, signal) => {
        const selected = contract.commands[0]?.action;
        const traceId = id('authorization');
        if (Date.now() >= deadline) return { status: 'blocked', code: 'budget_exhausted', traceId };
        const permitted = this.store.transaction(() => {
          verifyRemainderHandoff(this.store, contract);
          verifyGuidanceContinuation(this.store, contract);
          verifySelectedSkill(this.store, contract);
          if (!canSubmit() || selected?.kind !== 'operate') return false;
          const ledger = this.store.eventsByType(contract.agentId, ['execution.tool_trace'], [cycle.id])
            .filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === contract.id);
          const reserved = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorized');
          const finished = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'authorization_finished');
          const outcomes = ledger.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'finished');
          if (reserved.length !== finished.length || outcomes.length !== reserved.length
            || outcomes.some(event => event.type === 'execution.tool_trace' && event.payload.outcome?.status !== 'succeeded')
            || reserved.length >= contract.limits.maxSteps) return false;
          const procedure = executionProcedure(contract)!;
          const strategy = [...procedure.steps, ...(procedure.verification ? [procedure.verification] : [])];
          const expected = strategy[reserved.length];
          if (!expected || expected.serverId !== tool.serverId || expected.toolName !== tool.toolName
            || !isDeepStrictEqual(JSON.parse(expected.argumentsJson), args)) return false;
          this.store.appendEvent(contract.agentId, cycle.id, 'execution.tool_trace', { traceId, contractId: contract.id,
            serverId: tool.serverId, toolName: tool.toolName, phase: 'authorized', arguments: structuredClone(args) });
          return true;
        });
        if (!permitted) return { status: 'blocked', code: 'permission_denied', traceId };
        try {
          const remaining = deadline - Date.now();
          if (remaining <= 0) return { status: 'blocked', code: 'budget_exhausted', traceId };
          const timeout = AbortSignal.timeout(remaining);
          const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
          const activeGateway = await refresh();
          if (!canSubmit()) return { status: 'blocked', code: 'permission_denied', traceId };
          return await activeGateway.call(tool, args, bounded);
        }
        finally {
          this.store.appendEvent(contract.agentId, cycle.id, 'execution.tool_trace', { traceId, contractId: contract.id,
            serverId: tool.serverId, toolName: tool.toolName, phase: 'authorization_finished' });
        }
      } };
    return Object.freeze(gateway);
  }
  async close() { await this.#sync; await this.#manager.close(); }
}
