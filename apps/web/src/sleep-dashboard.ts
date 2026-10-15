import type { AgentSnapshot } from '../../../packages/sdk/src/api.js';
import type { ConsolidationRun } from '../../../packages/core/src/consolidation-domain.js';

const detailPolicies = {
  preserve_details: 'Keep meaningful details and belief history',
  trace_belief_changes: 'Emphasize how beliefs changed',
  compact_current_view: 'Summarize the current perspective',
} as const;
type Options = {
  snapshot: AgentSnapshot;
  api: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  fail: (error: unknown) => void;
  createDialog: () => HTMLDialogElement;
};
const el = (tag: string, text = '', className = ''): HTMLElement => {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
};
export function sleepDashboard(root: HTMLElement, options: Options): void {
  const host = el('section', '', 'research-dashboard sleep-dashboard'); root.append(host);
  let snapshot = options.snapshot;
  let selectedId = snapshot.consolidations.at(-1)?.id ?? '';
  let filter = 'all'; let busy = false;
  const agentId = snapshot.agent.id;
  const action = (parent: HTMLElement, label: string, work: () => void, className = ''): HTMLButtonElement => {
    const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.className = className;
    button.onclick = work; parent.append(button); return button;
  };
  const raw = (title: string, value: unknown): void => {
    const dialog = options.createDialog(); dialog.className = 'rd-dialog'; dialog.setAttribute('aria-label', title);
    dialog.append(el('h2', title), el('pre', JSON.stringify(value, null, 2)));
    action(dialog, 'Close', () => dialog.close()); dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog); dialog.showModal();
  };
  const refresh = async (): Promise<void> => {
    const next = await options.api<AgentSnapshot>(`agents/${agentId}`);
    if (!host.isConnected) return;
    snapshot = next; render();
  };
  const induce = (): void => {
    const dialog = options.createDialog(); dialog.className = 'rd-dialog'; dialog.setAttribute('aria-label', 'Induce sleep cycle');
    dialog.append(el('h2', 'Induce sleep cycle'), el('p', 'Consolidate selected completed cognitive cycles. The Agent interprets the evidence; earlier memory versions and source lineage remain preserved.'));
    const form = document.createElement('form'); dialog.append(form);
    const input = (name: string, value: number): HTMLInputElement => {
      const label = document.createElement('label'); label.textContent = name;
      const field = document.createElement('input'); field.type = 'number'; field.min = '1'; field.step = '1'; field.required = true; field.value = String(value);
      label.append(field); form.append(label); return field;
    };
    const completed = snapshot.cycles.filter(cycle => cycle.status === 'completed');
    const from = input('From cognitive cycle', completed[0]?.sequence ?? 1);
    const through = input('Through cognitive cycle', completed.at(-1)?.sequence ?? 1);
    const checkbox = (text: string): HTMLInputElement => {
      const label = document.createElement('label'); label.className = 'sleep-option';
      const field = document.createElement('input'); field.type = 'checkbox';
      label.append(field, el('span', text)); form.append(label); return field;
    };
    const synthesize = checkbox('Create consolidated memories per disposition');
    const replace = checkbox("Replace source memories in this disposition’s routine recall"); replace.disabled = true;
    const policyLabel = document.createElement('label'); policyLabel.textContent = 'Memory detail policy';
    const policy = document.createElement('select'); policy.disabled = true;
    for (const [value, label] of Object.entries(detailPolicies)) policy.append(new Option(label, value));
    policyLabel.append(policy); form.append(policyLabel);
    form.append(el('p', 'Keep details preserves meaningful evidence and belief history. Belief changes emphasizes “I used to believe…” and what changed. Current perspective may omit conclusively unneeded past explanations; unresolved uncertainty still stays.', 'rd-caption'));
    const instructionLabel = document.createElement('label'); instructionLabel.textContent = 'Additional synthesis guidance (optional)';
    const instructions = document.createElement('textarea'); instructions.rows = 3; instructions.maxLength = 4000; instructions.disabled = true;
    instructions.placeholder = 'For example: keep who gave useful advice, but omit unrelated details about that person.';
    instructionLabel.append(instructions); form.append(instructionLabel);
    synthesize.onchange = () => {
      replace.disabled = policy.disabled = instructions.disabled = !synthesize.checked;
      if (!synthesize.checked) replace.checked = false;
    };
    form.append(el('p', 'Review each activated disposition independently. Replacement preserves original records and other dispositions’ access. Both options are off by default.', 'rd-caption'));
    const status = el('p'); status.setAttribute('role', 'status'); form.append(status);
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Induce sleep'; form.append(submit);
    form.onsubmit = event => {
      event.preventDefault();
      if (!host.isConnected) { dialog.close(); return; }
      const start = Number(from.value), end = Number(through.value);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || !completed.some(cycle => cycle.sequence >= start && cycle.sequence <= end)) {
        status.textContent = 'Choose an ordered range containing a completed cognitive cycle.'; return;
      }
      busy = true; submit.disabled = true; render(); status.textContent = 'Sleep cycle in progress…';
      void options.api<ConsolidationRun>(`agents/${agentId}/consolidate`, 'POST', { fromCycle: start, toCycle: end, synthesizeMemories: synthesize.checked, replaceSourceMemories: replace.checked, detailPolicy: policy.value, synthesisInstructions: instructions.value })
        .then(async cycle => { selectedId = cycle.id; if (host.isConnected) await refresh(); dialog.close(); })
        .catch(async error => {
          status.textContent = error instanceof Error ? error.message : String(error);
          options.fail(error); if (host.isConnected) await refresh().catch(options.fail);
        }).finally(() => { busy = false; submit.disabled = false; if (host.isConnected) render(); });
    };
    action(dialog, 'Cancel', () => dialog.close()); dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog); dialog.showModal();
  };
  function render(): void {
    host.replaceChildren();
    const cycles = snapshot.consolidations;
    const top = el('header', '', 'rd-top'); const title = el('div');
    title.append(el('p', 'AGENT OPERATIONS', 'rd-eyebrow'), el('h2', 'Sleep')); top.append(title);
    const actions = el('div', '', 'rd-actions');
    const start = action(actions, 'Induce sleep cycle', induce, 'rd-primary');
    const blockedReason = busy ? 'Sleep cycle request is in progress.'
      : snapshot.cycles.some(cycle => cycle.status === 'running') ? 'A cognitive cycle is recorded as running. Wait for it to finish; an interrupted cycle requires recovery before sleep.'
      : cycles.some(cycle => cycle.status === 'running') ? 'A sleep cycle is recorded as running. Wait for it to finish; an interrupted sleep cycle requires recovery.'
      : !snapshot.cycles.some(cycle => cycle.status === 'completed') ? 'Complete a cognitive cycle before inducing sleep.'
      : snapshot.agent.architecture === 'persistent' ? 'New sleep cycles require the current memory and disposition profile.' : '';
    start.disabled = Boolean(blockedReason); start.title = blockedReason;
    action(actions, 'Refresh', () => { void refresh().catch(options.fail); }); top.append(actions); host.append(top);
    const main = el('div', '', 'rd-main'); host.append(main);
    main.append(el('p', 'Sleep is offline memory and disposition consolidation, separate from the cognitive loop. Counts describe recorded processing, not psychological improvement.', 'rd-caption'));
    if (blockedReason) main.append(el('p', blockedReason, 'rd-caution'));
    if (snapshot.agent.architecture === 'persistent') main.append(el('p', 'This Agent retains a historical Part-development profile. Its saved cycles remain inspectable; new sleep cycles here require the current memory and disposition profile.', 'rd-caution'));
    if (!snapshot.cycles.some(cycle => cycle.status === 'completed')) main.append(el('p', 'Complete a cognitive cycle before inducing sleep.', 'rd-caution'));
    const stats = el('div', '', 'rd-stats');
    for (const [label, count] of [['Recorded sleep cycles', cycles.length], ['Completed', cycles.filter(c => c.status === 'completed').length], ['In progress', cycles.filter(c => c.status === 'running').length], ['Failed', cycles.filter(c => c.status === 'failed').length]] as const) {
      const stat = el('div'); stat.append(el('strong', String(count)), el('span', label)); stats.append(stat);
    }
    main.append(stats);
    const history = el('section', '', 'rd-section'); history.append(el('h3', 'Sleep history'));
    const label = document.createElement('label'); label.textContent = 'Sleep status';
    const select = document.createElement('select');
    for (const [value, text] of [['all', 'All cycles'], ['completed', 'Completed'], ['running', 'In progress'], ['failed', 'Failed']]) select.append(new Option(text, value));
    select.value = filter; select.onchange = () => { filter = select.value; render(); }; label.append(select); history.append(label);
    const timeline = el('div', '', 'sleep-timeline'); timeline.setAttribute('aria-label', 'Sleep cycle timeline');
    const visible = cycles.filter(cycle => filter === 'all' || cycle.status === filter).slice().reverse();
    if (!visible.some(cycle => cycle.id === selectedId)) selectedId = visible[0]?.id ?? '';
    for (const cycle of visible) {
      const entry = action(timeline, `${new Date(cycle.startedAt).toLocaleString()} · ${cycle.status} · cognitive cycles ${cycle.fromCycle}–${cycle.toCycle}`, () => { selectedId = cycle.id; render(); }, `sleep-cycle sleep-${cycle.status}`);
      entry.setAttribute('aria-pressed', String(selectedId === cycle.id));
    }
    if (!visible.length) timeline.append(el('p', cycles.length ? 'No sleep cycles match this status.' : 'No sleep cycles yet. Induce sleep after ordinary cognitive experiences.', 'rd-empty'));
    history.append(timeline); main.append(history);
    const selected = visible.find(cycle => cycle.id === selectedId) ?? visible[0];
    if (!selected) return;
    const detail = el('section', '', 'rd-section'); detail.setAttribute('aria-label', 'Selected sleep cycle');
    detail.append(el('h3', 'Sleep cycle evidence'), el('p', `${new Date(selected.startedAt).toLocaleString()} · ${selected.status} · cognitive cycles ${selected.fromCycle}–${selected.toCycle}`), el('p', `Provider: ${selected.provider}`, 'rd-caption'));
    if (selected.error) detail.append(el('p', selected.error, 'rd-caution'));
    if (selected.status === 'running') detail.append(el('p', 'The saved record is in progress. Refresh to inspect later evidence. This status alone does not establish that a worker is still running.', 'rd-caution'));
    if (selected.options?.synthesizeMemories) {
      detail.append(el('h4', 'Disposition memory synthesis'), el('p', selected.options.replaceSourceMemories
        ? 'Synthesis enabled with disposition-specific source replacement.' : 'Synthesis enabled; source recall retained.', 'rd-caption'));
      detail.append(el('p', `Detail policy: ${detailPolicies[selected.options.detailPolicy] ?? detailPolicies.preserve_details}`, 'rd-caption'));
      if (selected.options.synthesisInstructions) detail.append(el('p', `Additional guidance: ${selected.options.synthesisInstructions}`, 'rd-caption'));
      const reviews = selected.synthesisReviews ?? [];
      detail.append(el('p', `${reviews.filter(review => review.status === 'created').length} new consolidated memories · ${reviews.length} dispositions selected for review`, 'rd-caption'));
      if (!reviews.length) detail.append(el('p', 'No activated dispositions were available for synthesis in this period.', 'rd-empty'));
      for (const review of reviews) {
        const row = el('blockquote'); row.append(el('strong', `${review.dispositionName} · ${review.status.replace('_', ' ')}`),
          el('p', review.reason), el('p', `${review.sourceMemoryIds.length} source memories · ${review.replacedMemoryIds.length} sources replaced in this disposition’s recall`, 'rd-caption'));
        const memory = snapshot.memories.find(memory => memory.id === review.memoryId);
        if (memory) row.append(el('p', memory.content));
        if (memory?.synthesis?.detailDecisions?.length) {
          const decisions = document.createElement('details'); decisions.append(el('summary', 'What was retained or left out'));
          for (const decision of memory.synthesis.detailDecisions) {
            const source = snapshot.memories.find(source => source.id === decision.memoryId);
            const version = memory.synthesis.sources.find(source => source.memoryId === decision.memoryId)?.version;
            decisions.append(el('strong', `${source && source.version === version ? source.gist : decision.memoryId} · source version ${version ?? 'unavailable'}`),
              el('p', `Retained: ${decision.retainedMeaning}`),
              el('p', decision.omittedDetails.length ? `Left out for this perspective: ${decision.omittedDetails.join('; ')}` : 'No meaningful details explicitly omitted.'), el('p', decision.reason));
          }
          row.append(decisions);
        }
        action(row, 'Inspect synthesis lineage', () => raw('Synthesis lineage', { review, memory })); detail.append(row);
      }
    }
    const learning = selected.constructedLearning;
    if (learning) {
      detail.append(el('h4', 'Recorded consolidation'), el('p', learning.reason));
      detail.append(el('p', `${learning.dispositionIds.length} new dispositions · ${new Set(learning.revisedMemoryIds).size} revised memories`, 'rd-caption'));
      action(detail, 'Inspect learned record references', () => raw('Learned record references', learning));
    } else detail.append(el('p', selected.status === 'completed' ? 'No current-profile learning summary was captured. Historical records may use Part-development proposals.' : 'No completed learning summary is available.', 'rd-caption'));
    const memories = new Set(selected.selections.flatMap(selection => selection.memoryIds));
    const predictions = new Set(selected.selections.flatMap(selection => selection.predictionIds));
    detail.append(el('h4', 'Selected evidence'), el('p', `${memories.size} distinct memories · ${predictions.size} distinct predictions · ${selected.selections.length} recorded Part selections`, 'rd-caption'));
    action(detail, 'Inspect selected evidence', () => raw('Selected sleep evidence', selected.selections));
    if (selected.changes.length) {
      detail.append(el('h4', 'Historical development decisions'));
      for (const change of selected.changes) {
        const row = el('blockquote'); row.append(el('strong', `${change.proposal.kind} · ${change.accepted ? 'accepted' : 'not accepted'}`), el('p', change.proposal.reason), el('p', change.explanation));
        action(row, 'Inspect version lineage', () => raw('Development decision', change)); detail.append(row);
      }
    }
    action(detail, 'Original sleep record', () => raw('Original sleep record', selected)); main.append(detail);
  }
  render();
  const poll = (): void => {
    if (!host.isConnected || !snapshot.consolidations.some(cycle => cycle.status === 'running')) return;
    setTimeout(() => { if (host.isConnected) void refresh().then(poll).catch(options.fail); }, 2000);
  };
  poll();
}
