import { dreamConsole } from './dream-console.js';
import { SynthesisPolicySchema } from '../../core/src/sleep-policy.js';
import { analyzeAffect, AffectAnalysisFilterSchema } from './affect-analysis.js';
import { analyzeSimulation } from './simulation-analysis.js';
import { simulationReport } from './simulation-report.js';
import { researchRun, simulationCitation, simulationResearch, simulationCandidates, saveSimulationReview, saveSimulationMetricReview, saveSimulationFinding, saveSimulationCandidates } from './simulation-research.js';
import { compareSimulations, compareSimulationStages, aggregateSimulations } from './simulation-comparison.js';
import { registerAgentMcp } from './mcp-registration.js';
import { previewMcpRepository, searchMcpRegistry } from './mcp-repository.js';
import { copySkillPackage } from './skill-package-copy.js';
import { copyExecutiveProfile } from './executive-profile-copy.js';
import { parseAgentSkillPackage } from '../../core/src/agent-skill-format.js';
import { simulationAssessmentAvailable, startSimulationAssessment } from './simulation-evaluator.js';
import { simulationRubric } from './simulation-rubrics.js';
import { dispositionStatistics } from './disposition-statistics.js';
import { createComponent, draftComponent } from './component-authoring.js';
import { referencesMemory } from '../../core/src/domain.js';
import { memoryOverview, searchMemories } from './memory-search.js';
import { PrimitiveDraftSchema, defaultPrimitives, effectivePrimitive } from '../../core/src/primitives.js';
import { ConflictError } from '../../core/src/contracts.js';
import { clarifyIdentity, generateIdentity } from './identity-authoring.js';
import { z } from 'zod';
import { previewPrompt } from './prompt-preview.js';
import { DispositionSchema, AgentActivationSettingsSchema, IdentitySchema, IdentityTraitDraftSchema, IdentityTraitRoleSchema, IdentityTraitSchema, id, now, MemorySchema, PartDraftSchema, PartPatchSchema, PromptTaskSchema, Text } from '../../core/src/domain.js';
import type { Application } from './application.js';
import { experimentNames, runExperiment } from './experiments.js';
import { identityAnswerGuidance, identityQuestionLibrary } from './identity-questions.js';
import { simulationTests, listSimulationRuns, startSimulationTest, startDream, replaySimulation, pauseDream, resumeDream } from './simulation-tests.js';
import { McpRegistrySchema, McpPermissionsSchema } from '../../core/src/mcp-configuration.js';
import { ExecutiveProfileSchema } from '../../core/src/executive-profile.js';
import { SkillProposalSchema, SkillMaturityAssessmentSchema } from '../../core/src/executive-skill.js';
import { inspectExecutiveSkill } from './skill-inspection.js';
import { FactSchema } from '../../core/src/domain.js';
import { ExecutiveCheckpointKindSchema, ExecutiveCompetenceSchema } from '../../core/src/executive-attention.js';

export function snapshot(app: Application, agentId: string, threadId?: string) {
  return { agent: app.store.get('agent', agentId), identity: app.store.get('identity', agentId), parts: app.store.list('part', agentId).map(part => app.store.partForThread(part.id, threadId)),
    dispositions: app.store.list('disposition', agentId),
    memories: app.store.list('memory', agentId), predictions: app.store.list('prediction', agentId), cycles: app.store.cycles(agentId),
    inferenceSettings: app.agentInferenceSettings(agentId), identityAuthoringSettings: app.store.identityAuthoringSettings(agentId),
    executions: app.store.executions(agentId), consolidations: app.store.consolidations(agentId) };
}
export type AgentSnapshot = ReturnType<typeof snapshot>;

/** Shared validated use cases; HTTP and CLI are researcher interfaces. */
export async function api(app: Application, method: string, path: string, body: unknown = null): Promise<unknown> {
  const route = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [prefix, resource, entityId, action, subresource, operation, traitOperation] = route;
  if (prefix !== 'api') throw new Error('Unknown route');
  if (method !== 'GET' && entityId && ['parts', 'memories', 'predictions', 'dispositions'].includes(resource ?? '')) {
    const kind = ({ parts: 'part', memories: 'memory', predictions: 'prediction', dispositions: 'disposition' } as const)[resource as 'parts' | 'memories' | 'predictions' | 'dispositions'];
    const owner = app.store.get(kind, entityId).agentId;
    if (listSimulationRuns(app).some(run => (run.status === 'running' || run.status === 'paused') && run.dream && run.agentId === owner)) throw new ConflictError('Wait for the Agent dream to finish before editing its psychology');
  }
  if (resource === 'identity-questions' && method === 'GET' && !entityId) return identityQuestionLibrary;
  if (resource === 'identity-guidance' && method === 'GET' && !entityId) return { guidance: identityAnswerGuidance };
  if (resource === 'agents' && !entityId) {
    if (method === 'GET') return app.store.list('agent');
    if (method === 'POST') { const input = z.strictObject({ name: Text, consolidationProfile: z.enum(['constructed', 'persistent']).optional() }).parse(body); return app.createAgent(input.name, input.consolidationProfile); }
  }
  if (resource === 'configuration' && method === 'GET') return { reasoning: app.providers.reasoning.label,
    decisions: app.providers.decisions.label, embeddings: app.providers.embeddings.label };
  if (resource === 'experiments') {
    if (method === 'GET') return { names: experimentNames, runs: app.store.experiments() };
    if (method === 'POST') return runExperiment(app, z.strictObject({ name: z.enum(experimentNames) }).parse(body).name);
  }
  if (resource === 'simulation-tests') {
    if (method === 'GET' && entityId && action === 'console') return dreamConsole(app, entityId, Number(subresource ?? 0));
    if (method === 'POST' && entityId && (action === 'pause' || action === 'resume')) {
      z.strictObject({}).parse(body ?? {});
      return action === 'pause' ? pauseDream(app, entityId) : resumeDream(app, entityId);
    }
    if (method === 'POST' && entityId === 'compare-stages' && !action) {
      const input = z.strictObject({ leftRunId: Text, rightRunId: Text, leftIndex: z.number().int().min(0), rightIndex: z.number().int().min(0) }).parse(body);
      return compareSimulationStages(researchRun(app.store, input.leftRunId), researchRun(app.store, input.rightRunId), input.leftIndex, input.rightIndex, app.store.experiments().filter(item => item.kind === 'simulation_metric_review') as import('./simulation-research.js').SimulationMetricReview[]);
    }
    if (method === 'POST' && entityId === 'compare' && !action) {
      const input = z.strictObject({ leftRunId: Text, rightRunId: Text }).parse(body);
      return compareSimulations(researchRun(app.store, input.leftRunId), researchRun(app.store, input.rightRunId), app.store.experiments().filter(item => item.kind === 'simulation_metric_review') as import('./simulation-research.js').SimulationMetricReview[]);
    }
    if (method === 'POST' && entityId === 'aggregate' && !action) {
      const input = z.strictObject({ runIds: z.array(Text).max(200) }).parse(body);
      const selected = [...new Set(input.runIds)].map(runId => researchRun(app.store, runId));
      return aggregateSimulations(selected,
        app.store.experiments().filter(item => item.kind === 'simulation_metric_review') as import('./simulation-research.js').SimulationMetricReview[],
        selected.filter(run => run.status !== 'running').map(run => ({ runId: run.id, candidates: simulationCandidates(app.store, run) })));
    }
    if (entityId && action === 'research') {
      if (method === 'GET') return { ...simulationResearch(app.store, entityId), candidates: simulationCandidates(app.store, researchRun(app.store, entityId)) };
      if (method === 'POST' && subresource === 'metric-reviews') return saveSimulationMetricReview(app.store, entityId, body);
      if (method === 'POST' && subresource === 'reviews') return saveSimulationReview(app.store, entityId, body);
      if (method === 'POST' && subresource === 'findings') return saveSimulationFinding(app.store, entityId, body);
      if (method === 'POST' && subresource === 'candidates') return saveSimulationCandidates(app.store, entityId);
    }
    if (method === 'POST' && entityId && (action === 'rerun' || action === 'fork')) {
      const settings = z.strictObject({ vectorSearchEnabled: z.boolean().optional(), memorySearchEnabled: z.boolean().optional(),
        memoryRelevanceThreshold: z.number().min(0).max(1).optional(), memoryRecallLimit: z.number().int().min(1).max(10000).nullable().optional(),
        primitivesFirst: z.boolean().optional(), reevaluateAfterDeliberation: z.boolean().optional() });
      const input = z.strictObject({ reason: z.string().trim().min(1).max(4000), activationChanges: settings.optional() }).parse(body);
      if (action === 'rerun' && Object.keys(input.activationChanges ?? {}).length) throw new Error('Use fork for explicit configuration changes');
      if (action === 'fork' && !Object.keys(input.activationChanges ?? {}).length) throw new Error('A fork requires an explicit configuration change');
      return replaySimulation(app, entityId, input.reason, input.activationChanges as Parameters<typeof replaySimulation>[3]);
    }
    if (method === 'GET' && entityId && action === 'report') {
      const run = researchRun(app.store, entityId);
      return simulationReport(run, analyzeSimulation(app.store, run), simulationResearch(app.store, entityId), simulationCandidates(app.store, run), reference => simulationCitation(app.store, run, reference));
    }
    if (method === 'GET' && entityId && action === 'analysis') {
      const run = listSimulationRuns(app).find(item => item.id === entityId);
      if (!run) throw new Error('Unknown simulation run');
      return analyzeSimulation(app.store, run);
    }
    if (method === 'GET' && !entityId) return { tests: simulationTests.map(test => ({ ...test, rubric: simulationRubric(test) })), runs: listSimulationRuns(app).map(run => ({ ...run, assessmentAvailable: simulationAssessmentAvailable(run) })) };
    if (method === 'POST' && entityId && action === 'assess') {
      const input = z.strictObject({ model: z.enum(['gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini', 'grok-4.3']).optional(), evaluatorAgentId: Text.optional() }).parse(body ?? {});
      return startSimulationAssessment(app, entityId, { ...(input.model ? { model: input.model } : {}), ...(input.evaluatorAgentId ? { evaluatorAgentId: input.evaluatorAgentId } : {}) });
    }
    if (method === 'POST' && !entityId) {
      const input = z.strictObject({ dream: z.strictObject({ keepChanges: z.boolean().default(false) }).optional(), evaluator: z.strictObject({ enabled: z.boolean().optional(), model: z.enum(['gpt-5-nano', 'gpt-4.1-nano', 'gpt-4.1-mini', 'grok-4.3']).optional() }).optional(), testId: Text, mode: z.enum(['fixture', 'configured']), sourceAgentId: Text }).parse(body);
      const evaluation = input.evaluator ? {
        ...(input.evaluator.enabled !== undefined ? { enabled: input.evaluator.enabled } : {}),
        ...(input.evaluator.model !== undefined ? { model: input.evaluator.model } : {}),
      } : undefined;
      return input.dream ? startDream(app, input.testId, input.mode, input.sourceAgentId, input.dream.keepChanges, evaluation)
        : startSimulationTest(app, input.testId, input.mode, input.sourceAgentId, evaluation);
    }
  }
  if (resource === 'mcp-registry-search' && method === 'POST') {
    const input = z.strictObject({ query: z.string().trim().min(1).max(200) }).parse(body);
    return searchMcpRegistry(input.query);
  }
  if (resource === 'mcp-repository-preview' && method === 'POST') {
    const input = z.strictObject({ url: z.string().max(2000) }).parse(body);
    return previewMcpRepository(input.url);
  }
  if (resource === 'mcp-servers') {
    if (method === 'GET' && !entityId) return app.executiveConnections.status();
    if (method === 'PUT' && !entityId) {
      const input = McpRegistrySchema.omit({ revision: true }).extend({ expectedRevision: z.number().int().nonnegative() }).parse(body);
      app.store.saveMcpRegistry({ revision: input.expectedRevision + 1, servers: input.servers }, input.expectedRevision);
      return app.executiveConnections.status();
    }
    if (method === 'GET' && entityId === 'history') return app.store.mcpRegistryHistory();
    if (method === 'POST' && entityId && action === 'discover') { z.strictObject({}).parse(body); return app.executiveConnections.discover(entityId); }
    if (method === 'POST' && entityId && action === 'disconnect') { z.strictObject({}).parse(body); await app.executiveConnections.disconnect(entityId); return { disconnected: true }; }
  }
  if (!entityId) throw new Error('Missing resource ID');
  if (resource === 'agents') {
    if (method !== 'GET' && listSimulationRuns(app).some(run => (run.status === 'running' || run.status === 'paused') && run.dream && run.agentId === entityId)) throw new ConflictError('Wait for the Agent dream to finish before editing or starting other work');
    if (action === 'affect-analysis' && method === 'GET') return analyzeAffect(app.store, entityId);
    if (action === 'affect-analysis' && method === 'POST') return analyzeAffect(app.store, entityId, AffectAnalysisFilterSchema.parse(body ?? {}));
    if (method === 'DELETE' && !action) {
      z.strictObject({}).parse(body);
      app.store.deleteAgent(entityId);
      return { deleted: true };
    }
    app.store.get('agent', entityId);
    if (action === 'executive-attention' && method === 'GET' && !subresource) {
      return app.store.eventsByType(entityId, ['execution.attention']).map(event => ({ cycleId: event.cycleId, ...event.payload }));
    }
    if (action === 'executions' && subresource && operation === 'checkpoint' && method === 'POST') {
      const input = z.strictObject({ facts: FactSchema.array().min(1).max(50), checkpoint: ExecutiveCheckpointKindSchema.default('environment'),
        competence: ExecutiveCompetenceSchema.optional() }).parse(body);
      return app.observeExecution(entityId, subresource, input.facts, input.checkpoint, input.competence);
    }
    if (action === 'executions' && subresource && operation === 'consult' && method === 'POST') {
      const input = z.strictObject({ facts: FactSchema.array().min(1).max(50), reason: z.string().trim().min(1).max(4000),
        competence: ExecutiveCompetenceSchema.optional() }).parse(body);
      return app.consultExecution(entityId, subresource, input.facts, input.reason, input.competence);
    }
    if (action === 'executive-consolidation') {
      if (method === 'POST' && subresource && operation === 'abandon') {
        const input = z.strictObject({ reason: Text }).parse(body);
        return app.procedureConsolidation.abandon(entityId, subresource, input.reason);
      }
      if (method === 'GET') return app.procedureConsolidation.records(entityId);
      if (method === 'POST') { z.strictObject({}).parse(body); return app.consolidateProcedures(entityId); }
    }
    if (action === 'executive-skill-imports') {
      if (method === 'POST' && subresource === 'copy') return copySkillPackage(app, entityId, body);
      if (method === 'POST' && subresource && operation === 'review') return app.agentSkillImports.review(entityId, subresource, body);
      if (method === 'POST' && !subresource) return app.agentSkillImports.propose(entityId, body);
      if (method === 'GET') return subresource ? app.agentSkillImports.load(entityId, subresource) : app.agentSkillImports.list(entityId);
    }
    if (action === 'executive-skill-packages' && method === 'POST' && subresource === 'preview') {
      app.store.get('agent', entityId);
      const { name, files } = z.strictObject({ name: z.string(), files: z.record(z.string(), z.string()) }).parse(body);
      return parseAgentSkillPackage(name, files);
    }
    if (action === 'executive-skill-packages' && method === 'GET' && subresource) return app.agentSkillPackages.load(entityId, subresource);
    if (action === 'executive-skill-packages' && method === 'POST' && !subresource) {
      z.strictObject({}).parse(body); return app.agentSkillPackages.reconcile(entityId);
    }
    if (action === 'executive-skills') {
      if (method === 'GET' && subresource && operation === 'package-method' && traitOperation) {
        return app.agentSkillPackages.resolveMethod(entityId, subresource, z.coerce.number().int().positive().parse(traitOperation));
      }
      if (method === 'GET' && !subresource) return app.store.executiveSkills(entityId);
      if (method === 'GET' && subresource && operation === 'history') return app.store.executiveSkillHistory(entityId, subresource);
      if (method === 'GET' && subresource && operation === 'inspect') return inspectExecutiveSkill(app.store, entityId, subresource);
      if (method === 'GET' && subresource && operation === 'package') return app.agentSkillPackages.build(entityId, subresource);
      if (method === 'POST' && subresource && operation === 'package') {
        const { version } = z.strictObject({ version: z.number().int().positive().optional() }).parse(body);
        return app.agentSkillPackages.persist(entityId, subresource, version);
      }
      if (method === 'POST' && subresource && operation === 'package-history') {
        z.strictObject({}).parse(body); return app.agentSkillPackages.persistHistory(entityId, subresource);
      }
      if (method === 'POST' && !subresource) return app.executiveSkills.proposeSkill(entityId, SkillProposalSchema.parse(body));
      if (method === 'POST' && subresource && operation === 'maturity') {
        const { expectedVersion, ...assessment } = SkillMaturityAssessmentSchema.extend({ expectedVersion: z.number().int().positive() }).parse(body);
        return app.executiveSkills.assessMaturity(entityId, subresource, expectedVersion, assessment);
      }
      if (method === 'PUT' && subresource && !operation) {
        const { expectedVersion, ...proposal } = SkillProposalSchema.extend({ expectedVersion: z.number().int().positive() }).parse(body);
        return app.executiveSkills.revise(entityId, subresource, expectedVersion, proposal);
      }
      if (method === 'POST' && subresource && operation === 'refresh-branches') {
        const input = z.strictObject({ expectedVersion: z.number().int().positive() }).parse(body);
        return app.executiveSkills.refreshBranches(entityId, subresource, input.expectedVersion);
      }
      if (method === 'POST' && subresource && operation === 'validate') {
        const input = z.strictObject({ expectedVersion: z.number().int().positive(), executionId: Text }).parse(body);
        return app.executiveSkills.validate(entityId, subresource, input.expectedVersion, input.executionId);
      }
      if (method === 'POST' && subresource && ['approve', 'reject', 'archive'].includes(operation ?? '')) {
        const input = z.strictObject({ expectedVersion: z.number().int().positive(), reason: Text }).parse(body);
        return app.executiveSkills.decide(entityId, subresource, input.expectedVersion,
          operation === 'approve' ? 'approval' : operation === 'reject' ? 'rejection' : 'archive', input.reason);
      }
      if (method === 'POST' && subresource && operation === 'rollback') {
        const input = z.strictObject({ expectedVersion: z.number().int().positive(), restoredVersion: z.number().int().positive(), reason: Text }).parse(body);
        return app.executiveSkills.rollback(entityId, subresource, input.expectedVersion, input.restoredVersion, input.reason);
      }
    }
    if (method === 'GET' && action === 'executions' && !subresource) return app.store.executions(entityId);
    if (method === 'POST' && action === 'executions' && subresource && operation === 'cancel') {
      z.strictObject({}).parse(body);
      return app.cancelExecution(entityId, subresource);
    }
    if (action === 'executive-profile') {
      if (method === 'POST' && subresource === 'copy') return copyExecutiveProfile(app.store, entityId, body);
      if (method === 'GET' && subresource === 'history') return app.store.executiveProfileHistory(entityId);
      if (method === 'GET' && !subresource) return app.store.executiveProfile(entityId);
      if (method === 'PUT' && !subresource) {
        const input = ExecutiveProfileSchema.omit({ revision: true }).extend({ expectedRevision: z.number().int().nonnegative() }).parse(body);
        const { expectedRevision, ...settings } = input;
        app.store.saveExecutiveProfile(entityId, { ...settings, revision: expectedRevision + 1 }, expectedRevision);
        return app.store.executiveProfile(entityId);
      }
    }
    if (action === 'mcp-connections' && method === 'POST') return registerAgentMcp(app.store, entityId, body);
    if (action === 'mcp-permissions') {
      if (method === 'GET' && subresource === 'history') return app.store.mcpPermissionsHistory(entityId);
      if (method === 'GET' && !subresource) return app.store.mcpPermissions(entityId);
      if (method === 'PUT' && !subresource) {
        const input = McpPermissionsSchema.omit({ revision: true }).extend({ expectedRevision: z.number().int().nonnegative() }).parse(body);
        const serverIds = input.serverIds ?? app.store.mcpPermissions(entityId).serverIds;
        app.store.saveMcpPermissions(entityId, { revision: input.expectedRevision + 1, tools: input.tools, ...(serverIds !== undefined ? { serverIds } : {}) }, input.expectedRevision);
        return app.store.mcpPermissions(entityId);
      }
    }
    if (method === 'GET' && action === 'mcp-tools') return app.executiveConnections.agentCatalog(entityId);
    if (method === 'GET' && !action) return snapshot(app, entityId);
    if (method === 'PATCH' && action === 'consolidation-profile') return app.changeConsolidationProfile(entityId, z.strictObject({ profile: z.enum(['constructed', 'persistent']) }).parse(body).profile);
    if (method === 'POST' && action === 'component-draft') return draftComponent(app, entityId, body);
    if (method === 'POST' && !subresource && (action === 'dispositions' || action === 'memories' || action === 'predictions')) return createComponent(app, entityId, action === 'dispositions' ? 'disposition' : action === 'memories' ? 'memory' : 'prediction', body);
    if (method === 'GET' && action === 'dispositions') return app.store.list('disposition', entityId);
    if (method === 'POST' && action === 'memories' && subresource && operation === 'recall') return app.runtime.constructed.recall(entityId, subresource, z.strictObject({ question: Text }).parse(body).question);
    if (method === 'GET' && action === 'worlds') return app.store.worlds(entityId);
    if (action === 'threads' && subresource) {
      if (method === 'GET' && !operation) return snapshot(app, entityId, subresource);
      if (method === 'POST' && operation === 'cycles') {
        const input = z.strictObject({ cycleIds: z.array(z.string().min(1)).max(10000) }).parse(body);
        app.store.assignCyclesToThread(entityId, subresource, input.cycleIds);
        return { threadId: subresource };
      }
    }
    if (method === 'PATCH' && !action) {
      const input = z.strictObject({ name: Text }).parse(body);
      return app.renameAgent(entityId, input.name);
    }
    if (action === 'primitives') {
      const current = app.store.primitiveSettings(entityId);
      if (method === 'GET') return { ...current, items: current.items.map(effectivePrimitive) };
      const version = z.strictObject({ expectedRevision: z.number().int().nonnegative() });
      let next = structuredClone(current);
      if (method === 'POST' && subresource === 'reset-all') {
        const input = version.parse(body);
        if (input.expectedRevision !== current.revision) throw new ConflictError('Primitive settings changed; reload before saving');
        const items = defaultPrimitives(); next = { revision: current.revision, items, originals: structuredClone(items) };
      } else if (method === 'POST' && !subresource) {
        const input = version.extend(PrimitiveDraftSchema.shape).parse(body);
        if (input.expectedRevision !== current.revision) throw new ConflictError('Primitive settings changed; reload before saving');
        const { expectedRevision: _, ...draft } = input;
        const item = { ...draft, id: id('primitive_custom') }; next.items.push(item); next.originals.push(structuredClone(item));
      } else if (subresource && (method === 'PATCH' || method === 'POST' && operation === 'reset' || method === 'DELETE')) {
        const index = next.items.findIndex(item => item.id === subresource);
        if (index < 0) throw new Error('Unknown primitive');
        const input = method === 'PATCH' ? version.extend(PrimitiveDraftSchema.shape).parse(body) : version.parse(body);
        if (input.expectedRevision !== current.revision) throw new ConflictError('Primitive settings changed; reload before saving');
        if (method === 'DELETE') {
          next.items.splice(index, 1); next.originals = next.originals.filter(item => item.id !== subresource);
        } else if (method === 'POST') {
          const original = [...defaultPrimitives(), ...next.originals].find(item => item.id === subresource);
          if (!original) throw new Error('No original definition available');
          next.items[index] = structuredClone(original);
        } else {
          const { expectedRevision: _, ...draft } = input as z.infer<typeof PrimitiveDraftSchema> & { expectedRevision: number };
          next.items[index] = { ...draft, id: subresource };
        }
      } else throw new Error('Unknown primitive operation');
      next.revision++;
      app.store.savePrimitiveSettings(entityId, next, current.revision);
      return { ...next, items: next.items.map(effectivePrimitive) };
    }
    if (method === 'GET' && action === 'events') return app.store.events(entityId);
    if (method === 'GET' && action === 'activation-settings') return app.agentActivationSettings(entityId);
    if (method === 'PATCH' && action === 'activation-settings') return app.updateAgentActivationSettings(entityId, AgentActivationSettingsSchema.extend({ reevaluateAfterDeliberation: z.boolean(), primitivesFirst: z.boolean() }).partial().parse(body));
    if (method === 'GET' && action === 'settings') return app.agentInferenceSettings(entityId);
    if (method === 'GET' && action === 'prompts') return app.promptSettings(entityId);
    if (method === 'POST' && action === 'prompts' && subresource && operation === 'preview') {
      const input = z.strictObject({ text: z.string().min(1).max(32768) }).parse(body);
      return previewPrompt(app.store, entityId, PromptTaskSchema.parse(subresource), input.text);
    }
    if (method === 'PATCH' && action === 'prompts' && subresource) {
      const input = z.strictObject({ scope: z.enum(['agent', 'global']), text: z.string().max(32768).refine(value => Boolean(value.trim()), 'Prompt cannot be empty') }).parse(body);
      return app.editPrompt(entityId, PromptTaskSchema.parse(subresource), input.scope, input.text);
    }
    if (method === 'POST' && action === 'prompts' && subresource && operation === 'reset') {
      const input = z.strictObject({ scope: z.enum(['agent', 'global']) }).parse(body);
      return app.resetPrompt(entityId, PromptTaskSchema.parse(subresource), input.scope);
    }
    if (method === 'POST' && action === 'prompts' && subresource === 'reset-all') return app.resetAllPrompts();
    if (method === 'PATCH' && action === 'settings') {
      const input = z.strictObject({ model: z.string().min(1).max(100),
        apiKey: z.string().min(16).max(512).refine(value => !/\s/.test(value), 'API key must not contain whitespace').optional(),
        clearApiKey: z.boolean().optional() }).parse(body);
      return app.updateAgentInferenceSettings(entityId, input);
    }
    if (action === 'identity-authoring' && subresource === 'settings') {
      if (method === 'GET') return app.store.identityAuthoringSettings(entityId);
      if (method === 'PATCH') {
        const input = z.strictObject({ selectedVersion: z.string().min(1).max(4000) }).parse(body);
        const current = app.store.identityAuthoringSettings(entityId);
        if (!current) throw new Error('Find character versions before selecting one');
        app.store.saveIdentityAuthoringSettings(entityId, { ...current, ...input });
        return app.store.identityAuthoringSettings(entityId);
      }
    }
    if (action === 'identity-authoring' && method === 'POST') {
      if (subresource === 'clarify') return clarifyIdentity(app, entityId, body);
      if (subresource === 'generate') return generateIdentity(app, entityId, body);
    }
    if (method === 'GET' && action === 'identity-history') return app.store.versions('identity', entityId);
    if (method === 'POST' && action === 'message') {
      const input = z.strictObject({ text: Text, source: Text.optional(), threadId: z.string().min(1).max(200).optional(),
        skillDocumentIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10).optional() }).parse(body);
      return app.message(entityId, input.text, input.source, input.threadId, input.skillDocumentIds);
    }
    if (method === 'POST' && action === 'consolidate') {
      const input = z.strictObject({ fromCycle: z.number().int().positive().optional(), toCycle: z.number().int().positive().optional(),
        synthesizeMemories: z.boolean().optional(), replaceSourceMemories: z.boolean().optional(), ...SynthesisPolicySchema.partial().shape }).parse(body);
      return app.consolidate(entityId, input.fromCycle, input.toCycle, { synthesizeMemories: input.synthesizeMemories ?? false, replaceSourceMemories: input.replaceSourceMemories ?? false, detailPolicy: input.detailPolicy ?? 'preserve_details', synthesisInstructions: input.synthesisInstructions ?? '' });
    }
    if (method === 'POST' && action === 'parts') return app.runtime.mutations.create(entityId, PartDraftSchema.parse(body),
      { origin: 'researcher_edit', reason: 'Researcher created a Part', sourceIds: [] });
    if (action === 'identity' && subresource === 'traits') {
      const identity = app.store.get('identity', entityId);
      if (method === 'GET' && !operation) return identity.traits;
      const versionInput = z.strictObject({ expectedVersion: z.number().int().positive() });
      let traits = [...identity.traits];
      let expectedVersion: number;
      let reason: string;
      if (method === 'POST' && !operation) {
        const input = versionInput.extend(IdentityTraitDraftSchema.shape).parse(body);
        expectedVersion = input.expectedVersion;
        traits.push({ id: id('trait'), createdAt: now(), question: input.question, answer: input.answer, keywords: input.keywords, role: input.role });
        reason = 'Researcher created Identity Trait';
      } else {
        const trait = identity.traits.find(item => item.id === operation);
        if (!trait) throw new Error('Identity Trait not found');
        if (method === 'PATCH' && !traitOperation) {
          const input = versionInput.extend(IdentityTraitDraftSchema.partial().extend({ role: IdentityTraitRoleSchema.optional() }).shape).parse(body);
          expectedVersion = input.expectedVersion;
          const { expectedVersion: _version, ...patch } = input;
          if (!Object.keys(patch).length) throw new Error('An explicit Trait change is required');
          traits = traits.map(item => item.id === trait.id ? IdentityTraitSchema.parse({ ...item, ...patch }) : item);
          reason = 'Researcher edited Identity Trait';
        } else if (method === 'DELETE' && !traitOperation) {
          expectedVersion = versionInput.parse(body).expectedVersion;
          traits = traits.filter(item => item.id !== trait.id);
          reason = 'Researcher deleted Identity Trait';
        } else if (method === 'POST' && traitOperation === 'duplicate') {
          expectedVersion = versionInput.parse(body).expectedVersion;
          const copy = { ...trait, keywords: [...trait.keywords], id: id('trait'), createdAt: now() };
          traits.splice(traits.indexOf(trait) + 1, 0, copy);
          reason = 'Researcher duplicated Identity Trait';
        } else throw new Error('Unknown Identity Trait operation');
      }
      const next = IdentitySchema.parse({ ...identity, traits, version: expectedVersion + 1 });
      app.store.save('identity', next, expectedVersion, { origin: 'researcher_edit', reason, sourceIds: [] });
      return next;
    }
    if (method === 'PATCH' && action === 'identity' && !subresource) {
      const input = z.strictObject({ expectedVersion: z.number().int().positive(), patch: IdentitySchema.omit({ id: true, agentId: true, version: true, schemaVersion: true }).partial() }).parse(body);
      const identity = app.store.get('identity', entityId);
      const next = IdentitySchema.parse({ ...identity, ...input.patch, version: input.expectedVersion + 1 });
      app.store.save('identity', next, input.expectedVersion, { origin: 'researcher_edit', reason: 'Researcher edited Identity', sourceIds: [] });
      return next;
    }
  }
  if (resource === 'agents' && method === 'GET' && action === 'memories' && subresource === 'overview') return memoryOverview(app, entityId!);
  if (resource === 'agents' && method === 'POST' && action === 'memories' && subresource === 'search') return searchMemories(app, entityId!, body);
  if (resource === 'cycles' && method === 'GET') return app.inspectCycle(entityId);
  if (resource === 'parts') {
    const part = action === 'threads' && subresource ? app.store.partForThread(entityId, subresource) : app.store.get('part', entityId);
    if (method === 'GET') return { part, versions: app.store.versions('part', entityId),
      memories: app.store.list('memory', part.agentId).filter(m => referencesMemory(m, entityId)),
      predictions: app.store.list('prediction', part.agentId).filter(p => p.partId === entityId) };
    if (method === 'PATCH') {
      const input = z.strictObject({ expectedVersion: z.number().int().positive(), patch: PartPatchSchema, threadId: z.string().min(1).max(200).optional() }).parse(body);
      const cycleId = input.threadId ? app.store.cycles(part.agentId).findLast(cycle => cycle.threadId === input.threadId)?.id : undefined;
      if (input.threadId && !cycleId) throw new Error('Thread has no cycle for a versioned Part edit');
      return app.runtime.mutations.patch(entityId, input.expectedVersion, input.patch,
        { origin: 'researcher_edit', reason: 'Researcher edited Part', sourceIds: [] }, cycleId ?? null);
    }
    if (method === 'POST' && action === 'restore') {
      const input = z.strictObject({ version: z.number().int().positive(), expectedVersion: z.number().int().positive() }).parse(body);
      return app.runtime.mutations.restore(entityId, input.version, input.expectedVersion);
    }
  }
  if (resource === 'memories') {
    if (method === 'PATCH' || method === 'DELETE') {
      const input = z.strictObject({ expectedVersion: z.number().int().positive(),
        ...(method === 'PATCH' ? { patch: MemorySchema.pick({ gist: true, content: true, context: true, referencingPartIds: true, ancestorIds: true }).partial() } : {}) }).parse(body);
      const memory = app.store.get('memory', entityId);
      if (memory.deleted) throw new Error('Memory has been deleted');
      const next = MemorySchema.parse({ ...memory, ...('patch' in input ? input.patch as object : {}),
        ...(method === 'DELETE' ? { deleted: true } : {}), version: input.expectedVersion + 1 });
      app.store.save('memory', next, input.expectedVersion, { origin: 'researcher_edit',
        reason: method === 'DELETE' ? 'Researcher deleted memory from recall' : 'Researcher edited memory', sourceIds: [] });
      return next;
    }
    if (method === 'GET') return { memory: app.store.get('memory', entityId), versions: app.store.versions('memory', entityId) };
    if (method === 'POST' && action === 'replay') {
      const input = z.strictObject({ ancestorId: Text, reason: Text }).parse(body);
      return app.consolidation.replay(entityId, input.ancestorId, input.reason);
    }
  }
  if (resource === 'dispositions') {
    const current = app.store.get('disposition', entityId);
    if (method === 'GET') return { disposition: current, versions: app.store.versions('disposition', entityId), statistics: dispositionStatistics(app.store, entityId) };
    if (current.deleted) throw new Error('Disposition has been deleted');
    if (method === 'DELETE' || (method === 'POST' && action === 'restore')) {
      const input = z.strictObject({ expectedVersion: z.number().int().positive(), ...(method === 'POST' ? { version: z.number().int().positive() } : {}) }).parse(body);
      const historical = method === 'POST' ? app.store.versions('disposition', entityId).find(record => record.state.version === (input as { version: number }).version)?.state : current;
      if (!historical) throw new Error('Disposition version not found');
      const next = DispositionSchema.parse({ ...historical, version: input.expectedVersion + 1,
        ...(historical.development ? { development: { ...historical.development, previousVersion: input.expectedVersion } } : {}),
        ...(method === 'DELETE' ? { deleted: true, active: false } : {}) });
      app.store.save('disposition', next, input.expectedVersion, { origin: 'researcher_edit', reason: method === 'DELETE' ? 'Researcher deleted disposition' : `Researcher restored disposition version ${historical.version}`, sourceIds: [] });
      return next;
    }
    if (method === 'PATCH') {
      const input = z.strictObject({ expectedVersion: z.number().int().positive(),
        patch: DispositionSchema.pick({ name: true, concern: true, cues: true, scope: true, prerequisites: true, activationAssociations: true, threshold: true, active: true }).partial() }).parse(body);
      for (const parent of input.patch.prerequisites ?? []) {
        if (parent === entityId || app.store.get('disposition', parent).agentId !== current.agentId) throw new Error('Invalid disposition prerequisite');
      }
      const next = DispositionSchema.parse({ ...current, ...input.patch, version: input.expectedVersion + 1, ...(current.development ? { development: { ...current.development, previousVersion: input.expectedVersion } } : {}) });
      app.store.save('disposition', next, input.expectedVersion, { origin: 'researcher_edit', reason: 'Researcher edited disposition', sourceIds: [] });
      return next;
    }
  }
  if (resource === 'predictions' && method === 'GET') return { prediction: app.store.get('prediction', entityId), versions: app.store.versions('prediction', entityId) };
  if (resource === 'worlds' && method === 'GET') return app.store.world(entityId);
  throw new Error('Unknown route');
}
