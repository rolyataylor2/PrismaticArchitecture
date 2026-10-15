import { executiveActionEnabled, executiveModuleEnabled } from '../../core/src/executive-profile.js';
import { ThoughtRoutingSettingsSchema, type ThoughtRoutingSettings } from '../../core/src/thought-resources.js';
import { selectedSkillReview, verifyProcedureReviewReport } from '../../core/src/selected-skill-review.js';
import { prepareSkillApproval } from '../../core/src/skill-approval.js';
import { initialPrimitiveSettings, PrimitiveSettingsSchema, type PrimitiveSettings } from '../../core/src/primitives.js';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  memoryPartIds, IdentityAuthoringSettingsSchema, type IdentityAuthoringSettings, AgentActivationSettingsSchema, readIdentity, entitySchemas, ExecutionSchema, freeze, id, Id, now, Origin, Text, WorldStateSchema, PartSchema, PromptTaskSchema,
  type Part,
  type Change, type Cycle, type EntityKind, type EntityMap, type Execution, type Fact, type VersionRecord, type WorldState, PromptOverrideSchema, type PromptOverride, type PromptTask,
} from '../../core/src/domain.js';
import { ConflictError, type CognitiveEvent, type EventPayloads, type Store } from '../../core/src/contracts.js';
import { migrate } from './migrations.js';
import type { ConsolidationRun } from '../../core/src/consolidation-domain.js';
import { McpRegistrySchema, McpPermissionsSchema, isLegacyCapabilityFact, type McpRegistry, type McpPermissions } from '../../core/src/mcp-configuration.js';
import { defaultExecutiveProfile, ExecutiveProfileSchema, type ExecutiveProfile } from '../../core/src/executive-profile.js';
import { validateExecutionUpdate } from '../../core/src/execution-lifecycle.js';
import { verifySelectedPauseReport } from '../../core/src/execution-control.js';
import { verifyRemainderHandoff } from '../../core/src/remainder-handoff.js';
import { prepareGuidanceContinuation, verifyGuidanceContinuation } from '../../core/src/guidance-continuation.js';
import { executionProcedure, verifySelectedSkill } from '../../core/src/skill-invocation.js';
import { teachingFeedback } from '../../core/src/procedure-teaching.js';
import { ExecutiveSkillSchema, type ExecutiveSkill } from '../../core/src/executive-skill.js';
import { evaluateSkillEvidence } from '../../core/src/executive-skill-evidence.js';
import { correctedProcedure, evaluateRecordedProcedure } from '../../core/src/corrected-procedure.js';
import { verifySkillMaturity } from '../../core/src/skill-maturity.js';
import { isDeepStrictEqual } from 'node:util';

type BodyRow = { body: string };
export class SqliteStore implements Store {
  readonly #db: DatabaseSync;
  #depth = 0;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    migrate(this.#db);
  }
  branchAgent(sourceAgentId: string, targetAgentId: string): Record<string, string> {
    return this.transaction(() => {
      this.get('agent', sourceAgentId);
      if (this.#db.prepare("SELECT 1 FROM entities WHERE kind='agent' AND id=?").get(targetAgentId)) throw new ConflictError('Branch target already exists');
      if (this.cycles(sourceAgentId).some(cycle => cycle.status === 'running') || this.consolidations(sourceAgentId).some(run => run.status === 'running')
        || this.executions(sourceAgentId).some(execution => execution.status === 'running' || execution.status === 'pending')) throw new ConflictError('Wait for active Agent work before branching');
      const mapping: Record<string, string> = { [sourceAgentId]: targetAgentId };
      const tables = this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      const batches: { table: string; rows: Record<string, unknown>[] }[] = [];
      const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
      for (const { name } of tables) {
        // Reports and grants remain outside the cognitive branch. Shared registry rows are never copied.
        if (['experiments', 'deleted_agents', 'mcp_permissions', 'mcp_permissions_history'].includes(name)) continue;
        const columns = this.#db.prepare(`PRAGMA table_info(${quote(name)})`).all() as { name: string }[];
        let rows: Record<string, unknown>[] = [];
        if (columns.some(column => column.name === 'agent_id')) rows = this.#db.prepare(`SELECT * FROM ${quote(name)} WHERE agent_id=?`).all(sourceAgentId);
        else if (name === 'versions') rows = this.#db.prepare('SELECT v.* FROM versions v JOIN entities e ON e.kind=v.kind AND e.id=v.id WHERE e.agent_id=?').all(sourceAgentId);
        else if (name === 'embeddings' || name === 'thread_part_stickiness') rows = this.#db.prepare(`SELECT t.* FROM ${quote(name)} t JOIN entities e ON e.kind='part' AND e.id=t.part_id WHERE e.agent_id=?`).all(sourceAgentId);
        if (rows.length) batches.push({ table: name, rows });
      }
      const register = (value: string) => { if (!mapping[value]) mapping[value] = id(value.split('_')[0] || 'branch'); };
      const collect = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
          if (['id', 'bidId', 'proposalId', 'contractId', 'operationId', 'traceId'].includes(key) && typeof item === 'string'
            && /^[a-z][a-z0-9_]*_[0-9a-f-]{36}$/.test(item)) register(item);
          else if (item && typeof item === 'object') collect(item);
        }
      };
      for (const batch of batches) for (const row of batch.rows) {
        if (typeof row.id === 'string') register(row.id);
        for (const [key, value] of Object.entries(row)) {
          if (typeof value !== 'string' || key === 'encrypted_api_key') continue;
          if (['body', 'change', 'payload', 'research_scope'].includes(key)) { try { collect(JSON.parse(value)); } catch { /* Non-JSON legacy field. */ } }
        }
      }
      const remap = (value: unknown): unknown => typeof value === 'string' ? mapping[value] ?? value
        : Array.isArray(value) ? value.map(remap) : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)])) : value;
      for (const batch of batches) for (const row of batch.rows) {
        const entries = Object.entries(row).filter(([key]) => !(batch.table === 'events' && key === 'sequence'));
        const values = entries.map(([key, value]) => {
          if (typeof value !== 'string' || key === 'encrypted_api_key' || key === 'model' || key === 'task') return value;
          if (['body', 'change', 'payload', 'research_scope'].includes(key)) { try { return JSON.stringify(remap(JSON.parse(value))); } catch { return value; } }
          return mapping[value] ?? value;
        });
        this.#db.prepare(`INSERT INTO ${quote(batch.table)} (${entries.map(([key]) => quote(key)).join(',')}) VALUES (${entries.map(() => '?').join(',')})`)
          .run(...values as import('node:sqlite').SQLInputValue[]);
      }
      return mapping;
    });
  }
  deleteAgent(agentId: string): void {
    this.transaction(() => {
      const agent = this.#db.prepare("SELECT id FROM entities WHERE kind = 'agent' AND id = ?").get(agentId);
      if (!agent) throw new Error(`agent ${agentId} not found`);
      if (this.cycles(agentId).some(item => item.status === 'running')
        || this.consolidations(agentId).some(item => item.status === 'running')
        || this.executions(agentId).some(item => item.status === 'pending' || item.status === 'running')) {
        throw new ConflictError('Wait for active Agent work to finish before deleting');
      }
      this.#db.prepare('INSERT OR IGNORE INTO deleted_agents(agent_id,deleted_at) VALUES(?,?)').run(agentId, now());
      this.#db.prepare("DELETE FROM embeddings WHERE part_id IN (SELECT id FROM entities WHERE agent_id = ? AND kind = 'part')").run(agentId);
      this.#db.prepare('DELETE FROM thread_part_stickiness WHERE part_id IN (SELECT id FROM entities WHERE agent_id = ?) OR cycle_id IN (SELECT id FROM cycles WHERE agent_id = ?)').run(agentId, agentId);
      this.#db.prepare('DELETE FROM versions WHERE (kind,id) IN (SELECT kind,id FROM entities WHERE agent_id = ?)').run(agentId);
      for (const table of ['worlds', 'events', 'executions', 'consolidations', 'experiments', 'cycle_threads',
        'agent_provider_settings', 'agent_activation_settings', 'identity_authoring_settings',
        'primitive_settings_history', 'primitive_settings', 'mcp_permissions_history', 'mcp_permissions', 'executive_profile_history', 'executive_profiles', 'executive_skill_history', 'executive_skills', 'prompt_overrides', 'cycles', 'entities', 'deleted_agents']) {
        this.#db.prepare(`DELETE FROM ${table} WHERE agent_id = ?`).run(agentId);
      }
    });
  }
  /** Explicit host administration for ADR 0127; never invoked by cognition. */
  discardLegacyState(agentId: string): void {
    this.transaction(() => {
      const agent = this.get('agent', agentId);
      const parts = this.list('part', agentId);
      if (parts.some(part => part.instance) || this.#db.prepare("SELECT 1 FROM entities WHERE kind = 'steering' AND agent_id = ? LIMIT 1").get(agentId) || this.list('disposition', agentId).length) {
        throw new ConflictError('Constructed history must be retained; legacy reset requires a wholly legacy Agent');
      }
      if (this.cycles(agentId).some(cycle => cycle.status === 'running')
        || this.consolidations(agentId).some(run => run.status === 'running')
        || this.executions(agentId).some(run => run.status === 'pending' || run.status === 'running')) {
        throw new ConflictError('Wait for active Agent work to finish before legacy reset');
      }
      this.save('agent', { ...agent, architecture: 'constructed', version: agent.version + 1 }, agent.version,
        { origin: 'researcher_edit', reason: 'Researcher-authorized constructed architecture cutover', sourceIds: [] });
      const discarded = new Set(parts.map(part => part.id));
      for (const memory of this.list('memory', agentId)) {
        this.save('memory', { ...memory, referencingPartIds: memoryPartIds(memory).filter(partId => !discarded.has(partId)),
          version: memory.version + 1 }, memory.version,
          { origin: 'researcher_edit', reason: 'Retain subjective memory while discarding legacy recall references', sourceIds: [] });
      }
      this.#db.prepare('INSERT INTO deleted_agents(agent_id,deleted_at) VALUES(?,?)').run(agentId, now());
      this.#db.prepare("DELETE FROM embeddings WHERE part_id IN (SELECT id FROM entities WHERE agent_id = ? AND kind = 'part')").run(agentId);
      this.#db.prepare('DELETE FROM thread_part_stickiness WHERE cycle_id IN (SELECT id FROM cycles WHERE agent_id = ?)').run(agentId);
      this.#db.prepare("DELETE FROM versions WHERE (kind,id) IN (SELECT kind,id FROM entities WHERE agent_id = ? AND kind IN ('part','prediction'))").run(agentId);
      this.#db.prepare("DELETE FROM entities WHERE agent_id = ? AND kind IN ('part','prediction')").run(agentId);
      for (const table of ['worlds', 'events', 'executions', 'consolidations', 'experiments', 'cycle_threads', 'cycles']) {
        this.#db.prepare(`DELETE FROM ${table} WHERE agent_id = ?`).run(agentId);
      }
      this.#db.prepare('DELETE FROM deleted_agents WHERE agent_id = ?').run(agentId);
    });
  }
  close(): void { this.#db.close(); }
  transaction<T>(operation: () => T): T {
    const depth = this.#depth++;
    const name = `nested_${depth}`;
    try {
      this.#db.exec(depth ? `SAVEPOINT ${name}` : 'BEGIN IMMEDIATE');
      try {
        const value = operation();
        if (value instanceof Promise) throw new Error('Storage transactions must be synchronous');
        this.#db.exec(depth ? `RELEASE ${name}` : 'COMMIT');
        return value;
      } catch (error) {
        this.#db.exec(depth ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK');
        throw error;
      }
    } finally { this.#depth--; }
  }
  get<K extends EntityKind>(kind: K, entityId: string): EntityMap[K] {
    const row = this.#db.prepare('SELECT body FROM entities WHERE kind = ? AND id = ?').get(kind, entityId) as BodyRow | undefined;
    if (!row) throw new Error(`${kind} ${entityId} not found`);
    const owner = JSON.parse(row.body).agentId as string;
    if (this.#db.prepare('SELECT 1 FROM deleted_agents WHERE agent_id = ?').get(owner)) throw new Error(`Agent ${owner} has been deleted`);
    return freeze(this.readEntity(kind, row.body));
  }
  list<K extends EntityKind>(kind: K, agentId?: string): EntityMap[K][] {
    const rows = agentId === undefined
      ? this.#db.prepare('SELECT body FROM entities WHERE kind = ? AND agent_id NOT IN (SELECT agent_id FROM deleted_agents) ORDER BY rowid').all(kind)
      : this.#db.prepare('SELECT body FROM entities WHERE kind = ? AND agent_id = ? AND agent_id NOT IN (SELECT agent_id FROM deleted_agents) ORDER BY rowid').all(kind, agentId);
    return rows.map(row => freeze(this.readEntity(kind, (row as BodyRow).body)))
      .filter(value => (kind !== 'memory' || !(value as EntityMap['memory']).deleted) && (kind !== 'disposition' || !(value as EntityMap['disposition']).deleted));
  }
  private readEntity<K extends EntityKind>(kind: K, body: string): EntityMap[K] {
    const value = JSON.parse(body);
    if (kind === 'identity') return readIdentity(value, this.get('agent', value.agentId).createdAt) as EntityMap[K];
    return entitySchemas[kind].parse(value) as EntityMap[K];
  }
  save<K extends EntityKind>(kind: K, state: EntityMap[K], expectedVersion: number, change: Change): void {
    const value = kind === 'memory' ? { ...state, referencingPartIds: memoryPartIds(state as EntityMap['memory']) } : state;
    const parsed = entitySchemas[kind].parse(value) as EntityMap[K];
    Origin.parse(change.origin); Text.parse(change.reason);
    if (parsed.version !== expectedVersion + 1) throw new ConflictError('New version must follow expected version');
    this.transaction(() => {
      if (kind === 'agent') {
        if (parsed.id !== parsed.agentId) throw new Error('Agent must own itself');
      } else {
        this.get('agent', parsed.agentId);
        if (kind === 'identity' && parsed.id !== parsed.agentId) throw new Error('Identity ID must match Agent');
      }
      if (kind === 'memory' || kind === 'prediction') {
        const owned = parsed as EntityMap['memory'] | EntityMap['prediction'];
        if (owned.partId === null && !(kind === 'memory' && (owned as EntityMap['memory']).synthesis)) {
          if (this.get('agent', parsed.agentId).architecture !== 'constructed') throw new Error('Gap ownership requires constructed cognition');
          const prediction = kind === 'prediction' ? owned as EntityMap['prediction']
            : (owned as EntityMap['memory']).predictionId ? this.get('prediction', (owned as EntityMap['memory']).predictionId!) : null;
          if (!prediction?.gapOrigin || prediction.partId !== null || prediction.agentId !== parsed.agentId)
            throw new Error('Partless records require explicit same-Agent gap hypothesis attribution');
          const cycle = this.cycle(prediction.createdCycle);
          if (cycle.agentId !== parsed.agentId || (cycle.threadId ?? null) !== prediction.gapOrigin.threadId)
            throw new Error('Gap hypothesis origin thread mismatch');
        }
        const source = owned.partId === null ? undefined : this.#db.prepare("SELECT body FROM entities WHERE kind = 'part' AND id = ?").get(owned.partId) as BodyRow | undefined;
        if (source) {
          if (JSON.parse(source.body).agentId !== parsed.agentId) throw new Error('Part ownership mismatch');
        } else if (owned.partId !== null && (kind !== 'memory' || expectedVersion === 0 || this.get('agent', parsed.agentId).architecture !== 'constructed'
          || this.get('memory', parsed.id).partId !== owned.partId || this.get('memory', parsed.id).agentId !== parsed.agentId)) {
          throw new Error('Part ownership source not found');
        }
      }
      if (kind === 'prediction') {
        const prediction = parsed as EntityMap['prediction'];
        if (prediction.gapOrigin && prediction.partId !== null) throw new Error('Gap hypothesis cannot fabricate an owning Part');
        if (expectedVersion > 0) {
          const old = this.get('prediction', prediction.id);
          if (old.createdCycle !== prediction.createdCycle || JSON.stringify(old.gapOrigin) !== JSON.stringify(prediction.gapOrigin))
            throw new Error('Prediction formation and gap attribution are immutable');
        }
      }
      if (kind === 'memory') {
        const memory = parsed as EntityMap['memory'];
        if (expectedVersion > 0 && JSON.stringify(memory.synthesis) !== JSON.stringify(this.get('memory', memory.id).synthesis))
          throw new Error('Memory synthesis attribution and source versions are immutable');
        if (memory.synthesis) {
          const lineage = memory.synthesis;
          const disposition = this.versions('disposition', lineage.dispositionId).find(record => record.state.version === lineage.dispositionVersion)?.state;
          const run = this.consolidations(memory.agentId).find(run => run.id === lineage.runId);
          if (memory.partId !== null || memory.predictionId !== null || this.get('agent', memory.agentId).architecture !== 'constructed'
            || !disposition || disposition.agentId !== memory.agentId || !run?.options?.synthesizeMemories
            || this.cycle(memory.createdCycle).agentId !== memory.agentId
            || new Set(lineage.sources.map(source => source.memoryId)).size !== lineage.sources.length
            || (lineage.detailDecisions && (lineage.detailDecisions.length !== lineage.sources.length
              || new Set(lineage.detailDecisions.map(decision => decision.memoryId)).size !== lineage.sources.length
              || lineage.detailDecisions.some(decision => !lineage.sources.some(source => source.memoryId === decision.memoryId)))))
            throw new Error('Synthesis requires explicit same-Agent disposition, sleep and distinct source attribution');
          for (const reference of lineage.sources) {
            const source = this.versions('memory', reference.memoryId).find(record => record.state.version === reference.version)?.state;
            if (reference.memoryId === memory.id || !source || source.agentId !== memory.agentId
              || source.ancestorIds.some(ancestor => !memory.ancestorIds.includes(ancestor)))
              throw new Error('Synthesis requires preserved same-Agent source versions and ancestry');
          }
        }
        for (const partId of memoryPartIds(memory)) {
          if (this.get('part', partId).agentId !== memory.agentId) throw new Error('Memory reference Agent mismatch');
        }
        // Legacy opaque ancestry is retained, but newly attached sources must be real snapshots.
        const previousSources = expectedVersion > 0 ? this.get('memory', memory.id).ancestorIds : [];
        for (const sourceId of memory.ancestorIds) {
          if (previousSources.includes(sourceId)) continue;
          const source = this.#db.prepare('SELECT agent_id FROM worlds WHERE id = ?').get(sourceId);
          if (source && source.agent_id !== memory.agentId) throw new Error('Memory WorldState Agent mismatch');
          if (!source && (expectedVersion > 0 || 'referencingPartIds' in state)) throw new Error('Memory WorldState reference not found');
        }
      }
      if (kind === 'disposition') {
        const state = parsed as EntityMap['disposition'];
        for (const parentId of state.prerequisites) {
          if (parentId === state.id || this.get('disposition', parentId).agentId !== state.agentId) throw new Error('Invalid disposition prerequisite');
        }
        for (const association of state.activationAssociations ?? []) {
          if (association.kind !== 'disposition') continue;
          const target = this.get('disposition', association.dispositionId);
          const preserved = expectedVersion > 0 && this.get('disposition', state.id).activationAssociations?.some(previous => previous.kind === 'disposition' && previous.dispositionId === target.id);
          if (target.id === state.id || target.agentId !== state.agentId || (target.deleted && !preserved)) throw new Error('Invalid disposition activation association');
        }
        for (const memoryId of state.suppressedMemoryIds ?? []) if (this.get('memory', memoryId).agentId !== state.agentId) throw new Error('Disposition retrieval exclusion ownership mismatch');
        for (const memoryId of state.memoryIds) if (this.get('memory', memoryId).agentId !== state.agentId) throw new Error('Disposition memory ownership mismatch');
        if (state.sourcePredictionId && this.get('prediction', state.sourcePredictionId).agentId !== state.agentId) throw new Error('Disposition prediction ownership mismatch');
        if (state.scaffold) {
          const sourceCycle = this.cycle(state.scaffold.createdCycle);
          const prediction = state.sourcePredictionId ? this.get('prediction', state.sourcePredictionId) : null;
          if (!state.temporary || !prediction || sourceCycle.agentId !== state.agentId
            || (sourceCycle.threadId ?? null) !== state.scaffold.threadId
            || !this.versions('prediction', prediction.id).some(record => record.state.version === state.scaffold!.hypothesisVersion && record.change.sourceIds.includes(sourceCycle.worldId)))
            throw new Error('Temporary scaffold must reference a preserved same-Agent hypothesis and origin thread');
          if ((state.scaffold.endedCycle === null) !== (state.scaffold.endReason === null)
            || (state.scaffold.endedCycle && (state.active || this.cycle(state.scaffold.endedCycle).agentId !== state.agentId)))
            throw new Error('Ended scaffold must be inactive with attributed end evidence');
          if (state.scaffold.relevance.relevantMemoryIds.some(memoryId => !state.memoryIds.includes(memoryId)))
            throw new Error('Scaffold recall hints must be preserved as same-Agent references');
        }
        if (state.development) {
          const development = state.development;
          for (const cue of development.cueEvidence ?? []) {
            if (cue.memoryIds.some(memoryId => !state.memoryIds.includes(memoryId)
              || this.get('memory', memoryId).agentId !== state.agentId))
              throw new Error('Disposition cue evidence must reference preserved same-Agent supporting memories');
          }
          if (development.previousVersion !== null && (development.previousVersion !== expectedVersion
            || !this.versions('disposition', state.id).some(record => record.state.version === development.previousVersion))) {
            throw new Error('Disposition previous version must reference its immediate preserved predecessor');
          }
          for (const link of development.lineage) {
            const ancestor = this.versions('disposition', link.dispositionId).find(record => record.state.version === link.version)?.state;
            if (!ancestor || ancestor.agentId !== state.agentId) throw new Error('Disposition lineage must reference preserved same-Agent versions');
          }
          for (const evidence of development.evidence) {
            const memory = this.get('memory', evidence.memoryId);
            const cycle = this.cycle(evidence.cycleId);
            if (memory.agentId !== state.agentId || cycle.agentId !== state.agentId
              || memory.createdCycle !== cycle.id || (cycle.threadId ?? null) !== evidence.threadId) {
              throw new Error('Disposition evidence must reference its same-Agent memory formation cycle and thread');
            }
            if (evidence.predictionId !== null) {
              const prediction = this.get('prediction', evidence.predictionId);
              if (prediction.agentId !== state.agentId || memory.predictionId !== prediction.id) {
                throw new Error('Disposition prediction evidence must be linked to its subjective memory');
              }
            }
            if (evidence.dispositionVersion !== null && !this.versions('disposition', state.id)
              .some(record => record.state.version === evidence.dispositionVersion)) {
              throw new Error('Disposition evidence version must reference preserved history');
            }
          }
        }
      }
      if (kind === 'part') {
        const part = parsed as EntityMap['part'];
        if (part.instance) {
          if (!part.temporary || (part.instance.retirement && part.lifecycle === 'active')) throw new Error('Constructed Parts are temporary; retired instances cannot participate');
          if (part.instance.retirement && this.cycle(part.instance.retirement.cycleId).agentId !== part.agentId) throw new Error('Constructed Part retirement ownership mismatch');
          const cycle = this.cycle(part.instance.createdCycle);
          if (cycle.agentId !== part.agentId || (cycle.threadId ?? null) !== part.instance.threadId) throw new Error('Constructed Part origin mismatch');
          for (const memoryId of [...part.instance.evidenceMemoryIds, ...part.instance.counterevidenceMemoryIds]) if (this.get('memory', memoryId).agentId !== part.agentId) throw new Error('Constructed Part evidence ownership mismatch');
        }
      }
      if (expectedVersion > 0) {
        const old = this.get(kind, parsed.id);
        if (kind === 'part') {
          const before = old as EntityMap['part'];
          const after = parsed as EntityMap['part'];
          if (before.instance && (!after.instance || before.instance.createdCycle !== after.instance.createdCycle || before.instance.threadId !== after.instance.threadId
            || (before.instance.retirement && (!after.instance.retirement || after.lifecycle === 'active')))) throw new Error('Constructed Part origin and retirement are immutable');
        }
        if (old.agentId !== parsed.agentId) throw new Error('Agent ownership is immutable');
        if (kind === 'identity') {
          const before = old as EntityMap['identity'];
          const after = parsed as EntityMap['identity'];
          for (const trait of after.traits) {
            const previous = before.traits.find(item => item.id === trait.id);
            if (previous && previous.createdAt !== trait.createdAt) throw new Error('Trait creation timestamp is immutable');
          }
        }
        if ('partId' in old && 'partId' in parsed && old.partId !== parsed.partId) throw new Error('Part ownership is immutable');
      }
      const body = JSON.stringify(parsed);
      if (expectedVersion === 0) {
        this.#db.prepare('INSERT INTO entities(kind,id,agent_id,version,body) VALUES(?,?,?,?,?)')
          .run(kind, parsed.id, parsed.agentId, parsed.version, body);
      } else {
        const result = this.#db.prepare('UPDATE entities SET version = ?, body = ? WHERE kind = ? AND id = ? AND version = ?')
          .run(parsed.version, body, kind, parsed.id, expectedVersion);
        if (result.changes !== 1) throw new ConflictError(`Stale ${kind} version; reload before editing`);
      }
      this.#db.prepare('INSERT INTO versions(kind,id,version,body,change,at) VALUES(?,?,?,?,?,?)')
        .run(kind, parsed.id, parsed.version, body, JSON.stringify(change), now());
    });
  }
  versions<K extends EntityKind>(kind: K, entityId: string): VersionRecord<EntityMap[K]>[] {
    return this.#db.prepare('SELECT body,change,at FROM versions WHERE kind = ? AND id = ? ORDER BY version').all(kind, entityId)
      .map(row => freeze({ state: this.readEntity(kind, row.body as string),
        change: JSON.parse(row.change as string) as Change, at: row.at as string }));
  }
  saveWorld(world: WorldState, previousWorldId?: string): void {
    const parsed = WorldStateSchema.parse(world);
    const cycle = this.cycle(parsed.cycleId);
    if (cycle.agentId !== parsed.agentId || (!previousWorldId && cycle.worldId !== parsed.id) || cycle.sequence !== parsed.sequence) throw new Error('WorldState cycle mismatch');
    if (previousWorldId) {
      const previous = this.world(previousWorldId);
      if (cycle.status !== 'running' || previous.cycleId !== parsed.cycleId || previous.agentId !== parsed.agentId
        || JSON.stringify(previous.facts) !== JSON.stringify(parsed.facts)) throw new Error('Deliberation snapshot mismatch');
    }
    this.#db.prepare('INSERT INTO worlds(id,agent_id,body) VALUES(?,?,?)').run(parsed.id, parsed.agentId, JSON.stringify(parsed));
  }
  /** Research/ancestry timeline, including additional immutable deliberation snapshots. */
  worlds(agentId: string): WorldState[] {
    this.get('agent', agentId);
    return this.#db.prepare('SELECT body FROM worlds WHERE agent_id = ? ORDER BY rowid').all(agentId)
      .map(row => freeze(WorldStateSchema.parse(JSON.parse(row.body as string))))
      .sort((a, b) => a.sequence - b.sequence);
  }
  world(worldId: string): WorldState {
    const row = this.#db.prepare('SELECT body FROM worlds WHERE id = ?').get(worldId) as BodyRow | undefined;
    if (!row) throw new Error(`WorldState ${worldId} not found`);
    return freeze(WorldStateSchema.parse(JSON.parse(row.body)));
  }
  startCycle(agentId: string, threadId?: string): Cycle {
    return this.transaction(() => {
      this.get('agent', agentId);
      if (this.consolidations(agentId).some(r => r.status === 'running')) throw new ConflictError('Agent is consolidating');
      const row = this.#db.prepare('SELECT COALESCE(MAX(sequence), 0) AS n FROM cycles WHERE agent_id = ?').get(agentId)!;
      const cycle: Cycle = { id: id('cycle'), agentId, sequence: Number(row.n) + 1, worldId: id('world'), startedAt: now(),
        status: 'running', error: null, selectedBidId: null, ...(threadId ? { threadId: Id.parse(threadId) } : {}) };
      this.#db.prepare('INSERT INTO cycles(id,agent_id,sequence,body) VALUES(?,?,?,?)').run(cycle.id, agentId, cycle.sequence, JSON.stringify(cycle));
      if (threadId) this.#db.prepare('INSERT INTO cycle_threads(cycle_id,agent_id,thread_id) VALUES(?,?,?)').run(cycle.id, agentId, threadId);
      return cycle;
    });
  }
  saveCycle(cycle: Cycle): void {
    const old = this.cycle(cycle.id);
    if (old.agentId !== cycle.agentId || old.sequence !== cycle.sequence || old.worldId !== cycle.worldId) throw new Error('Cycle identity is immutable');
    this.#db.prepare('UPDATE cycles SET body = ? WHERE id = ?').run(JSON.stringify(cycle), cycle.id);
  }
  cycle(cycleId: string): Cycle {
    const row = this.#db.prepare('SELECT body FROM cycles WHERE id = ?').get(cycleId) as BodyRow | undefined;
    if (!row) throw new Error(`Cycle ${cycleId} not found`);
    const thread = this.#db.prepare('SELECT thread_id FROM cycle_threads WHERE cycle_id = ?').get(cycleId);
    return freeze({ ...JSON.parse(row.body) as Cycle, ...(thread ? { threadId: String(thread.thread_id) } : {}) });
  }
  cycles(agentId: string): Cycle[] {
    return this.#db.prepare('SELECT id FROM cycles WHERE agent_id = ? ORDER BY sequence').all(agentId).map(row => this.cycle(String(row.id)));
  }
  assignCyclesToThread(agentId: string, threadId: string, cycleIds: string[]): void {
    Id.parse(threadId); this.get('agent', agentId);
    this.transaction(() => {
      for (const cycleId of cycleIds) {
        const cycle = this.cycle(cycleId);
        if (cycle.agentId !== agentId) throw new Error('Thread cycle ownership mismatch');
        if (cycle.threadId && cycle.threadId !== threadId) throw new ConflictError('Cycle already belongs to another thread');
        this.#db.prepare('INSERT OR IGNORE INTO cycle_threads(cycle_id,agent_id,thread_id) VALUES(?,?,?)').run(cycleId, agentId, threadId);
      }
      // Import a legacy browser thread's recorded sticky state without rewriting
      // its immutable worlds, events, or Part history.
      const importedParts = new Set<string>();
      for (const event of this.eventsByType(agentId, ['part.thought', 'part.mutation_applied'], cycleIds).reverse()) {
        const part = event.type === 'part.thought' ? event.payload.partSnapshot : event.type === 'part.mutation_applied' ? event.payload.part : null;
        if (!part || !event.cycleId) continue;
        if (importedParts.has(part.id)) continue;
        importedParts.add(part.id);
        const existing = this.#db.prepare('SELECT cycle_id FROM thread_part_stickiness WHERE part_id = ? AND thread_id = ?').get(part.id, threadId);
        if (existing) continue;
        this.#db.prepare('INSERT INTO thread_part_stickiness(part_id,thread_id,body,cycle_id) VALUES(?,?,?,?) ON CONFLICT(part_id,thread_id) DO UPDATE SET body=excluded.body,cycle_id=excluded.cycle_id')
          .run(part.id, threadId, JSON.stringify(part.stickiness), event.cycleId);
      }
    });
  }
  partForThread(partId: string, threadId?: string): Part {
    const part = this.get('part', partId);
    if (!threadId || (part.instance && part.instance.threadId === threadId)) return part;
    const row = this.#db.prepare('SELECT body FROM thread_part_stickiness WHERE part_id = ? AND thread_id = ?').get(partId, threadId) as BodyRow | undefined;
    return freeze({ ...part, stickiness: row ? PartSchema.shape.stickiness.parse(JSON.parse(row.body)) : { retained: false, unresolved: false, concern: '' } });
  }
  saveThreadStickiness(partId: string, threadId: string, stickiness: Part['stickiness'], cycleId: string): void {
    const part = this.get('part', partId); const cycle = this.cycle(cycleId);
    if (cycle.agentId !== part.agentId || cycle.threadId !== threadId) throw new Error('Thread stickiness ownership mismatch');
    this.#db.prepare('INSERT INTO thread_part_stickiness(part_id,thread_id,body,cycle_id) VALUES(?,?,?,?) ON CONFLICT(part_id,thread_id) DO UPDATE SET body=excluded.body,cycle_id=excluded.cycle_id')
      .run(partId, threadId, JSON.stringify(PartSchema.shape.stickiness.parse(stickiness)), cycleId);
  }
  appendEvent<K extends keyof EventPayloads>(agentId: string, cycleId: string | null, type: K, payload: EventPayloads[K], researchScope?: import('../../core/src/provider-operation.js').ResearchStageReference): CognitiveEvent {
    const event = { id: id('event'), agentId, cycleId, at: now(), type, payload: structuredClone(payload), ...(researchScope ? { researchScope: structuredClone(researchScope) } : {}) };
    const result = this.#db.prepare('INSERT INTO events(id,agent_id,cycle_id,at,type,payload,research_scope) VALUES(?,?,?,?,?,?,?)')
      .run(event.id, agentId, cycleId, event.at, type, JSON.stringify(payload), researchScope ? JSON.stringify(researchScope) : null);
    return freeze({ ...event, sequence: Number(result.lastInsertRowid) } as CognitiveEvent);
  }
  events(agentId: string, after = 0): CognitiveEvent[] {
    return this.#db.prepare('SELECT * FROM events WHERE agent_id = ? AND sequence > ? ORDER BY sequence').all(agentId, after)
      .map(row => freeze({ id: row.id, sequence: row.sequence, agentId: row.agent_id, cycleId: row.cycle_id, at: row.at,
        type: row.type, payload: JSON.parse(row.payload as string), ...(row.research_scope ? { researchScope: JSON.parse(row.research_scope as string) } : {}) } as CognitiveEvent));
  }
  eventsByType(agentId: string, types: (keyof EventPayloads)[], cycleIds?: string[]): CognitiveEvent[] {
    if (!types.length || cycleIds?.length === 0) return [];
    const cycleFilter = cycleIds ? ` AND cycle_id IN (${cycleIds.map(() => '?').join(',')})` : '';
    return this.#db.prepare(`SELECT * FROM events WHERE agent_id = ? AND type IN (${types.map(() => '?').join(',')})${cycleFilter} ORDER BY sequence`)
      .all(agentId, ...types, ...(cycleIds ?? [])).map(row => freeze({ id: row.id, sequence: row.sequence, agentId: row.agent_id,
        cycleId: row.cycle_id, at: row.at, type: row.type, payload: JSON.parse(row.payload as string), ...(row.research_scope ? { researchScope: JSON.parse(row.research_scope as string) } : {}) } as CognitiveEvent));
  }
  embedding(partId: string, key: string): number[] | null {
    const row = this.#db.prepare('SELECT vector FROM embeddings WHERE part_id = ? AND key = ?').get(partId, key);
    return row ? JSON.parse(row.vector as string) as number[] : null;
  }
  saveEmbedding(partId: string, key: string, vector: number[]): void {
    this.#db.prepare('INSERT INTO embeddings(part_id,key,vector) VALUES(?,?,?) ON CONFLICT(part_id) DO UPDATE SET key=excluded.key,vector=excluded.vector')
      .run(partId, key, JSON.stringify(vector));
  }
  saveExecution(execution: Execution): void {
    const recordedAt = now();
    const parsed = ExecutionSchema.parse({ ...execution, facts: execution.facts.map(fact => ({ ...fact, timestamp: fact.timestamp ?? recordedAt, originCycleId: fact.originCycleId ?? execution.cycleId })) });
    this.transaction(() => {
      if (this.cycle(parsed.cycleId).agentId !== parsed.agentId) throw new Error('Execution Agent mismatch');
      verifyProcedureReviewReport(this, parsed);
      verifySelectedPauseReport(this, parsed);
      const selectedContract = parsed.contractId ? this.eventsByType(parsed.agentId, ['execution.contract'], [parsed.cycleId])
        .find(event => event.type === 'execution.contract' && event.payload.id === parsed.contractId) : undefined;
      if (selectedContract?.type === 'execution.contract') verifyGuidanceContinuation(this, selectedContract.payload);
      if (selectedContract?.type === 'execution.contract') verifySelectedSkill(this, selectedContract.payload);
      if (selectedContract?.type === 'execution.contract' && selectedContract.payload.remainder
        && (parsed.status !== 'blocked' || parsed.operational?.attempts !== 0 || parsed.operational.traceRefs.length || parsed.operational.verified))
        verifyRemainderHandoff(this, selectedContract.payload);
      if (selectedContract?.type === 'execution.contract' && selectedContract.payload.remainder && parsed.status === 'completed'
        && evaluateSkillEvidence(executionProcedure(selectedContract.payload)!, parsed, this.eventsByType(parsed.agentId, ['execution.contract', 'execution.tool_trace'], [parsed.cycleId])).result !== 'passed')
        throw new Error('Remainder completion requires independent final verification evidence');
      if (selectedContract?.type === 'execution.contract' && (selectedContract.payload.guidanceRejection || selectedContract.payload.skillRejection || selectedContract.payload.remainderRejection)
        && (parsed.status !== 'blocked' || parsed.operational?.attempts !== 0 || parsed.operational.traceRefs.length || parsed.operational.verified))
        throw new Error('Rejected guidance contracts cannot report execution or completion');
      if (parsed.status === 'continued') {
        const target = this.eventsByType(parsed.agentId, ['execution.contract']).find(event => event.type === 'execution.contract'
          && event.payload.id === parsed.continuedByContractId);
        if (target?.type === 'execution.contract' && target.payload.remainder) {
          verifyRemainderHandoff(this, target.payload, true);
          if (target.payload.remainder.parentExecutionId !== parsed.id || parsed.operational?.verified
            || parsed.operational?.attempts !== target.payload.remainder.completedSteps
            || !isDeepStrictEqual(parsed.operational.traceRefs, target.payload.remainder.completedTraceRefs))
            throw new Error('Continued remainder must preserve its exact stopped prefix');
        } else {
        const claim = target?.type === 'execution.contract' ? this.eventsByType(parsed.agentId, ['execution.guidance_instruction'], [target.cycleId!])
          .find(event => event.type === 'execution.guidance_instruction' && event.payload.contractId === target.payload.id) : undefined;
        if (!target || target.type !== 'execution.contract' || !target.payload.continuation || !claim || claim.type !== 'execution.guidance_instruction'
          || !isDeepStrictEqual(claim.payload.continuation, target.payload.continuation)
          || target.payload.continuation.parentExecutionId !== parsed.id || target.payload.continuation.parentContractId !== parsed.contractId
          || target.payload.continuation.requestId !== parsed.guidance?.id
          || target.payload.commands.some(command => !this.cycle(target.payload.cycleId).selectedBidIds?.includes(command.bidId))
          || !isDeepStrictEqual(prepareGuidanceContinuation(this, parsed.agentId, target.payload.cycleId, target.payload.threadId,
            target.payload.commands[0]!, target.payload.id), target.payload.continuation))
          throw new Error('Continued status requires recorded Self-selected supplemental authority');
        }
      }
      if (parsed.guidance) {
        const cycle = this.cycle(parsed.cycleId);
        const events = this.eventsByType(parsed.agentId, ['execution.contract', 'execution.tool_trace'], [parsed.cycleId]);
        const source = events.find(event => event.type === 'execution.contract' && event.payload.id === parsed.contractId);
        if (!source || source.type !== 'execution.contract' || !source.payload.limits.maxGuidanceRequests || cycle.status === 'failed'
          || source.payload.commands.some(command => !cycle.selectedBidIds?.includes(command.bidId))
          || source.payload.commands.length !== 1 || !isDeepStrictEqual(source.payload.commands[0]!.action, parsed.action))
          throw new Error('Guidance requires a recorded selected contract and available handoff budget');
        if (parsed.operational?.attempts !== 0 || parsed.operational.traceRefs.length || parsed.guidance.traceRefs.length
          || events.some(event => event.type === 'execution.tool_trace' && event.payload.contractId === parsed.contractId && event.payload.phase === 'submitted'))
          throw new Error('The no-submission guidance handoff cannot conceal recorded tool submissions');
        if (this.executions(parsed.agentId).some(item => item.id !== parsed.id && item.contractId === parsed.contractId && item.guidance))
          throw new Error('A selected handoff cannot duplicate its guidance request');
      }
      const old = this.#db.prepare('SELECT body FROM executions WHERE id = ?').get(parsed.id) as BodyRow | undefined;
      if (old) {
        const previous = ExecutionSchema.parse(JSON.parse(old.body));
        validateExecutionUpdate(previous, parsed);
      }
      const order = Number(this.#db.prepare('SELECT COALESCE(MAX(updated_order),0) + 1 AS n FROM executions').get()!.n);
      this.#db.prepare('INSERT INTO executions(id,agent_id,body,updated_order,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_order=excluded.updated_order,updated_at=excluded.updated_at')
        .run(parsed.id, parsed.agentId, JSON.stringify(parsed), order, now());
    });
  }
  executions(agentId: string): Execution[] {
    return this.#db.prepare('SELECT body FROM executions WHERE agent_id = ? ORDER BY rowid').all(agentId)
      .map(row => freeze(ExecutionSchema.parse(JSON.parse(row.body as string))));
  }
  recentFacts(agentId: string, limit: number | null, threadId?: string): Fact[] {
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new Error('Invalid context limit');
    if (limit === 0) return [];
    // Thread-scoped factual conversation records only; no Part-private thought or
    // autobiographical reconstruction enters shared WorldState.
    const cycleFilter = threadId
      ? 'IN (SELECT cycle_id FROM cycle_threads WHERE agent_id = ? AND thread_id = ?)'
      : 'NOT IN (SELECT cycle_id FROM cycle_threads WHERE agent_id = ?)';
    const parameters = threadId ? [agentId, agentId, threadId, limit ?? -1] : [agentId, agentId, limit ?? -1];
    const executiveProfile = this.executiveProfile(agentId);
    const executiveEnabled = executiveProfile.enabled;
    const toolsEnabled = executiveModuleEnabled(executiveProfile, 'tools');
    const executions = !executiveEnabled ? [] : this.#db.prepare(`SELECT e.body,e.updated_at,e.updated_order,c.sequence FROM executions e JOIN cycles c ON c.id = json_extract(e.body,'$.cycleId') WHERE e.agent_id = ? AND c.id ${cycleFilter} ORDER BY e.updated_order DESC LIMIT ?`).all(...parameters)
      .map(row => {
        const execution = ExecutionSchema.parse(JSON.parse(row.body as string));
        if (!executiveActionEnabled(executiveProfile, execution.action.kind)) return { cycle: Number(row.sequence), phase: 1, at: '', order: 0, facts: [] };
        const timestamp = String(row.updated_at) || this.cycle(execution.cycleId).startedAt;
        const statusFacts: Fact[] = execution.status === 'completed' && execution.facts.length ? [] : [{
          source: 'Environment', kind: 'observes', timestamp, originCycleId: execution.cycleId,
          text: `The action “${execution.action.text}” ${execution.status === 'running' ? 'is still in progress' : execution.status === 'pending' ? 'has not started yet' : execution.status === 'needs_guidance' ? 'is awaiting cognitive instruction; no tool calls were submitted' : execution.status === 'continued' ? 'continues under a fresh Self-selected supplemental contract; goal completion is not established' : execution.status === 'failed' ? 'failed' : execution.status === 'blocked' ? 'is blocked' : execution.status === 'unverified' ? 'has an unverified outcome' : 'completed'}.`, referenceId: execution.id,
        }];
        return { cycle: Number(row.sequence), phase: 1, at: timestamp, order: Number(row.updated_order), facts: [...statusFacts,
          ...execution.facts.map(fact => ({ ...fact,
            ...(execution.status === 'completed' && execution.speech && (execution.action.kind === 'say' || execution.action.kind === 'ask')
              ? { source: 'Sensor audio', kind: 'says' as const, text: `You said: ${execution.speech.text}` }
              : { source: fact.source === 'agent chat output' ? 'Agent' : fact.source,
                kind: fact.source === 'agent chat output' && execution.action.kind !== 'wait' ? 'says' as const : fact.kind }),
            timestamp: fact.timestamp ?? timestamp, originCycleId: fact.originCycleId ?? execution.cycleId }))] };
      });
    const worlds = this.#db.prepare(`SELECT w.body,c.sequence FROM worlds w JOIN cycles c ON c.id = json_extract(w.body,'$.cycleId') WHERE w.id = json_extract(c.body,'$.worldId') AND w.agent_id = ? AND c.id ${cycleFilter} ORDER BY c.sequence DESC LIMIT ?`).all(...parameters)
      .map(row => {
        const raw = JSON.parse(row.body as string) as { facts: { kind: string; originCycleId?: string }[] };
        const world = WorldStateSchema.parse(raw);
        if (!toolsEnabled && this.cycle(world.cycleId).kind?.startsWith('attention_')) return { cycle: Number(row.sequence), phase: 0, at: world.capturedAt, order: 0, facts: [] };
        // Legacy utterances were the incoming facts. New snapshots retain explicit origin
        // so prior statements remain says without being re-added on each later turn.
        const originals = world.facts.filter((fact, index) => raw.facts[index]?.kind === 'utterance' || fact.originCycleId === world.cycleId);
        return { cycle: Number(row.sequence), phase: 0, at: world.capturedAt, order: 0,
          facts: originals.map(fact => ({ ...fact, timestamp: fact.timestamp ?? world.capturedAt, originCycleId: world.cycleId })) };
      });
    const teaching = !toolsEnabled ? [] : this.eventsByType(agentId, ['execution.procedure_teaching']).filter(event => event.cycleId
      && (this.cycle(event.cycleId).threadId ?? null) === (threadId ?? null)).slice(limit === null ? 0 : -limit).flatMap(event => {
        if (event.type !== 'execution.procedure_teaching' || !event.cycleId) return [];
        return [{ cycle: this.cycle(event.cycleId).sequence, phase: 1, at: event.at, order: event.sequence,
          facts: [{ source: 'External execution', kind: 'observes' as const, text: teachingFeedback(event.payload), timestamp: event.at,
            originCycleId: event.cycleId, referenceId: event.payload.executionId }] }];
      });
    const rejections = !toolsEnabled ? [] : this.eventsByType(agentId, ['execution.bid_rejected']).filter(event => event.cycleId
      && (this.cycle(event.cycleId).threadId ?? null) === (threadId ?? null)).slice(limit === null ? 0 : -limit).flatMap(event => {
        if (event.type !== 'execution.bid_rejected' || !event.cycleId) return [];
        return [{ cycle: this.cycle(event.cycleId).sequence, phase: 1, at: event.at, order: event.sequence,
          facts: [{ source: 'External execution admission', kind: 'observes' as const,
            text: `The host did not submit the selected recommendation. Admission report: ${event.payload.reason}`,
            timestamp: event.at, originCycleId: event.cycleId, referenceId: event.id }] }];
      });
    // A researcher replacement changes future context, never the historical rows.
    const boundaryParameters = threadId ? [agentId, agentId, threadId] : [agentId, agentId];
    const boundary = this.#db.prepare(`SELECT MAX(c.sequence) AS sequence FROM worlds w JOIN cycles c ON c.id = json_extract(w.body,'$.cycleId') WHERE w.agent_id = ? AND c.id ${cycleFilter} AND json_extract(w.body,'$.replacesExternalFacts') = 1`).get(...boundaryParameters)?.sequence;
    const cutoff = typeof boundary === 'number' ? boundary : 0;
    const facts = [...worlds, ...executions, ...teaching, ...rejections].filter(record => record.cycle >= cutoff).sort((a, b) => a.cycle - b.cycle || a.phase - b.phase || a.at.localeCompare(b.at) || a.order - b.order).flatMap(record => record.facts);
    const factual = facts.filter(fact => !isLegacyCapabilityFact(fact));
    return limit === null ? factual : factual.slice(-limit);
  }
  saveConsolidation(run: ConsolidationRun): void {
    this.transaction(() => {
      this.get('agent', run.agentId);
      if (run.status === 'running' && this.cycles(run.agentId).some(c => c.status === 'running')) throw new ConflictError('Agent is in a cognitive cycle');
      this.#db.prepare('INSERT INTO consolidations(id,agent_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
        .run(run.id, run.agentId, JSON.stringify(run));
    });
  }
  consolidations(agentId: string): ConsolidationRun[] {
    return this.#db.prepare('SELECT body FROM consolidations WHERE agent_id = ? ORDER BY rowid').all(agentId)
      .map(row => freeze(JSON.parse(row.body as string) as ConsolidationRun));
  }
  saveExperiment(run: { id: string; agentId: string } & Record<string, unknown>): void {
    this.#db.prepare('INSERT INTO experiments(id,agent_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(run.id, run.agentId, JSON.stringify(run));
  }
  experiments(): ({ id: string; agentId: string } & Record<string, unknown>)[] {
    return this.#db.prepare('SELECT body FROM experiments ORDER BY rowid').all()
      .map(row => freeze(JSON.parse(row.body as string) as { id: string; agentId: string } & Record<string, unknown>));
  }
  mcpRegistry(): McpRegistry {
    const row = this.#db.prepare('SELECT body FROM mcp_registry WHERE singleton=1').get() as BodyRow | undefined;
    return row ? McpRegistrySchema.parse(JSON.parse(row.body)) : { revision: 0, servers: [] };
  }
  mcpRegistryHistory(): McpRegistry[] {
    return (this.#db.prepare('SELECT body FROM mcp_registry_history ORDER BY revision').all() as BodyRow[])
      .map(row => McpRegistrySchema.parse(JSON.parse(row.body)));
  }
  saveMcpRegistry(registry: McpRegistry, expectedRevision: number): void {
    const next = McpRegistrySchema.parse(registry);
    this.transaction(() => {
      const current = this.mcpRegistry();
      if (current.revision !== expectedRevision || next.revision !== expectedRevision + 1) throw new ConflictError('MCP registry changed; reload before saving');
      if (!current.revision) this.#db.prepare('INSERT OR IGNORE INTO mcp_registry_history VALUES(?,?,?)').run(0, JSON.stringify(current), now());
      this.#db.prepare('INSERT INTO mcp_registry VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET body=excluded.body').run(JSON.stringify(next));
      this.#db.prepare('INSERT INTO mcp_registry_history VALUES(?,?,?)').run(next.revision, JSON.stringify(next), now());
      const surviving = new Set(next.servers.map(server => server.id));
      for (const agent of this.list('agent')) {
        const grants = this.mcpPermissions(agent.id);
        const tools = grants.tools.filter(tool => surviving.has(tool.serverId));
        const serverIds = grants.serverIds?.filter(serverId => surviving.has(serverId));
        if (tools.length !== grants.tools.length || serverIds?.length !== grants.serverIds?.length)
          this.saveMcpPermissions(agent.id, { revision: grants.revision + 1, tools, ...(serverIds !== undefined ? { serverIds } : {}) }, grants.revision);
      }
    });
  }
  mcpPermissions(agentId: string): McpPermissions {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT body FROM mcp_permissions WHERE agent_id=?').get(agentId) as BodyRow | undefined;
    return row ? McpPermissionsSchema.parse(JSON.parse(row.body)) : { revision: 0, tools: [] };
  }
  mcpPermissionsHistory(agentId: string): McpPermissions[] {
    this.get('agent', agentId);
    return (this.#db.prepare('SELECT body FROM mcp_permissions_history WHERE agent_id=? ORDER BY revision').all(agentId) as BodyRow[])
      .map(row => McpPermissionsSchema.parse(JSON.parse(row.body)));
  }
  saveMcpPermissions(agentId: string, permissions: McpPermissions, expectedRevision: number): void {
    const next = McpPermissionsSchema.parse(permissions);
    this.transaction(() => {
      const current = this.mcpPermissions(agentId);
      if (current.revision !== expectedRevision || next.revision !== expectedRevision + 1) throw new ConflictError('MCP permissions changed; reload before saving');
      const registered = new Set(this.mcpRegistry().servers.map(server => server.id));
      if (next.serverIds?.some(serverId => !registered.has(serverId))) throw new Error('MCP membership references an unregistered server');
      if (next.tools.some(tool => !registered.has(tool.serverId))) throw new Error('MCP permission references an unregistered server');
      if (!current.revision) this.#db.prepare('INSERT OR IGNORE INTO mcp_permissions_history VALUES(?,?,?,?)').run(agentId, 0, JSON.stringify(current), now());
      this.#db.prepare('INSERT INTO mcp_permissions VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET body=excluded.body').run(agentId, JSON.stringify(next));
      this.#db.prepare('INSERT INTO mcp_permissions_history VALUES(?,?,?,?)').run(agentId, next.revision, JSON.stringify(next), now());
    });
  }
  executiveSkills(agentId: string): ExecutiveSkill[] {
    this.get('agent', agentId);
    return (this.#db.prepare('SELECT body FROM executive_skills WHERE agent_id=? ORDER BY rowid').all(agentId) as BodyRow[])
      .map(row => freeze(ExecutiveSkillSchema.parse(JSON.parse(row.body))));
  }
  executiveSkillHistory(agentId: string, skillId: string): ExecutiveSkill[] {
    this.get('agent', agentId);
    return (this.#db.prepare('SELECT body FROM executive_skill_history WHERE agent_id=? AND id=? ORDER BY version').all(agentId, skillId) as BodyRow[])
      .map(row => freeze(ExecutiveSkillSchema.parse(JSON.parse(row.body))));
  }
  saveExecutiveSkill(skill: ExecutiveSkill, expectedVersion: number): void {
    const next = ExecutiveSkillSchema.parse(skill);
    this.transaction(() => {
      this.get('agent', next.agentId);
      const row = this.#db.prepare('SELECT body FROM executive_skills WHERE id=?').get(next.id) as BodyRow | undefined;
      const previous = row ? ExecutiveSkillSchema.parse(JSON.parse(row.body)) : null;
      const mode = this.executiveProfile(next.agentId).learningMode;
      if (next.change.reviewContractId) {
        const event = this.eventsByType(next.agentId, ['execution.contract']).find(item => item.type === 'execution.contract' && item.payload.id === next.change.reviewContractId);
        if (event?.type !== 'execution.contract') throw new Error('Cognitive skill decision requires a recorded contract');
        const contract = event.payload; const review = selectedSkillReview(this, contract);
        const profile = this.executiveProfile(next.agentId);
        const receipts = this.eventsByType(next.agentId, ['execution.procedure_review'], [contract.cycleId]).filter(item => item.type === 'execution.procedure_review' && item.payload.contractId === contract.id);
        const receipt = receipts[0]?.type === 'execution.procedure_review' ? receipts[0].payload : undefined;
        if (profile.skillReviewPolicy !== 'self_selected' || contract.skillReviewPolicy !== 'self_selected'
          || profile.learningMode === 'disabled' || !contract.learningMode || contract.learningMode === 'disabled'
          || this.cycle(contract.cycleId).status !== 'running' || !previous || previous.status !== 'proposed'
          || review.skillId !== next.id || review.version !== expectedVersion || review.decision !== next.change.kind
          || review.reason !== next.change.reason || receipts.length !== 1 || !receipt
          || receipt.skillId !== next.id || receipt.sourceVersion !== expectedVersion || receipt.resultVersion !== next.version
          || receipt.decision !== review.decision || receipt.reason !== review.reason || !/^[a-f0-9]{64}$/.test(receipt.packageDigest)
          || (previous.scope === 'thread' && previous.threadId !== contract.threadId))
          throw new Error('Cognitive skill decision requires its exact selected receipt and enabled policy');
        if (review.decision === 'approval') prepareSkillApproval(this, next.agentId, contract.threadId, next.id, expectedVersion);
      }

      if (mode === 'disabled' && !['archive', 'rejection'].includes(next.change.kind)) throw new Error('Executive procedural learning is disabled');
      if ((previous?.version ?? 0) !== expectedVersion || next.version !== expectedVersion + 1)
        throw new ConflictError('Executive skill changed; reload before saving');
      if (previous && (previous.agentId !== next.agentId || (!['revision', 'rollback'].includes(next.change.kind)
        && (!isDeepStrictEqual(previous.source, next.source) || !isDeepStrictEqual(previous.procedure, next.procedure) || !isDeepStrictEqual(previous.limits, next.limits) || !isDeepStrictEqual(previous.conditional, next.conditional)
          || previous.name !== next.name || !isDeepStrictEqual(previous.conditions, next.conditions) || previous.scope !== next.scope || previous.threadId !== next.threadId))))
        throw new Error('Skill ownership, source instruction and exact procedure are immutable');
      if ((!previous && next.change.kind !== 'proposal') || (['proposal', 'revision'].includes(next.change.kind)
        && (next.status !== 'proposed' || next.validations.length))) throw new Error('New procedural instructions require an unvalidated proposal');
      if (!previous && next.maturity) throw new Error('New knowledge cannot fabricate a recorded maturity assessment');
      if (previous) {
        const kind = next.change.kind;
        if (kind === 'maturity') verifySkillMaturity(this, previous, next);
        else if (!['revision', 'rollback'].includes(kind) && !isDeepStrictEqual(previous.maturity, next.maturity))
          throw new Error('Maturity changes require an explicit assessment');
        if (kind === 'revision' && next.maturity) throw new Error('Revised methods require fresh maturity assessment');
        if (kind === 'proposal') throw new Error('Existing skills require an explicit lifecycle transition');
        if (kind === 'approval' && (previous.status !== 'proposed' || next.status !== 'active'))
          throw new Error('Skill approval requires a validated proposal');
        if ((kind === 'rejection' && next.status !== 'rejected') || (kind === 'archive' && next.status !== 'archived'))
          throw new Error('Skill status must match its lifecycle transition');
        if (kind === 'validation' && (previous.status !== 'proposed' || next.validations.length !== previous.validations.length + 1
          || (next.status !== 'proposed' && !(next.status === 'active' && mode === 'validated_automatic' && next.validations.at(-1)?.result === 'passed'))))
          throw new Error('Skill validation requires one new observation on a proposed procedure');
        if (['approval', 'rejection', 'archive'].includes(kind) && !isDeepStrictEqual(previous.validations, next.validations))
          throw new Error('Administrative decisions cannot add validation evidence');
      }
      if (previous && !['revision', 'rollback'].includes(next.change.kind)
        && previous.validations.some((validation, index) => !isDeepStrictEqual(validation, next.validations[index])))
        throw new Error('Skill updates must preserve accumulated validation evidence');
      if (next.conditional) {
        for (const branch of next.conditional.branches) {
          const member = this.executiveSkillHistory(next.agentId, branch.skillId).find(member => member.version === branch.version);
          if (!member || member.id === next.id || member.conditional || (next.scope === 'agent' && member.scope !== 'agent')
            || (member.scope === 'thread' && member.threadId !== next.threadId)) throw new Error('Conditional branches require recorded same-Agent scope-compatible exact methods');
          if (next.status === 'active') {
            const current = this.executiveSkills(next.agentId).find(skill => skill.id === member.id);
            const grants = this.mcpPermissions(next.agentId).tools;
            if (current?.version !== member.version || current.status !== 'active' || [...member.procedure.steps, ...(member.procedure.verification ? [member.procedure.verification] : [])]
              .some(tool => !grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName)))
              throw new Error('Conditional activation requires current active permitted branch methods');
          }
        }
      }
      if (next.status === 'active') {
        if (mode === 'supervised' && next.change.kind === 'validation') throw new Error('Supervised proposals require explicit approval');
        const grants = this.mcpPermissions(next.agentId).tools;
        if ([...next.procedure.steps, ...(next.procedure.verification ? [next.procedure.verification] : [])]
          .some(tool => !grants.some(grant => grant.serverId === tool.serverId && grant.toolName === tool.toolName)))
          throw new Error('Skill activation cannot expand current tool permissions');
      }
      const source = this.eventsByType(next.agentId, ['execution.contract'], [next.source.cycleId])
        .find(event => event.type === 'execution.contract' && event.payload.id === next.source.contractId);
      if (!source || source.type !== 'execution.contract') throw new Error('Skill requires a recorded same-Agent source contract');
      if (source.payload.guidanceRejection || source.payload.skillRejection || source.payload.remainderRejection) throw new Error('A rejected guidance instruction or method cannot teach a retained procedure');
      const command = source.payload.commands[0];
      const chain = next.source.correctionChain ? correctedProcedure(this, next.agentId, next.source.correctionChain.executionId) : undefined;
      const root = chain ? this.eventsByType(next.agentId, ['execution.contract']).find(event => event.type === 'execution.contract' && event.payload.id === chain.rootContractId) : undefined;
      if (source.payload.remainder && !chain) throw new Error('Corrected skill cannot retain only a remainder fragment');
      if (chain && (chain.evidence !== 'passed' || chain.contractIds.at(-1) !== source.payload.id
        || !isDeepStrictEqual(next.source.correctionChain, { executionId: chain.executionIds.at(-1), rootContractId: chain.rootContractId, contractIds: chain.contractIds, executionIds: chain.executionIds })))
        throw new Error('Corrected skill lineage does not match independently recorded whole-chain evidence');
      if (source.payload.commands.length !== 1 || command?.action.kind !== 'operate'
        || command.bidId !== next.source.bidId || command.partId !== next.source.partId || command.argument !== next.source.instruction
        || !isDeepStrictEqual(chain?.method ?? executionProcedure(source.payload), next.procedure)
        || !isDeepStrictEqual(root?.type === 'execution.contract' ? root.payload.limits : source.payload.limits, next.limits)
        || (next.scope === 'thread' && next.threadId !== source.payload.threadId)) throw new Error('Skill source does not match selected instruction');
      if (next.status === 'active' && next.change.kind === 'validation' && command.action.operation.teachProcedure
        && source.payload.learningMode !== 'validated_automatic') throw new Error('Captured teaching mode requires explicit approval');
      for (const [index, validation] of next.validations.entries()) {
        const execution = this.executions(next.agentId).find(item => item.id === validation.executionId);
        if (!execution) throw new Error('Skill validation must reference a same-Agent execution');
        if (next.scope === 'thread' && this.cycle(execution.cycleId).threadId !== next.threadId) throw new Error('Skill evidence is outside its thread scope');
        const evidence = evaluateRecordedProcedure(this, next.procedure, execution);
        if (validation.result === 'passed' && (evidence.result !== 'passed' || !isDeepStrictEqual(validation.traceRefs, evidence.traceRefs)))
          throw new Error('Skill validation is not supported by recorded tool evidence');
        if (next.change.kind === 'validation' && index === next.validations.length - 1
          && (validation.result !== evidence.result || !isDeepStrictEqual(validation.traceRefs, evidence.traceRefs)))
          throw new Error('Skill validation is not supported by recorded tool evidence');
      }
      if (next.change.kind === 'rollback') {
        const restored = this.executiveSkillHistory(next.agentId, next.id).find(item => item.version === next.change.restoredVersion);
        if (!restored) throw new Error('Skill rollback requires a preserved version');
        const { version: _version, change: _change, ...original } = restored;
        const { version: _nextVersion, change: _nextChange, ...candidate } = next;
        if (!isDeepStrictEqual(original, candidate)) throw new Error('Skill rollback must restore the preserved version exactly');
      }
      this.#db.prepare('INSERT INTO executive_skills VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(next.id, next.agentId, JSON.stringify(next));
      this.#db.prepare('INSERT INTO executive_skill_history VALUES(?,?,?,?,?)').run(next.id, next.agentId, next.version, JSON.stringify(next), now());
    });
  }
  executiveProfile(agentId: string): ExecutiveProfile {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT body FROM executive_profiles WHERE agent_id=?').get(agentId) as BodyRow | undefined;
    return freeze(row ? ExecutiveProfileSchema.parse(JSON.parse(row.body)) : defaultExecutiveProfile());
  }
  executiveProfileHistory(agentId: string): ExecutiveProfile[] {
    this.get('agent', agentId);
    return (this.#db.prepare('SELECT body FROM executive_profile_history WHERE agent_id=? ORDER BY revision').all(agentId) as BodyRow[])
      .map(row => freeze(ExecutiveProfileSchema.parse(JSON.parse(row.body))));
  }
  saveExecutiveProfile(agentId: string, profile: ExecutiveProfile, expectedRevision: number): void {
    const next = ExecutiveProfileSchema.parse(profile);
    this.transaction(() => {
      const current = this.executiveProfile(agentId);
      if (current.revision !== expectedRevision || next.revision !== expectedRevision + 1)
        throw new ConflictError('Executive profile changed; reload before saving');
      if (!current.revision) this.#db.prepare('INSERT OR IGNORE INTO executive_profile_history VALUES(?,?,?,?)')
        .run(agentId, 0, JSON.stringify(current), now());
      this.#db.prepare('INSERT INTO executive_profiles VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET body=excluded.body').run(agentId, JSON.stringify(next));
      this.#db.prepare('INSERT INTO executive_profile_history VALUES(?,?,?,?)').run(agentId, next.revision, JSON.stringify(next), now());
    });
  }
  identityAuthoringSettings(agentId: string): IdentityAuthoringSettings | null {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT body FROM identity_authoring_settings WHERE agent_id = ?').get(agentId);
    return row ? freeze(IdentityAuthoringSettingsSchema.parse(JSON.parse(row.body as string))) : null;
  }
  saveIdentityAuthoringSettings(agentId: string, settings: IdentityAuthoringSettings): void {
    this.get('agent', agentId);
    const validated = IdentityAuthoringSettingsSchema.parse(settings);
    this.transaction(() => this.#db.prepare(`INSERT INTO identity_authoring_settings(agent_id,body) VALUES(?,?)
      ON CONFLICT(agent_id) DO UPDATE SET body=excluded.body`).run(agentId, JSON.stringify(validated)));
  }
  primitiveSettings(agentId: string): PrimitiveSettings {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT body FROM primitive_settings WHERE agent_id = ?').get(agentId);
    return row ? freeze(PrimitiveSettingsSchema.parse(JSON.parse(row.body as string))) : initialPrimitiveSettings();
  }
  savePrimitiveSettings(agentId: string, settings: PrimitiveSettings, expectedRevision: number): void {
    const validated = PrimitiveSettingsSchema.parse(settings);
    this.transaction(() => {
      const current = this.primitiveSettings(agentId);
      if (current.revision !== expectedRevision || validated.revision !== expectedRevision + 1) throw new ConflictError('Primitive settings changed; reload before saving');
      if (current.revision === 0) this.#db.prepare('INSERT OR IGNORE INTO primitive_settings_history VALUES(?,?,?,?)').run(agentId, 0, JSON.stringify(current), now());
      this.#db.prepare('INSERT INTO primitive_settings VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET body=excluded.body').run(agentId, JSON.stringify(validated));
      this.#db.prepare('INSERT INTO primitive_settings_history VALUES(?,?,?,?)').run(agentId, validated.revision, JSON.stringify(validated), now());
    });
  }
  agentActivationSettings(agentId: string): { vectorSearchEnabled: boolean; memorySearchEnabled?: boolean; memoryRelevanceThreshold?: number; memoryRecallLimit?: number | null; includeProcessingDispositions?: boolean; maxConcurrentThoughts?: number; maxQueuedThoughts?: number; activationPassLimit?: number | null; primitivesFirst?: boolean; reevaluateAfterDeliberation?: boolean } {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT continuous_settings, memory_search_enabled, memory_relevance_threshold, memory_recall_limit, vector_search_enabled, reevaluate_after_deliberation, primitives_first FROM agent_activation_settings WHERE agent_id = ?').get(agentId);
    return { ...{ includeProcessingDispositions: false, maxConcurrentThoughts: 4, maxQueuedThoughts: 100, activationPassLimit: 1 }, ...(row ? JSON.parse(String(row.continuous_settings)) : {}), memorySearchEnabled: row ? row.memory_search_enabled === 1 : false, memoryRelevanceThreshold: row ? Number(row.memory_relevance_threshold) : 0.5, memoryRecallLimit: row ? row.memory_recall_limit === null ? null : Number(row.memory_recall_limit) : 12, vectorSearchEnabled: row ? row.vector_search_enabled === 1 : true, reevaluateAfterDeliberation: row ? row.reevaluate_after_deliberation === 1 : false, primitivesFirst: row ? row.primitives_first === 1 : false };
  }
  saveAgentActivationSettings(agentId: string, settings: { vectorSearchEnabled: boolean; memorySearchEnabled?: boolean; memoryRelevanceThreshold?: number; memoryRecallLimit?: number | null; includeProcessingDispositions?: boolean; maxConcurrentThoughts?: number; maxQueuedThoughts?: number; activationPassLimit?: number | null; primitivesFirst?: boolean; reevaluateAfterDeliberation?: boolean }): void {
    this.get('agent', agentId);
    const validated = AgentActivationSettingsSchema.parse(settings);
    this.transaction(() => this.#db.prepare(`INSERT INTO agent_activation_settings(agent_id,vector_search_enabled,reevaluate_after_deliberation,primitives_first,memory_search_enabled,memory_relevance_threshold,memory_recall_limit,continuous_settings) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET vector_search_enabled=excluded.vector_search_enabled, reevaluate_after_deliberation=excluded.reevaluate_after_deliberation, primitives_first=excluded.primitives_first, memory_search_enabled=excluded.memory_search_enabled, memory_relevance_threshold=excluded.memory_relevance_threshold, memory_recall_limit=excluded.memory_recall_limit, continuous_settings=excluded.continuous_settings`)
      .run(agentId, validated.vectorSearchEnabled ? 1 : 0, validated.reevaluateAfterDeliberation ? 1 : 0, validated.primitivesFirst ? 1 : 0, validated.memorySearchEnabled ? 1 : 0, validated.memoryRelevanceThreshold, validated.memoryRecallLimit, JSON.stringify({ includeProcessingDispositions: validated.includeProcessingDispositions, maxConcurrentThoughts: validated.maxConcurrentThoughts, maxQueuedThoughts: validated.maxQueuedThoughts, activationPassLimit: validated.activationPassLimit })));
  }
  agentProviderSettings(agentId: string): { model: string; encryptedApiKey: string | null; thoughtRouting?: ThoughtRoutingSettings | null } | null {
    this.get('agent', agentId);
    const row = this.#db.prepare('SELECT model, encrypted_api_key AS encryptedApiKey, thought_routing AS thoughtRouting FROM agent_provider_settings WHERE agent_id = ?').get(agentId) as { model: string; encryptedApiKey: string | null; thoughtRouting: string | null } | undefined;
    return row ? { model: row.model, encryptedApiKey: row.encryptedApiKey, ...(row.thoughtRouting ? { thoughtRouting: ThoughtRoutingSettingsSchema.parse(JSON.parse(row.thoughtRouting)) } : {}) } : null;
  }
  saveAgentProviderSettings(agentId: string, settings: { model: string; encryptedApiKey: string | null; thoughtRouting?: ThoughtRoutingSettings | null }): void {
    this.get('agent', agentId);
    this.transaction(() => this.#db.prepare(`INSERT INTO agent_provider_settings(agent_id,model,encrypted_api_key,thought_routing) VALUES(?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET model=excluded.model, encrypted_api_key=excluded.encrypted_api_key, thought_routing=excluded.thought_routing`)
      .run(agentId, settings.model, settings.encryptedApiKey, settings.thoughtRouting ? JSON.stringify(ThoughtRoutingSettingsSchema.parse(settings.thoughtRouting)) : null));
  }
  promptOverrides(input: { scope?: 'global' | 'agent'; agentId?: string; task?: PromptTask } = {}): PromptOverride[] {
    if (input.scope === 'agent' && !input.agentId) throw new Error('Agent prompt overrides require an Agent ID');
    if (input.agentId) this.get('agent', input.agentId);
    const where: string[] = []; const values: (string | number)[] = [];
    if (input.scope) { where.push('scope = ?'); values.push(input.scope); }
    if (input.agentId !== undefined) { where.push('agent_id = ?'); values.push(input.agentId); }
    if (input.task === 'deliberation') { where.push("task IN ('deliberation', 'debate')"); }
    else if (input.task) { where.push('task = ?'); values.push(input.task); }
    const sql = `SELECT scope,agent_id AS agentId,task,body AS text FROM prompt_overrides ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY scope,agent_id,task`;
    const rows = this.#db.prepare(sql).all(...values) as (Omit<PromptOverride, 'task'> & { task: string })[];
    // Current renamed overrides take precedence; preserve old template text on read.
    return rows.filter(row => row.task === 'debate' || PromptTaskSchema.safeParse(row.task).success)
      .filter(row => row.task !== 'debate' || !rows.some(current => current.task === 'deliberation' && current.scope === row.scope && current.agentId === row.agentId))
      .map(row => PromptOverrideSchema.parse({ ...row, task: row.task === 'debate' ? 'deliberation' : row.task }));
  }
  savePromptOverride(input: PromptOverride): void {
    const parsed = PromptOverrideSchema.parse(input);
    if (parsed.scope === 'agent') this.get('agent', parsed.agentId!);
    this.transaction(() => {
      this.#db.prepare('DELETE FROM prompt_overrides WHERE scope = ? AND agent_id IS ? AND task = ?')
        .run(parsed.scope, parsed.agentId, parsed.task);
      this.#db.prepare('INSERT INTO prompt_overrides(scope,agent_id,task,body) VALUES(?,?,?,?)')
        .run(parsed.scope, parsed.agentId, parsed.task, parsed.text);
    });
  }
  deletePromptOverride(scope: 'global' | 'agent', agentId: string | null, task: PromptTask): void {
    if (scope === 'agent' && !agentId) throw new Error('Agent prompt overrides require an Agent ID');
    if (scope === 'global' && agentId !== null) throw new Error('Global prompt overrides cannot have an Agent ID');
    if (agentId) this.get('agent', agentId);
    this.#db.prepare('DELETE FROM prompt_overrides WHERE scope = ? AND agent_id IS ? AND task IN (?, ?)').run(scope, agentId, task, task === 'deliberation' ? 'debate' : task);
  }
  clearPromptOverrides(): number {
    return Number(this.#db.prepare('DELETE FROM prompt_overrides').run().changes);
  }
}
