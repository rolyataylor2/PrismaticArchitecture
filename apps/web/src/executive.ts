import { showMcpRegistration } from './mcp-registration.js';
import type { ExecutiveProfile } from '../../../packages/core/src/executive-profile.js';
import type { ExecutiveSkill } from '../../../packages/core/src/executive-skill.js';
import type { McpRegistry, McpPermissions, CapabilityToolSchema } from '../../../packages/core/src/mcp-configuration.js';
import type { Execution } from '../../../packages/core/src/domain.js';
import type { CognitiveEvent } from '../../../packages/core/src/contracts.js';
import type { z } from 'zod';
import type { ExecutiveSkillInspection } from '../../../packages/sdk/src/skill-inspection.js';
import { showSkillInspector } from './skill-inspector.js';
import type { ExecutiveAttentionRecord } from '../../../packages/core/src/executive-attention.js';
import type { AgentSkillImports } from '../../../packages/sdk/src/agent-skill-imports.js';

type RegistryStatus = McpRegistry & { health?: Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'> };
type Api = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const element = document.createElement(tag); element.textContent = text; return element;
};
function input(parent: HTMLElement, title: string, value: string, type = 'text') {
  const label = el('label', title); const control = el('input'); control.type = type; control.value = value;
  label.append(control); parent.append(label); return control;
}
function choice(parent: HTMLElement, title: string, values: string[], value: string) {
  const label = el('label', title); const select = el('select');
  for (const item of values) { const option = el('option', item); option.value = item; select.append(option); }
  select.value = value; label.append(select); parent.append(label); return select;
}
function panel(parent: HTMLElement, title: string) {
  const section = el('section'); section.className = 'card executive-panel'; section.append(el('h3', title)); parent.append(section); return section;
}
function action(parent: HTMLElement, title: string, run: () => Promise<void>, fail: (error: unknown) => void) {
  const button = el('button', title); button.type = 'button';
  button.onclick = () => { button.disabled = true; void run().catch(fail).finally(() => { button.disabled = false; }); };
  parent.append(button); return button;
}

/** Privileged researcher configuration/inspection only. No cognitive state is owned here. */
export async function executivePage(root: HTMLElement, agentId: string, api: Api, fail: (error: unknown) => void,
  ui: { dialog: () => HTMLDialogElement; cycle: (cycleId: string) => void; considerSkill?: (proposalId: string, message: string) => Promise<void> }): Promise<void> {
  const page = el('div'); page.className = 'executive-page'; root.append(page);
  const path = `agents/${encodeURIComponent(agentId)}`;
  let [profile, registry, grants] = await Promise.all([
    api<ExecutiveProfile>(`${path}/executive-profile`), api<RegistryStatus>('mcp-servers'), api<McpPermissions>(`${path}/mcp-permissions`),
  ]);
  const toolbar = el('div'); toolbar.className = 'executive-actions';
  const heading = root.querySelector('h2');
  const header = el('div'); header.className = 'executive-header';
  if (heading) {
    heading.closest('.component-header')?.classList.add('executive-component-header');
    heading.replaceWith(header); header.append(heading, toolbar);
  } else { header.append(el('h2', 'Executive'), toolbar); page.append(header); }
  const runtime = panel(page, 'Runtime');
  runtime.append(el('p', 'Native is the available runtime. OpenClaw and custom adapters are not yet available.'));
  const enabled = input(runtime, 'Enable Executive', '', 'checkbox'); enabled.checked = profile.enabled; enabled.parentElement!.classList.add('executive-master-switch');
  const modules = el('fieldset'); modules.className = 'executive-modules'; modules.append(el('legend', 'Modules')); runtime.append(modules);
  const speaking = input(modules, 'Speaking', '', 'checkbox'); speaking.checked = profile.modules.speaking;
  const toolsModule = input(modules, 'Tool execution', '', 'checkbox'); toolsModule.checked = profile.modules.tools;
  const syncModules = () => { modules.disabled = !enabled.checked; };
  enabled.addEventListener('change', syncModules); syncModules();
  runtime.append(el('p', 'Off disconnects execution, tool and skill context, feedback and checkpoint reviews from cognition. Selected actions, including speech, are recorded without enactment. Already submitted effects cannot be undone.'));
  const mode = choice(runtime, 'Execution mode', ['synchronous', 'background'], profile.executionMode);
  const copy = el('fieldset'); copy.append(el('legend', 'Copy Executive configuration'));
  const sourceLabel = el('label', 'Source Agent'); const sourceChoice = el('select'); sourceLabel.append(sourceChoice); copy.append(sourceLabel);
  const emptySource = el('option', 'Choose an Agent'); emptySource.value = ''; sourceChoice.append(emptySource);
  for (const agent of await api<{ id: string; name: string }[]>('agents')) if (agent.id !== agentId) {
    const option = el('option', agent.name); option.value = agent.id; sourceChoice.append(option);
  }
  const copyReason = input(copy, 'Reason for copying configuration', '');
  const preview = el('pre'); copy.append(preview);
  copy.append(el('p', 'Copies settings into a new revision. Skills, tool grants, credentials and cognitive state keep their current owners.'));
  let sourceProfile: { agentId: string; profile: ExecutiveProfile } | null = null;
  sourceChoice.onchange = () => {
    sourceProfile = null; preview.textContent = '';
    const selected = sourceChoice.value;
    if (selected) void api<ExecutiveProfile>(`agents/${encodeURIComponent(selected)}/executive-profile`).then(settings => {
      if (sourceChoice.value !== selected || !page.isConnected) return;
      sourceProfile = { agentId: selected, profile: settings }; preview.textContent = JSON.stringify(settings, null, 2);
    }).catch(fail);
  };
  action(copy, 'Copy configuration', async () => {
    if (!sourceProfile || sourceProfile.agentId !== sourceChoice.value) throw new Error('Choose and review a source configuration first');
    await api(`${path}/executive-profile/copy`, 'POST', { sourceAgentId: sourceProfile.agentId,
      sourceRevision: sourceProfile.profile.revision, expectedRevision: profile.revision, reason: copyReason.value });
    page.remove(); await executivePage(root, agentId, api, fail, ui);
  }, fail);
  const recovery = panel(page, 'Autonomy & Recovery');
  const equivalent = input(recovery, 'Allow equivalent methods when a selected contract permits them', '', 'checkbox'); equivalent.checked = profile.allowEquivalentMethods;
  recovery.append(el('p', 'Exact selected strategies retain their chosen order and arguments. Adaptive methods and retries are not yet implemented.'));
  const limits = Object.fromEntries(Object.entries(profile.limits).map(([key, value]) => {
    const names: Record<string, string> = { maxSteps: 'Step budget', maxRetries: 'Retry budget', maxParallelJobs: 'Parallel jobs', maxDurationMs: 'Duration budget (ms)', maxGuidanceRequests: 'Guidance budget' };
    const control = input(recovery, names[key]!, String(value), 'number'); control.min = key === 'maxRetries' || key === 'maxGuidanceRequests' ? '0' : '1';
    return [key, control];
  }));
  const sensitivity = panel(page, 'Environmental Sensitivity');
  sensitivity.append(el('p', 'Engineering thresholds, not psychological probabilities. Unresolved submissions and constraint violations always stop further work.'));
  const signals = ['failure', 'drift', 'surprise', 'novelty', 'uncertainty'] as const;
  const settings = signals.map(signal => {
    const group = el('fieldset'); group.append(el('legend', signal)); sensitivity.append(group);
    const current = profile.sensitivity[signal];
    const fields = ['threshold', 'minThreshold', 'maxThreshold', 'cooldownMs'] as const;
    return { signal, controls: Object.fromEntries(fields.map(key => {
      const control = input(group, key === 'cooldownMs' ? 'Cooldown (ms)' : key === 'threshold' ? 'Response threshold' : key === 'minThreshold' ? 'Minimum threshold' : 'Maximum threshold', String(current[key]), 'number');
      control.min = '0'; control.max = key === 'cooldownMs' ? '86400000' : '1'; control.step = key === 'cooldownMs' ? '1' : '0.05'; return [key, control];
    })) };
  });
  const multiplier = input(sensitivity, 'Consequential-risk multiplier', String(profile.sensitivity.consequentialRiskMultiplier), 'number'); multiplier.min = '1'; multiplier.max = '10'; multiplier.step = '0.1';
  const attention = el('fieldset'); attention.append(el('legend', 'Cognitive checkpoint monitoring')); sensitivity.append(attention);
  attention.append(el('p', 'Relevance checks after background tool results or supplied observations. Optional interested review runs ordinary Parts while the activity remains live. Self may continue or select an explicit local pause; replacing/resuming submitted work remains pending. Monitoring cannot relax authorization.'));
  const monitor = input(attention, 'Enable checkpoint monitoring', '', 'checkbox'); monitor.checked = profile.attention.enabled;
  const review = input(attention, 'Review interested checkpoints through Parts and Self', '', 'checkbox'); review.checked = profile.attention.reviewInterested;
  const awaitReview = input(attention, 'Wait for checkpoint review before the next tool call', '', 'checkbox'); awaitReview.checked = profile.attention.awaitCheckpointReview;
  const attentionFields = Object.fromEntries((['relevanceThreshold', 'competenceThreshold', 'coverageThreshold', 'hysteresis', 'cooldownMs'] as const).map(key => {
    const names = { relevanceThreshold: 'Cognitive attention threshold (0–4)', competenceThreshold: 'Competence threshold (0–1)', coverageThreshold: 'Procedure coverage threshold (0–1)', hysteresis: 'Attention hysteresis (0–4)', cooldownMs: 'Advisory review cooldown (ms)' };
    const control = input(attention, names[key], String(profile.attention[key]), 'number'); control.min = '0';
    control.max = key === 'cooldownMs' ? '86400000' : key === 'relevanceThreshold' || key === 'hysteresis' ? '4' : '1'; control.step = key === 'cooldownMs' ? '1' : '0.1';
    return [key, control];
  }));
  const checkpoints = (['tool_result', 'environment'] as const).map(kind => {
    const control = input(attention, kind === 'tool_result' ? 'Monitor background tool results' : 'Monitor supplied environmental observations', '', 'checkbox');
    control.checked = profile.attention.checkpoints.includes(kind); return { kind, control };
  });
  const learning = panel(page, 'Skills & Learning');
  const learningMode = choice(learning, 'Learning mode', ['disabled', 'supervised', 'validated_automatic'], profile.learningMode);
  const reviewPolicy = choice(learning, 'Skill approval authority', ['researcher_only', 'self_selected'], profile.skillReviewPolicy);
  learning.append(el('p', 'Researcher-only review is the default. Self-selected review lets Parts propose approval or rejection of supplied candidates; approval requires recorded evidence and current permissions. Review does not run a skill or establish maturity.'));
  const consolidationMode = choice(learning, 'Skill consolidation mode', ['manual', 'after_verified_execution', 'after_repeated_success'], profile.consolidation.mode);
  const requiredSuccesses = input(learning, 'Verified successes before repeated consolidation', String(profile.consolidation.requiredSuccesses), 'number');
  requiredSuccesses.min = '2'; requiredSuccesses.max = '50';
  learning.append(el('p', 'Automatic consolidation proposes candidates after ended verified execution. It does not approve skills or establish that a correction caused success. Repeated evidence counts identical whole procedures.'));
  learning.append(el('p', 'Parts may propose teaching an exact method or using a current active method; Self selects the proposal. Recorded tool evidence validates exact inputs. Supervised proposals await approval. Offline consolidation can propose conditional branches from ended selected experience. Each branch retains an exact method; applicability and transfer remain unproven.'));
  const skillList = el('div'); learning.append(skillList);
  const refreshSkills = async () => {
    const [skills, executions] = await Promise.all([api<ExecutiveSkill[]>(`${path}/executive-skills`), api<Execution[]>(`${path}/executions`)]);
    const fragment = el('div');
    const candidates = executions.filter(item => item.action.kind === 'operate' && item.contractId);
    if (candidates.length) {
      const proposal = el('fieldset'); proposal.append(el('legend', 'Propose exact procedure'));
      const name = input(proposal, 'Procedure name', '');
      const conditionLabel = el('label', 'Applicable conditions (one per line)'); const conditions = el('textarea'); conditionLabel.append(conditions); proposal.append(conditionLabel);
      const scope = choice(proposal, 'Procedure scope', ['agent', 'thread'], 'agent');
      const source = choice(proposal, 'Source execution', candidates.map(item => item.id), candidates[0]!.id);
      for (const option of source.options) { const execution = candidates.find(item => item.id === option.value)!; option.textContent = `${execution.action.text} (${execution.status})`; }
      action(proposal, 'Propose skill', async () => {
        const execution = candidates.find(item => item.id === source.value)!;
        await api(`${path}/executive-skills`, 'POST', { name: name.value, conditions: conditions.value.split('\n').map(line => line.trim()).filter(Boolean),
          scope: scope.value, sourceContractId: execution.contractId }); await refreshSkills();
      }, fail); fragment.append(proposal);
    } else fragment.append(el('p', 'Execute a selected operational strategy before proposing a retained procedure.'));
    for (const skill of skills) {
      const row = el('article'); row.append(el('h4', skill.name), el('p', `Version ${skill.version}; ${skill.status}; scope: ${skill.scope}`),
        el('p', `Conditions: ${skill.conditions.join('; ')}`)); fragment.append(row);
      action(row, 'Inspect skill', async () => {
        const load = (skillId: string) => api<ExecutiveSkillInspection>(`${path}/executive-skills/${encodeURIComponent(skillId)}/inspect`);
        showSkillInspector(await load(skill.id), load, { ...ui,
          package: digest => api<{ name: string; files: Record<string, string> }>(`${path}/executive-skill-packages/${encodeURIComponent(digest)}`) }, fail);
      }, fail);
      const transfer = el('details'); transfer.append(el('summary', 'Copy package to another Agent')); row.append(transfer);
      const targetLabel = el('label', `Target Agent for ${skill.name}`); const target = el('select'); targetLabel.append(target); transfer.append(targetLabel);
      for (const source of sourceChoice.options) { const option = el('option', source.textContent ?? ''); option.value = source.value; target.append(option); }
      const versionToCopy = input(transfer, `Version to copy for ${skill.name}`, String(skill.version), 'number'); versionToCopy.min = '1'; versionToCopy.max = String(skill.version);
      const transferReason = input(transfer, `Copy reason for ${skill.name}`, '');
      const transferResult = el('p'); transfer.append(transferResult);
      transfer.append(el('p', 'Creates portable knowledge for review. Source approval, maturity and tool permissions do not carry across.'));
      action(transfer, 'Copy skill package', async () => {
        if (!target.value) throw new Error('Choose the receiving Agent');
        const copied = await api<{ id: string }>(`agents/${encodeURIComponent(target.value)}/executive-skill-imports/copy`, 'POST', {
          sourceAgentId: agentId, skillId: skill.id, version: Number(versionToCopy.value), reason: transferReason.value,
        });
        transferResult.textContent = `Copied as review proposal ${copied.id}. Open the receiving Agent's Imports tab to inspect and review it.`;
      }, fail);
      if (skill.conditional) {
        row.append(el('p', `Conditional procedure: ${skill.conditional.branches.length} recorded branches. ${skill.conditional.reason}`));
        action(row, 'Refresh approved branch versions', async () => {
          await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/refresh-branches`, 'POST', { expectedVersion: skill.version }); await refreshSkills();
        }, fail);
      }
      for (const validation of skill.validations) row.append(el('p', `Validation: ${validation.result}. ${validation.limitations.join(' ')}`));
      if (skill.status === 'proposed') {
        const evidence = choice(row, `Validation execution for ${skill.name}`, candidates.map(item => item.id), candidates[0]?.id ?? '');
        for (const option of evidence.options) { const execution = candidates.find(item => item.id === option.value)!; option.textContent = `${execution.action.text} (${execution.status})`; }
        const validate = action(row, 'Validate skill', async () => {
          await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/validate`, 'POST', { expectedVersion: skill.version, executionId: evidence.value }); await refreshSkills();
        }, fail); validate.disabled = !candidates.length;
        const approve = action(row, 'Approve skill', async () => {
          await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/approve`, 'POST', { expectedVersion: skill.version, reason: skill.conditional ? 'Researcher approval of validated current conditional method references; applicability remains unproven' : 'Researcher approval of the validated exact procedure' }); await refreshSkills();
        }, fail); approve.disabled = !skill.validations.some(item => item.result === 'passed');
        action(row, 'Reject skill', async () => {
          await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/reject`, 'POST', { expectedVersion: skill.version, reason: 'Researcher rejected procedural proposal' }); await refreshSkills();
        }, fail);
      }
      if (skill.status !== 'archived') action(row, 'Archive skill', async () => {
        await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/archive`, 'POST', { expectedVersion: skill.version, reason: 'Researcher archived retained procedure' }); await refreshSkills();
      }, fail);
      const history = el('details'); history.append(el('summary', 'Skill version history')); row.append(history);
      const historyList = el('div'); history.append(historyList);
      action(history, 'Load skill history', async () => {
        const versions = await api<ExecutiveSkill[]>(`${path}/executive-skills/${encodeURIComponent(skill.id)}/history`);
        const list = el('div'); historyList.replaceChildren(list);
        for (const version of versions) {
          const entry = el('div'); entry.append(el('p', `Version ${version.version}: ${version.change.kind}. ${version.change.reason}`)); list.append(entry);
          action(entry, `Restore skill version ${version.version}`, async () => {
            await api(`${path}/executive-skills/${encodeURIComponent(skill.id)}/rollback`, 'POST', { expectedVersion: skill.version,
              restoredVersion: version.version, reason: 'Researcher restored preserved procedure version' }); await refreshSkills();
          }, fail);
        }
      }, fail);
    }
    if (page.isConnected) skillList.replaceChildren(fragment);
  };
  const consolidationReport = el('div'); learning.append(consolidationReport);
  action(learning, 'Consolidate procedural experience', async () => {
    consolidationReport.textContent = 'Consolidating ended selected experience…';
    const report = await api<import('../../../packages/sdk/src/procedure-consolidation.js').ProcedureConsolidationRun>(`${path}/executive-consolidation`, 'POST', {});
    consolidationReport.replaceChildren(el('p', `Consolidation ${report.status}: ${report.error ?? report.output?.reason ?? 'No independently verified episode or learning is disabled.'}`), el('p', report.limitation));
    await refreshSkills();
  }, fail);
  action(learning, 'Inspect consolidation history', async () => {
    const records = await api<import('../../../packages/sdk/src/procedure-consolidation.js').ProcedureConsolidationRun[]>(`${path}/executive-consolidation`);
    consolidationReport.replaceChildren();
    for (const record of records) {
      const entry = el('details'); entry.append(el('summary', `${record.status} · ${record.provider} · ${new Date(record.createdAt).toLocaleString()}`),
        el('p', record.output?.reason ?? record.error ?? 'No proposal'), el('p', record.limitation));
      entry.append(el('p', record.trigger ? `Automatic candidate policy: ${record.trigger.mode}; trigger execution ${record.trigger.executionId}.`
        : record.triggerFailure ? `Automatic trigger failed before inference: execution ${record.triggerFailure.executionId}.` : 'Manually requested consolidation.'));
      if (record.status === 'running') action(entry, 'Close incomplete inference report', async () => {
        await api(`${path}/executive-consolidation/${encodeURIComponent(record.id)}/abandon`, 'POST', { reason: 'Researcher closed an incomplete report; discard any late output without replay' });
        entry.replaceChildren(el('p', 'Incomplete report closed. Its original input remains preserved; late output cannot create candidates.'));
      }, fail);
      const evidence = el('details'); evidence.append(el('summary', 'Preserved source evidence and proposed conditions'), el('pre', JSON.stringify(record, null, 2))); entry.append(evidence); consolidationReport.append(entry);
    }
  }, fail);
  action(learning, 'Refresh skills', refreshSkills, fail); await refreshSkills();
  const importsPanel = panel(page, 'Imports');
  importsPanel.append(copy);
  const imports = el('fieldset'); imports.append(el('legend', 'Imported skill proposals')); importsPanel.append(imports);
  imports.append(el('p', 'Inspect imported instructions, declared source and revision history here. These proposals await review before they can become executable skills.'));
  const folderLabel = el('label', 'Skill package folder'); const folder = el('input'); folder.type = 'file';
  folder.multiple = true; folder.setAttribute('webkitdirectory', ''); folderLabel.append(folder); imports.append(folderLabel);
  imports.append(el('p', 'Choose a folder containing SKILL.md and text resources.'));
  const importSource = input(imports, 'Package source', 'Local skill package');
  const importReason = input(imports, 'Reason for importing', '');
  const previousLabel = el('label', 'Earlier proposal'); const previousProposal = el('select'); previousLabel.append(previousProposal); imports.append(previousLabel);
  const importList = el('div'); imports.append(importList);
  const refreshImports = async () => {
    const expanded = new Set([...importList.querySelectorAll<HTMLDetailsElement>('details[id]')].filter(entry => entry.open).map(entry => entry.id));
    const records = await api<Awaited<ReturnType<AgentSkillImports['list']>>>(`${path}/executive-skill-imports`);
    const previous = previousProposal.value; const none = el('option', 'New proposal'); none.value = '';
    previousProposal.replaceChildren(none);
    for (const record of records) { const option = el('option', `${record.name}: ${record.reason}`); option.value = record.id; previousProposal.append(option); }
    previousProposal.value = previous;
    const fragment = el('div');
    if (!records.length) fragment.append(el('p', 'No imported proposals.'));
    for (const record of records) {
      const entry = el('details'); entry.id = `skill-import-${record.id}`;
      entry.open = expanded.has(entry.id);
      entry.append(el('summary', `${record.name} · Proposed`), el('p', record.package.frontmatter.description),
        el('p', `Source: ${record.source}`), el('p', `Reason: ${record.reason}`));
      const latestReview = record.reviews.at(-1);
      entry.append(el('p', `Knowledge review: ${latestReview?.decision ?? 'Awaiting review'}`));
      if (ui.considerSkill) {
        const task = input(entry, 'Message with this skill', '');
        const consider = action(entry, 'Ask Agent to consider this skill', async () => {
          if (!task.value.trim()) throw new Error('Enter a message for the Agent');
          await ui.considerSkill!(record.id, task.value.trim());
        }, fail);
        consider.disabled = latestReview?.decision !== 'reviewed';
      }
      const reviewReason = input(entry, 'Review reason', '');
      for (const decision of ['reviewed', 'rejected'] as const) action(entry, decision === 'reviewed' ? 'Mark knowledge reviewed' : 'Reject imported knowledge', async () => {
        await api(`${path}/executive-skill-imports/${record.id}/review`, 'POST', {
          expectedRevision: latestReview?.revision ?? 0, decision, reason: reviewReason.value }); await refreshImports();
      }, fail);
      if (record.reviews.length) {
        const history = el('details'); history.append(el('summary', 'Knowledge review history'));
        for (const review of record.reviews) history.append(el('p', `Review ${review.revision}: ${review.decision}. ${review.reason} (${review.at})`));
        entry.append(history);
      }
      if (record.previousId) {
        const previous = el('a', 'Inspect previous proposal'); previous.href = `#skill-import-${record.previousId}`;
        previous.onclick = () => {
          const target = fragment.querySelector<HTMLDetailsElement>(`#skill-import-${record.previousId}`);
          if (target) target.open = true;
        };
        entry.append(previous);
      }
      entry.append(el('h4', 'Instructions'), el('pre', record.package.instructions));
      for (const [name, contents] of Object.entries(record.package.files)) {
        const resource = el('details'); resource.append(el('summary', name), el('pre', contents)); entry.append(resource);
      }
      fragment.append(entry);
    }
    importList.replaceChildren(fragment);
  };
  action(imports, 'Import skill proposal', async () => {
    const selected = [...(folder.files ?? [])]; if (!selected.length) throw new Error('Choose a skill package folder');
    const name = selected[0]!.webkitRelativePath.split('/')[0]!;
    const files: Record<string, string> = Object.create(null);
    for (const file of selected) {
      const [directory, ...parts] = file.webkitRelativePath.split('/');
      if (directory !== name || !parts.length) throw new Error('Choose one complete skill package folder');
      files[parts.join('/')] = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    }
    await api(`${path}/executive-skill-imports`, 'POST', { name, files, source: importSource.value, reason: importReason.value,
      ...(previousProposal.value ? { previousId: previousProposal.value } : {}) });
    await refreshImports();
  }, fail);
  action(imports, 'Refresh imported proposals', refreshImports, fail); await refreshImports();
  const saved = el('p', `Profile revision ${profile.revision}`); toolbar.append(saved);
  action(toolbar, 'Save Executive profile', async () => {
    const sensitivity = structuredClone(profile.sensitivity);
    for (const { signal, controls } of settings) for (const key of ['threshold', 'minThreshold', 'maxThreshold', 'cooldownMs'] as const) sensitivity[signal][key] = Number(controls[key]!.value);
    sensitivity.consequentialRiskMultiplier = Number(multiplier.value);
    const { revision, ...current } = profile;
    profile = await api<ExecutiveProfile>(`${path}/executive-profile`, 'PUT', { ...current, expectedRevision: revision,
      enabled: enabled.checked, modules: { speaking: speaking.checked, tools: toolsModule.checked }, executionMode: mode.value, allowEquivalentMethods: equivalent.checked, learningMode: learningMode.value, skillReviewPolicy: reviewPolicy.value,
      consolidation: { mode: consolidationMode.value, requiredSuccesses: Number(requiredSuccesses.value) },
      limits: Object.fromEntries(Object.entries(limits).map(([key, control]) => [key, Number(control.value)])), sensitivity,
      attention: { enabled: monitor.checked, reviewInterested: review.checked, awaitCheckpointReview: awaitReview.checked, ...Object.fromEntries(Object.entries(attentionFields).map(([key, control]) => [key, Number(control.value)])),
        checkpoints: checkpoints.filter(item => item.control.checked).map(item => item.kind) } });
    saved.textContent = `Saved profile revision ${profile.revision}`;
  }, fail);

  const connections = panel(page, 'MCP Connections');
  page.insertBefore(connections, recovery);
  connections.append(el('p', 'Connections are shared in this database. Tool grants are specific to this Agent. Use secret references, never credential values.'));
  const catalog = new Map<string, z.infer<typeof CapabilityToolSchema>>();
  const pendingGrants = new Set(grants.tools.map(tool => JSON.stringify([tool.serverId, tool.toolName])));
  const serverList = el('div'); const tools = el('div'); connections.append(serverList, tools);
  const redrawTools = () => {
    tools.replaceChildren(el('h4', 'Agent tool grants'));
    const choices = new Map(grants.tools.map(tool => [JSON.stringify([tool.serverId, tool.toolName]), tool]));
    for (const [key, tool] of catalog) choices.set(key, tool);
    for (const [key, tool] of choices) {
      const checkbox = input(tools, `${tool.serverId} / ${tool.toolName}`, '', 'checkbox'); checkbox.dataset.toolKey = key;
      checkbox.checked = pendingGrants.has(key);
      checkbox.onchange = () => { if (checkbox.checked) pendingGrants.add(key); else pendingGrants.delete(key); };
    }
    if (!choices.size) tools.append(el('p', 'Discover a server to choose tools.'));
  };
  const redrawServers = () => {
    serverList.replaceChildren();
    const assigned = new Set([...(grants.serverIds ?? []), ...grants.tools.map(tool => tool.serverId)]);
    const servers = registry.servers.filter(server => assigned.has(server.id));
    if (!servers.length) serverList.append(el('p', 'None. Try importing them.'));
    for (const server of servers) {
      const row = el('div'); row.append(el('h4', `${server.id} (${server.transport})`),
        el('p', `Connection status: ${registry.health?.[server.id] ?? 'disconnected'}`)); serverList.append(row);
      action(row, 'Discover tools', async () => {
        try {
          const discovered = await api<z.infer<typeof CapabilityToolSchema>[]>(`mcp-servers/${encodeURIComponent(server.id)}/discover`, 'POST', {});
          for (const tool of discovered) catalog.set(JSON.stringify([tool.serverId, tool.toolName]), tool);
          redrawTools();
        } finally { registry = await api<RegistryStatus>('mcp-servers'); redrawServers(); }
      }, fail);
      action(row, 'Disconnect', async () => {
        await api(`mcp-servers/${encodeURIComponent(server.id)}/disconnect`, 'POST', {});
        registry = await api<RegistryStatus>('mcp-servers'); redrawServers();
      }, fail);
      action(row, 'Remove from Agent', async () => {
        await api(`${path}/mcp-permissions`, 'PUT', { expectedRevision: grants.revision, serverIds: [...assigned].filter(id => id !== server.id), tools: grants.tools.filter(tool => tool.serverId !== server.id) });
        registry = await api<RegistryStatus>('mcp-servers'); grants = await api<McpPermissions>(`${path}/mcp-permissions`);
        for (const [key, tool] of catalog) if (tool.serverId === server.id) catalog.delete(key);
        for (const key of pendingGrants) if ((JSON.parse(key) as string[])[0] === server.id) pendingGrants.delete(key);
        redrawServers(); redrawTools();
      }, fail);
    }
  };
  redrawServers(); redrawTools();
  action(connections, 'Refresh connection status', async () => { registry = await api<RegistryStatus>('mcp-servers'); grants = await api<McpPermissions>(`${path}/mcp-permissions`); redrawServers(); redrawTools(); }, fail);
  action(connections, 'Save tool grants', async () => {
    const selected = [...tools.querySelectorAll<HTMLInputElement>('input[data-tool-key]')].filter(control => control.checked).map(control => {
      const [serverId, toolName] = JSON.parse(control.dataset.toolKey!) as [string, string]; return { serverId, toolName };
    });
    grants = await api<McpPermissions>(`${path}/mcp-permissions`, 'PUT', { expectedRevision: grants.revision, tools: selected }); redrawTools();
  }, fail);
  action(connections, 'Add MCP', async () => {
    showMcpRegistration(ui.dialog(), api, path, registry, grants, result => {
      registry = result.registry; grants = result.permissions; redrawServers(); redrawTools();
    });
  }, fail);

  const diagnostics = panel(page, 'Feedback & Diagnostics');
  const sections = [runtime, connections, recovery, sensitivity, learning, importsPanel, diagnostics];
  const tabs = el('div'); tabs.className = 'executive-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Executive sections');
  const buttons = sections.map((section, index) => {
    const tab = el('button', section.querySelector('h3')!.textContent!); tab.type = 'button'; tab.setAttribute('role', 'tab');
    tab.id = `executive-${agentId}-${index}-tab`; section.id = `executive-${agentId}-${index}-panel`;
    tab.setAttribute('aria-controls', section.id); section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', tab.id);
    tabs.append(tab); return tab;
  });
  const selectTab = (index: number, focus = false) => {
    sections.forEach((section, current) => {
      section.hidden = current !== index; buttons[current]!.setAttribute('aria-selected', String(current === index)); buttons[current]!.tabIndex = current === index ? 0 : -1;
    });
    if (focus) buttons[index]!.focus();
  };
  buttons.forEach((button, index) => {
    button.onclick = () => selectTab(index);
    button.onkeydown = event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
      if (next !== null) { event.preventDefault(); selectTab(next, true); }
    };
  });
  page.prepend(tabs); selectTab(0);
  const records = el('div'); diagnostics.append(records);
  const historyCount = el('p'); diagnostics.append(historyCount);
  let visibleExecutions = 20;
  let refreshing = false;
  const refresh = async () => {
    if (refreshing || !page.isConnected) return; refreshing = true;
    try {
      const [executions, attention] = await Promise.all([api<Execution[]>(`${path}/executions`),
        api<(ExecutiveAttentionRecord & { cycleId: string })[]>(`${path}/executive-attention`)]);
      const operationalExecutions = executions.filter(item => item.action.kind === 'operate');
      const fragments = await Promise.all(operationalExecutions.slice(-visibleExecutions).reverse().map(async execution => {
        const row = el('article'); row.append(el('h4', execution.action.text), el('p', `Status: ${execution.status}`));
        if (execution.action.kind === 'operate') row.append(el('p', `Success criterion: ${execution.action.operation.successCriteria}`));
        const audit = await api<{ events: CognitiveEvent[] }>(`cycles/${encodeURIComponent(execution.cycleId)}`);
        const contractEvent = audit.events.find(event => event.type === 'execution.contract' && event.payload.id === execution.contractId);
        const contract = contractEvent?.type === 'execution.contract' ? contractEvent.payload : undefined;
        const selectedAction = contract?.commands[0]?.action;
        const method = selectedAction?.kind === 'operate' ? contract?.selectedSkill?.procedure ?? selectedAction.operation : undefined;
        const traces = audit.events.filter(event => event.type === 'execution.tool_trace' && event.payload.contractId === execution.contractId);
        const submitted = traces.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'submitted');
        const finished = new Set(traces.filter(event => event.type === 'execution.tool_trace' && event.payload.phase === 'finished').map(event => event.type === 'execution.tool_trace' ? event.payload.traceId : ''));
        const active = submitted.filter(event => event.type === 'execution.tool_trace' && !finished.has(event.payload.traceId));
        row.append(el('p', `Submitted calls: ${submitted.length}. Current tools: ${active.map(event => event.type === 'execution.tool_trace' ? `${event.payload.serverId}/${event.payload.toolName}` : '').join(', ') || 'none'}.`));
        row.append(el('p', execution.operational?.reason ?? 'No operational report yet.'));
        action(row, 'Inspect execution and cognition', async () => { ui.cycle(execution.cycleId); }, fail);
        if (contract?.selectedSkill) row.append(el('p', `Selected skill version: ${contract.selectedSkill.version}${contract.selectedSkill.branchId ? `; branch: ${contract.selectedSkill.branchId}` : ''}.`));
        if (method && (method.steps.length || method.verification)) {
          const procedure = el('details'); procedure.dataset.evidenceKey = `${execution.id}:procedure`; procedure.append(el('summary', 'Selected tool procedure'));
          for (const constraint of [...new Set([...method.constraints, ...(selectedAction?.kind === 'operate' ? selectedAction.operation.constraints : [])])])
            procedure.append(el('p', `Constraint: ${constraint}`));
          const sequence = el('ol');
          for (const step of method.steps) sequence.append(el('li', `${step.serverId} / ${step.toolName}: ${step.argumentsJson}`));
          if (method.verification) {
            const check = method.verification;
            sequence.append(el('li', `Independent verification: ${check.serverId} / ${check.toolName}: ${check.argumentsJson}. Expected ${check.path.join('.') || 'whole result'}: ${check.expectedJson}`));
          }
          procedure.append(sequence); row.append(procedure);
        }
        const parentId = contract?.remainder?.parentExecutionId ?? contract?.continuation?.parentExecutionId;
        const parent = parentId ? executions.find(item => item.id === parentId) : undefined;
        if (parent) action(row, 'Inspect preceding execution', async () => { ui.cycle(parent.cycleId); }, fail);
        const successor = execution.continuedByContractId ? executions.find(item => item.contractId === execution.continuedByContractId) : undefined;
        if (successor) action(row, 'Inspect continuation', async () => { ui.cycle(successor.cycleId); }, fail);
        if (submitted.length) {
          const calls = el('details'); calls.dataset.evidenceKey = `${execution.id}:tools`; calls.append(el('summary', 'Tool calls and results'));
          const table = el('table'); const header = el('tr');
          for (const label of ['Step', 'Role', 'Tool', 'Status', 'Evidence']) header.append(el('th', label));
          const head = el('thead'); head.append(header); table.append(head);
          const body = el('tbody');
          submitted.forEach((event, index) => {
            if (event.type !== 'execution.tool_trace') return;
            const call = event.payload;
            const result = traces.find(item => item.type === 'execution.tool_trace' && item.payload.phase === 'finished' && item.payload.traceId === call.traceId);
            const outcome = result?.type === 'execution.tool_trace' ? result.payload : undefined;
            const updates = traces.flatMap(item => item.type === 'execution.tool_trace' && item.payload.phase === 'progress' && item.payload.traceId === call.traceId && item.payload.progress ? [item.payload.progress] : []);
            const latestProgress = updates.at(-1);
            const role = method?.verification && index === method.steps.length ? 'Independent verification' : 'Procedure step';
            const entry = el('tr'); entry.append(el('td', String(index + 1)), el('td', role), el('td', `${call.serverId} / ${call.toolName}`),
              el('td', typeof outcome?.outcome?.status === 'string' ? outcome.outcome.status : outcome ? 'unverified' : 'Awaiting result'));
            const evidence = el('td'); const details = el('details'); details.dataset.evidenceKey = `${execution.id}:call:${call.traceId}`; details.append(el('summary', 'Arguments and recorded response'),
              el('pre', JSON.stringify({ submitted: call, response: outcome ?? null }, null, 2)));
            if (latestProgress) evidence.append(el('p', `Server-reported progress: ${latestProgress.progress}${latestProgress.total !== undefined ? ` / ${latestProgress.total}` : ''}. ${latestProgress.message ?? ''}`));
            evidence.append(details); entry.append(evidence); body.append(entry);
          });
          table.append(body); calls.append(table); row.append(calls);
        }
        const checkpoints = attention.filter(item => item.executionId === execution.id);
        if (checkpoints.length) row.append(el('h5', `Cognition checkpoints (${checkpoints.length})`));
        for (const checkpoint of checkpoints) {
          const evidence = el('details'); evidence.dataset.evidenceKey = `${execution.id}:checkpoint:${checkpoint.cycleId}`;
          evidence.append(el('summary', `Cognitive attention: ${checkpoint.state}`), el('p', new Date(checkpoint.at).toLocaleString()),
            el('p', `Disposition relevance: ${checkpoint.relevance} / 4. Competence: ${checkpoint.competence.confidence ?? 'unassessed'}. Coverage: ${checkpoint.competence.coverage ?? 'unassessed'}.`),
            el('p', checkpoint.competence.evidence));
          for (const reason of checkpoint.reasons) evidence.append(el('p', reason));
          action(evidence, 'Inspect attention checkpoint', async () => { ui.cycle(checkpoint.cycleId); }, fail); row.append(evidence);
        }
        if (execution.guidance) row.append(el('p', `Guidance requested: ${execution.guidance.requestedInstruction}`),
          el('p', `Operational uncertainty: ${execution.guidance.uncertainty}`));
        if (execution.continuedByContractId) row.append(el('p', `Continued under supplemental contract: ${execution.continuedByContractId}`));
        if (execution.action.kind === 'operate' && execution.action.operation.guidanceResponse)
          row.append(el('p', `Responds to guidance request: ${execution.action.operation.guidanceResponse.requestId}`));
        const uncertainty = execution.operational?.diagnostics?.observations.filter(item => item.signal === 'uncertainty');
        row.append(el('p', uncertainty?.length ? `Uncertainty: ${uncertainty.map(item => item.evidence).join('; ')}` : 'Uncertainty: no recorded observation.'));
        if (execution.status === 'running') action(row, 'Consult cognition', async () => {
          const dialog = ui.dialog(); dialog.setAttribute('aria-label', 'Consult cognition');
          dialog.append(el('h3', 'Consult cognition'), el('p', execution.action.text),
            el('p', 'Request ordinary cognitive review of this running activity. Execution continues while the request is assessed.'));
          const reason = input(dialog, 'Reason for consulting cognition', '');
          const label = el('label', 'Current observation'); const observation = el('textarea'); label.append(observation); dialog.append(label);
          const result = el('p'); dialog.append(result);
          action(dialog, 'Request cognitive review', async () => {
            if (!reason.value.trim() || !observation.value.trim()) throw new Error('Supply a reason and current observation');
            result.textContent = 'Awaiting cognition…';
            const reviewed = await api<{ cycle: { id: string }; consultation: 'reviewed' | 'activity_ended' }>(
              `${path}/executions/${encodeURIComponent(execution.id)}/consult`, 'POST', {
                reason: reason.value.trim(), facts: [{ source: 'Researcher execution observation', kind: 'observes',
                  text: observation.value.trim(), timestamp: null, referenceId: null }],
              });
            result.textContent = reviewed.consultation === 'reviewed' ? 'Cognitive review recorded.' : 'Activity ended before cognitive review.';
            action(dialog, 'Inspect consultation', async () => { dialog.close(); ui.cycle(reviewed.cycle.id); }, fail);
          }, error => { result.textContent = error instanceof Error ? error.message : String(error); });
          action(dialog, 'Close consultation', async () => { dialog.close(); }, fail);
          document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
        }, fail);
        if (execution.status === 'running') action(row, 'Cancel execution', async () => {
          await api(`${path}/executions/${encodeURIComponent(execution.id)}/cancel`, 'POST', {}); await refresh();
        }, fail);
        return row;
      }));
      if (page.isConnected) {
        historyCount.textContent = `Showing ${fragments.length} of ${operationalExecutions.length} operational executions, newest first.`;
        olderExecutions.hidden = fragments.length >= operationalExecutions.length;
        const expanded = new Set([...records.querySelectorAll<HTMLDetailsElement>('details[data-evidence-key][open]')].map(details => details.dataset.evidenceKey));
        for (const fragment of fragments) for (const details of fragment.querySelectorAll<HTMLDetailsElement>('details[data-evidence-key]'))
          details.open = expanded.has(details.dataset.evidenceKey);
        records.replaceChildren(...(fragments.length ? fragments : [el('p', 'No operational executions recorded.')]));
      }
    } finally { refreshing = false; }
  };
  action(diagnostics, 'Refresh executions', refresh, fail);
  const olderExecutions = action(diagnostics, 'Show older executions', async () => { visibleExecutions += 20; await refresh(); }, fail);
  await refresh();
  const timer = setInterval(() => { if (!page.isConnected) clearInterval(timer); else void refresh().catch(fail); }, 3000);
}
