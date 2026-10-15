import type { SimulationRun } from '../../../packages/sdk/src/simulation-tests.js';
import type { SimulationAnalysis } from '../../../packages/sdk/src/simulation-analysis.js';
import type { SimulationComparison } from '../../../packages/sdk/src/simulation-comparison.js';
import type { SimulationReview, SimulationFinding, SimulationCandidate } from '../../../packages/sdk/src/simulation-research.js';

type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Cycle = (cycleId: string, agentId: string) => void;
type Fail = (error: unknown) => void;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
};
function button(parent: HTMLElement, title: string, action: () => void | Promise<void>, fail: Fail) {
  const b = node('button', title); b.type = 'button'; b.onclick = () => { void Promise.resolve().then(action).catch(fail); }; parent.append(b); return b;
}
function disclosure(parent: HTMLElement, title: string, value?: unknown) {
  const holder = node('div', '', 'observatory-evidence-link');
  const content = node('div'); content.hidden = true;
  if (value !== undefined) content.append(node('pre', JSON.stringify(value, null, 2)));
  const trigger = node('button', title); trigger.type = 'button'; holder.append(trigger, content); parent.append(holder);
  trigger.onclick = () => {
    const dialog = node('dialog', '', 'rd-dialog'); dialog.setAttribute('aria-label', title);
    dialog.append(node('h2', title)); content.hidden = false; dialog.append(content);
    const close = node('button', 'Close'); close.onclick = () => dialog.close(); dialog.append(close);
    dialog.addEventListener('close', () => { content.hidden = true; holder.append(content); dialog.remove(); }, { once: true });
    document.body.append(dialog); dialog.showModal();
  };
  // Compatibility for historical explorer callers; evidence now opens only in dialogs.
  return Object.assign(content, { open: false });
}

function card(parent: HTMLElement, title: string, subtitle = '') {
  const c = node('article', '', 'observatory-card'); c.append(node('h3', title)); if (subtitle) c.append(node('p', subtitle, 'muted')); parent.append(c); return c;
}
function field(parent: HTMLElement, title: string, textarea = false) {
  const label = node('label', title); const input = textarea ? node('textarea') : node('input'); label.append(input); parent.append(label); return input;
}
function select(parent: HTMLElement, title: string, values: [string, string][]) {
  const label = node('label', title); const control = node('select'); control.setAttribute('aria-label', title);
  for (const [value, text] of values) control.append(new Option(text, value)); label.append(control); parent.append(label); return control;
}
function table(parent: HTMLElement, headings: string[], rows: (string | HTMLElement)[][], title: string) {
  const scroll = node('div', '', 'observatory-scroll'); const t = node('table'); t.setAttribute('aria-label', title);
  const head = node('thead'); const tr = node('tr'); for (const h of headings) tr.append(node('th', h)); head.append(tr); t.append(head);
  const body = node('tbody'); for (const row of rows) { const r = node('tr'); row.forEach((value, index) => { const cell = node(index === 0 ? 'th' : 'td'); cell.append(value); r.append(cell); }); body.append(r); }
  t.append(body); scroll.append(t); parent.append(scroll); return t;
}
const readable = (text: string) => text.replaceAll('_', ' ').replaceAll('.', ' · ');
const latest = <T extends { version: number }>(items: T[]) => items.slice().sort((a, b) => a.version - b.version).at(-1);

/** One shared stage/Part selection coordinates heatmap, ledger, memory history and event detail. */
export async function renderRunExplorer(root: HTMLElement, run: SimulationRun, api: Api, cycle: Cycle, fail: Fail, developmentOnly = false) {
  const host = node('section', '', 'simulation-run-explorer'); root.append(host); host.append(node('p', 'Loading recorded run evidence…'));
  const analysis = await api<SimulationAnalysis>(`simulation-tests/${encodeURIComponent(run.id)}/analysis`);
  if (!host.isConnected) return;
  host.replaceChildren();
  const overview = card(host, 'Run overview', `${analysis.summary.completedStages}/${analysis.summary.totalStages} stages · ${analysis.summary.controls} controls · ${analysis.summary.changedObjects} object additions/revisions`);
  overview.append(node('p', analysis.summary.hypothesis), node('p', `${readable(run.evidenceBasis)} · ${run.providers.reasoning} · ${run.providers.decisions}`, 'muted'));
  if (run.lineage) overview.append(node('p', `${readable(run.lineage.kind)} of ${run.lineage.parentRunId}: ${run.lineage.reason}`));
  const replay = disclosure(overview, 'Repeat or fork saved starting conditions');
  disclosure(replay, 'Frozen scenario, configuration and prompts', { specification: run.specification, configuration: run.startingConfiguration,
    providers: run.providers, routing: run.providerRouting, prompts: run.prompts, lineage: run.lineage });
  replay.append(node('p', 'Launches a fresh isolated Agent. Developed psychology is not copied. Models and external tools can vary; automatic assessment is disabled.'));
  const reason = field(replay, 'Launch reason'); reason.setAttribute('aria-label', 'Launch reason');
  const status = node('p'); status.setAttribute('role', 'status'); replay.append(status);
  const launch = async (fork: boolean, changes?: Record<string, boolean>) => {
    const created = await api<SimulationRun>(`simulation-tests/${encodeURIComponent(run.id)}/${fork ? 'fork' : 'rerun'}`, 'POST',
      { reason: reason.value, ...(changes ? { activationChanges: changes } : {}) });
    if (host.isConnected) status.textContent = `Started ${created.id} on a new Agent. Follow progress in Experiments and saved run history.`;
  };
  const rerun = button(replay, 'Rerun frozen configuration', () => launch(false), fail);
  const setting = select(replay, 'Fork activation setting', [['vectorSearchEnabled', 'Vector candidate filtering'], ['memorySearchEnabled', 'Memory search'],
    ['primitivesFirst', 'Primitive consideration'], ['reevaluateAfterDeliberation', 'Reevaluate after deliberation']]);
  const value = select(replay, 'Fork setting value', [['true', 'Enabled'], ['false', 'Disabled']]);
  const fork = button(replay, 'Launch configuration fork', () => launch(true, { [setting.value]: value.value === 'true' }), fail);
  rerun.disabled = fork.disabled = ['running', 'paused'].includes(run.status) || !run.startingConfiguration || !run.providerRouting;
  if (rerun.disabled) replay.append(node('p', ['running', 'paused'].includes(run.status) ? 'Wait for this run to end.' : 'Historical starting configuration or provider routing is missing.'));
  if (run.error) overview.append(node('p', `Infrastructure failure: ${run.error}`));
  const worked = run.measures.filter(item => item.assessmentKind !== 'semantic' && item.outcome === 'observed');
  const surprising = run.measures.filter(item => item.assessmentKind !== 'semantic' && item.outcome === 'not_observed');
  const unknown = run.measures.filter(item => item.outcome === 'inconclusive' || item.assessmentKind === 'semantic');
  for (const [title, values] of [['What worked?', worked], ['What deserves inspection?', surprising], ['What remains unknown?', unknown]] as const) {
    const area = disclosure(overview, title);
    area.append(node('p', values.map(item => item.criterion).join(' · ') || 'No qualifying observer criterion recorded.'));
    disclosure(area, 'Supporting observer evidence', values);
  }
  const controls = node('div', '', 'observatory-filters'); host.append(controls);
  const stageSelect = select(controls, 'Analytics stage', run.stages.map((stage, index) => [String(index), `${index + 1}. ${stage.name} · ${stage.phase}`]));
  const partSelect = select(controls, 'Analytics Part', [['', 'All Parts'], ...analysis.parts.map(item => [item.part.id, `${item.part.name} · ${item.originStage >= 0 ? `from stage ${item.originStage + 1}` : 'origin unavailable'}`] as [string, string])]);
  const laneSelect = select(controls, 'Timeline lane', [['', 'All lanes'], ...['Environment', 'Activation', 'Parts', 'Cognition', 'Self', 'Executive', 'Learning'].map(item => [item, item] as [string, string])]);
  const chart = node('div'); const ledger = node('div'); const development = node('div'); const inspector = node('div');
  host.append(chart, ledger, development, inspector);
  let index = 0; let partId = ''; let lane = ''; let eventId: string | null = null;
  const scopes = () => new Set(analysis.parts.find(item => item.part.id === partId)?.part.instance?.dispositionBindings?.map(binding => binding.dispositionId) ?? []);
  function inspect(next: number) { index = next; eventId = null; stageSelect.value = String(index); render(); }
  stageSelect.onchange = () => inspect(Number(stageSelect.value));
  partSelect.onchange = () => { partId = partSelect.value; eventId = null; render(); };
  laneSelect.onchange = () => { lane = laneSelect.value; renderInspector(); };
  button(controls, 'Clear coordinated filters', () => { partId = ''; partSelect.value = ''; lane = ''; laneSelect.value = ''; inspect(0); }, fail);
  function source(parent: HTMLElement, stageIndex: number, title = 'Inspect source stage') { button(parent, title, () => inspect(stageIndex), fail); }
  function renderActivation() {
    chart.replaceChildren();
    const heatmap = card(chart, 'Activation heatmap', '● crossed threshold; — not evaluated. Final recorded round shown; select a cell for all rounds. Activation, admission and decision authority are distinct.');
    const headings: (string | HTMLElement)[] = run.stages.map((stage, stageIndex) => {
      const wrapper = node('span'); const b = button(wrapper, String(stageIndex + 1), () => inspect(stageIndex), fail); b.title = stage.name;
      b.setAttribute('aria-pressed', String(stageIndex === index)); return wrapper;
    });
    const rows = analysis.activation.filter(row => !partId || scopes().has(row.dispositionId)).map(row => [row.name,
      ...row.cells.map(cell => {
        const wrapper = node('span'); const last = cell.rounds.at(-1);
        const b = button(wrapper, last ? `${last.score.toFixed(2)}${last.active ? ' ●' : ''}` : '—', () => {
          inspect(cell.stageIndex); const d = disclosure(inspector, `${row.name} · recorded activation rounds`, cell.rounds); d.open = true;
        }, fail);
        b.setAttribute('aria-label', `${row.name}, ${run.stages[cell.stageIndex]!.name}, ${last ? `${last.active ? 'active' : 'inactive'}, ${last.score}` : 'not evaluated'}`);
        if (last) b.style.backgroundColor = `rgba(70,130,180,${Math.max(.05, Math.min(1, last.score / 4))})`; return wrapper;
      })]);
    const t = table(heatmap, ['Disposition', ...run.stages.map((_, i) => String(i + 1))], rows, 'Activation across stages');
    const ths = t.querySelectorAll('thead th'); headings.forEach((heading, i) => ths[i + 1]!.replaceChildren(heading));
    const co = disclosure(chart, 'Coactivation network · descriptive associations');
    co.append(node('p', 'Edges count stages with final coactivation, once per pair per stage. Coincidence does not establish learned association or causality.'));
    const edges = analysis.coactivation.filter(item => !partId || scopes().has(item.left) || scopes().has(item.right));
    const ids = [...new Set(edges.flatMap(edge => [edge.left, edge.right]))];
    if (ids.length) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 640 440');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Recorded disposition coactivation network'); svg.style.width = '100%';
      const position = (id: string) => { const angle = Math.PI * 2 * ids.indexOf(id) / ids.length; return [320 + Math.cos(angle) * 235, 215 + Math.sin(angle) * 165] as const; };
      for (const edge of edges) {
        const line = document.createElementNS(svg.namespaceURI, 'line'); const [x1, y1] = position(edge.left); const [x2, y2] = position(edge.right);
        for (const [key, value] of Object.entries({ x1, y1, x2, y2 })) line.setAttribute(key, String(value));
        line.setAttribute('stroke', '#839a8f'); line.setAttribute('stroke-width', String(Math.min(8, 1 + edge.stages.length)));
        const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = `${edge.stages.length} coactivated stages`; line.append(title); svg.append(line);
      }
      for (const id of ids) {
        const [x, y] = position(id); const name = analysis.activation.find(row => row.dispositionId === id)?.name ?? 'Historical scope';
        const group = document.createElementNS(svg.namespaceURI, 'g'); group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0'); group.setAttribute('aria-label', `Inspect coactivation for ${name}`);
        const marker = document.createElementNS(svg.namespaceURI, 'circle'); marker.setAttribute('cx', String(x)); marker.setAttribute('cy', String(y)); marker.setAttribute('r', '9'); marker.setAttribute('fill', '#365c47');
        const label = document.createElementNS(svg.namespaceURI, 'text'); label.setAttribute('x', String(x)); label.setAttribute('y', String(y + 23)); label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '11'); label.textContent = name.length > 27 ? name.slice(0, 24) + '…' : name;
        const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = name; group.append(marker, label, title);
        const inspectNode = () => { const d = disclosure(inspector, `${name} · coactivation evidence`, edges.filter(edge => edge.left === id || edge.right === id)); d.open = true; };
        group.addEventListener('click', inspectNode); group.addEventListener('keydown', event => { const key = (event as KeyboardEvent).key; if (key === 'Enter' || key === ' ') { event.preventDefault(); inspectNode(); } });
        svg.append(group);
      }
      co.append(svg);
    }
    for (const edge of edges) {
      const name = (id: string) => analysis.activation.find(row => row.dispositionId === id)?.name ?? 'Historical scope';
      const entry = node('p', `${name(edge.left)} ↔ ${name(edge.right)} · ${edge.stages.length} stage(s)`); co.append(entry);
      for (const stageIndex of edge.stages) source(co, stageIndex, run.stages[stageIndex]!.name);
    }
    const life = disclosure(chart, 'Part lifecycle by cycle');
    table(life, ['Stage', 'Formed', 'Continued', 'Retired', 'Recruited scopes'], analysis.stages.map(stage => [stage.name,
      String(stage.lifecycle.formed.filter(id => !partId || id === partId).length), String(stage.lifecycle.continued.filter(id => !partId || id === partId).length),
      String(stage.lifecycle.retired.filter(item => !partId || item.partId === partId).length), String(stage.lifecycle.recruited.length)]), 'Part lifecycle');
    life.append(node('p', 'Part counts describe temporary working perspectives; they are not intelligence scores.'));
  }
  function renderPredictions() {
    ledger.replaceChildren(); const area = card(ledger, 'Prediction ledger', 'Closure, evidence sufficiency and support remain separate. Conviction is not calibrated probability.');
    const entries = analysis.predictions.filter(item => !partId || item.prediction.partId === partId);
    if (!entries.length) area.append(node('p', 'No predictions recorded for this view.'));
    for (const entry of entries) {
      const d = disclosure(area, `${entry.prediction.expectation} · ${entry.administrativeStatus} · ${entry.expectationAssessment}`);
      d.append(node('p', `${entry.ownerName} · conviction ${(entry.prediction.confidence * 100).toFixed(1)}% · horizon: ${entry.prediction.horizon}`),
        node('p', `Evidence: ${entry.evidenceSufficiency} · resolution delay: ${entry.resolutionDelayStages ?? 'Unavailable'} stages`),
        node('p', `Selected context: ${entry.prediction.capsule.interpretation}`));
      if (entry.prediction.evaluation) d.append(node('p', `Later evidence: ${entry.prediction.evaluation.evidence.join(' · ') || 'No evidence text recorded'}`),
        node('p', `Owning interpretation: ${entry.prediction.evaluation.interpretation}`), node('p', `Causal attribution: ${entry.prediction.evaluation.causalAttribution}`));
      if (entry.originStage !== null) source(d, entry.originStage, 'Inspect prediction origin');
      for (const check of entry.checks) source(d, check.stageIndex, `Inspect later outcome · ${run.stages[check.stageIndex]!.name}`);
      if (entry.learnedMemory) d.append(node('p', `Linked subjective memory: ${entry.learnedMemory.gist}`));
      disclosure(d, 'Exact conditions, versions and source references', entry);
    }
  }
  function renderDevelopment() {
    development.replaceChildren(); const area = card(development, 'Memory and development history', 'Experience → subjective interpretation → memory/prediction evidence → disposition development → later cognition. Links establish provenance, not causal benefit.');
    for (const entry of analysis.memories.filter(item => !partId || item.memory.partId === partId || item.retrievals.some(retrieval => retrieval.partId === partId))) {
      const d = disclosure(area, `${entry.memory.gist} · ${entry.retrievals.length} recorded retrieval(s)`);
      d.append(node('p', entry.memory.content), node('p', entry.effectiveness));
      if (entry.originStage >= 0) source(d, entry.originStage, 'Inspect memory experience');
      for (const retrieval of entry.retrievals) source(d, retrieval.stageIndex, `Inspect later cognition · ${run.stages[retrieval.stageIndex]!.name}`);
      for (const related of entry.linkedDispositions) d.append(node('p', `Recorded relevance: ${related.name} · version ${related.version}`));
      disclosure(d, 'Memory versions, ancestry and retrieval references', entry);
    }
    const changes = disclosure(area, 'Disposition changes and consolidation');
    for (const stage of analysis.stages) for (const change of stage.changes.dispositions.filter(item => !partId || scopes().has(item.id))) {
      const d = disclosure(changes, `${stage.name} · ${change.after.name} · ${change.kind}`);
      d.append(node('p', change.fields.map(item => `${item.field}: ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)}`).join('\n') || 'First captured version; may be a researcher-authored starting condition.'));
      source(d, stage.index); disclosure(d, 'Exact before/after state', change);
    }
    const activity = disclosure(area, 'Part activity and interpretation comparison');
    for (const entry of analysis.parts.filter(item => !partId || item.part.id === partId)) {
      const d = disclosure(activity, entry.part.name);
      d.append(node('p', `Mission: ${entry.part.mission}`), node('p', `Affect: ${entry.part.emotionalCharge ?? 'Not expressed'}`),
        node('p', `Retirement: ${entry.retirement?.reason ?? 'No retirement captured'}`));
      for (const contribution of entry.contributions) { d.append(node('p', `${run.stages[contribution.stageIndex]!.name}: ${contribution.thought.interpretation ?? contribution.thought.thought}`)); source(d, contribution.stageIndex); }
      disclosure(d, 'Scope, origin, recall, predictions and proposal lineage', entry);
    }
    for (const gap of analysis.gaps) area.append(node('p', gap, 'muted'));
  }
  function renderInspector() {
    inspector.replaceChildren(); const stage = run.stages[index]; const projected = analysis.stages[index];
    if (!stage || !projected) { inspector.append(node('p', 'No completed stage snapshot. Inspect diagnostics for any failed attempt.')); return; }
    inspector.append(node('h4', `${index + 1}. ${stage.name}`));
    const experience = card(inspector, '1. What happened?'); experience.append(node('p', stage.text ?? 'Offline or operational stage; no new authored message.'),
      node('p', 'Authored scenario experience and attributed external records; Part interpretations below remain subjective.', 'muted'));
    disclosure(experience, 'External observations and imagined alternatives (separate records)', { observations: stage.observations ?? [], experienced: stage.experienced });
    const relevant = card(inspector, '2. What became relevant?');
    const activation = stage.activations.filter(item => !partId || scopes().has(item.dispositionId));
    table(relevant, ['Scope', 'Direct', 'Final', 'Decision'], activation.map(item => [item.name, item.baselineScore === undefined ? 'Unavailable' : item.baselineScore.toFixed(2),
      item.score.toFixed(2), item.active ? 'Threshold crossed' : 'Below threshold']), 'Stage activation judgments');
    disclosure(relevant, 'Independent activation and separate admission budgets', { rounds: activation, budgets: stage.temporaryScopeBudgets ?? [], coverage: stage.coverage ?? [] });
    const interpretations = card(inspector, '3. How was it interpreted?');
    const thoughts = stage.thoughts.filter(item => !partId || item.partId === partId);
    table(interpretations, ['Part', 'Interpretation', 'Thought', 'Affect'], thoughts.map(item => [item.name, item.interpretation ?? 'Not recorded', item.thought,
      stage.parts.find(part => part.id === item.partId)?.emotionalCharge ?? 'Not expressed']), 'Parallel interpretations');
    const advocated = card(inspector, '4. What was advocated?');
    for (const thought of thoughts) { const d = disclosure(advocated, thought.name); d.append(node('p', thought.proposal ? JSON.stringify(thought.proposal) : 'No proposal')); }
    disclosure(advocated, 'Self inputs, per-bid scores, choice and rejected alternatives', { inputs: projected.selfInputs, decisions: projected.decisions, bids: projected.bids, inquiries: stage.inquiries ?? [] });
    const acted = card(inspector, '5. What was actually done?');
    for (const choice of stage.selfChoices ?? []) acted.append(node('p', `Self: ${choice.explanation}`));
    const executionRows = (stage.executions ?? []).filter(item => !partId || projected.contracts.some(entry => entry.contract.id === item.contractId && entry.contract.commands.some(command => command.partId === partId))
      || projected.bids.some(bid => bid.bid.partId === partId && item.speech?.bidIds.includes(bid.bid.id)));
    for (const execution of executionRows) acted.append(node('p', `${execution.status}: ${execution.speech?.text ?? (execution.facts.map(fact => fact.text).join(' · ') || execution.action.text)}${execution.operational ? ` · verification: ${execution.operational.verified === true ? 'verified' : 'not verified'}` : ''}`));
    if (!executionRows.length) acted.append(node('p', 'No stage execution outcome captured; advocacy does not establish action.'));
    disclosure(acted, 'Contracts, tool attempts, progress, outcomes and escalations', { operations: projected.operations, executions: executionRows });
    const learned = card(inspector, '6. What changed after experience?');
    learned.append(node('p', `${projected.changes.memories.length} memory and ${projected.changes.dispositions.length} disposition additions/revisions. These counts do not establish useful learning.`));
    disclosure(learned, 'New and revised cognitive objects', projected.changes);
    const timeline = card(inspector, 'Cognitive event timeline', 'External experience, Part interpretation, imagined futures and researcher judgments have separate provenance. Select an event for exact evidence.');
    const relatedIds = new Set<string>([partId, ...scopes(), ...analysis.memories.filter(item => item.memory.partId === partId || item.retrievals.some(retrieval => retrieval.partId === partId)).map(item => item.memory.id),
      ...analysis.predictions.filter(item => item.prediction.partId === partId).map(item => item.prediction.id),
      ...analysis.stages.flatMap(stage => stage.bids.filter(item => item.bid.partId === partId).map(item => item.bid.id)),
      ...analysis.stages.flatMap(stage => stage.contracts.filter(item => item.contract.commands.some(command => command.partId === partId)).map(item => item.contract.id))]);
    function related(value: unknown): boolean { return typeof value === 'string' ? relatedIds.has(value) : Array.isArray(value) ? value.some(related)
      : value !== null && typeof value === 'object' ? Object.values(value).some(related) : false; }
    const items = projected.trace.filter(event => !lane || event.lane === lane).filter(event => {
      return !partId || event.lane === 'Environment' || related(event.payload);
    });
    for (const event of items) button(timeline, `${event.lane} · ${readable(event.type)} · ${new Date(event.at).toLocaleTimeString()}`, () => { eventId = event.id; renderInspector(); }, fail);
    const selected = projected.trace.find(event => event.id === eventId);
    if (selected) { const d = disclosure(timeline, `Selected event · ${readable(selected.type)}`, selected); d.open = true; d.dataset.evidenceReference = `/events/${selected.id}`; }
    if (!projected.traceAvailable) timeline.append(node('p', 'No cycle trace recorded. Snapshot evidence remains available.'));
    if (stage.attentionWindow) {
      const window = stage.attentionWindow;
      inspector.append(node('p', `Attention window: ${window.allowanceMs} ms allowed; ${window.elapsedToPauseMs?.toFixed(0) ?? 'unmeasured'} ms to admission pause; ${window.passesAtPause ?? 'unmeasured'} passes. Pass cap: ${window.passLimit ?? 'unrestricted within window'}. Accepted inference drained at ${new Date(window.drainedAt).toLocaleTimeString()}. Equal ceilings do not establish equal consumed computation.`));
    }
    if (stage.cycleId) button(inspector, 'Inspect authoritative source cycle', () => cycle(stage.cycleId!, run.agentId), fail);
    for (const [position, cycleId] of (stage.concurrentCycleIds ?? []).entries()) if (cycleId !== stage.cycleId) button(inspector, `Inspect ${stage.attentionWindow ? 'attention snapshot' : 'overlapping observation'} ${position + 1}`, () => cycle(cycleId, run.agentId), fail);
    disclosure(inspector, 'Full stage snapshot', stage);
  }
  function render() { if (!developmentOnly) { renderActivation(); renderPredictions(); } renderDevelopment(); renderInspector(); }
  render();
}

export function simulationRunAnalysis(run: SimulationRun, api: Api, cycle: Cycle, fail: Fail) {
  const host = node('div');
  button(host, 'Explore run analytics', async () => { host.replaceChildren(); await renderRunExplorer(host, run, api, cycle, fail); }, fail);
  return host;
}

type Research = { reviews: SimulationReview[]; findings: SimulationFinding[]; candidates: SimulationCandidate[] };
export async function renderResearch(root: HTMLElement, run: SimulationRun, api: Api, cycle: Cycle, fail: Fail) {
  const host = node('section', '', 'simulation-research'); root.append(host); host.append(node('p', 'Loading research records…'));
  const [initialResearch, analysis] = await Promise.all([api<Research>(`simulation-tests/${run.id}/research`), api<SimulationAnalysis>(`simulation-tests/${run.id}/analysis`)]);
  let research = initialResearch;
  if (!host.isConnected) return;
  async function refresh() { const next = await api<Research>(`simulation-tests/${run.id}/research`); if (!host.isConnected) return; research = next; render(); }
  function render() {
    host.replaceChildren();
  const operations = card(host, 'Provider operation diagnostics', `${analysis.providerOperations.length} recorded operations · ${analysis.providerOperations.filter(item => item.phase === 'failed').length} failures`);
  operations.append(node('p', 'Adapter returns, runtime validation and admission are distinct. Unreported usage, cache, cost and causal parents stay unavailable. Calls without explicit cycle attribution remain unassigned.'));
  table(operations, ['Component / task', 'Provider', 'Status', 'Elapsed', 'Cycle', 'Diagnostics'], analysis.providerOperations.map(item => {
    const evidence = disclosure(document.createElement('div'), 'Exact operation input/output and prompts', item);
    const wrapper = document.createElement('div'); wrapper.append(evidence);
    if (item.cycleId) button(wrapper, 'Inspect operation source cycle', () => cycle(item.cycleId!, run.agentId), fail);
    return [`${item.component} · ${readable(item.task)}`, item.provider, item.phase,
      item.elapsedMs === null ? 'Unavailable' : `${item.elapsedMs.toFixed(1)} ms`, item.cycleId ? 'Recorded source cycle' : 'Unassigned', wrapper];
  }), 'Provider operations');
  if (!analysis.providerOperations.length) operations.append(node('p', 'This historical run has no operation instrumentation; missing records cannot be reconstructed.'));
  for (const item of analysis.providerOperations.filter(item => item.error)) {
    const error = item.error!; operations.append(node('p', `${item.provider} · ${readable(item.task)}: ${error.message} · HTTP ${error.httpStatus ?? 'unreported'} · retryability ${error.retryable === null ? 'unreported' : error.retryable ? 'reported retryable' : 'reported not retryable'}`));
    if (error.issues.length) disclosure(operations, 'Violated output contract locations', error.issues);
  }
  disclosure(operations, 'Recorded token/cache usage (exact operation attribution where recorded)', analysis.providerUsage);

    const reviews = card(host, 'Researcher criterion reviews', 'Human judgments append versions and frozen citations; original observer measures and model assessments remain unchanged. Fixture/mixed evidence remains explicit.');
    const form = node('form', '', 'observatory-review-form'); reviews.append(form);
    const criterion = select(form, 'Review criterion', run.specification.criteria.map((text, index) => [`criterion-${index + 1}`, text]));
    const verdict = select(form, 'Human verdict', [['inconclusive', 'Inconclusive'], ['observed', 'Observed'], ['not_observed', 'Not observed']]);
    const reviewer = field(form, 'Reviewer'); reviewer.required = true;
    const rationale = field(form, 'Review rationale', true); rationale.required = true;
    const refs = field(form, 'Evidence references (one per line)', true); refs.placeholder = '/stages/0/thoughts\n/stages/1/predictionChecks';
    const update = () => { const prior = latest(research.reviews.filter(item => item.criterionId === criterion.value));
      verdict.value = prior?.outcome ?? 'inconclusive'; rationale.value = prior?.rationale ?? ''; refs.value = prior?.citations.map(item => item.reference).join('\n') ?? ''; reviewer.value = prior?.reviewer ?? ''; };
    criterion.onchange = update; update();
    const submit = node('button', 'Save criterion review'); submit.type = 'submit'; submit.disabled = ['running', 'paused'].includes(run.status); form.append(submit);
    form.onsubmit = event => { event.preventDefault(); const prior = latest(research.reviews.filter(item => item.criterionId === criterion.value));
      submit.disabled = true; void api(`simulation-tests/${run.id}/research/reviews`, 'POST', { criterionId: criterion.value, outcome: verdict.value,
        reviewer: reviewer.value, rationale: rationale.value, evidenceReferences: refs.value.split('\n').map(item => item.trim()).filter(Boolean), expectedVersion: prior?.version ?? 0 })
        .then(refresh).catch(fail).finally(() => { if (submit.isConnected) submit.disabled = false; }); };
    const sources = disclosure(reviews, 'Available citation references');
    run.stages.forEach((stage, index) => { sources.append(node('p', `/stages/${index} · ${stage.name}`)); if (stage.cycleId) button(sources, 'Inspect evidence source cycle', () => cycle(stage.cycleId!, run.agentId), fail); });
    disclosure(reviews, 'All immutable human review versions', research.reviews);
    for (const criterionId of new Set(research.reviews.map(item => item.criterionId))) {
      const last = latest(research.reviews.filter(item => item.criterionId === criterionId))!;
      reviews.append(node('p', `${run.specification.criteria[Number(criterionId.slice(10)) - 1]}: ${readable(last.outcome)} · ${last.reviewer} · v${last.version}`), node('p', last.rationale));
    }
    const insights = card(host, 'Candidate findings and saved history', 'Mechanical observations and researcher interpretations remain reviewable hypotheses, outside Agent memory and WorldState.');
    button(insights, 'Analyze completed evidence for candidates', async () => { await api(`simulation-tests/${run.id}/research/candidates`, 'POST', {}); await refresh(); }, fail).disabled = ['running', 'paused'].includes(run.status);
    if (!research.candidates.length) insights.append(node('p', 'No mechanical candidate detected. This is not proof that cognition is correct.'));
    for (const candidate of research.candidates) {
      const d = disclosure(insights, `Candidate · ${candidate.title}`);
      d.append(node('p', candidate.claim), node('p', `Alternative explanations: ${candidate.alternatives}`), node('p', `Follow-up: ${candidate.followUp}`));
      disclosure(d, 'Exact evidence references', candidate.evidenceReferences);
    }
    const findingForm = node('form', '', 'observatory-review-form'); insights.append(findingForm);
    const key = field(findingForm, 'Finding key'); key.required = true;
    const title = field(findingForm, 'Finding title'); title.required = true;
    const claim = field(findingForm, 'Finding claim', true); claim.required = true;
    const alternatives = field(findingForm, 'Alternative explanations', true); alternatives.required = true;
    const followUp = field(findingForm, 'Recommended follow-up', true); followUp.required = true;
    const author = field(findingForm, 'Finding reviewer'); author.required = true;
    const status = select(findingForm, 'Finding review status', [['unreviewed', 'Unreviewed inference'], ['supported', 'Supported by cited run evidence'], ['disputed', 'Disputed'], ['insufficient_evidence', 'Insufficient evidence']]);
    const references = field(findingForm, 'Finding evidence references', true);
    const save = node('button', 'Save finding version'); save.type = 'submit'; save.disabled = ['running', 'paused'].includes(run.status); findingForm.append(save);
    const populate = (finding: SimulationFinding) => { key.value = finding.key; title.value = finding.title; claim.value = finding.claim; alternatives.value = finding.alternatives;
      followUp.value = finding.followUp; author.value = finding.reviewer; status.value = finding.status; references.value = finding.citations.map(item => item.reference).join('\n'); };
    findingForm.onsubmit = event => { event.preventDefault(); const prior = latest(research.findings.filter(item => item.key === key.value)); save.disabled = true;
      void api(`simulation-tests/${run.id}/research/findings`, 'POST', { key: key.value, title: title.value, claim: claim.value, alternatives: alternatives.value, followUp: followUp.value,
        reviewer: author.value, status: status.value, evidenceReferences: references.value.split('\n').map(item => item.trim()).filter(Boolean), expectedVersion: prior?.version ?? 0 })
        .then(refresh).catch(fail).finally(() => { if (save.isConnected) save.disabled = false; }); };
    for (const findingKey of new Set(research.findings.map(item => item.key))) {
      const versions = research.findings.filter(item => item.key === findingKey); const finding = latest(versions)!;
      const d = disclosure(insights, `${finding.title} · ${readable(finding.status)} · v${finding.version}`);
      d.append(node('p', finding.claim), node('p', `Alternatives: ${finding.alternatives}`), node('p', `Follow-up: ${finding.followUp}`));
      button(d, 'Review this finding', () => { populate(finding); findingForm.scrollIntoView({ block: 'nearest' }); }, fail);
      disclosure(d, 'Frozen cited evidence and prior versions', versions);
    }
    disclosure(host, 'Model assessments (separate from human review)', run.assessments ?? []);
    disclosure(host, 'Provider or infrastructure errors', { runError: run.error, researchAnalysisError: run.researchAnalysisError, assessmentSetupError: run.assessmentSetupError });
    const failures = card(host, 'Failed cognitive attempts', 'Failures preserve audit evidence without being counted as completed stages or failed psychological hypotheses.');
    if (!analysis.failedAttempts.length) failures.append(node('p', 'No failed cognitive attempt recorded for this run.'));
    for (const attempt of analysis.failedAttempts) {
      failures.append(node('p', attempt.cycle.error ?? 'No error text recorded'));
      button(failures, 'Inspect failed source cycle', () => cycle(attempt.cycle.id, run.agentId), fail);
      disclosure(failures, 'Recorded operation and infrastructure evidence', attempt.events);
    }
  }
  render();
}

export async function renderComparisons(root: HTMLElement, runs: SimulationRun[], api: Api, cycle: Cycle, fail: Fail) {
  const host = node('section', '', 'simulation-comparisons'); root.append(host);
  if (!runs.length) { host.append(node('p', 'No saved runs to compare.')); return; }
  const choices = runs.map(run => [run.id, `${run.title} · ${run.providers.reasoning} · ${run.createdAt}`] as [string, string]);
  const controls = node('div', '', 'observatory-filters'); host.append(controls);
  const left = select(controls, 'Comparison baseline run', choices); const right = select(controls, 'Comparison follow-up run', choices);
  if (choices[1]) right.value = choices[1][0];
  const mode = select(controls, 'Comparison mode', [['runs', 'Run versus run'], ['configuration', 'Configuration versus configuration'], ['development', 'Agent before versus after learning']]);
  const baselineStage = select(controls, 'Baseline stage', []); const followUpStage = select(controls, 'Follow-up stage', []);
  function stageOptions() {
    for (const [runSelect, stageSelect] of [[left, baselineStage], [right, followUpStage]]) {
      stageSelect!.replaceChildren(); const run = runs.find(item => item.id === runSelect!.value);
      run?.stages.forEach((stage, index) => stageSelect!.append(new Option(`${index + 1}. ${stage.name} · ${stage.phase}`, String(index))));
    }
    baselineStage.closest('label')!.hidden = mode.value !== 'development';
    followUpStage.closest('label')!.hidden = mode.value !== 'development';
  }
  left.onchange = stageOptions; right.onchange = stageOptions; mode.onchange = stageOptions; stageOptions();
  const result = node('div'); host.append(result); let request = 0;
  button(controls, 'Compare recorded runs', async () => {
    const current = ++request;
    const comparison = await api<SimulationComparison>(`simulation-tests/${mode.value === 'development' ? 'compare-stages' : 'compare'}`, 'POST', {
      leftRunId: left.value, rightRunId: right.value, ...(mode.value === 'development' ? { leftIndex: Number(baselineStage.value), rightIndex: Number(followUpStage.value) } : {}) });
    if (!host.isConnected || current !== request) return;
    result.replaceChildren();
    const config = card(result, 'Configuration versus configuration', !comparison.leftConfiguration.startingConfigurationAvailable || !comparison.rightConfiguration.startingConfigurationAvailable
      ? 'Historical starting configuration is incomplete.' : comparison.configurationDifferences.length ? `Differing fields: ${comparison.configurationDifferences.join(', ')}` : 'Recorded comparison configuration matches.');
    disclosure(config, 'Exact reproducibility fingerprints', { left: comparison.leftConfiguration, right: comparison.rightConfiguration });
    for (const limitation of comparison.limitations) config.append(node('p', limitation, 'muted'));
    const aligned = card(result, 'Synchronized run comparison');
    const names = comparison.stages.map((stage, index) => [String(index), `${stage.name} · ${stage.phase}${stage.matched ? '' : ' · unmatched'}`] as [string, string]);
    const choose = select(aligned, 'Aligned comparison stage', names); const detail = node('div'); aligned.append(detail);
    const inspect = () => {
      const stage = comparison.stages[Number(choose.value)]; if (!stage) return; detail.replaceChildren(node('h4', stage.name));
      table(detail, ['Recorded measure', 'Baseline', 'Follow-up'], Object.keys(stage.left?.measures ?? stage.right!.measures).map(key => [readable(key),
        String(stage.left?.measures[key as keyof NonNullable<typeof stage.left>['measures']] ?? 'Unavailable'), String(stage.right?.measures[key as keyof NonNullable<typeof stage.right>['measures']] ?? 'Unavailable')]), 'Aligned stage comparison');
      const sides = node('div', '', 'observatory-comparison-sides'); detail.append(sides);
      for (const [title, value, runId, stageIndex] of [['Baseline', stage.left, comparison.leftRunId, stage.leftIndex], ['Follow-up', stage.right, comparison.rightRunId, stage.rightIndex]] as const) {
        const side = card(sides, title); if (!value) { side.append(node('p', 'No matching stage.')); continue; }
        for (const thought of value.thoughts) side.append(node('h4', thought.name), node('p', thought.interpretation ?? thought.thought), node('p', thought.thought));
        for (const choice of value.choices) side.append(node('p', `Self: ${choice.explanation}`));
        const run = runs.find(item => item.id === runId)!; const source = stageIndex === null ? null : run.stages[stageIndex];
        if (source?.cycleId) button(side, 'Inspect comparison source cycle', () => cycle(source.cycleId!, run.agentId), fail);
        disclosure(side, 'Predictions, memories, dispositions, choices and actions', value);
      }
      table(detail, ['Scope role', 'Match', 'Baseline score', 'Follow-up score'], stage.activation.map(item => [item.name, item.match,
        item.left?.score.toFixed(2) ?? 'Unmatched/unavailable', item.right?.score.toFixed(2) ?? 'Unmatched/unavailable']), 'Matched semantic scope activation');
    }; choose.onchange = inspect; inspect();
  }, fail);
  button(controls, 'Aggregate repeated configurations', async () => {
    const current = ++request;
    const aggregate = await api<Array<{ testId: string; trials: number; completed: number; failed: number; activeScopeEvaluations: { n: number; mean: number | null; min: number | null; max: number | null; sampleStandardDeviation: number | null }; limitations: string }>>('simulation-tests/aggregate', 'POST', { runIds: runs.map(run => run.id) });
    if (!host.isConnected || current !== request) return; result.replaceChildren();
    const panel = card(result, 'Repeated trial variation', 'Only exact frozen configurations are grouped; incomplete runs do not enter descriptive activation totals.');
    table(panel, ['Scenario', 'Trials', 'Completed', 'Failed', 'Mean', 'Range', 'Sample SD'], aggregate.map(group => [group.testId, String(group.trials), String(group.completed), String(group.failed),
      group.activeScopeEvaluations.mean?.toFixed(2) ?? 'Unavailable', group.activeScopeEvaluations.n ? `${group.activeScopeEvaluations.min}–${group.activeScopeEvaluations.max}` : 'Unavailable',
      group.activeScopeEvaluations.sampleStandardDeviation?.toFixed(2) ?? 'Insufficient trials']), 'Repeated configuration observations');
    panel.append(node('p', 'These counts do not measure quality, intelligence or causal learning. Compare criteria, controls and behavioral evidence.'));
    disclosure(panel, 'Full grouped configurations and run evidence', aggregate);
  }, fail);
}

/** The shared registry remains the launch surface; this shell coordinates six researcher views. */
export function observatoryShell(root: HTMLElement, experiments: HTMLElement, getRuns: () => SimulationRun[], api: Api, cycle: Cycle, fail: Fail) {
  const shell = node('section', '', 'observatory'); root.append(shell); shell.append(node('h2', 'Cognitive Observatory'));
  const tabs = node('div', '', 'observatory-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Simulation research views');
  const panel = node('div'); panel.setAttribute('role', 'tabpanel'); shell.append(tabs, panel);
  const titles = ['Overview', 'Experiments', 'Run Explorer', 'Comparisons', 'Development', 'Diagnostics & Evidence'] as const;
  let active: typeof titles[number] = 'Experiments'; let generation = 0;
  const buttons: HTMLButtonElement[] = [];
  function render() {
    generation++; const current = generation;
    buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(titles[i] === active)); button.tabIndex = titles[i] === active ? 0 : -1; });
    panel.replaceChildren(); panel.setAttribute('aria-label', active);
    if (active === 'Experiments') { panel.append(experiments); return; }
    const runs = getRuns();
    if (active === 'Overview') {
      const summary = card(panel, 'Research overview', `${runs.length} runs · ${runs.filter(run => run.status === 'completed').length} completed · ${runs.filter(run => run.status === 'failed').length} failed · ${runs.filter(run => ['running', 'paused'].includes(run.status)).length} running`);
      summary.append(node('p', 'Operational completion, observer measurements, human reviews and machine assessments are separate.'));
      for (const run of runs.slice().reverse().slice(0, 8)) {
        const report = card(panel, run.title, `${run.status} · ${run.evidenceBasis} · ${run.stages.length}/${run.totalSteps} stages`);
        report.append(node('p', run.specification.hypothesis));
        button(report, 'Open this run', () => { active = 'Run Explorer'; render(); const selector = panel.querySelector<HTMLSelectElement>('[aria-label="Observatory run"]'); if (selector) { selector.value = run.id; selector.dispatchEvent(new Event('change')); } }, fail);
      }
      void Promise.all(runs.filter(run => !['running', 'paused'].includes(run.status)).map(run => api<Research>(`simulation-tests/${run.id}/research`))).then(records => {
        if (!shell.isConnected || generation !== current) return;
        const patterns = new Map<string, Set<string>>();
        records.forEach((record, index) => record.candidates.forEach(candidate => { const ids = patterns.get(candidate.pattern) ?? new Set<string>(); ids.add(String(index)); patterns.set(candidate.pattern, ids); }));
        const area = card(panel, 'Recurring candidate patterns', 'Counts are runs with mechanical observations, not confirmed regressions.');
        for (const [pattern, ids] of patterns) area.append(node('p', `${readable(pattern)} · ${ids.size} run(s)`));
        if (!patterns.size) area.append(node('p', 'No recurring mechanical candidate detected.'));
        const saved = card(panel, 'Latest saved research judgments', 'Human reviews and candidate finding states remain separate from model verdicts and operational completion.');
        const findings = new Map<string, SimulationFinding>(); const reviews = new Map<string, SimulationReview>();
        for (const record of records) {
          for (const finding of record.findings) findings.set(`${finding.runId}:${finding.key}`, finding);
          for (const review of record.reviews) reviews.set(`${review.runId}:${review.criterionId}`, review);
        }
        saved.append(node('p', `${reviews.size} reviewed criteria · ${[...findings.values()].filter(item => item.status === 'unreviewed').length} unreviewed findings`));
        for (const finding of [...findings.values()].slice(-8).reverse()) {
          const d = disclosure(saved, `${finding.title} · ${readable(finding.status)}`); d.append(node('p', finding.claim), node('p', `Alternative explanations: ${finding.alternatives}`));
          button(d, 'Inspect finding history', () => { active = 'Diagnostics & Evidence'; render(); const control = panel.querySelector<HTMLSelectElement>('[aria-label="Observatory run"]');
            if (control) { control.value = finding.runId; control.dispatchEvent(new Event('change')); } }, fail);
        }
      }).catch(fail);
      return;
    }
    if (active === 'Comparisons') { void renderComparisons(panel, runs, api, cycle, fail).catch(fail); return; }
    if (!runs.length) { panel.append(node('p', 'No runs saved for this Agent. Run a scenario under Experiments.')); return; }
    const selector = select(panel, 'Observatory run', runs.slice().reverse().map(run => [run.id, `${run.title} · ${run.status} · ${run.createdAt}`]));
    const target = node('div'); panel.append(target); let request = 0;
    const load = () => {
      request++; const selected = request; target.replaceChildren(); const run = runs.find(item => item.id === selector.value)!;
      const host = node('div'); target.append(host);
      const work = active === 'Diagnostics & Evidence' ? renderResearch(host, run, api, cycle, fail) : renderRunExplorer(host, run, api, cycle, fail, active === 'Development');
      void work.catch(error => { if (shell.isConnected && selected === request && generation === current) fail(error); });
    }; selector.onchange = load; load();
  }
  titles.forEach((title, index) => {
    const b = button(tabs, title, () => { active = title; render(); }, fail); b.setAttribute('role', 'tab'); buttons.push(b);
    b.onkeydown = event => { let next = index; if (event.key === 'ArrowRight') next = (index + 1) % titles.length;
      else if (event.key === 'ArrowLeft') next = (index + titles.length - 1) % titles.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = titles.length - 1; else return;
      event.preventDefault(); active = titles[next]!; render(); buttons[next]!.focus(); };
  });
  render();
  return { refresh: () => { if (active !== 'Experiments') render(); } };
}
