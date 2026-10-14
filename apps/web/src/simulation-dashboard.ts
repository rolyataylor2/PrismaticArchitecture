import type { DreamConsole, DreamConsoleLine } from '../../../packages/sdk/src/dream-console.js';
import type { SimulationRun, SimulationTestDefinition } from '../../../packages/sdk/src/simulation-tests.js';
import type { SimulationReview } from '../../../packages/sdk/src/simulation-research.js';
import type { SimulationAnalysis } from '../../../packages/sdk/src/simulation-analysis.js';
import type { aggregateSimulations, SimulationComparison } from '../../../packages/sdk/src/simulation-comparison.js';
import { renderResearch } from './simulation-observatory.js';
import { criterionRecurrence, stageMetrics, trajectories, verdicts, type Metric } from './simulation-metrics.js';

type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Options = { context?: string; api: Api; cycle: (id: string, agentId: string) => void; fail: (error: unknown) => void;
  agent: (id: string) => void | Promise<void>; launch: (testId: string) => void | Promise<void>; refresh: () => void | Promise<void>; };
type Group = ReturnType<typeof aggregateSimulations>[number];
const ns = 'http://www.w3.org/2000/svg';
const colors = ['#257b78', '#9b6c29', '#6c64a2', '#5585b0'];
const outcomeColor: Record<string, string> = { observed: '#257b78', not_observed: '#b65c51', inconclusive: '#b09a71', missing: '#dce1e2' };
const labels: Record<Metric, string> = { active: 'Active scopes', scored: 'Scored scopes', contributors: 'Contributing Parts', proposals: 'Proposals', recalls: 'Recalled memories', memories: 'Stored memories', predictions: 'Recorded predictions', choices: 'Self choices', executions: 'Recorded executions', verified: 'Verified operations' };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; n.className = cls; return n; };
const pretty = (s: string) => s.replaceAll('_', ' ');
const time = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text = '') {
  const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text) n.textContent = text; return n;
}
function action(parent: HTMLElement, name: string, work: () => unknown, fail: Options['fail'], cls = '') {
  const b = el('button', name, cls); b.type = 'button'; b.onclick = () => { void Promise.resolve().then(work).catch(fail); }; parent.append(b); return b;
}
function choose(parent: HTMLElement, name: string, items: [string, string][], value: string, change: (v: string) => void) {
  const label = el('label', name); const s = el('select'); s.setAttribute('aria-label', name); for (const [v, t] of items) s.append(new Option(t, v)); s.value = value; s.onchange = () => change(s.value); label.append(s); parent.append(label); return s;
}
function section(parent: HTMLElement, title: string, subtitle = '', cls = '') {
  const s = el('section', '', `rd-section ${cls}`); const head = el('header'); head.append(el('h3', title)); if (subtitle) head.append(el('p', subtitle, 'rd-caption')); s.append(head); parent.insertBefore(s, parent.querySelector(':scope > .rd-limits')); return s;
}
function empty(parent: HTMLElement, title: string, message: string) { const n = el('div', '', 'rd-empty'); n.append(el('h3', title), el('p', message)); parent.append(n); }
function dialog(title: string, content: (body: HTMLElement) => void) {
  const d = el('dialog', '', 'rd-dialog'); d.setAttribute('aria-label', title); const head = el('header'); head.append(el('h2', title));
  const b = el('button', 'Close'); b.type = 'button'; b.onclick = () => d.close(); head.append(b); const body = el('div', '', 'rd-dialog-body'); content(body); d.append(head, body);
  d.onclick = e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } };
  d.addEventListener('close', () => d.remove(), { once: true }); document.body.append(d); d.showModal();
}
function raw(title: string, value: unknown) {
  dialog(title, body => { const input = el('input'); input.type = 'search'; input.placeholder = 'Find text in original JSON'; input.setAttribute('aria-label', 'Search original JSON');
    const text = JSON.stringify(value, null, 2); const pre = el('pre', text, 'rd-json'); const status = el('p', '', 'rd-caption'); status.setAttribute('role', 'status');
    input.oninput = () => { const query = input.value.toLowerCase(); const lines = text.split('\n'); status.textContent = query ? `${lines.filter(line => line.toLowerCase().includes(query)).length} matching lines; full original record preserved below` : ''; pre.replaceChildren();
      for (const line of lines) { const row = el('span', line+'\n'); if (query && line.toLowerCase().includes(query)) row.className = 'rd-match'; pre.append(row); } const match = pre.querySelector('.rd-match'); match?.scrollIntoView({ block: 'nearest' }); };
    body.append(input, status, pre); });
}
function tooltip(root: HTMLElement, mark: SVGElement, text: string, click?: () => void) {
  mark.append(svg('title', {}, text)); mark.setAttribute('tabindex', '0'); mark.setAttribute('role', click ? 'button' : 'img'); mark.setAttribute('aria-label', text);
  let tip: HTMLElement | null = null;
  const hide = () => { tip?.remove(); tip = null; };
  const show = () => { hide(); tip = el('div', text, 'rd-tooltip'); tip.setAttribute('role', 'tooltip'); root.append(tip); };
  mark.addEventListener('pointerenter', show); mark.addEventListener('pointerleave', hide); mark.addEventListener('focus', show); mark.addEventListener('blur', hide);
  if (click) { mark.addEventListener('click', () => { hide(); click(); }); mark.addEventListener('keydown', event => { const e = event as KeyboardEvent; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hide(); click(); } }); }
}
function plot(parent: HTMLElement, title: string, width = 720, height = 250) {
  const wrap = el('div', '', 'rd-plot'); const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': title }); wrap.append(s); parent.append(wrap); return { wrap, s };
}
function legend(parent: HTMLElement, items: [string, string][]) { const row = el('div', '', 'rd-legend'); for (const [name, color] of items) { const label = el('span', name); const dot = el('i'); dot.style.background = color; label.prepend(dot); row.append(label); } parent.append(row); }
function lineChart(parent: HTMLElement, runs: SimulationRun[], metrics: Metric[], inspect: (run: SimulationRun, index: number) => void) {
  if (!runs.some(run => run.stages.length)) { empty(parent, 'No recorded stages', 'A trajectory appears after the first completed stage.'); return; }
  const series = metrics.map(metric => ({ metric, points: trajectories(runs, metric) }));
  const count = Math.max(...series.map(item => item.points.length)); const max = Math.max(1, ...series.flatMap(item => item.points.flatMap(p => p.max === null ? [] : [p.max])));
  const { s, wrap } = plot(parent, 'Recorded stage trajectories'); const x = (i: number) => 48 + i / Math.max(1, count - 1) * 630; const y = (v: number) => 196 - v / max * 156;
  for (let t = 0; t <= 4; t++) { const value = max * t / 4; s.append(svg('line', { x1: 48, y1: y(value), x2: 680, y2: y(value), class: 'rd-grid' }), svg('text', { x: 36, y: y(value)+4, 'text-anchor': 'end', class: 'rd-axis' }, Number(value.toFixed(1)).toString())); }
  s.append(svg('text', { x: 48, y: 20, class: 'rd-axis' }, 'count · mean across recorded trials'));
  series.forEach(({ metric, points }, seriesIndex) => {
    let segment: string[] = []; const flush = () => { if (segment.length) s.append(svg('polyline', { points: segment.join(' '), fill: 'none', stroke: colors[seriesIndex]!, 'stroke-width': 2.5 })); segment = []; };
    points.forEach((p, i) => { if (p.mean === null) { flush(); return; } segment.push(`${x(i)},${y(p.mean)}`); }); flush();
    points.forEach((p, i) => {
      if (p.mean === null) return; const color = colors[seriesIndex]!;
      if (runs.length > 1 && p.min !== p.max) s.append(svg('line', { x1: x(i), y1: y(p.min!), x2: x(i), y2: y(p.max!), stroke: color, 'stroke-width': 7, opacity: .22 }));
      const c = svg('circle', { cx: x(i), cy: y(p.mean), r: 5, fill: color, stroke: '#fff', 'stroke-width': 2 }); s.append(c);
      tooltip(wrap, c, `${p.name} · ${p.phase}: ${labels[metric]} ${p.mean.toFixed(1)}; range ${p.min}–${p.max}, n=${p.n}. Click to inspect a recorded source stage.`, () => { const source = p.values[0]!; inspect(runs.find(run => run.id === source.runId)!, source.stage); });
    });
  });
  series[0]!.points.forEach((p, i) => { s.append(svg('text', { x: x(i), y: 220, 'text-anchor': 'middle', class: 'rd-axis' }, `${i+1}. ${p.name.length>17?p.name.slice(0,15)+'…':p.name}`)); const mark = svg('text', { x: x(i), y: 239, 'text-anchor': 'middle', class: 'rd-axis' }, p.phase); mark.append(svg('title', {}, p.name)); s.append(mark); });
  legend(parent, metrics.map((m, i) => [labels[m], colors[i]!])); parent.append(el('p', 'Stage order → · markers open evidence · translucent ranges show min–max, not confidence intervals. Counts do not establish learning benefit.', 'rd-caption'));
}
function direction(id: string) {
  if (/affect|stance/.test(id)) return 'Affect & Self'; if (/executive|procedure|skill|remainder/.test(id)) return 'Executive & skills';
  if (/prediction|anticipation|prospective|calibration|future|scaffold/.test(id)) return 'Prediction & anticipation'; if (/memory|learning|inheritance|development|consolidation/.test(id)) return 'Memory & development'; return 'Attention & cognition';
}
const views = ['Overview', 'Activation', 'Predictions', 'Learning', 'Affect', 'Execution', 'Conclusions', 'Compare', 'Records'] as const;
type View = typeof views[number];
export function simulationDashboard(root: HTMLElement, options: Options) {
  const host = el('section', '', 'research-dashboard'); root.append(host);
  let definitions: SimulationTestDefinition[] = []; let runs: SimulationRun[] = []; let groups: Group[] = [];
  let testId = ''; let groupId = ''; let runId = ''; let view: View = 'Overview'; let stageIndex: number | null = null; let generation = 0; let search = ''; let lane = ''; let basis = '';
  const storageKey = `prism-simulation-dashboard:${options.context ?? 'default'}`;
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as { testId?: string; groupId?: string; runId?: string; view?: View; basis?: string } | null; if (saved) { testId = saved.testId ?? ''; groupId = saved.groupId ?? ''; runId = saved.runId ?? ''; view = views.includes(saved.view!) ? saved.view! : 'Overview'; basis = saved.basis ?? ''; } } catch { /* Ignore invalid local navigation state. */ }
  let updateEpoch = 0;
  let judgmentChannel = 'observer';
  let scrolledExperiment = ''; let directoryScroll = 0;
  const scope = () => runs.filter(r => r.testId === testId && (!groupId || groups.find(g => g.configurationId === groupId)?.runIds.includes(r.id)) && (!runId || r.id === runId) && (!basis || r.evidenceBasis === basis));
  const goto = (next: View, selectedRun?: string, stage?: number) => { view = next; if (selectedRun) runId = selectedRun; stageIndex = stage ?? null; render(); };
  const fail = (e: unknown) => { options.fail(e); };
  function stageDetail(run: SimulationRun, index: number) { runId = run.id; stageIndex = index; view = 'Overview'; render(); }
  async function analysis(run: SimulationRun, parent: HTMLElement, work: (a: SimulationAnalysis) => void) {
    const current = generation; const loading = el('p', 'Loading recorded analysis…', 'rd-caption'); loading.setAttribute('role', 'status'); parent.append(loading);
    try { const a = await options.api<SimulationAnalysis>(`simulation-tests/${encodeURIComponent(run.id)}/analysis`); if (current !== generation || !parent.isConnected) return; loading.remove(); work(a); }
    catch (error) { if (current === generation && parent.isConnected) { loading.textContent = 'Analysis unavailable. Refresh to retry; saved snapshots remain in Records.'; fail(error); } }
  }
  function render() {
    directoryScroll = host.querySelector('.rd-directory')?.scrollTop ?? directoryScroll;
    generation++; if (definitions.length) sessionStorage.setItem(storageKey, JSON.stringify({ testId, groupId, runId, view, basis })); host.replaceChildren(); const allExperiment = runs.filter(r => r.testId === testId); const selected = scope(); const definition = definitions.find(d => d.id === testId);
    const top = el('header', '', 'rd-top'); const title = el('div'); title.append(el('p', 'RESEARCH WORKSPACE', 'rd-eyebrow'), el('h2', 'Dreams')); top.append(title);
    const actions = el('div', '', 'rd-actions'); action(actions, 'New dream', () => options.launch(testId), fail, 'rd-primary'); action(actions, 'Refresh', options.refresh, fail); top.append(actions); host.append(top);
    const layout = el('div', '', 'rd-layout'); const nav = el('nav', '', 'rd-directory'); nav.setAttribute('aria-label', 'Research directions'); layout.append(nav); const main = el('main', '', 'rd-main'); layout.append(main); host.append(layout);
    const query = el('input'); query.type = 'search'; query.value = search; query.placeholder = 'Find an experiment'; query.setAttribute('aria-label', 'Find an experiment'); nav.append(query);
    const links = el('div'); nav.append(links);
    function drawLinks() { links.replaceChildren(); const visible = definitions.filter(d => `${d.title} ${d.hypothesis}`.toLowerCase().includes(query.value.toLowerCase()));
      for (const name of [...new Set(definitions.map(d => direction(d.id)))]) { const subset = visible.filter(d => direction(d.id) === name); if (!subset.length) continue;
        const d = el('details', '', 'rd-direction'); d.open = !query.value ? subset.some(s => s.id === testId) : true; d.append(el('summary', name));
        for (const item of subset) { const b = action(d, item.title, () => { scrolledExperiment = ''; testId = item.id; groupId = ''; runId = ''; stageIndex = null; view = 'Overview'; render(); }, fail, item.id === testId ? 'rd-experiment selected' : 'rd-experiment'); b.dataset.experimentId = item.id; b.setAttribute('aria-current', item.id === testId ? 'page' : 'false'); const count = runs.filter(r => r.testId === item.id).length; b.append(el('small', `${count} runs`)); } links.append(d);
      }
      if (!visible.length) links.append(el('p', 'No experiments match.', 'rd-caption'));
    } query.oninput = () => { search = query.value; drawLinks(); }; drawLinks();
    const sets = groups.filter(g => g.testId === testId);
    const eligible = allExperiment.filter(r => !groupId || groups.find(g => g.configurationId === groupId)?.runIds.includes(r.id));
    nav.scrollTop = directoryScroll;
    if (scrolledExperiment !== testId) {
      const selectedExperiment = testId;
      requestAnimationFrame(() => {
        if (!nav.isConnected || testId !== selectedExperiment) return;
        const selectedButton = nav.querySelector<HTMLElement>('.rd-experiment.selected');
        if (selectedButton) { nav.scrollTop += selectedButton.getBoundingClientRect().top - nav.getBoundingClientRect().top; scrolledExperiment = selectedExperiment; }
      });
    }
    const crumbs = el('nav', '', 'rd-breadcrumb'); crumbs.setAttribute('aria-label', 'Analytics breadcrumb');
    if (groupId) { crumbs.append(el('span', '›')); action(crumbs, 'Run set overview', () => { runId = ''; stageIndex = null; view = 'Overview'; render(); }, fail); }
    if (runId) { crumbs.append(el('span', '›')); action(crumbs, 'Run overview', () => { stageIndex = null; view = 'Overview'; render(); }, fail); } if (stageIndex !== null) crumbs.append(el('span', `› Stage ${stageIndex+1}`)); main.append(crumbs);
    const heading = el('div', '', 'rd-heading'); heading.append(el('p', runId ? 'INDIVIDUAL RUN' : groupId ? 'MATCHED CONFIGURATION' : 'EXPERIMENT OVERVIEW', 'rd-eyebrow'), el('h2', definition?.title ?? 'Loading experiments…'), el('p', definition?.hypothesis ?? 'Loading the research registry.'));
    const filterButton = action(heading, '', () => {
      const modal = el('dialog', '', 'rd-dialog rd-filter-dialog'); modal.setAttribute('aria-label', 'Run filters'); modal.append(el('h2', 'Run filters'));
      const fields = el('div', '', 'rd-filter-fields'); modal.append(fields);
      let nextGroup = groupId; let nextRun = runId; let nextBasis = basis;
      const runSelect = choose(fields, 'Run', [['', 'Combined run overview']], nextRun, value => { nextRun = value; });
      const populateRuns = () => {
        const available = allExperiment.filter(r => !nextGroup || groups.find(g => g.configurationId === nextGroup)?.runIds.includes(r.id));
        runSelect.replaceChildren(new Option('Combined run overview', ''));
        for (const r of available.slice().reverse()) runSelect.append(new Option(`${time(r.createdAt)} · ${r.status} · ${r.id.slice(-6)}`, r.id));
        runSelect.value = nextRun;
      };
      const setSelect = choose(fields, 'Run set', [['', `All configurations · ${allExperiment.length} runs`], ...sets.map((g, i): [string, string] => [g.configurationId, `Set ${i+1} · ${g.trials} trials · ${g.configuration.evidenceBasis}`])], nextGroup, value => { nextGroup = value; nextRun = ''; populateRuns(); });
      fields.prepend(setSelect.parentElement!); populateRuns();
      choose(fields, 'Evidence basis', [['', 'All provenance'], ['configured_models', 'Configured models'], ['mixed', 'Mixed providers'], ['fixture', 'Fixture only']], nextBasis, value => { nextBasis = value; });
      const actions = el('div', '', 'rd-actions'); modal.append(actions);
      action(actions, 'Apply filters', () => { groupId = nextGroup; runId = nextRun; basis = nextBasis; stageIndex = null; modal.close(); render(); }, fail, 'rd-primary');
      action(actions, 'Reset filters', () => { groupId = ''; runId = ''; basis = ''; stageIndex = null; modal.close(); render(); }, fail);
      action(actions, 'Close', () => modal.close(), fail);
      modal.addEventListener('close', () => modal.remove(), { once: true }); document.body.append(modal); modal.showModal();
    }, fail, 'rd-filter-button');
    filterButton.setAttribute('aria-label', 'Filter runs'); filterButton.title = 'Filter run set, run and evidence basis';
    filterButton.append(svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }));
    filterButton.querySelector('svg')!.append(svg('path', { d: 'M3 4h18l-7 8v7l-4 2v-9z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    if (groupId || runId || basis) filterButton.dataset.active = 'true';
    const sourceUrl = definition?.source.match(/https?:\/\/[^\s]+/)?.[0]; if(sourceUrl){const link=el('a','Source discussion','rd-source');link.href=sourceUrl;link.target='_blank';link.rel='noreferrer';heading.append(link);} main.append(heading);
    const meta = el('div', '', 'rd-meta'); meta.append(el('span', `${selected.length} trials in view`), el('span', `${new Set(selected.map(r => r.providers.reasoning)).size} reasoning providers`), el('span', `${selected.filter(r => r.evidenceBasis === 'fixture').length} fixture / ${selected.filter(r => r.evidenceBasis === 'mixed').length} mixed / ${selected.filter(r => r.evidenceBasis === 'configured_models').length} configured`)); main.append(meta);
    const tabs = el('nav', '', 'rd-tabs'); tabs.setAttribute('aria-label', 'Analytics views'); for (const name of views) { const b = action(tabs, name, () => { view = name; stageIndex = null; render(); }, fail); b.setAttribute('aria-current', view === name ? 'page' : 'false'); } main.append(tabs);
    const panel = el('div', '', 'rd-panel'); main.append(panel);
    if (!definition) { empty(panel, 'Loading experiments', 'The registry and saved runs are being retrieved.'); return; }
    if (!selected.length) { empty(panel, allExperiment.length ? 'No runs match this selection' : 'No observations yet', allExperiment.length ? 'Change the provenance filter or run selection to inspect available evidence.' : 'Launch a fixture to inspect the pipeline, or a configured run for model observations. No measurements have been invented.'); const protocol = section(panel, 'Research protocol', definition.limitations); protocol.append(el('p', definition.criteria.join(' · '))); return; }
    const run = selected.find(r => r.id === runId) ?? selected.at(-1)!;
    if (stageIndex !== null) { stagePage(panel, run, stageIndex); return; }
    if (view === 'Execution') cognitionAcrossExperience(panel, selected);
    if (view === 'Overview') overview(panel, selected, definition);
    else if (view === 'Compare') compare(panel, eligible);
    else if (view === 'Conclusions') conclusions(panel, selected);
    else if (view === 'Records') records(panel, run);
    else if (!runId) { const picker = section(panel, `${view} · choose a recorded run`, 'Detailed objects retain run-local identities. Select a trial to investigate; cross-run trajectories below align exact stage names and phases.');
      runButtons(picker, selected); if (view !== 'Execution') lineChart(panel, selected.filter(r => r.status === 'completed'), view === 'Learning' ? ['memories', 'recalls', 'predictions'] : ['active', 'contributors', 'proposals'], stageDetail);
    } else if (view === 'Activation') activation(panel, run);
    else if (view === 'Predictions') predictions(panel, run);
    else if (view === 'Learning') learning(panel, run);
    else if (view === 'Affect') affect(panel, run);
    else if (view === 'Execution') execution(panel, run);
    const note = el('footer', definition.limitations, 'rd-limits'); note.prepend(el('strong', 'Interpretation boundary · ')); panel.append(note);
    if (selected.some(r => r.evidenceBasis !== 'configured_models')) panel.append(el('p', 'Fixture and mixed-provider evidence describe apparatus behavior. They do not independently validate a cognitive theory.', 'rd-caution'));
  }
  function runControls(parent: HTMLElement, run: SimulationRun) {
    const panel = el('section', '', 'rd-run-controls'); panel.setAttribute('aria-label', `${run.title} run controls`); parent.insertBefore(panel, parent.querySelector(':scope > .rd-tabs'));
    const title = el('strong', run.title); const state = el('span', run.status, 'rd-run-state');
    const heading = el('div', '', 'rd-run-control-heading'); heading.append(title, state); panel.append(heading);
    const progress = el('progress'); progress.max = run.totalSteps || 1; progress.value = run.stages.length;
    progress.setAttribute('aria-label', 'Dream stage progress'); progress.setAttribute('aria-valuetext', `${run.stages.length} of ${run.totalSteps} stages completed`); panel.append(progress);
    const task = el('p', `${run.currentStep} · ${run.stages.length}/${run.totalSteps} stages completed`, 'rd-run-task'); task.setAttribute('role', 'status'); panel.append(task);
    const controls = el('div', '', 'rd-actions'); panel.append(controls);
    let busy = false;
    const toggle = run.dream && run.status !== 'completed' ? action(controls, run.status === 'running' ? 'Ⅱ Pause dream' : '▶ Resume dream', async () => {
      if (busy) return; busy = true; toggle!.disabled = true;
      try { await options.api(`simulation-tests/${run.id}/${run.status === 'running' ? 'pause' : 'resume'}`, 'POST', {}); await options.refresh(); }
      finally { busy = false; if (toggle!.isConnected) toggle!.disabled = false; }
    }, fail) : null;
    if (toggle) { toggle.setAttribute('aria-label', run.status === 'running' ? 'Pause dream' : 'Resume dream'); toggle.disabled = !!run.pauseRequested; }
    action(controls, 'Console', () => openConsole(run), fail);
    if (run.error) panel.append(el('p', run.error, 'rd-caution'));
    const note = el('p', run.pauseRequested ? 'Pause requested · finishing the current stage.' : run.status === 'paused' ? 'Paused · resume continues with the next experience.' : run.status === 'failed' && run.dream ? 'Resume retries the interrupted stage using preserved Agent state.' : run.status === 'running' && run.dream ? 'Pause takes effect when the current stage finishes.' : 'Progress counts completed scenario stages.', 'rd-caption'); panel.append(note);
    async function poll() {
      try {
        const snapshot = await options.api<DreamConsole>(`simulation-tests/${run.id}/console`);
        if (!panel.isConnected) return;
        state.textContent = snapshot.pauseRequested ? 'Pausing' : snapshot.status;
        progress.value = snapshot.completedStages;
        progress.setAttribute('aria-valuetext', `${snapshot.completedStages} of ${snapshot.totalStages} stages completed`);
        task.textContent = `${snapshot.currentStage} · ${snapshot.currentTask === snapshot.currentStage ? '' : snapshot.currentTask + ' · '}${snapshot.completedStages}/${snapshot.totalStages} stages completed`;
        if (snapshot.pauseRequested) { note.textContent = 'Pause requested · finishing the current stage.'; if (toggle) toggle.disabled = true; }
        if (snapshot.status === 'running') setTimeout(() => { if (panel.isConnected) void poll(); }, 1000);
      } catch (error) { if (panel.isConnected) { task.textContent = 'Run status unavailable. Refresh to retry.'; fail(error); } }
    }
    if (run.status === 'running') void poll();
  }

  function openConsole(run: SimulationRun) {
    const modal = el('dialog', '', 'rd-dialog rd-console-dialog'); modal.setAttribute('aria-label', 'Dream console');
    modal.append(el('h2', 'Dream console'), el('p', run.title, 'rd-caption'));
    const status = el('p', 'Loading saved events…'); status.setAttribute('role', 'status'); modal.append(status);
    const search = el('input'); search.type = 'search'; search.placeholder = 'Find a task, decision or error'; search.setAttribute('aria-label', 'Search dream console'); modal.append(search);
    const log = el('div', '', 'rd-console-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Dream event history'); log.setAttribute('aria-live', 'polite'); modal.append(log);
    let cursor = 0; let timer: ReturnType<typeof setTimeout> | undefined; let closed = false;
    const lines: DreamConsoleLine[] = [];
    const show = () => {
      const scrollTop = log.scrollTop;
      const nearBottom = log.scrollHeight - scrollTop - log.clientHeight < 50;
      log.replaceChildren();
      for (const line of lines.filter(line => `${line.stage ?? ''} ${line.task ?? ''} ${line.message}`.toLowerCase().includes(search.value.toLowerCase()))) {
        const row = el('div', '', `rd-console-line ${line.level}`); row.dataset.sequence = String(line.sequence);
        row.append(el('time', new Date(line.at).toLocaleTimeString()), el('span', line.stage ?? 'Run', 'rd-console-stage'), el('span', line.message)); log.append(row);
      }
      if (!log.childElementCount) log.append(el('p', lines.length ? 'No events match this search.' : 'No recorded events yet.'));
      log.scrollTop = nearBottom ? log.scrollHeight : scrollTop;
    };
    search.oninput = show;
    async function poll() {
      if (closed) return;
      if (!host.isConnected) { modal.close(); return; }
      try {
        const snapshot = await options.api<DreamConsole>(`simulation-tests/${run.id}/console/${cursor}`);
        if (closed) return;
        if (!host.isConnected) { modal.close(); return; }
        lines.push(...snapshot.lines); cursor = snapshot.cursor;
        status.textContent = `${snapshot.status}${snapshot.pauseRequested ? ' · pause requested' : ''} · ${snapshot.completedStages}/${snapshot.totalStages} stages · ${snapshot.currentTask}`;
        show();
        if (snapshot.error) status.textContent += ` · ${snapshot.error}`;
        if (snapshot.hasMore || snapshot.status === 'running' || snapshot.status === 'paused') timer = setTimeout(() => { void poll(); }, snapshot.hasMore ? 0 : 1000);
      } catch (error) { if (!closed) status.textContent = `Console unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    }
    action(modal, 'Close', () => modal.close(), fail);
    modal.addEventListener('close', () => { closed = true; if (timer) clearTimeout(timer); modal.remove(); }, { once: true });
    document.body.append(modal); modal.showModal(); void poll();
  }

  function runButtons(parent: HTMLElement, selected: SimulationRun[]) {
    const rows = el('div', '', 'rd-trials'); parent.append(rows); selected.slice().reverse().forEach((run, i) => { const b = action(rows, `Trial ${selected.length-i} · ${time(run.createdAt)}`, () => { runId = run.id; stageIndex = null; render(); }, fail); b.dataset.simulationRun = run.id; b.append(el('span', `${run.status} · ${run.stages.length}/${run.totalSteps} stages · ${pretty(run.evidenceBasis)}`, 'rd-caption')); });
  }
  function recurrence(parent: HTMLElement, selected: SimulationRun[]) {
    const area = section(parent, 'What recurs, what wavers?', 'Completed trials only · missing reviews stay missing · operational observations, human reviews and model judgments never merge.');
    const controls = el('div', '', 'rd-context'); area.append(controls);
    const target = el('div'); area.append(target); let request = 0;
    choose(controls, 'Criterion evidence channel', [['observer', 'Original observer'], ['human', 'Human criterion reviews'], ['model', 'Latest completed model assessment']], judgmentChannel, value => { judgmentChannel = value; void draw().catch(fail); });
    async function draw() {
      const current = ++request; target.replaceChildren(); let evidenceRuns = selected;
      if (judgmentChannel === 'human') {
        target.append(el('p', 'Loading immutable researcher reviews…', 'rd-caption'));
        let records: { run: SimulationRun; reviews: SimulationReview[] }[];
        try { records = await Promise.all(selected.map(async run => ({ run, ...(await options.api<{ reviews: SimulationReview[] }>(`simulation-tests/${run.id}/research`)) }))); }
        catch (error) { if (current === request && target.isConnected) target.replaceChildren(el('p', 'Human reviews unavailable. Original observer records remain accessible.')); throw error; }
        if (current !== request || !target.isConnected) return;
        evidenceRuns = records.map(({ run, reviews }) => ({ ...run, measures: run.specification.criteria.flatMap((criterion, i) => {
          const review = reviews.filter(r => r.criterionId === `criterion-${i+1}`).sort((a,b) => b.version-a.version)[0];
          return review ? [{ criterion, outcome: review.outcome, evidence: `${review.reviewer} · v${review.version}: ${review.rationale}`, assessmentKind: 'operational' as const }] : [];
        }) }));
      } else if (judgmentChannel === 'model') {
        evidenceRuns = selected.map(run => { const assessment = run.assessments?.filter(a => a.status === 'completed').sort((a,b) => b.version-a.version)[0];
          return { ...run, measures: assessment?.measures.map(m => ({ criterion: assessment.rubric.criteria.find(c => c.criterionId === m.criterionId)?.criterion ?? m.criterionId,
            outcome: m.outcome, evidence: `${assessment.model} · v${assessment.version}: ${m.explanation}`, assessmentKind: 'operational' as const })) ?? [] };
        });
      }
      if (current !== request || !target.isConnected) return; target.replaceChildren();
      const channelName = judgmentChannel === 'observer' ? 'original observer' : judgmentChannel === 'human' ? 'human review' : 'model judgment';
      target.append(el('p', judgmentChannel === 'observer' ? 'Semantic observer criteria are unresolved; observed operational measures do not establish the theory.' : `These are ${channelName} verdicts, not independently established facts. Repetitions and cited controls remain necessary.`, 'rd-caption'));
      // Include authored criteria absent from the entire review channel, without inventing a measurement.
      const criteria = [...new Set(selected.filter(r => r.status === 'completed').flatMap(r => r.specification.criteria))];
      const values = criterionRecurrence(evidenceRuns);
      for (const criterion of criteria) if (!values.some(v => v.criterion === criterion)) {
        const n = selected.filter(r => r.status === 'completed').length;
        values.push({ criterion, counts: { observed: 0, not_observed: 0, inconclusive: 0, missing: n }, n, measured: 0, pattern: 'Unavailable' });
      }
      if (!values.length) { empty(target, 'Criteria not measured yet', 'Running and failed trials do not enter completed-trial denominators.'); return; }
      legend(target, [['Observed', outcomeColor.observed!], ['Not observed', outcomeColor.not_observed!], ['Inconclusive', outcomeColor.inconclusive!], ['Missing', outcomeColor.missing!]]);
      for (const row of values) {
        const entry = el('div', '', 'rd-criterion'); const label = el('div'); label.append(el('span', row.criterion), el('small', `${row.pattern} · ${row.measured}/${row.n} trials measured`));
        const bar = el('button', '', 'rd-stacked'); bar.type = 'button'; const description = verdicts.map(v => `${pretty(v)} ${row.counts[v]}`).join(', ');
        bar.setAttribute('aria-label', `${row.criterion}: ${description}`); bar.title = `${description}. Completed denominator n=${row.n}; ${channelName}.`;
        for (const v of verdicts) if (row.counts[v]) { const segment = el('span', String(row.counts[v])); segment.style.flex = String(row.counts[v]); segment.style.background = outcomeColor[v]!; segment.title = `${pretty(v)}: ${row.counts[v]}/${row.n}`; if(v==='missing')segment.style.color='#536b76'; bar.append(segment); }
        bar.onclick = () => dialog(row.criterion, body => {
          for (const run of evidenceRuns.filter(r => r.status === 'completed')) {
            const m = run.measures.find(m => m.criterion === row.criterion); const item = section(body, `${time(run.createdAt)} · ${m?.assessmentKind === 'semantic' ? 'Unresolved semantic criterion' : pretty(m?.outcome ?? 'missing')}`, `${channelName} · ${pretty(run.evidenceBasis)} · ${run.providers.reasoning}`);
            item.append(el('p', m?.evidence ?? 'No judgment for this criterion in this run.')); action(item, 'Open source run', () => { body.closest('dialog')?.close(); goto('Conclusions', run.id); }, fail);
          }
        }); entry.append(label, bar); target.append(entry);
      }
    }
    void draw().catch(fail);
  }
  function overview(parent: HTMLElement, selected: SimulationRun[], definition: SimulationTestDefinition) {
    const activeRuns = selected.filter(run => ['running', 'paused'].includes(run.status));
    for (const run of activeRuns.length ? activeRuns : [selected.at(-1)!]) runControls(parent, run);
    const stats = el('div', '', 'rd-stats'); parent.append(stats);
    const completed = selected.filter(r => r.status === 'completed');
    for (const [value, label, note] of [[String(selected.length), 'Recorded trials', `${selected.filter(r => r.status === 'failed').length} failed · ${selected.filter(r => r.status === 'running').length} running · ${selected.filter(r => r.status === 'paused').length} paused`], [`${completed.length}/${selected.length}`, 'Execution completed', 'Completion is not theory support'], [String(completed.reduce((s, r) => s+r.stages.filter(x => x.phase === 'control').length, 0)), 'Control stages', 'Recorded stages across completed trials'], [String(criterionRecurrence(selected).filter(r => r.pattern === 'Varies across trials').length), 'Varying criteria', 'Original operational observations']]) {
      const n = el('div'); n.append(el('strong', value), el('span', label), el('small', note)); stats.append(n);
    }
    for (const run of selected.filter(item => item.dream)) {
      const dream = run.dream!; const panel = section(parent, 'Dream before and after', `${dream.sourceBefore.agent.name} · ${dream.keepChanges ? 'Changes kept in base Agent' : 'Dream leaves base unchanged; continuation preserved'} · ${run.status}`);
      const after = dream.after;
      const table = el('table'); table.setAttribute('aria-label', 'Dream state comparison');
      const head = el('tr'); for (const text of ['Recorded state', 'Before', 'After', 'New or revised records']) head.append(el('th', text)); table.append(head);
      for (const key of ['parts', 'memories', 'predictions', 'dispositions'] as const) {
        const before = dream.before[key]; const later = after?.[key];
        const changed = later?.filter(item => !before.some(old => old.id === item.id && old.version === item.version)).length;
        const row = el('tr'); for (const text of [key, String(before.length), later ? String(later.length) : 'Pending', changed === undefined ? 'Pending' : String(changed)]) row.append(el('td', text)); table.append(row);
      }
      panel.append(table, el('p', 'Version differences describe recorded development, not benefit. Failed dreams preserve partial changes. Original source and branch identities are linked explicitly.', 'rd-caption'));
      action(panel, 'Inspect base before dream', () => raw('Base Agent before dream', dream.sourceBefore), fail);
      action(panel, 'Inspect dream starting state', () => raw('Dream starting state', dream.before), fail);
      if (after) action(panel, 'Inspect Agent after dream', () => raw('Agent after dream', after), fail);
      action(panel, 'Inspect dream lineage', () => raw('Dream lineage', { sourceAgentId: run.sourceAgentId, agentId: run.agentId, identifierMap: dream.identifierMap }), fail);
    }

    if (selected.some(r => r.error)) { const errors = section(parent, 'Infrastructure failures', 'Excluded from completed-trial recurrence; not a failed cognitive hypothesis.'); selected.filter(r => r.error).forEach(r => errors.append(el('p', r.error!))); }

    const row = el('div', '', 'rd-two'); parent.append(row); const flow = section(row, 'From relevance to behavior', 'Recorded totals over completed stages · these are distinct processes, not a conversion funnel.');
    const totals = completed.flatMap(r => r.stages).map(stageMetrics); const nodes: [string, number | null][] = [['Active scopes', totals.reduce((s, m) => s+m.active, 0)], ['Proposals', totals.reduce((s, m) => s+m.proposals, 0)], ['Self choices', totals.some(m => m.choices === null) ? null : totals.reduce((s, m) => s+m.choices!, 0)], ['Executions', totals.some(m => m.executions === null) ? null : totals.reduce((s, m) => s+m.executions!, 0)]];
    flowDiagram(flow, nodes); const protocol = section(row, 'Protocol & controls', `${definition.steps.filter(s => s.phase === 'control').length} authored control stages · ${definition.steps.length} planned stages`);
    protocol.append(el('p', selected.some(run => run.dream) ? 'Dreams inherit developed Agent psychology; scenario seed dispositions are not installed. Fresh research tests retain their explicit starting conditions.' : `${definition.seeds.length} researcher-authored starting dispositions. Starting conditions are distinct from learned objects.`)); action(protocol, 'Inspect protocol', () => raw('Frozen experiment protocol', selected.length === 1 ? selected[0]!.specification : { catalog: definition, savedSpecifications: selected.map(run => ({ runId: run.id, specification: run.specification })) }), fail);
    const trials = section(parent, 'Recorded trials', 'Select a trial to open its overview; run sets preserve exact configuration matching.'); runButtons(trials, selected);
    if (runId) { const r = selected[0]!; const commands = section(parent, 'Run actions'); action(commands, 'Inspect test Agent', () => options.agent(r.agentId), fail); action(commands, 'Repeat or fork saved starting conditions', () => replay(r), fail); if (r.status === 'completed' && r.assessmentAvailable) action(commands, 'Assess saved run', () => assess(r), fail); }
  }
  function flowDiagram(parent: HTMLElement, nodes: [string, number | null][]) {
    const flow = el('div', '', 'rd-flow'); nodes.forEach(([name, value], i) => { if (i) flow.append(el('span', '→', 'rd-flow-arrow')); const item = el('div'); item.append(el('strong', value === null ? '—' : String(value)), el('span', name)); item.title = value === null ? 'Missing instrumentation; never assumed zero.' : `${name}: ${value} recorded occurrences`; flow.append(item); }); parent.append(flow);
  }
  function stagePage(parent: HTMLElement, run: SimulationRun, index: number) {
    const stage = run.stages[index]; if (!stage) { empty(parent, 'Stage unavailable', 'No saved snapshot exists for this selection.'); return; }
    const toolbar = el('div', '', 'rd-actions'); parent.append(toolbar); action(toolbar, '← Back to run overview', () => { stageIndex = null; render(); }, fail);
    choose(toolbar, 'Inspection stage', run.stages.map((s, i) => [String(i), `${i+1}. ${s.name}`]), String(index), value => stageDetail(run, Number(value)));
    const s = section(parent, `${index+1}. ${stage.name}`, `${stage.phase} · ${pretty(run.evidenceBasis)} · recorded snapshot`); s.append(el('p', stage.text ?? 'Offline or operational stage; no authored message.'));
    const m = stageMetrics(stage); flowDiagram(s, [['Scored scopes', m.scored], ['Active scopes', m.active], ['Proposals', m.proposals], ['Self choices', m.choices], ['Executions', m.executions]]);
    const grid = el('div', '', 'rd-two'); parent.append(grid);
    const thoughts = section(grid, 'Expressed interpretations', 'Attributed subjective products; never authoritative external facts.');
    for (const t of stage.thoughts) { const q = el('blockquote'); q.append(el('strong', t.name), el('p', t.interpretation ?? t.thought)); action(q, 'Inspect contribution', () => raw(`${t.name} · recorded contribution`, t), fail); thoughts.append(q); }
    if (!stage.thoughts.length) empty(thoughts, 'No expressed contributions', 'No thoughts were captured at this stage.');
    const decision = section(grid, 'Choice & outcome', 'Selected behavior, recorded execution and verification stay separate.');
    (stage.selfChoices ?? []).forEach(c => action(decision, 'Inspect recorded Self choice', () => raw('Recorded Self choice', c), fail)); (stage.executions ?? []).forEach(e => { const p = el('p', `${e.status} · ${e.operational?.verified === true ? 'verified' : 'not verified'}`); action(p, 'Inspect execution', () => raw('Recorded execution', e), fail); decision.append(p); });
    if (!stage.selfChoices?.length && !stage.executions?.length) decision.append(el('p', 'No choice or execution record in this snapshot.'));
    const sources = section(parent, 'Evidence access'); if (stage.cycleId) action(sources, 'Inspect source cognitive cycle', () => options.cycle(stage.cycleId!, run.agentId), fail); action(sources, 'Original stage JSON', () => raw(`${stage.name} · original stage JSON`, stage), fail);
    action(sources, 'Activation analytics', () => goto('Activation', run.id), fail); action(sources, 'Learning analytics', () => goto('Learning', run.id), fail);
    analysis(run, parent, a => { const projected = a.stages[index]; if (!projected) return; const timeline = section(parent, 'Recorded event sequence', 'Audit order only; chronology does not establish causal parents.');
      choose(timeline, 'Event lane', [['', 'All lanes'], ...['Environment','Activation','Parts','Cognition','Self','Executive','Learning'].map((s): [string,string] => [s,s])], lane, value => { lane = value; stagePageRedraw(); });
      const events = el('div', '', 'rd-event-lanes'); timeline.append(events); function stagePageRedraw() { events.replaceChildren(); for (const l of ['Environment','Activation','Parts','Cognition','Self','Executive','Learning'].filter(l => !lane || l === lane)) { const row = el('div', '', 'rd-event-row'); row.append(el('strong', l)); const marks = el('div'); row.append(marks); for (const e of projected!.trace.filter(e => e.lane === l)) { const b = action(marks, String(e.sequence), () => raw(`${pretty(e.type)} · original audit event`, e), fail); b.title = `${e.at} · ${e.type}`; b.setAttribute('aria-label', `${e.type}, sequence ${e.sequence}`); } if (!marks.children.length) marks.append(el('span', 'No recorded events', 'rd-caption')); events.append(row); } } stagePageRedraw();
    });
  }
  function activation(parent: HTMLElement, run: SimulationRun) {
    const chart = section(parent, 'Activation over stages', 'Final recorded round per scope · activation does not imply admission or authority.'); lineChart(chart, [run], ['scored', 'active', 'contributors'], stageDetail);
    analysis(run, parent, a => {
      const area = section(parent, 'Activation heatmap', 'Scores retain their provider scale. Color is normalized to this run’s observed maximum; dots indicate recorded threshold crossing. Blank means not evaluated.');
      const max = Math.max(1, ...a.activation.flatMap(r => r.cells.flatMap(c => c.rounds.map(r => r.score))));
      const grid = el('div', '', 'rd-heatmap'); grid.style.setProperty('--stages', String(Math.max(1,run.stages.length))); area.append(grid); grid.append(el('span','Disposition'));
      run.stages.forEach((s,i) => { const b = action(grid, String(i+1), () => stageDetail(run,i), fail); b.title = `${s.name} · ${s.phase}`; });
      a.activation.forEach(r => { grid.append(el('span', r.name, 'rd-scope-label')); r.cells.forEach(c => { const last = c.rounds.at(-1); const b = action(grid, last ? `${last.score.toFixed(1)}${last.active ? ' ●' : ''}` : '—', () => dialog(`${r.name} · stage ${c.stageIndex+1}`, body => { body.append(el('p',run.stages[c.stageIndex]!.name)); c.rounds.forEach((round,i) => body.append(el('p', `Round ${i+1} · score ${round.score} · threshold ${round.threshold ?? 'unavailable'} · ${round.active ? 'active' : 'inactive'}`))); action(body,'Inspect source stage', () => { body.closest('dialog')?.close(); stageDetail(run,c.stageIndex); }, fail); }), fail); b.style.background = last ? `rgba(37,123,120,${.08+.7*Math.max(0,last.score)/max})` : '#f1f3f4'; b.title = `${r.name}: ${last ? `score ${last.score}; threshold ${last.threshold ?? 'unknown'}; ${last.active ? 'active' : 'inactive'}` : 'not evaluated'}`; b.setAttribute('aria-label', `${r.name}, ${run.stages[c.stageIndex]!.name}, ${last ? `score ${last.score}, ${last.active ? 'active' : 'inactive'}` : 'not evaluated'}`); }); });
      if (!a.activation.length) empty(area, 'No scope evaluations', 'Fallback Part cognition can occur without disposition activation.');
      const network = section(parent, 'Coactivation relationships', 'Edge width counts stages with joint final activation. Association is descriptive, never causal.');
      const ids = [...new Set(a.coactivation.flatMap(e => [e.left,e.right]))]; if (!ids.length) { empty(network, 'No joint activation recorded', 'A network needs at least two coactive dispositions.'); return; }
      const {s,wrap} = plot(network,'Disposition coactivation network',720,330); const position = (id:string) => {const angle=2*Math.PI*ids.indexOf(id)/ids.length;return [360+Math.cos(angle)*230,160+Math.sin(angle)*105] as const;};
      a.coactivation.forEach(e => {const [x1,y1]=position(e.left),[x2,y2]=position(e.right);const line=svg('line',{x1,y1,x2,y2,stroke:'#a8bbb9','stroke-width':Math.min(9,1+e.stages.length)});s.append(line);tooltip(wrap,line,`${e.stages.length} coactivated stages`,()=>raw('Coactivation source stages',e));});
      ids.forEach(id=>{const [x,y]=position(id);const name=a.activation.find(r=>r.dispositionId===id)!.name;const c=svg('circle',{cx:x,cy:y,r:11,fill:colors[0]!});s.append(c,svg('text',{x,y:y+27,'text-anchor':'middle',class:'rd-axis'},name.length>32?name.slice(0,29)+'…':name));tooltip(wrap,c,name,()=>raw(name,a.coactivation.filter(e=>e.left===id||e.right===id)));});
    });
  }
  function predictions(parent: HTMLElement, run: SimulationRun) {
    analysis(run,parent,a=>{const s=section(parent,'Prediction lifetimes','Administrative closure and expectation assessment are separate. Conviction is not calibrated probability.');
      if(!a.predictions.length){empty(s,'No predictions recorded','No expectation, outcome accuracy or calibration is inferred.');return;}
      const {s:chart,wrap}=plot(s,'Prediction lifetimes by recorded stage',720,Math.max(170,a.predictions.length*48+55));
      const x=(i:number)=>240+i/Math.max(1,run.stages.length-1)*430;
      run.stages.forEach((_,i)=>chart.append(svg('text',{x:x(i),y:22,'text-anchor':'middle',class:'rd-axis'},String(i+1))));
      a.predictions.forEach((p,i)=>{const y=55+i*48;chart.append(svg('text',{x:8,y:y+4,class:'rd-axis'},p.prediction.expectation.slice(0,33)+(p.prediction.expectation.length>33?'…':'')));
        const origin=p.originStage??p.firstSeenStage;const end=p.prediction.status==='open'?run.stages.length-1:p.versions.at(-1)!.stageIndex;const color=p.expectationAssessment==='confirmed'?colors[0]!:p.expectationAssessment==='contradicted'?outcomeColor.not_observed!:colors[1]!;
        const line=svg('line',{x1:x(origin),y1:y,x2:x(end),y2:y,stroke:color,'stroke-width':5});chart.append(line);const mark=svg('circle',{cx:x(end),cy:y,r:7,fill:color});chart.append(mark);tooltip(wrap,mark,`${p.prediction.expectation}: ${p.administrativeStatus} · ${p.expectationAssessment} · conviction ${(p.prediction.confidence*100).toFixed(0)}% · delay ${p.resolutionDelayStages??'unavailable'} stages`,()=>dialog('Prediction evidence',body=>{body.append(el('h3',p.prediction.expectation),el('p',`${p.ownerName} · ${p.administrativeStatus} · ${p.expectationAssessment}`),el('p',p.prediction.evaluation?.interpretation??'No later assessment recorded.'),el('p',p.prediction.evaluation?.evidence.join(' · ')??'No decisive evidence.'));if(p.originStage!==null)action(body,'Inspect origin stage',()=>{body.closest('dialog')?.close();stageDetail(run,p.originStage!);},fail);action(body,'Exact prediction history',()=>raw('Prediction versions and checks',p),fail);}));});
      legend(s,[['Confirmed',colors[0]!],['Contradicted',outcomeColor.not_observed!],['Unassessed / other',colors[1]!]]);
    });
  }
  function learning(parent: HTMLElement, run: SimulationRun) {
    const s=section(parent,'Memory and development trajectories','Unique snapshot objects and recorded recall; counts cannot establish learning effectiveness.');lineChart(s,[run],['memories','recalls','predictions'],stageDetail);
    analysis(run,parent,a=>{const lifecycle=section(parent,'Part lifecycle','Temporary perspectives retain origins and retirement evidence. Select a lifespan to inspect contributions.');
      const {s:chart,wrap}=plot(lifecycle,'Part lifespans',720,Math.max(160,a.parts.length*35+40));const x=(i:number)=>230+i/Math.max(1,run.stages.length-1)*440;
      a.parts.forEach((p,i)=>{const y=30+i*35;const origin=Math.max(0,p.originStage);const retirement=run.stages.findIndex(s=>s.cycleId===p.retirement?.cycleId);const end=retirement<0?run.stages.length-1:retirement;chart.append(svg('text',{x:6,y:y+4,class:'rd-axis'},p.part.name.slice(0,32)));const path=svg('line',{x1:x(origin),y1:y,x2:x(end),y2:y,stroke:colors[2]!,'stroke-width':6});const dot=svg('circle',{cx:x(origin),cy:y,r:6,fill:colors[2]!});chart.append(path,dot);tooltip(wrap,path,`${p.part.name}: first source ${p.originStage<0?'unavailable':origin+1}, ${p.contributions.length} contributions; ${p.retirement?.reason??'no recorded retirement'}`,()=>raw(`${p.part.name} · lifecycle and contributions`,p));tooltip(wrap,dot,p.part.name,()=>raw('Part lifecycle',p));});
      const memories=section(parent,'Memory reuse','Bars count recorded retrievals per unique memory, not proof of usefulness.');const items=a.memories.slice().sort((a,b)=>b.retrievals.length-a.retrievals.length); const max=Math.max(1,...items.map(m=>m.retrievals.length));
      for(const m of items){const row=el('div','', 'rd-reuse');const b=action(row,m.memory.gist,()=>dialog('Subjective memory evidence',body=>{body.append(el('h3',m.memory.gist),el('p',m.memory.content),el('p',m.effectiveness));for(const r of m.retrievals)action(body,`Inspect recall · ${run.stages[r.stageIndex]!.name}`,()=>{body.closest('dialog')?.close();stageDetail(run,r.stageIndex);},fail);action(body,'Original memory and versions',()=>raw('Memory record',m),fail);}),fail);b.title=m.memory.gist;const bar=el('span','', 'rd-reuse-track');const fill=el('i');fill.style.width=`${m.retrievals.length/max*100}%`;bar.append(fill);row.append(bar,el('strong',String(m.retrievals.length)));memories.append(row);}if(!items.length)empty(memories,'No recorded memories','Missing memory evidence remains explicit.');
      const development=section(parent,'Disposition changes by stage','Added objects can be researcher-authored starting conditions; revisions are not automatically improvement.');
      flowDiagram(development,a.stages.map(s=>[`${s.index+1}. ${s.name}`,s.changes.dispositions.length]));action(development,'Inspect exact before/after changes',()=>raw('Disposition changes',a.stages.map(s=>({stage:s.name,changes:s.changes.dispositions}))),fail);
    });
  }
  function affect(parent: HTMLElement, run: SimulationRun) {
    const s=section(parent,'Affect & world-blind Self','Affect is expressed language, not a numerical intensity scale. Proposals, selection and experienced affect remain distinct.');
    let any=false;for(const [i,stage]of run.stages.entries()){const offers=stage.affectProposals?.reduce((sum,record)=>sum+record.proposals.length,0)??0,choices=stage.affectChoices?.length??0,revisions=stage.focusedRevisions?.length??0;if(!offers&&!choices&&!revisions&&!stage.transitions?.length)continue;any=true;
      const item=el('div','', 'rd-affect-stage');item.append(el('span',`${i+1}`, 'rd-stage-number'),el('h4',stage.name));flowDiagram(item,[['Attributed offers',offers],['Self choices',choices],['Focused revisions',revisions],['Experienced transitions',stage.transitions?.length??0]]); const language = el('div', '', 'rd-affect-language');
      for (const transition of stage.transitions ?? []) { const phases: [string, typeof transition.before][] = [['Before', transition.before], ['Chosen', transition.chosen], ['Resulting', transition.resulting]];
        for (const [phase, stances] of phases) { const column = el('div'); column.append(el('small', phase)); if (!stances.length) column.append(el('span', 'No expressed stance')); for (const stance of stances) { const text = el('p', stance.affect || 'Affect not expressed'); text.title = `${stance.name}: ${stance.interpretation}`; column.append(text); } language.append(column); }
      }
      for (const decision of stage.affectDecisions ?? []) { const column = el('div'); column.append(el('small', `Focus · ${decision.boundary}`), el('p', decision.resultingFocus?.proposals.map(p=>p.orientation).join(' + ') ?? 'No voluntary focus')); column.title = decision.selection.reason; language.append(column); }
      item.append(language); action(item,'Inspect affect evidence',()=>dialog('Affect stage evidence',body=>{body.append(el('p', 'These are attributed language products. No valence or intensity has been inferred.'));action(body,'Selection and revision records',()=>raw('Affect selection evidence',{proposals:stage.affectProposals,inputs:stage.affectInputs,choices:stage.affectChoices,decisions:stage.affectDecisions,revisions:stage.focusedRevisions,transitions:stage.transitions}),fail);action(body,'Inspect source stage',()=>{body.closest('dialog')?.close();stageDetail(run,i);},fail);}),fail);s.append(item);}
    if(!any)empty(s,'No affect instrumentation in this run','Select an affect experiment or inspect stage contributions. Absence of instrumentation is not neutral affect.');
  }
  function cognitionAcrossExperience(parent: HTMLElement, selected: SimulationRun[]) {
    const completed = selected.filter(run => run.status === 'completed');
    const chart = section(parent, 'Cognition across experience', `${groupId ? 'Matched configuration' : 'All selected configurations; differences can confound comparisons'} · means and observed ranges by stage`); lineChart(chart, completed.length ? completed : selected, ['active', 'contributors', 'recalls'], stageDetail);
  }
  function execution(parent: HTMLElement, run: SimulationRun) {
    const s=section(parent,'Selection, enactment & verification','Selected behavior does not imply successful execution. Unreported operations remain missing.');lineChart(s,[run],['choices','executions','verified'],stageDetail);
    analysis(run,parent,a=>{const operations=section(parent,'Provider operation duration','Recorded elapsed milliseconds · adapter returns and runtime admission are distinct.');
      const valid=a.providerOperations.filter(o=>o.elapsedMs!==null);if(!valid.length)empty(operations,'Elapsed time unavailable','This run has no recorded provider timing. Cost and missing usage are not estimated.');
      const max=Math.max(1,...valid.map(o=>o.elapsedMs!));for(const o of valid){const row=el('div','', 'rd-reuse');action(row,`${pretty(o.task)} · ${o.phase}`,()=>raw('Provider operation evidence',o),fail);const track=el('span','', 'rd-reuse-track');const fill=el('i');fill.style.width=`${o.elapsedMs!/max*100}%`;if(o.phase==='failed')fill.style.background=outcomeColor.not_observed!;track.append(fill);row.append(track,el('span',`${o.elapsedMs!.toFixed(0)} ms`));operations.append(row);}
      const error=section(parent,'Infrastructure & evidence gaps',`${a.failedAttempts.length} failed cognitive attempts · ${a.providerOperations.filter(o=>o.phase==='failed').length} failed provider operations`);for(const gap of a.gaps)error.append(el('p',gap));for(const attempt of a.failedAttempts){error.append(el('p',attempt.cycle.error??'Failure without text'));action(error,'Inspect failed source cycle',()=>options.cycle(attempt.cycle.id,run.agentId),fail);}
    });
  }
  function conclusions(parent: HTMLElement, selected: SimulationRun[]) {
    recurrence(parent,selected);const assessments=section(parent,'Model judgments','Automated rubric assessments remain separate from original observer measures and human reviews.');
    let any=false;for(const run of selected)for(const assessment of run.assessments??[]){any=true;const area=section(assessments,`${assessment.model} · assessment v${assessment.version}`,`${assessment.status} · ${pretty(run.evidenceBasis)}`);if(assessment.error)area.append(el('p',assessment.error));for(const m of assessment.measures){const criterion=assessment.rubric.criteria.find(c=>c.criterionId===m.criterionId)?.criterion??m.criterionId;const row=el('div','', 'rd-model-verdict');row.append(el('span',pretty(m.outcome),'rd-badge'),el('span',criterion));action(row,'Inspect cited judgment',()=>raw('Model assessment criterion',m),fail);area.append(row);}action(area,'Exact rubric and frozen evidence',()=>raw('Assessment original records',assessment),fail);}
    if(!any)empty(assessments,'No model assessment recorded','This is not a failed hypothesis. Fixture runs do not invoke an evaluator.');
    if(!runId){const s=section(parent,'Human review & findings','Select a run to inspect and append cited human review. Reviews never overwrite original measurements.');runButtons(s,selected);}else {const r=selected[0]!; const review=section(parent,'Human review workspace');void renderResearch(review,r,options.api,options.cycle,fail).catch(fail);}
  }
  function compare(parent: HTMLElement, selected: SimulationRun[]) {
    const s=section(parent,'Compare recorded runs','Exact phase, stage name and occurrence alignment. Configuration differences are confounds.');if(selected.length<2){empty(s,'A comparison needs two saved trials','Repeat the same configuration or launch a deliberate fork. No synthetic comparison is created.');return;}
    const controls=el('div','', 'rd-context');s.append(controls);let left=selected[0]!.id,right=selected.at(-1)!.id,comparisonMode='runs',leftStage='0',rightStage='0';
    choose(controls,'Baseline run',selected.map(r=>[r.id,`${time(r.createdAt)} · ${r.id.slice(-6)}`]),left,v=>{left=v;});choose(controls,'Comparison run',selected.map(r=>[r.id,`${time(r.createdAt)} · ${r.id.slice(-6)}`]),right,v=>{right=v;});
    choose(controls,'Comparison mode',[['runs','Aligned recorded runs'],['stages','Explicit baseline / follow-up stages']],comparisonMode,v=>{comparisonMode=v;});
    const stageControls=el('div','', 'rd-context');s.append(stageControls);
    function stageSelectors(){stageControls.replaceChildren();const l=selected.find(r=>r.id===left)!,r=selected.find(r=>r.id===right)!;leftStage='0';rightStage=String(Math.max(0,r.stages.length-1));choose(stageControls,'Baseline stage',l.stages.map((s,i)=>[String(i),s.name]),leftStage,v=>{leftStage=v;});choose(stageControls,'Follow-up stage',r.stages.map((s,i)=>[String(i),s.name]),rightStage,v=>{rightStage=v;});}stageSelectors();
    controls.querySelectorAll('select').forEach(select=>{if(select.getAttribute('aria-label')!=='Comparison mode')select.addEventListener('change',stageSelectors);});
    const output=el('div');s.append(output);let request=0;
    action(controls,'Compare recorded runs',async()=>{const current=++request;output.replaceChildren(el('p','Aligning recorded stages…'));try{const result=await options.api<SimulationComparison>(comparisonMode==='stages'?'simulation-tests/compare-stages':'simulation-tests/compare','POST',{leftRunId:left,rightRunId:right,...(comparisonMode==='stages'?{leftIndex:Number(leftStage),rightIndex:Number(rightStage)}:{})});if(!output.isConnected||current!==request)return;output.replaceChildren();output.append(el('p',result.configurationDifferences.length?`Configuration differs: ${result.configurationDifferences.map(pretty).join(' · ')}`:'Recorded configurations match. This does not establish a causal effect.','rd-caution'));
      const metric=section(output,'Active scopes · baseline vs comparison','Solid baseline and dashed comparison; unmatched stages remain gaps.');const max=Math.max(1,...result.stages.flatMap(s=>[s.left?.measures.activeScopes??0,s.right?.measures.activeScopes??0]));const{ s:chart,wrap}=plot(metric,'Aligned active scope comparison');const x=(i:number)=>48+i/Math.max(1,result.stages.length-1)*630,y=(v:number)=>196-v/max*150;
      for(let i=0;i<=4;i++){const value=max*i/4;chart.append(svg('line',{x1:48,y1:y(value),x2:680,y2:y(value),class:'rd-grid'}),svg('text',{x:36,y:y(value)+4,'text-anchor':'end',class:'rd-axis'},String(Number(value.toFixed(1)))));}
      for(const [side,color]of [['left',colors[0]!],['right',colors[2]!]]as const){let segments:string[]=[];const flush=()=>{if(segments.length)chart.append(svg('polyline',{points:segments.join(' '),fill:'none',stroke:color,'stroke-width':2.5,'stroke-dasharray':side==='right'?'6 4':'none'}));segments=[];};result.stages.forEach((stage,i)=>{const value=stage[side]?.measures.activeScopes;if(value===undefined){flush();return;}segments.push(`${x(i)},${y(value)}`);const c=svg('circle',{cx:x(i),cy:y(value),r:5,fill:color});chart.append(c);tooltip(wrap,c,`${stage.name}: ${side==='left'?'baseline':'comparison'} active scopes ${value}`,()=>raw('Aligned stage evidence',stage));});flush();}result.stages.forEach((_,i)=>chart.append(svg('text',{x:x(i),y:224,'text-anchor':'middle',class:'rd-axis'},`${i+1}`)));legend(metric,[['Baseline',colors[0]!],['Comparison',colors[2]!]]);
      for(const limitation of result.limitations)output.append(el('p',limitation,'rd-caption'));action(output,'Inspect exact aligned values',()=>raw('Recorded run comparison',result),fail);
    }catch(error){if(output.isConnected&&current===request){output.replaceChildren(el('p','Comparison failed. Try again after checking diagnostics.'));fail(error);}}},fail);
  }
  function records(parent: HTMLElement, run: SimulationRun) {
    const s=section(parent,'Search recorded evidence','Original records open in a separate dialog. Browsing never changes Agent psychology.');const search=el('input');search.type='search';search.placeholder='Search names, thoughts, expectations or JSON values';search.setAttribute('aria-label','Search recorded evidence');s.append(search);
    const filters=el('div','', 'rd-context');s.append(filters);let type='';choose(filters,'Record type',[['','All types'],['Stage','Stages'],['Part','Parts'],['Memory','Memories'],['Prediction','Predictions'],['Disposition','Dispositions']],type,v=>{type=v;draw();});
    const records:{type:string;label:string;value:unknown;stage:number}[]=[];run.stages.forEach((stage,i)=>{records.push({type:'Stage',label:stage.name,value:stage,stage:i});for(const [type,objects]of [['Part',stage.parts],['Memory',stage.memories],['Prediction',stage.predictions],['Disposition',stage.dispositions]]as const)objects.forEach(obj=>{records.push({type,label:'name'in obj?obj.name:'gist'in obj?obj.gist:obj.expectation,value:obj,stage:i});});});
    const list=el('div','', 'rd-records');const status=el('p','', 'rd-caption');status.setAttribute('role','status');s.append(status,list);let limit=40;const more=action(s,'Show more records',()=>{limit+=40;draw();},fail);
    function draw(){list.replaceChildren();const q=search.value.toLowerCase();const filtered=records.filter(r=>(!type||r.type===type)&&(!q||JSON.stringify(r.value).toLowerCase().includes(q)));status.textContent=`${filtered.length} matching records · showing ${Math.min(limit,filtered.length)}`;for(const r of filtered.slice(0,limit)){const row=el('div');row.append(el('span',`${r.type} · stage ${r.stage+1}`,'rd-caption'));action(row,r.label,()=>raw(`${r.type} · ${r.label}`,r.value),fail);action(row,'Open source stage',()=>stageDetail(run,r.stage),fail);list.append(row);}more.hidden=limit>=filtered.length;if(!filtered.length)empty(list,'No matching records','Try another record type or search term.');}search.oninput=()=>{limit=40;draw();};draw();action(s,'Original run configuration',()=>raw('Frozen run configuration',{specification:run.specification,startingConfiguration:run.startingConfiguration,providers:run.providers,prompts:run.prompts,lineage:run.lineage}),fail);
  }
  function replay(run: SimulationRun) {
    dialog('Repeat or fork saved starting conditions',body=>{body.append(el('p','Creates a fresh isolated Agent. Developed psychology is not copied; automatic assessment is disabled.'));action(body,'Inspect frozen starting configuration',()=>raw('Frozen starting configuration',{specification:run.specification,startingConfiguration:run.startingConfiguration,providers:run.providers,prompts:run.prompts}),fail);
      const label=el('label','Launch reason');const reason=el('input');reason.required=true;label.append(reason);body.append(label);let key='memorySearchEnabled',value='false';choose(body,'Fork activation setting',[['memorySearchEnabled','Memory search'],['vectorSearchEnabled','Vector filtering'],['primitivesFirst','Primitive consideration'],['reevaluateAfterDeliberation','Reevaluate after deliberation']],key,v=>{key=v;});choose(body,'Fork setting value',[['true','Enabled'],['false','Disabled']],value,v=>{value=v;});const status=el('p');status.setAttribute('role','status');body.append(status);
      const launch=async(fork:boolean)=>{if(!reason.value.trim()){reason.reportValidity();return;}const r=await options.api<SimulationRun>(`simulation-tests/${run.id}/${fork?'fork':'rerun'}`,'POST',{reason:reason.value,...(fork?{activationChanges:{[key]:value==='true'}}:{})});status.textContent=`Started ${r.id} on a fresh Agent`;await options.refresh();};
      const a=action(body,'Rerun frozen configuration',()=>launch(false),fail),b=action(body,'Launch configuration fork',()=>launch(true),fail);a.disabled=b.disabled=!!run.dream||run.status==='running'||!run.startingConfiguration||!run.providerRouting;if(a.disabled)body.append(el('p',run.dream?'Launch a new dream from the chosen developed Agent base. Fresh-test reruns do not reconstruct dream psychology.':'Requires a terminal run with frozen starting configuration and provider routing.'));
    });
  }
  function assess(run: SimulationRun) {dialog('Assess saved run',body=>{body.append(el('p','Evaluator calls may incur provider costs and require that provider’s configured key. Machine judgments remain distinct from human review.'));let model='';choose(body,'Evaluator model',[['','Same as source Agent'],['gpt-4.1-mini','GPT-4.1 mini'],['gpt-4.1-nano','GPT-4.1 nano'],['gpt-5-nano','GPT-5 nano'],['grok-4.3','Grok 4.3']],model,v=>{model=v;});const b=action(body,'Start model assessment',async()=>{b.disabled=true;try{await options.api(`simulation-tests/${run.id}/assess`,'POST',{evaluatorAgentId:run.sourceAgentId,...(model?{model}:{})});await options.refresh();body.closest('dialog')?.close();}finally{b.disabled=false;}},fail);b.disabled=Boolean(run.assessments?.some(a=>a.status==='running'));});}
  render();
  return { element: host, selectExperiment: (id: string) => { testId = id; groupId = ''; runId = ''; stageIndex = null; view = 'Overview'; render(); }, update: async (nextDefinitions: SimulationTestDefinition[], nextRuns: SimulationRun[]) => {
    const current=++updateEpoch; const nextGroups=nextRuns.length?await options.api<Group[]>('simulation-tests/aggregate','POST',{runIds:nextRuns.map(r=>r.id)}):[];
    if(current!==updateEpoch||!host.isConnected)return;definitions=nextDefinitions;runs=nextRuns;groups=nextGroups;
    if(!definitions.some(d=>d.id===testId))testId=nextRuns.at(-1)?.testId??definitions[0]?.id??'';if(groupId&&!groups.some(g=>g.configurationId===groupId))groupId='';if(runId&&!runs.some(r=>r.id===runId))runId='';render();
  } };
}
