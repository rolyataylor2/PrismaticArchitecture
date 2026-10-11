import type { AffectAnalysis, AffectAnalysisFilter } from '../../../packages/sdk/src/affect-analysis.js';
import type { AffectFeedback } from '../../../packages/core/src/affect-domain.js';

type Api = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const element = document.createElement(tag); element.textContent = text; return element;
};
const date = (at: string) => new Date(at).toLocaleString();
const percent = (value: number | null) => value === null ? 'Insufficient evidence' : `${(value * 100).toFixed(1)}%`;
function button(parent: HTMLElement, title: string, run: () => void) {
  const control = node('button', title); control.type = 'button'; control.onclick = run; parent.append(control); return control;
}
function details(parent: HTMLElement, label: string) {
  const element = node('details'); element.append(node('summary', label)); parent.append(element); return element;
}
function evidence(parent: HTMLElement, label: string, value: unknown) {
  details(parent, label).append(node('pre', JSON.stringify(value, null, 2)));
}
function statistics(parent: HTMLElement, lifetime: AffectFeedback, window: AffectFeedback) {
  const table = node('table'); table.setAttribute('aria-label', 'Period prediction statistics');
  const header = node('tr'); for (const label of ['Measure', 'Lifetime period', 'Window origins']) header.append(node('th', label));
  const head = node('thead'); head.append(header); table.append(head); const body = node('tbody');
  const keys = ['completedCycles', 'baselinePredictions', 'originatedPredictions', 'supported', 'contradicted', 'partlySupported',
    'ambiguous', 'selfInfluenced', 'externalCircumstances', 'interrupted', 'notTestable', 'unresolved', 'untested', 'abandoned', 'expired', 'invalidated'] as const;
  const titles: Record<typeof keys[number], string> = { completedCycles: 'Exposed cycles', baselinePredictions: 'Predictions open at entry',
    originatedPredictions: 'Predictions originating during use', supported: 'Supported', contradicted: 'Contradicted', partlySupported: 'Partly supported',
    ambiguous: 'Ambiguous', selfInfluenced: 'Self influenced', externalCircumstances: 'External circumstances', interrupted: 'Interrupted', notTestable: 'Not testable', unresolved: 'Unresolved', untested: 'Untested',
    abandoned: 'Abandoned', expired: 'Expired', invalidated: 'Invalidated' };
  for (const key of keys) { const row = node('tr'); row.append(node('th', titles[key]), node('td', String(lifetime[key])), node('td', String(window[key]))); body.append(row); }
  for (const [title, key] of [['Resolved fraction', 'resolvedFraction'], ['Supported among decisive outcomes', 'supportedFractionAmongDecisive']] as const) {
    const row = node('tr'); row.append(node('th', title), node('td', percent(lifetime[key])), node('td', percent(window[key]))); body.append(row);
  }
  table.append(body); const scroll = node('div'); scroll.className = 'affect-table-scroll'; scroll.append(table); parent.append(scroll);
  parent.append(node('p', 'Learning progress: unavailable. Practical value: requires Part interpretation.'));
}

/** UI renders researcher projections; no cognitive state is owned here. */
export async function affectAnalysisPage(root: HTMLElement, agentId: string, api: Api,
  cycle: (cycleId: string) => void, fail: (error: unknown) => void) {
  const holder = node('section'); holder.className = 'affect-analysis'; root.append(holder);
  holder.append(node('p', 'Loading affect history…'));
  let report = await api<AffectAnalysis>(`agents/${agentId}/affect-analysis`);
  if (!holder.isConnected) return;
  holder.replaceChildren();
  const controls = node('form'); controls.className = 'affect-filters'; controls.setAttribute('aria-label', 'Affect timeline filters'); holder.append(controls);
  const input = (title: string) => { const label = node('label', title); const value = node('input'); value.type = 'datetime-local'; label.append(value); controls.append(label); return value; };
  const from = input('From'); const to = input('To');
  const threadLabel = node('label', 'Thread'); const thread = node('select'); threadLabel.append(thread); controls.append(threadLabel);
  thread.append(new Option('All threads', 'all'));
  for (const id of report.threads) thread.append(new Option(id ?? 'Unthreaded', id === null ? 'null' : `thread:${id}`));
  const partLabel = node('label', 'Contributing Part'); const part = node('select'); partLabel.append(part); controls.append(partLabel);
  part.append(new Option('All Parts', ''));
  const contributors = new Map(report.periods.flatMap(period => period.parts.map(item => [item.partId, item.name] as const)));
  for (const item of report.timeline) if (item.type === 'part.affect_proposals' && 'proposals' in item.detail)
    for (const offer of item.detail.proposals) contributors.set(offer.partId, offer.name);
  for (const [id, name] of contributors) part.append(new Option(name, id));
  const apply = node('button', 'Apply filters'); apply.type = 'submit'; controls.append(apply);
  let request = 0;
  const result = node('div'); holder.append(result);
  const refresh = async (filter: AffectAnalysisFilter) => {
    const current = ++request; apply.disabled = true;
    try { const next = await api<AffectAnalysis>(`agents/${agentId}/affect-analysis`, 'POST', filter);
      if (!holder.isConnected || current !== request) return; report = next; render();
    } catch (error) { if (holder.isConnected && current === request) fail(error); }
    finally { if (current === request) apply.disabled = false; }
  };
  controls.onsubmit = event => { event.preventDefault();
    if (from.value && to.value && new Date(from.value) > new Date(to.value)) { fail(new Error('Start must precede end')); return; }
    void refresh({ ...(from.value ? { from: new Date(from.value).toISOString() } : {}), ...(to.value ? { to: new Date(to.value).toISOString() } : {}),
      ...(thread.value === 'all' ? {} : { threadId: thread.value === 'null' ? null : thread.value.slice(7) }), ...(part.value ? { partId: part.value } : {}) });
  };
  button(controls, 'Lifetime', () => { from.value = ''; to.value = ''; thread.value = 'all'; part.value = ''; void refresh({}); });
  button(controls, 'Last 7 days', () => { const now = new Date(); const weekAgo = new Date(now.getTime() - 7 * 86400000); from.value = new Date(weekAgo.getTime() - weekAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 16); to.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    void refresh({ from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: now.toISOString(), ...(thread.value === 'all' ? {} : { threadId: thread.value === 'null' ? null : thread.value.slice(7) }), ...(part.value ? { partId: part.value } : {}) }); });
  function inspectPeriod(period: AffectAnalysis['periods'][number], parent: HTMLElement) {
    const panel = details(parent, `${period.focus.proposals.map(offer => offer.orientation).join(' + ')} · ${date(period.startAt)}`);
    panel.id = `affect-period-${period.id}`;
    panel.append(node('p', `Thread: ${period.focus.threadId ?? 'Unthreaded'} · ${period.end ? `${period.end.kind} at ${date(period.end.at)}` : 'No ending boundary recorded'} · Renewals: ${period.renewals}`));
    for (const offer of period.focus.proposals) panel.append(node('h4', `${offer.name}: ${offer.orientation}`), node('p', `Motivation: ${offer.motivation}`),
      node('p', `Reason: ${offer.reason}`), node('p', `Expected value: ${offer.expectedValue}`));
    panel.append(node('p', `Self selection reason: ${period.focus.reason}`));
    statistics(panel, period.feedback, period.windowFeedback);
    const sources = details(panel, 'Contributing perspectives and dispositions');
    for (const source of period.parts) sources.append(node('p', `${source.name} (${source.partId}) · Dispositions: ${source.dispositionIds.join(', ') || 'No bound disposition'}`));
    const decisions = details(panel, 'Selections and period boundaries');
    for (const decision of period.decisions) { const row = node('div'); row.append(node('p', `${decision.boundary}: ${decision.selection.reason}`));
      button(row, 'Inspect decision cycle', () => cycle(decision.cycleId)); decisions.append(row); }
    const revisions = details(panel, 'How bids changed');
    if (!period.revisions.length) revisions.append(node('p', 'No focused bid revision recorded.'));
    for (const revision of period.revisions) { const row = node('article'); row.append(node('p', `${revision.bid_disposition}: ${revision.response}`),
      node('p', `Before: ${revision.previousBid?.action?.text ?? revision.previousBid?.argument ?? 'No bid'}`),
      node('p', `After: ${revision.resultingBid?.action?.text ?? revision.resultingBid?.argument ?? 'No bid'}`));
      button(row, 'Inspect revision cycle', () => cycle(revision.cycleId)); evidence(row, 'Bid lineage', revision); revisions.append(row); }
    const behavior = details(panel, 'Actual Self selections');
    for (const choice of period.behavior) { const row = node('div'); row.append(node('p', `${choice.bids.map(bid => bid.action?.text ?? bid.argument).join(' · ') || choice.choice}: ${choice.explanation}`));
      button(row, 'Inspect selected behavior', () => cycle(choice.cycleId)); behavior.append(row); }
    const evaluation = details(panel, 'Baseline and focused evaluations');
    for (const item of period.evaluations) {
      evidence(evaluation, `Cycle ${item.cycleId}: non-enacting baseline and actual choices`, item);
      button(evaluation, 'Inspect evaluation cycle', () => cycle(item.cycleId));
    }
    const predictions = details(panel, 'Prediction evidence and versions');
    if (!period.predictionEvidence.length) predictions.append(node('p', 'No prediction evidence in this period.'));
    for (const item of period.predictionEvidence) { const row = details(predictions, `${item.cohort}: ${item.prediction.expectation}`);
      row.append(node('p', `${item.prediction.status} · ${item.prediction.evaluation?.assessment ?? 'No assessment'} · ${item.origin?.stage ?? 'Open at entry'}`));
      button(row, 'Inspect prediction origin', () => cycle(item.prediction.createdCycle)); evidence(row, 'Preserved prediction versions', item.versions); }
  }
  function render() {
    result.replaceChildren();
    result.append(node('p', `Lifetime: ${report.lifetime.from ? date(report.lifetime.from) : 'No cycles'} — ${report.lifetime.to ? date(report.lifetime.to) : 'No cycles'}`),
      node('p', `${report.totals.periods} periods · ${report.totals.completedCycles} completed cycles in view · ${report.totals.revisions} focused revisions · ${report.totals.failedCycles} failed attempts`));
    result.append(node('h3', 'Affect periods'));
    if (!report.periods.length) result.append(node('p', 'No selected affect periods in this view. Experienced affect may still appear in the timeline.'));
    const timeline = node('div'); timeline.className = 'affect-period-chart'; timeline.setAttribute('aria-label', 'Selected affect periods over time'); result.append(timeline);
    const min = Date.parse(report.filter.from ?? report.lifetime.from ?? new Date().toISOString());
    const max = Math.max(min + 1, Date.parse(report.filter.to ?? report.lifetime.to ?? new Date().toISOString()));
    for (const period of report.periods) { const row = node('div'); row.className = 'affect-period-row';
      const label = node('span', period.focus.proposals.map(offer => offer.orientation).join(' + ')); row.append(label);
      const track = node('div'); track.className = 'affect-period-track'; const bar = button(track, `${date(period.startAt)} — ${period.end ? date(period.end.at) : 'No ending boundary recorded'}`, () => {
        const detail = document.getElementById(`affect-period-${period.id}`) as HTMLDetailsElement | null; if (detail) { detail.open = true; detail.scrollIntoView({ block: 'nearest' }); }
      });
      const left = Math.max(0, Math.min(100, (Date.parse(period.startAt) - min) / (max - min) * 100));
      const right = Math.max(left, Math.min(100, (Date.parse(period.end?.at ?? report.lifetime.to ?? period.startAt) - min) / (max - min) * 100));
      bar.style.marginLeft = `${left}%`; bar.style.width = `${Math.max(1, right - left)}%`; bar.title = `${label.textContent}: ${bar.textContent}`; row.append(track); timeline.append(row);
    }
    for (const period of report.periods) inspectPeriod(period, result);
    result.append(node('h3', 'Experienced affect and decisions'));
    if (!report.timeline.length) result.append(node('p', 'No affect records in this view.'));
    for (const item of report.timeline) {
      const row = details(result, `${date(item.at)} · ${item.type.replaceAll('.', ' ')}${item.completed ? '' : ' · Uncommitted attempt'}`);
      row.append(node('p', `Cycle ${item.sequence} · Thread: ${item.threadId ?? 'Unthreaded'}`));
      if (item.type === 'self.experienced_transition' && 'before' in item.detail) {
        for (const [label, stances] of [['Before choice', item.detail.before], ['Chosen', item.detail.chosen], ['Resulting', item.detail.resulting]] as const) {
          row.append(node('h4', label)); for (const stance of stances) row.append(node('p', `${stance.name}: ${stance.affect || 'No affect expressed'} · ${stance.interpretation}`));
        }
      }
      button(row, 'Inspect source cycle', () => cycle(item.cycleId)); evidence(row, 'Recorded source', item.detail);
    }
    const limits = details(result, 'How to interpret these statistics'); for (const text of report.limitations) limits.append(node('p', text));
  }
  render();
}
