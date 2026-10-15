import type { thoughtModelEvidence } from '../../../packages/sdk/src/thought-model-evidence.js';
import { affectAnalysisPage } from './affect-analysis.js';
import { cognitionTimeline } from '../../../packages/sdk/src/cognition-timeline.js';
import { dispositionActivationChart } from './disposition-activation-chart.js';
import type { DispositionActivationSample } from '../../../packages/sdk/src/disposition-activation-history.js';
import type { MemoryOverview, MemorySearchResult } from '../../../packages/sdk/src/memory-search.js';
import { executivePage } from './executive.js';
import type { PrimitiveSettings, Primitive } from '../../../packages/core/src/primitives.js';
import type { Agent, Part, Memory, Prediction, VersionRecord, PartDraft, ActivationAssociation, Cycle } from '../../../packages/core/src/domain.js';
import type { CognitiveEvent } from '../../../packages/core/src/contracts.js';
import type { AgentSnapshot } from '../../../packages/sdk/src/api.js';
import type { IdentityQuestionGroup } from '../../../packages/sdk/src/identity-questions.js';
import type { SimulationTestDefinition, SimulationRun } from '../../../packages/sdk/src/simulation-tests.js';
import { simulationDashboard } from './simulation-dashboard.js';
import { sleepDashboard } from './sleep-dashboard.js';

const dispositionAssociations = (item: AgentSnapshot['dispositions'][number]): ActivationAssociation[] =>
  item.activationAssociations ?? item.prerequisites.map(dispositionId => ({ kind: 'disposition', dispositionId, effect: 'contribute' }));
const associationLabel = (association: ActivationAssociation): string => `${association.effect === 'contribute' ? 'Contributes' : 'Inhibits'}: ${association.kind === 'keyword'
  ? association.keyword : state?.dispositions.find(item => item.id === association.dispositionId)?.name ?? association.dispositionId}`;
const content = document.querySelector<HTMLDivElement>('#content')!;
const notice = document.querySelector<HTMLDivElement>('#notice')!;
type ChatSession = {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  cycleIds: string[];
  pinned?: boolean;
  deleted?: boolean;
};

let activeTab = 'Perception';
let selectedPromptTask = 'activation';
let settingsSection: 'Model & key' | 'Prompts' | 'Activation' | 'Delete Agent' = 'Model & key';
// Preserve existing researcher selections and sessions after the namespace change.
for (const key of Object.keys(localStorage)) {
  if (!key.startsWith('ontoagentic-')) continue;
  const replacement = `prism-${key.slice('ontoagentic-'.length)}`;
  if (localStorage.getItem(replacement) === null) localStorage.setItem(replacement, localStorage.getItem(key)!);
  localStorage.removeItem(key);
}
let selectedAgent = localStorage.getItem('prism-agent') ?? '';
let selectedDatabase = localStorage.getItem('prism-database') ?? '';
let state: AgentSnapshot | null = null;
let events: CognitiveEvent[] = [];
let stream: EventSource | null = null;
let frozenCycle = '';
let brainSeekSequence: number | null = null;
let perceptionSnapshotId: string | null = null;
let perceptionControlPending = false;
type PerceptionFact = import('../../../packages/core/src/domain.js').Fact;
let perceptionChannel = 'audio';
type SensorDraft = { baseId?: string | null | undefined; dirty?: boolean; items: { channel: string; text: string; fact?: PerceptionFact }[]; speaker: string; speech: string; raw: Record<string, string>; requestId: string };
const sensorDrafts = new Map<string, SensorDraft>();
function sensorDraft(): SensorDraft {
  const key = `${selectedDatabase}:${selectedAgent}`;
  let draft = sensorDrafts.get(key);
  if (!draft) { draft = { items: [], speaker: 'Taylor', speech: '', raw: {}, requestId: crypto.randomUUID() }; sensorDrafts.set(key, draft); }
  return draft;
}

let pendingMessage = false;
let submittedChat: { requestId: string; agentId: string; databaseId: string; threadId: string; text: string; source: string; cycleId?: string; error?: string } | null = null;
let threadLoading = false;
let threadSelectionRevision = 0;

const expandedSections = {
  chat: true,
  brain: false,
  settings: false,
  operations: true,
};
let sessions: ChatSession[] = [];
let activeSessionId: string | null = null;

function sessionStorageKey(agentId: string): string {
  return `prism-sessions-${selectedDatabase ? `${selectedDatabase}-` : ''}${agentId}`;
}

function loadSessions(agentId: string): void {
  if (!agentId) { sessions = []; activeSessionId = null; return; }
  try {
    const raw = localStorage.getItem(sessionStorageKey(agentId));
    sessions = raw ? JSON.parse(raw) as ChatSession[] : [];
  } catch {
    sessions = [];
  }
  syncSessionsWithEvents(agentId);
}

function saveSessions(): void {
  if (!selectedAgent) return;
  try {
    localStorage.setItem(sessionStorageKey(selectedAgent), JSON.stringify(sessions));
  } catch {
    // Ignore storage quota or access errors
  }
}

function syncSessionsWithEvents(agentId: string): void {
  // A message in flight owns the cycle association; do not auto-create a
  // thread from its stream events before sendMessage can attach it.
  if (pendingMessage) return;
  for (const cycle of state?.cycles ?? []) {
    if (!cycle.threadId) continue;
    let session = sessions.find(item => item.id === cycle.threadId);
    if (!session) {
      const world = events.find(event => event.cycleId === cycle.id && event.type === 'worldstate.frozen');
      const text = world?.type === 'worldstate.frozen' ? world.payload.facts.find(fact => ((fact.kind === 'says' || fact.source.startsWith('Sensor ')) && fact.originCycleId === world.cycleId) || String(fact.kind) === 'utterance')?.text : undefined;
      session = { id: cycle.threadId, agentId, title: text?.slice(0, 28) ?? `Thread · Cycle ${cycle.sequence}`, createdAt: cycle.startedAt, cycleIds: [] };
      sessions.unshift(session);
    }
    if (!session.cycleIds.includes(cycle.id)) session.cycleIds.push(cycle.id);
  }
  saveSessions();
  const utteranceCycleMap = new Map<string, { cycleId: string; at: string; utterance: string; sequence: number }>();
  for (const event of events) {
    if (event.cycleId && event.type === 'worldstate.frozen') {
      const fact = event.payload.facts.find(f => ((f.kind === 'says' || f.source.startsWith('Sensor ')) && f.originCycleId === event.cycleId) || String(f.kind) === 'utterance');
      if (fact && !utteranceCycleMap.has(event.cycleId)) {
        const cycle = state?.cycles.find(item => item.id === event.cycleId);
        // Failed/unfinished turns stay available to the send handler for
        // attachment to its originating thread.
        if (cycle?.status !== 'completed') continue;
        utteranceCycleMap.set(event.cycleId, {
          cycleId: event.cycleId,
          at: event.at,
          utterance: fact.text,
          sequence: event.sequence,
        });
      }
    }
  }

  const assignedCycleIds = new Set(sessions.flatMap(s => s.cycleIds));
  const unassigned = [...utteranceCycleMap.values()]
    .filter(item => !assignedCycleIds.has(item.cycleId))
    .sort((a, b) => a.sequence - b.sequence);

  if (unassigned.length > 0) {
    const groups: { cycleId: string; at: string; utterance: string; sequence: number }[][] = [];
    let currentGroup: typeof unassigned = [];
    for (const item of unassigned) {
      if (currentGroup.length === 0) {
        currentGroup.push(item);
      } else {
        const prev = currentGroup[currentGroup.length - 1]!;
        const gapMs = Math.abs(new Date(item.at).getTime() - new Date(prev.at).getTime());
        if (gapMs < 30 * 60 * 1000) {
          currentGroup.push(item);
        } else {
          groups.push(currentGroup);
          currentGroup = [item];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    for (const group of groups) {
      const first = group[0]!;
      const title = first.utterance.length > 28 ? first.utterance.slice(0, 28) + '…' : first.utterance;
      sessions.push({
        id: `session_${first.cycleId}`,
        agentId,
        title: title || `Session ${sessions.length + 1}`,
        createdAt: first.at,
        cycleIds: group.map(g => g.cycleId),
      });
    }
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    saveSessions();
  }

  if (!activeSessionId || !sessions.some(s => s.id === activeSessionId && !s.deleted)) {
    activeSessionId = sessions.find(s => !s.deleted)?.id ?? null;
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; element.className = className;
  if (element instanceof HTMLDialogElement) standardizeDialog(element);
  return element;
}
// All authoring and inspection dialogs share one shell and native modal lifecycle.
function standardizeDialog(dialog: HTMLDialogElement): void {
  const show = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    dialog.classList.add('app-dialog');
    let header = dialog.querySelector<HTMLElement>(':scope > .modal-header');
    if (!header) {
      header = node('div', '', 'modal-header');
      const title = dialog.querySelector<HTMLElement>(':scope > h2, :scope > h3');
      header.append(title ?? node('h3', dialog.getAttribute('aria-label') ?? 'Information'));
      dialog.prepend(header);
    }
    if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
      dialog.setAttribute('aria-label', header.querySelector('h2, h3')?.textContent ?? 'Information');
    }
    let close = Array.from(header.querySelectorAll('button')).find(control => /close/i.test(control.getAttribute('aria-label') ?? '') || control.textContent === '✕');
    if (!close) {
      close = button('✕', () => dialog.close(), true);
      close.setAttribute('aria-label', 'Close dialog');
      header.append(close);
    }
    close.type = 'button'; close.classList.add('modal-close-btn');
    const toolbar = node('div', '', 'popup-header-actions');
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Popup actions');
    const actions = Array.from(header.querySelectorAll('button')).filter(control => control !== close && !control.closest('[popover]'));
    for (const control of [...actions, close]) {
      const label = control.getAttribute('aria-label') ?? (control.title || control.textContent?.trim() || 'Action');
      control.setAttribute('aria-label', label); control.title = label; control.type = 'button';
      control.classList.add('popup-header-icon');
      if (!control.querySelector('svg')) {
        const paths = control === close ? ['M6 6l12 12M6 18L18 6']
          : /reset/i.test(label) ? ['M3 10a9 9 0 1 1 2 9', 'M3 4v6h6']
          : /delete|remove/i.test(label) ? ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7']
          : /duplicate|copy/i.test(label) ? ['M9 9h12v12H9zM15 9V3H3v12h6']
          : /edit/i.test(label) ? ['M16 3l5 5L7 22H2v-5ZM14 5l5 5']
          : ['M12 11v6M12 7v1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
        svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
        for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
        control.replaceChildren(svg);
      }
      control.querySelector('svg')!.setAttribute('aria-hidden', 'true');
      toolbar.append(control);
    }
    for (const container of header.querySelectorAll('.identity-trait-actions, .memory-inspector-actions, .popup-header-actions')) {
      if (!container.childNodes.length) container.remove();
    }
    header.append(toolbar);
    let body = dialog.querySelector<HTMLElement>(':scope > .modal-body');
    if (!body) {
      body = node('div', '', 'modal-body');
      for (const child of Array.from(dialog.childNodes)) if (child !== header) body.append(child);
      dialog.append(body);
    }
    show();
  };
  const outside = (event: MouseEvent): boolean => {
    const bounds = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };
  let startedOutside = false;
  dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (startedOutside && outside(event)) dialog.close();
    startedOutside = false;
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
}
function button(text: string, action: () => unknown, secondary = false): HTMLButtonElement {
  const element = node('button', text, secondary ? 'secondary' : '');
  element.onclick = () => { element.disabled = true; notice.textContent = ''; Promise.resolve().then(action).catch(showError).finally(() => { element.disabled = false; }); };
  return element;
}
const toastRegion = node('div', '', 'error-toasts');
toastRegion.setAttribute('popover', 'manual');
toastRegion.setAttribute('aria-label', 'Error notifications');
document.body.append(toastRegion);
function showError(error: unknown): void {
  const toast = node('div', '', 'error-toast');
  const message = node('div', error instanceof Error ? error.message : String(error));
  message.setAttribute('role', 'alert');
  const dismiss = node('button', '×', 'error-toast-dismiss');
  dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss error notification');
  let timer: ReturnType<typeof setTimeout>;
  const remove = () => {
    clearTimeout(timer); toast.remove();
    if (!toastRegion.childElementCount) toastRegion.hidePopover();
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(remove, 12000); };
  dismiss.onclick = remove;
  toast.onmouseenter = () => clearTimeout(timer);
  toast.onmouseleave = schedule;
  toast.addEventListener('focusin', () => clearTimeout(timer));
  toast.addEventListener('focusout', schedule);
  toast.append(message, dismiss); toastRegion.append(toast);
  // Reopen above any modal dialog that may have entered the top layer.
  toastRegion.hidePopover(); toastRegion.showPopover(); schedule();
}
window.addEventListener('error', event => showError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));
async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const prefix = path === 'agent-catalog' ? '/api/' : apiPrefix();
  const response = await fetch(`${prefix}${path}`, { method, ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error((result as { error: string }).error);
  return result as T;
}
function apiPrefix(): string {
  return selectedDatabase ? `/api/research/${encodeURIComponent(selectedDatabase)}/` : '/api/';
}
function compactDataSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const schema = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (schema.type !== undefined) result.type = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
  if (Array.isArray(schema.enum)) result.enum = schema.enum.map(String).join('|');
  if ('const' in schema) {
    result.type ??= schema.const === null ? 'null' : typeof schema.const;
    result.enum = String(schema.const);
  }
  if (schema.items !== undefined) result.items = compactDataSchema(schema.items);
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [name, field] of Object.entries(schema.properties)) result[name] = compactDataSchema(field);
  }
  if (Array.isArray(schema.anyOf)) {
    const types: string[] = [];
    const possibilities: string[] = [];
    for (const branch of schema.anyOf) {
      const compact = compactDataSchema(branch);
      if (typeof compact.type === 'string') types.push(...compact.type.split('|'));
      if (typeof compact.enum === 'string') possibilities.push(...compact.enum.split('|'));
      for (const [name, field] of Object.entries(compact)) {
        if (name !== 'type' && name !== 'enum') result[name] = field;
      }
    }
    if (types.length) result.type = [...new Set(types)].join('|');
    if (possibilities.length) result.enum = [...new Set(possibilities)].join('|');
  }
  return result;
}

function dataSchemaOutline(name: string, schema: Record<string, unknown>, indent = 0): string {
  const type = typeof schema.type === 'string' ? schema.type : 'unknown';
  const choices = typeof schema.enum === 'string' ? ` (${schema.enum})` : '';
  const label = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(name) ? name : JSON.stringify(name);
  const lines = [`${' '.repeat(indent)}${label}: ${type}${choices}`];
  for (const [field, definition] of Object.entries(schema)) {
    if (field === 'type' || field === 'enum') continue;
    if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
      lines.push(dataSchemaOutline(field, definition as Record<string, unknown>, indent + 2));
    }
  }
  return lines.join('\n');
}

function schemaYaml(value: unknown, indent = 0): string {
  const padding = ' '.repeat(indent);
  const scalar = (item: unknown): string => JSON.stringify(item) ?? 'null';
  const nested = (item: unknown): boolean => item !== null && typeof item === 'object'
    && (Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0);
  if (Array.isArray(value)) {
    if (!value.length) return `${padding}[]`;
    return value.map(item => nested(item) ? `${padding}-\n${schemaYaml(item, indent + 2)}` : `${padding}- ${scalar(item)}`).join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${padding}{}`;
    return entries.map(([key, item]) => {
      const label = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key) && !/^(null|true|false|yes|no|on|off)$/i.test(key) ? key : scalar(key);
      return nested(item) ? `${padding}${label}:\n${schemaYaml(item, indent + 2)}` : `${padding}${label}: ${scalar(item)}`;
    }).join('\n');
  }
  return `${padding}${scalar(value)}`;
}

function details(title: string, data: unknown, open = false): HTMLDetailsElement {
  const element = node('details'); element.open = open; element.append(node('summary', title), node('pre', JSON.stringify(data, null, 2))); return element;
}
function card(title: string, body?: string): HTMLDivElement {
  const element = node('div', '', 'card'); element.append(node('h3', title)); if (body) element.append(node('p', body)); return element;
}
function table(headers: string[], rows: (string | HTMLElement)[][]): HTMLTableElement {
  const element = node('table'); const head = node('tr'); for (const label of headers) head.append(node('th', label)); element.append(head);
  for (const row of rows) { const tr = node('tr'); for (const cell of row) { const td = node('td'); td.append(typeof cell === 'string' ? node('span', cell) : cell); tr.append(td); } element.append(tr); }
  return element;
}
function field(parent: HTMLElement, title: string, value: string, multiline = false): HTMLInputElement | HTMLTextAreaElement {
  const label = node('label', title); const input = multiline ? node('textarea') : node('input'); input.value = value; label.append(input); parent.append(label); return input;
}
const fieldDescriptions: Record<string, string> = {
  'Evaluate activation of dispositions that are thinking': 'Include busy dispositions in scoring. Their latest measured activation changes; their running thought continues unchanged.',
  'Maximum concurrent thoughts': 'Limit running scope inference across this Agent. Each disposition can run only one job at a time.',
  'Maximum queued thoughts': 'Bound waiting inference jobs. New context replaces queued context only for the same disposition and kind of work.',
  'Activation passes per observation': 'Count the initial activation and later attention or recruitment assessments. At the limit, pause new activation and finish accepted thoughts.',
  'Name': 'Use a short, recognizable name.',
  'Agent Name': 'The name shown in the Agent selector.',
  'Experiment': 'Choose a benchmark to run on a fresh Agent.',
  'Trait Role': 'Enable sorting by the role of each Trait.',
  'Icon category': 'Enable sorting by the category of each Trait.',
  'Delete All Existing Traits': 'Replace the current Trait collection when generating answers.',
  'Sort by': 'Choose the field used to order this list.',
  'Direction': 'Choose ascending or descending order.',
  'Mission / concern': 'What this perspective believes best serves the Agent.',
  'Beliefs': 'The assumptions driving this perspective’s interpretation.',
  'Strategies': 'How this perspective pursues its concern.',
  'Trigger definitions': 'Situations that make this perspective relevant.',
  'Retrieval keys': 'Search terms used to find this perspective.',
  'Unresolved sticky concern': 'Retain this concern while unresolved. Clear it to release.',
  'Question': 'The question this answer or recall will address.',
  'Answer': 'Express the Agent’s self-definition in its own words.',
  'Keywords': 'One keyword per line for grouping and discovery.',
  'Trait role': 'Self-definition guides Self; autobiographical traits remain authoring context.',
  'Person or character name': 'Choose the person or character to model.',
  'Additional details': 'Clarify the version or interpretation to use.',
  'Icon': 'Choose an emoji or symbol for this primitive.',
  'Aspects': 'One aspect per line describing what this primitive registers.',
  'Primitive family': 'Group this primitive as appraisal or action tendency.',
  'Surfacing threshold': 'The minimum score required to surface this primitive.',
  'Activation threshold': 'The minimum score required for activation.',
  'Activation instructions': 'Instructions for evaluating this primitive’s relevance.',
  'Thought production prompt': 'Instructions for generating this primitive’s thought.',
  'Allow this primitive to produce bids': 'Enable action proposals and customize their instructions.',
  'Bid production prompt': 'Instructions for generating an action proposal.',
  'Memory relevance threshold': 'The minimum relevance score for accessible memories.',
  'Maximum accessible memories': 'Limit recalled memories, or leave blank for unlimited.',
  'Confidence': 'The degree of confidence in this expectation.',
  'Owning Part': 'The perspective that owns this subjective record.',
  'Source cycle': 'The recorded experience used as provenance.',
  'Memory content': 'The subjective experience retained by its owning Part.',
  'Memory text': 'The subjective experience retained by its owning Part.',
  'Gist': 'A concise summary of this memory.',
  'Expectation': 'What the owning Part expects to happen.',
  'Horizon': 'When this uncertainty should resolve.',
  'Context': 'One relevant detail per line.',
  'Relevant context': 'One relevant detail per line.',
  'Cues': 'One situation or cue per line that makes this concern relevant.',
  'Concern': 'The motivation behind this disposition.',
  'Scope': 'The bounded entity, relationship, situation, activity, method, strategy or combination of conditions this disposition attends to.',
  'Contributing dispositions': 'Selected dispositions can increase activation through their frozen direct scores.',
  'Inhibiting dispositions': 'Selected dispositions can reduce activation through their frozen direct scores.',
  'Describe what to create': 'Describe the draft to generate for your review.',
  'Part': 'Choose the perspective whose memories to inspect.',
  'Memory': 'Choose a subjective episode belonging to that Part.',
  'Development version': 'Inspect a preserved version without changing the current skill.',
  'From cycle': 'The first cycle included in this range.',
  'Through cycle': 'The last cycle included in this range.',
  'Assess resources separately for each thought': 'Enable workload assessment before choosing the model for each independent thought.',
  'Intuitive thought model': 'Use for work assessed as simple with low uncertainty.',
  'Deliberative thought model': 'Use for complex or uncertain work, including urgent work.',
  'Consecutive incorrect predictions before escalation': 'Escalate later thoughts after this many consecutive conclusive prediction checks from the same scope, conversation and intuitive model.',
  'Model': 'The language model used for this Agent’s inference.',
  'OpenAI API key': 'Leave blank to keep the current key. Saved keys are encrypted.',
};
let formDescriptionId = 0;
function standardizeForms(): void {
  for (const label of document.querySelectorAll<HTMLLabelElement>('label:not(.form-setting)')) {
    if (label.closest('.research-dashboard, .rd-dialog')) continue;
    if (label.matches('.identity-wizard-question, .identity-version-option') || label.querySelector('input[type="radio"], input[data-filter-group]')) continue;
    const controls = Array.from(label.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
    if (!controls.length) continue;
    const name = Array.from(label.childNodes).filter(child => !controls.includes(child as HTMLInputElement) && !(child instanceof HTMLElement && child.matches('.primitive-icon-picker'))).map(child => child.textContent).join('').trim();
    if (!name) continue;
    const copy = node('span', '', 'form-setting-copy');
    const title = node('span', name, 'form-setting-name'); copy.append(title);
    const description = Object.entries(fieldDescriptions).find(([key]) => name.startsWith(key))?.[1]
      ?? (controls.some(control => control instanceof HTMLSelectElement) ? 'Choose the value to use for this setting.' : 'Customize this setting for the current operation.');
    if (description) {
      const help = node('span', description, 'form-setting-description');
      help.id = `form-description-${++formDescriptionId}`; copy.append(help);
      for (const control of controls) control.setAttribute('aria-describedby', help.id);
    }
    const controlArea = node('span', '', 'form-setting-control');
    for (const control of controls) {
      if (!control.hasAttribute('aria-label')) control.setAttribute('aria-label', name);
      if (control instanceof HTMLInputElement && control.type === 'checkbox') control.classList.add('form-toggle');
      controlArea.append(control);
      if (control instanceof HTMLInputElement && control.type === 'range') {
        const output = node('output', control.value, 'form-scale-value');
        output.setAttribute('aria-hidden', 'true');
        control.addEventListener('input', () => { output.value = control.value; });
        control.addEventListener('change', () => { output.value = control.value; });
        controlArea.append(output);
      }
    }
    const picker = label.querySelector('.primitive-icon-picker'); if (picker) controlArea.append(picker);
    label.replaceChildren(copy, controlArea); label.classList.add('form-setting');
  }
}
const partName = (partId: string | null): string => state?.parts.find(p => p.id === partId)?.name ?? partId ?? 'Coverage hypothesis';
const lines = (value: string): string[] => value.split('\n').map(s => s.trim()).filter(Boolean);

async function refresh(): Promise<void> {
  const agentId = selectedAgent;
  const databaseId = selectedDatabase;
  const threadId = activeSessionId;
  if (agentId) {
    const snapshot = await api<AgentSnapshot>(threadId ? `agents/${agentId}/threads/${threadId}` : `agents/${agentId}`);
    if (agentId === selectedAgent && databaseId === selectedDatabase && threadId === activeSessionId) state = snapshot;
  }
}
async function selectAgent(agentId: string, databaseId = selectedDatabase): Promise<void> {
  selectedDatabase = databaseId; localStorage.setItem('prism-database', databaseId);
  selectedAgent = agentId; perceptionSnapshotId = null; activeSessionId = null; brainSeekSequence = null; localStorage.setItem('prism-agent', agentId); frozenCycle = ''; events = [];
  threadSelectionRevision++; threadLoading = false;
  renderAgentControls();
  stream?.close(); state = null; content.replaceChildren(node('h2', 'Loading Agent…')); await refresh();
  const loadedEvents = await api<CognitiveEvent[]>(`agents/${agentId}/events`);
  if (agentId !== selectedAgent || databaseId !== selectedDatabase) return;
  events = loadedEvents;
  loadSessions(agentId);
  // Persist browser-only legacy session membership once, preserving the old
  // immutable cognitive records. New cycles carry ownership at creation.
  const assigned = new Set(state!.cycles.filter(cycle => cycle.threadId).map(cycle => cycle.id));
  for (const session of sessions) {
    const legacyIds = session.cycleIds.filter(cycleId => !assigned.has(cycleId) && state!.cycles.some(cycle => cycle.id === cycleId));
    if (!legacyIds.length) continue;
    await api(`agents/${agentId}/threads/${session.id}/cycles`, 'POST', { cycleIds: legacyIds });
    for (const cycleId of legacyIds) assigned.add(cycleId);
  }
  await refresh();
  stream = new EventSource(`${apiPrefix()}agents/${agentId}/stream?after=${events.at(-1)?.sequence ?? 0}`);
  stream.onopen = () => { document.querySelector('#connection')!.textContent = '● Live inspection connected'; };
  stream.onerror = () => { document.querySelector('#connection')!.textContent = 'Reconnecting to saved event stream…'; };
  stream.onmessage = event => {
    const item = JSON.parse(event.data) as CognitiveEvent;
    if (item.agentId !== selectedAgent || databaseId !== selectedDatabase) return;
    if (!events.some(e => e.id === item.id)) {
      events.push(item);
      if (item.type === 'infrastructure.error') showError(item.payload.message);
    }
    if (item.type === 'cognition.stream') window.dispatchEvent(new CustomEvent('cognition-stream-updated', { detail: item }));
    if (item.type === 'cycle.started' && item.payload.threadId) {
      const session = sessions.find(session => session.id === item.payload.threadId);
      if (session && !session.cycleIds.includes(item.payload.id)) { session.cycleIds.push(item.payload.id); saveSessions(); }
      if (item.payload.kind !== 'attention_monitor' && submittedChat?.agentId === item.agentId && submittedChat.databaseId === databaseId && submittedChat.threadId === item.payload.threadId && submittedChat.requestId === item.payload.clientMessageId && !submittedChat.cycleId) submittedChat.cycleId = item.payload.id;
    }
    if (item.type === 'worldstate.frozen' && submittedChat?.cycleId === item.cycleId) {
      pendingMessage = false; submittedChat = null;
    }
    if (activeTab === 'Perception' || activeTab === 'Interaction') render();
    if ((activeTab === 'Brain' || activeTab === 'Brain Monitor') && !frozenCycle) render();
    if (['cycle.completed', 'consolidation.completed', 'infrastructure.error'].includes(item.type)) {
      void refresh().then(() => {
        syncSessionsWithEvents(selectedAgent);
        if (activeTab === 'Perception' || activeTab === 'Interaction' || activeTab === 'Brain' || activeTab === 'Brain Monitor') render();
      }).catch(showError);
    }
  };
  render();
}
let agentDropdownOpen = false;
let isRenamingAgent = false;
type AvailableAgent = Agent & { databaseId: string; databaseLabel: string };
let agentList: AvailableAgent[] = [];

function openCreateAgentModal(): void {
  document.querySelector('#create-agent-dialog')?.remove();

  const modal = node('dialog'); modal.id = 'create-agent-dialog';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'create-agent-modal-title');

  const title = node('h3', 'Create New Prismatic Agent', 'modal-title');
  title.id = 'create-agent-modal-title';

  const desc = node('p', 'Create a Prismatic Agent with independent perspectives, identity, and memory.', 'modal-desc');

  const form = node('form', '', 'modal-form');
  const label = node('label', 'Agent Name', 'modal-label');
  const input = node('input', '', 'modal-input');
  input.type = 'text';
  input.placeholder = 'New Prismatic Agent name';
  input.setAttribute('aria-label', 'New Prismatic Agent name');
  label.append(input);

  const actions = node('div', '', 'modal-actions');
  const cancelBtn = node('button', 'Cancel', 'secondary modal-btn');
  cancelBtn.type = 'button';

  const submitBtn = node('button', 'Create Prismatic Agent', 'modal-btn modal-submit-btn');
  submitBtn.type = 'submit';

  actions.append(cancelBtn, submitBtn);
  form.append(label, actions);
  modal.append(title, desc, form);

  const cleanup = () => modal.close();
  cancelBtn.onclick = cleanup;

  form.onsubmit = async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      const agentName = input.value.trim() || 'Research Agent';
      const agent = await api<Agent>('agents', 'POST', { name: agentName });
      cleanup();
      selectedAgent = agent.id;
      await agents();
    } catch (err) {
      submitBtn.disabled = false;
      showError(err);
    }
  };

  document.body.append(modal); modal.showModal(); input.focus();
}

function renderAgentControls(): void {
  const controls = document.querySelector('#agent-controls')!;
  controls.replaceChildren();

  if (agentList.length === 0) {
    const createBtn = button('+ Create Prismatic Agent', () => openCreateAgentModal());
    createBtn.className = 'agent-create-prompt-btn';
    controls.append(createBtn);
    return;
  }

  const currentAgent = agentList.find(a => a.id === selectedAgent && a.databaseId === selectedDatabase) ?? agentList[0]!;

  if (isRenamingAgent) {
    const renameForm = node('form', '', 'agent-rename-form');
    const input = node('input', '', 'agent-rename-input');
    input.type = 'text';
    input.value = currentAgent.name;
    input.setAttribute('aria-label', 'Agent name');
    input.required = true;

    const saveBtn = node('button', '', 'agent-icon-btn agent-save-btn');
    saveBtn.type = 'submit';
    saveBtn.title = 'Save agent name';
    saveBtn.setAttribute('aria-label', 'Save agent name');
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const cancelBtn = node('button', '', 'agent-icon-btn agent-cancel-btn');
    cancelBtn.type = 'button';
    cancelBtn.title = 'Cancel';
    cancelBtn.setAttribute('aria-label', 'Cancel rename');
    cancelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    cancelBtn.onclick = () => {
      isRenamingAgent = false;
      renderAgentControls();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        isRenamingAgent = false;
        renderAgentControls();
      }
    };

    renameForm.onsubmit = async (e) => {
      e.preventDefault();
      const newName = input.value.trim();
      if (!newName || newName === currentAgent.name) {
        isRenamingAgent = false;
        renderAgentControls();
        return;
      }
      try {
        saveBtn.disabled = true;
        const updated = await api<Agent>(`agents/${currentAgent.id}`, 'PATCH', { name: newName });
        currentAgent.name = updated.name;
        if (state?.agent.id === currentAgent.id) state.agent.name = updated.name;
        isRenamingAgent = false;
        agentList = await api<AvailableAgent[]>('agent-catalog');
        renderAgentControls();
        render();
      } catch (err) {
        saveBtn.disabled = false;
        showError(err);
      }
    };

    renameForm.append(input, saveBtn, cancelBtn);
    controls.append(renameForm);
    setTimeout(() => { input.focus(); input.select(); }, 20);
    return;
  }

  const wrapper = node('div', '', 'agent-selector-wrapper');

  const dropdownBtn = node('button', '', 'agent-dropdown-btn' + (agentDropdownOpen ? ' active' : ''));
  dropdownBtn.type = 'button';
  dropdownBtn.setAttribute('aria-haspopup', 'listbox');
  dropdownBtn.setAttribute('aria-expanded', String(agentDropdownOpen));
  dropdownBtn.setAttribute('aria-label', `Select Agent (currently ${currentAgent.name})`);

  const avatar = node('span', '🧠', 'agent-avatar-badge');
  const nameLabel = node('span', currentAgent.name, 'agent-display-name');
  const caret = node('span', agentDropdownOpen ? '▴' : '▾', 'agent-caret');
  dropdownBtn.append(avatar, nameLabel, caret);

  dropdownBtn.onclick = (e) => {
    e.stopPropagation();
    agentDropdownOpen = !agentDropdownOpen;
    renderAgentControls();
  };

  const pencilBtn = node('button', '', 'agent-pencil-btn');
  pencilBtn.type = 'button';
  pencilBtn.title = 'Rename Agent';
  pencilBtn.setAttribute('aria-label', 'Rename Agent');
  pencilBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

  pencilBtn.onclick = (e) => {
    e.stopPropagation();
    agentDropdownOpen = false;
    isRenamingAgent = true;
    renderAgentControls();
  };

  wrapper.append(dropdownBtn, pencilBtn);

  if (agentDropdownOpen) {
    const dropdownMenu = node('div', '', 'agent-dropdown-menu');
    dropdownMenu.setAttribute('role', 'listbox');

    const menuHeader = node('div', 'All available Prismatic Agents', 'agent-menu-header');
    dropdownMenu.append(menuHeader);

    const listContainer = node('div', '', 'agent-menu-list');
    for (const agent of agentList) {
      const isSelected = agent.id === selectedAgent && agent.databaseId === selectedDatabase;
      const item = node('button', '', 'agent-menu-item' + (isSelected ? ' selected' : ''));
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(isSelected));

      const itemName = node('span', agent.name, 'agent-menu-name');
      item.append(itemName);
      if (agent.databaseId) item.append(node('span', ` · ${agent.databaseLabel}`, 'muted'));

      if (isSelected) {
        const check = node('span', '✓', 'agent-menu-check');
        item.append(check);
      }

      item.onclick = (e) => {
        e.stopPropagation();
        agentDropdownOpen = false;
        renderAgentControls();
        void selectAgent(agent.id, agent.databaseId).catch(showError);
      };
      listContainer.append(item);
    }
    dropdownMenu.append(listContainer);

    const divider = node('div', '', 'agent-menu-divider');
    dropdownMenu.append(divider);

    const createOption = node('button', '', 'agent-menu-create-btn');
    createOption.type = 'button';
    createOption.innerHTML = `<span class="agent-menu-plus">+</span> Create Prismatic Agent`;
    createOption.onclick = (e) => {
      e.stopPropagation();
      agentDropdownOpen = false;
      renderAgentControls();
      openCreateAgentModal();
    };
    dropdownMenu.append(createOption);

    wrapper.append(dropdownMenu);
  }

  controls.append(wrapper);
}

window.addEventListener('click', (e) => {
  const clickedPencil = e.target instanceof Element ? e.target.closest('.session-pencil') : null;
  for (const menu of document.querySelectorAll<HTMLDetailsElement>('.session-menu[open]')) {
    if (!clickedPencil || !menu.contains(clickedPencil)) menu.open = false;
  }
  if (agentDropdownOpen) {
    const controls = document.querySelector('#agent-controls');
    if (controls && !controls.contains(e.target as Node)) {
      agentDropdownOpen = false;
      renderAgentControls();
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    for (const menu of document.querySelectorAll<HTMLDetailsElement>('.session-menu[open]')) {
      menu.open = false;
      menu.querySelector<HTMLElement>('.session-pencil')?.focus();
    }
  }
  if (e.key === 'Escape' && agentDropdownOpen) {
    agentDropdownOpen = false;
    renderAgentControls();
  }
});

async function agents(): Promise<void> {
  agentList = await api<AvailableAgent[]>('agent-catalog');
  if (agentList.length === 0) {
    selectedAgent = ''; state = null;
    renderAgentControls();
    openCreateAgentModal();
    render();
    return;
  }
  if (!agentList.some(a => a.id === selectedAgent && a.databaseId === selectedDatabase)) {
    selectedAgent = agentList[0]?.id ?? '';
    selectedDatabase = agentList[0]?.databaseId ?? '';
  }
  renderAgentControls();
  if (selectedAgent) {
    await selectAgent(selectedAgent);
  } else {
    render();
  }
}

function renderNavigation(): void {
  const nav = document.querySelector('#navigation')!;
  nav.replaceChildren();

  const perception = button('Perception', () => { activeTab = 'Perception'; render(); });
  perception.className = 'nav-item' + (activeTab === 'Perception' ? ' selected' : '');
  if (activeTab === 'Perception') perception.setAttribute('aria-current', 'page');
  nav.append(perception);

  // 2. Agent Components (collapsible menu only)
  const brainSection = node('div', '', 'nav-section');
  const brainHeader = node('div', '', 'nav-header');
  const brainToggle = node('button', expandedSections.brain ? '▾' : '▸', 'nav-toggle');
  brainToggle.setAttribute('aria-label', 'Toggle Agent Components');
  brainToggle.setAttribute('aria-expanded', String(expandedSections.brain));
  brainToggle.onclick = (e) => { e.stopPropagation(); expandedSections.brain = !expandedSections.brain; render(); };
  const brainTitle = button('Agent Components', () => {
    expandedSections.brain = !expandedSections.brain;
    render();
  });
  brainTitle.className = 'nav-title';
  brainTitle.setAttribute('aria-expanded', String(expandedSections.brain));
  brainHeader.append(brainToggle, brainTitle);
  brainSection.append(brainHeader);

  if (expandedSections.brain) {
    const brainChildren = node('div', '', 'nav-children');
    const brainTabs: [string, string][] = [
      ['Primitives', 'Primitives'], ['Identity', 'Identity'],
      ['Dispositions', 'Dispositions'], ['Memories', 'Memories'],
      ['Parts', 'Part History'], ['Predictions', 'Predictions'],
      ['Network', 'Analytics'], ['Affect', 'Affect Analysis'], ['History', 'Logs'],
      ['Executive', 'Executive'],
    ];
    for (const [tab, label] of brainTabs) {
      const item = button(label, () => { activeTab = tab; render(); });
      item.className = 'nav-item' + (tab === activeTab ? ' selected' : '');
      brainChildren.append(item);
    }
    brainSection.append(brainChildren);
  }
  nav.append(brainSection);

  // 3. Settings Section (collapsible, expands to Model & key and Prompts)
  const settingsSectionEl = node('div', '', 'nav-section');
  const settingsHeader = node('div', '', 'nav-header');
  const settingsToggle = node('button', expandedSections.settings ? '▾' : '▸', 'nav-toggle');
  settingsToggle.setAttribute('aria-label', 'Toggle Settings');
  settingsToggle.setAttribute('aria-expanded', String(expandedSections.settings));
  settingsToggle.onclick = (e) => { e.stopPropagation(); expandedSections.settings = !expandedSections.settings; render(); };
  const settingsTitle = button('Settings', () => {
    expandedSections.settings = !expandedSections.settings;
    render();
  });
  settingsTitle.className = 'nav-title';
  settingsTitle.setAttribute('aria-expanded', String(expandedSections.settings));
  settingsHeader.append(settingsToggle, settingsTitle);
  settingsSectionEl.append(settingsHeader);

  if (expandedSections.settings) {
    const settingsChildren = node('div', '', 'nav-children');
    for (const tab of ['Model & key', 'Prompts', 'Activation', 'Delete Agent'] as const) {
      const isTabActive = (activeTab === 'Settings' && settingsSection === tab);
      const item = button(tab, () => {
        activeTab = 'Settings';
        settingsSection = tab;
        render();
      });
      item.className = 'nav-item' + (isTabActive ? ' selected' : '');
      settingsChildren.append(item);
    }
    settingsSectionEl.append(settingsChildren);
  }
  nav.append(settingsSectionEl);

  // Offline operations and external simulation share one navigation group.
  const section = node('div', '', 'nav-section');
  const header = node('div', '', 'nav-header');
  const toggle = button(expandedSections.operations ? '▾' : '▸', () => { expandedSections.operations = !expandedSections.operations; render(); });
  toggle.className = 'nav-toggle'; toggle.setAttribute('aria-label', 'Toggle Agent Operations');
  toggle.setAttribute('aria-expanded', String(expandedSections.operations));
  const title = button('Agent Operations', () => { expandedSections.operations = !expandedSections.operations; render(); });
  title.className = 'nav-title'; title.setAttribute('aria-expanded', String(expandedSections.operations));
  header.append(toggle, title); section.append(header);
  if (expandedSections.operations) {
    const children = node('div', '', 'nav-children');
    for (const tab of ['Sleep', 'Dreams']) {
      const item = button(tab, () => { activeTab = tab; render(); });
      item.className = 'nav-item' + (activeTab === tab ? ' selected' : ''); children.append(item);
    }
    section.append(children);
  }
  nav.append(section);
}

function threadViewButton(view: 'Brain' | 'Perception'): HTMLButtonElement {
  const label = view === 'Brain' ? 'View Brain timeline' : 'Return to Perception';
  const toggle = button(view === 'Brain' ? '🧠' : '◉', () => {
    activeTab = view;
    expandedSections.chat = true;
    render();
  }, true);
  toggle.className = 'thread-view-button secondary';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  return toggle;
}

function componentHeader(title: string, description: string): HTMLElement {
  const header = node('header', '', 'component-header');
  header.append(node('h2', title), node('p', description, 'component-header-description'),
    node('div', '', 'component-header-actions'), node('div', '', 'component-header-tools'));
  return header;
}
let componentHeaderDescriptions: Record<string, string> = {};
function sizeComponentHeaders(): void {
  if (document.body.classList.contains('model-settings-view') || document.body.classList.contains('activation-settings-view')) { content.style.setProperty('--component-header-height', 'auto'); return; }
  const current = content.querySelector<HTMLElement>('.component-header');
  if (!current || !document.body.classList.contains('component-view') || document.body.classList.contains('simulation-dashboard-view')) return;
  let largest = 0;
  for (const [title, description] of Object.entries(componentHeaderDescriptions)) {
    const probe = componentHeader(({ Perception: 'Perception', Parts: 'Part History', Network: 'Analytics', History: 'Logs', Affect: 'Affect Analysis' } as Record<string, string>)[title] ?? title, description);
    Object.assign(probe.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', width: `${current.getBoundingClientRect().width}px`, height: 'auto', minHeight: '0', margin: '0', top: '0', left: '0', gridTemplateRows: 'auto auto' });
    const actions = probe.querySelector('.component-header-actions')!;
    actions.append(node('button', '+', 'secondary'), node('button', '🧠', 'secondary'), node('button', '↺', 'secondary'));
    const tools = probe.querySelector('.component-header-tools')!;
    const form = node('div', '', 'memory-search-toolbar');
    const search = node('input'); search.type = 'search'; search.placeholder = 'Search';
    form.append(node('button', 'Vector search', 'secondary'), node('button', 'JEV search', 'secondary'), search, node('button', 'Filter · Active', 'secondary'), node('button', 'Sort', 'secondary'));
    tools.append(form);
    if (title === 'Prompts') {
      actions.remove(); tools.remove();
      const promptControls = node('div', '', 'component-header-prompt-controls');
      const toolbar = node('div', '', 'prompt-toolbar');
      const selector = node('div', '', 'prompt-selector'); selector.append(node('button', 'Cog · Part formation → reflection → cognition ▾', 'secondary'));
      toolbar.append(node('span', 'LLM · Generation', 'prompt-provider'), selector, node('button', 'Save', 'secondary'), node('button', '↺', 'secondary'), node('span', 'Modified', 'prompt-source muted'), node('span', '[glob]', 'prompt-scope muted'));
      const rightActions = node('div', '', 'prompt-toolbar-right');
      for (const label of ['data', 'output', 'preview', 'view default', '(?)']) rightActions.append(node('button', label, 'secondary'));
      toolbar.append(rightActions);
      promptControls.append(toolbar); probe.append(promptControls);
    }
    content.append(probe);
    largest = Math.max(largest, probe.getBoundingClientRect().height); probe.remove();
  }
  content.style.setProperty('--component-header-height', `${Math.ceil(largest)}px`);
}
let componentPanelWidth = 0;
let componentHeaderFrame = 0;
new ResizeObserver(entries => {
  const width = entries[0]?.contentRect.width ?? 0;
  if (width !== componentPanelWidth) {
    componentPanelWidth = width;
    if (!componentHeaderFrame) componentHeaderFrame = requestAnimationFrame(() => { componentHeaderFrame = 0; sizeComponentHeaders(); });
  }
}).observe(content);
function componentCreationControls(...controls: HTMLElement[]): void {
  content.querySelector('.component-header-actions')?.append(...controls);
}
function componentSearchControls(...controls: HTMLElement[]): void {
  content.querySelector('.component-header-tools')?.append(...controls);
}
function plusButton(label: string, action: () => unknown): HTMLButtonElement {
  const control = button('+', action, true); control.title = label; control.setAttribute('aria-label', label); return control;
}
function smartCreationButton(label: string, action: () => unknown): HTMLButtonElement {
  const control = button('🧠', action, true); control.classList.add('smart-creation-button'); control.title = label; control.setAttribute('aria-label', label); return control;
}
function contextMenuButton(label: string, panel: HTMLElement, icon?: string, host: HTMLElement = content): HTMLButtonElement {
  panel.classList.add('component-context-menu'); panel.setAttribute('popover', 'auto');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', label);
  const control = button(icon ?? label, () => {
    const bounds = control.getBoundingClientRect();
    panel.style.top = `${bounds.bottom + 6}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
    panel.togglePopover();
  }, true);
  control.type = 'button';
  control.title = label; control.setAttribute('aria-label', label); control.setAttribute('aria-haspopup', 'dialog'); control.setAttribute('aria-expanded', 'false');
  panel.addEventListener('toggle', () => control.setAttribute('aria-expanded', String(panel.matches(':popover-open'))));
  host.append(panel); return control;
}
function resetMenuButton(label: string, action: () => unknown, host?: HTMLElement): HTMLButtonElement {
  const panel = node('div');
  panel.append(button(label, () => { panel.hidePopover(); return action(); }, true));
  return contextMenuButton('Reset options', panel, '↺', host);
}
type BrowseField<T> = { key: string; label: string; value: (item: T) => string | number; options?: [string, string][] };
const componentBrowsePreferences = new Map<string, { sort: string; direction: string; filters: Record<string, string> }>();
function componentBrowse<T>(fields: BrowseField<T>[], redraw: () => void) {
  const preferenceKey = `${selectedAgent}:${activeTab}`;
  const prefs = componentBrowsePreferences.get(preferenceKey) ?? { sort: '', direction: 'asc', filters: {} };
  componentBrowsePreferences.set(preferenceKey, prefs);
  const selectControl = (label: string, options: [string, string][], value: string, change: (value: string) => void): HTMLElement => {
    const wrapper = node('label', label); const select = node('select'); select.setAttribute('aria-label', label);
    for (const [value, text] of options) { const option = node('option', text); option.value = value; select.append(option); }
    select.value = value; select.onchange = () => { change(select.value); redraw(); }; wrapper.append(select); return wrapper;
  };
  const sortPanel = node('div');
  sortPanel.append(selectControl('Sort by', [['', 'Default order'], ...fields.map(field => [field.key, field.label] as [string, string])], prefs.sort, value => { prefs.sort = value; }),
    selectControl('Direction', [['asc', 'Ascending'], ['desc', 'Descending']], prefs.direction, value => { prefs.direction = value; }));
  const filterPanel = node('div');
  const filterFields = fields.filter(field => field.options);
  for (const field of filterFields) filterPanel.append(selectControl(field.label, [['', 'All'], ...field.options!], prefs.filters[field.key] ?? '', value => { prefs.filters[field.key] = value; }));
  filterPanel.append(button('Reset filters', () => { prefs.filters = {}; filterPanel.querySelectorAll('select').forEach(select => { select.value = ''; }); redraw(); }, true));
  const filterButton = contextMenuButton('Filter', filterPanel);
  const sortButton = contextMenuButton('Sort', sortPanel);
  const updateLabel = (): void => { filterButton.textContent = Object.values(prefs.filters).some(Boolean) ? 'Filter · Active' : 'Filter'; };
  updateLabel();
  return {
    controls: [filterButton, sortButton],
    active: () => Boolean(prefs.sort || Object.values(prefs.filters).some(Boolean)),
    apply: (items: T[]): T[] => {
      updateLabel();
      const result = items.filter(item => filterFields.every(field => !prefs.filters[field.key] || String(field.value(item)) === prefs.filters[field.key]));
      const sort = fields.find(field => field.key === prefs.sort);
      if (sort) result.sort((a, b) => { const first = sort.value(a); const second = sort.value(b); return (typeof first === 'number' && typeof second === 'number' ? first - second : String(first).localeCompare(String(second))) * (prefs.direction === 'desc' ? -1 : 1); });
      return result;
    },
  };
}
function componentAuthoring(kind: 'disposition' | 'memory' | 'prediction', smart = false, existing?: AgentSnapshot['dispositions'][number]): void {
  const agentId = selectedAgent;
  const dialog = node('dialog', '', 'identity-trait-dialog');
  const title = `${existing ? 'Edit' : smart ? 'Smart create' : 'Create'} ${kind}`; dialog.setAttribute('aria-label', title);
  const header = node('div', '', 'modal-header');
  const close = button('✕', () => dialog.close(), true); close.setAttribute('aria-label', 'Close creation');
  header.append(node('h2', title), close); const form = node('form', '', 'modal-body');
  const error = node('p', '', 'identity-trait-error'); error.setAttribute('role', 'alert');
  const fields: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  const addField = (key: string, label: string, value = '', multiline = false, required = true) => {
    const input = field(form, label, value, multiline); input.required = required; fields[key] = input; return input;
  };
  const text = addField('text', kind === 'disposition' ? 'Name' : kind === 'memory' ? 'Memory content' : 'Expectation', '', kind !== 'disposition');
  const summary = kind !== 'prediction' ? addField('summary', kind === 'disposition' ? 'Concern' : 'Gist', '', true) : undefined;
  const context = addField('context', kind === 'disposition' ? 'Cues (one per line)' : 'Relevant context (one per line)', '', true, kind === 'disposition');
  const choose = (label: string, options: [string, string][]) => {
    const wrapper = node('label', label); const select = node('select'); select.setAttribute('aria-label', label); select.required = true;
    const placeholder = node('option', `Choose ${label.toLowerCase()}`); placeholder.value = ''; select.append(placeholder);
    for (const [value, label] of options) { const option = node('option', label); option.value = value; select.append(option); }
    wrapper.append(select); form.append(wrapper); return select;
  };
  let part: HTMLSelectElement | undefined; let cycle: HTMLSelectElement | undefined;
  if (kind !== 'disposition') {
    part = choose('Owning Part', state!.parts.filter(item => kind !== 'prediction' || !state!.predictions.some(prediction => prediction.partId === item.id && prediction.status === 'open')).map(item => [item.id, item.name]));
    cycle = choose('Source cycle', []);
    part.onchange = () => {
      const owner = state!.parts.find(item => item.id === part!.value);
      cycle!.replaceChildren(node('option', 'Choose source cycle'));
      cycle!.firstElementChild!.setAttribute('value', '');
      for (const entry of state!.cycles.filter(entry => entry.status !== 'running' && (kind !== 'prediction' || !owner?.instance || (entry.threadId ?? null) === owner.instance.threadId))) {
        const option = node('option', `Cycle ${entry.sequence} · ${readableDate(entry.startedAt)}`); option.value = entry.id; cycle!.append(option);
      }
    };
  }
  let scope: HTMLInputElement | HTMLTextAreaElement | undefined;
  const associationFields: { effect: 'contribute' | 'inhibit'; keywords: HTMLInputElement | HTMLTextAreaElement; dispositions: HTMLSelectElement }[] = [];
  if (kind === 'disposition') {
    scope = addField('scope', 'Scope (optional)', '', false, false);
    for (const effect of ['contribute', 'inhibit'] as const) {
      const label = effect === 'contribute' ? 'Contributing' : 'Inhibiting';
      const keywords = addField(`${effect}Keywords`, `${label} keywords or phrases (one per line)`, '', true, false);
      const dispositions = choose(`${label} dispositions`, state!.dispositions.filter(item => item.id !== existing?.id).map(item => [item.id, item.name]));
      dispositions.required = false; dispositions.multiple = true;
      associationFields.push({ effect, keywords, dispositions });
    }
    form.append(node('p', 'Associations influence activation once after direct scoring. They are soft cues; opposing influences can coexist.', 'muted'));
    const threshold = addField('threshold', 'Activation threshold (0–4)', '2') as HTMLInputElement; threshold.min = '0'; threshold.max = '4'; threshold.step = '0.1'; threshold.type = 'range';
  }
  if (kind === 'prediction') {
    addField('horizon', 'Horizon'); const confidence = addField('confidence', 'Confidence (0–1)', '0.5') as HTMLInputElement; confidence.min = '0'; confidence.max = '1'; confidence.step = '0.01'; confidence.type = 'range';
  }
  if (smart && kind !== 'disposition') {
    const description = field(form, 'Describe what to create', '', true);
    const generate = button('Generate draft', async () => {
      generate.disabled = true; error.textContent = '';
      try {
        const draft = await api<{ text: string; summary: string; context: string[]; horizon: string; confidence: number }>(`agents/${agentId}/component-draft`, 'POST', { kind, description: description.value });
        if (!dialog.isConnected || selectedAgent !== agentId) return;
        text.value = draft.text; if (summary) summary.value = draft.summary; context.value = draft.context.join('\n');
        if (kind === 'prediction') { fields.horizon!.value = draft.horizon; fields.confidence!.value = String(draft.confidence); fields.confidence!.dispatchEvent(new Event('input')); }
      } catch (cause) { showError(cause); }
      finally { generate.disabled = false; }
    }, true); generate.type = 'button'; form.append(generate);
  }
  if (existing) {
    text.value = existing.name; summary!.value = existing.concern; context.value = existing.cues.join('\n');
    scope!.value = existing.scope ?? ''; fields.threshold!.value = String(existing.threshold);
    fields.threshold!.dispatchEvent(new Event('input'));
    for (const controls of associationFields) {
      const associations = dispositionAssociations(existing).filter(association => association.effect === controls.effect);
      controls.keywords.value = associations.flatMap(association => association.kind === 'keyword' ? [association.keyword] : []).join('\n');
      for (const option of controls.dispositions.options) option.selected = associations.some(association => association.kind === 'disposition' && association.dispositionId === option.value);
    }
  }
  const save = node('button', existing ? 'Save disposition' : `Create ${kind}`); save.type = 'submit';
  form.append(error, save);
  form.onsubmit = event => {
    event.preventDefault(); save.disabled = true; error.textContent = '';
    const payload = kind === 'disposition'
      ? { name: text.value, concern: summary!.value, cues: lines(context.value), scope: scope!.value.trim() || null, prerequisites: [], activationAssociations: associationFields.flatMap(controls => [
          ...lines(controls.keywords.value).map(keyword => ({ kind: 'keyword', keyword, effect: controls.effect })),
          ...[...controls.dispositions.selectedOptions].map(option => option.value).filter(Boolean).map(dispositionId => ({ kind: 'disposition', dispositionId, effect: controls.effect })),
        ]), threshold: Number(fields.threshold!.value), memoryIds: [], sourcePredictionId: null, temporary: false }
      : { partId: part!.value, createdCycle: cycle!.value, context: lines(context.value), ...(kind === 'memory' ? { content: text.value, gist: summary!.value } : { expectation: text.value, horizon: fields.horizon!.value, confidence: Number(fields.confidence!.value) }) };
    const { memoryIds: _memories, sourcePredictionId: _prediction, temporary: _temporary, ...patch } = payload as Record<string, unknown>;
    void api(existing ? `dispositions/${existing.id}` : `agents/${agentId}/${kind === 'memory' ? 'memories' : kind === 'prediction' ? 'predictions' : 'dispositions'}`, existing ? 'PATCH' : 'POST', existing ? { expectedVersion: existing.version, patch } : payload).then(async () => { dialog.close(); if (selectedAgent === agentId) { await refresh(); render(); } }).catch(cause => { showError(cause); }).finally(() => { save.disabled = false; });
  };
  dialog.append(header, form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); text.focus();
}
function render(): void {
  renderNavigation();
  const isChat = false;
  const isBrain = activeTab === 'Brain' || activeTab === 'Brain Monitor';
  document.body.classList.toggle('chat-view', isChat || isBrain);
  document.body.classList.toggle('brain-view', isBrain);
  const isPerception = activeTab === 'Perception' || activeTab === 'Interaction';
  document.body.classList.toggle('perception-view', isPerception);
  const isPrompts = activeTab === 'Prompts' || (activeTab === 'Settings' && settingsSection === 'Prompts');
  document.body.classList.toggle('prompts-view', isPrompts);
  document.body.classList.toggle('activation-settings-view', activeTab === 'Activation' || (activeTab === 'Settings' && settingsSection === 'Activation'));
  document.body.classList.toggle('model-settings-view', activeTab === 'Model & key' || (activeTab === 'Settings' && settingsSection === 'Model & key'));
  const pageKey = activeTab === 'Settings' ? settingsSection : activeTab;
  const displayTitle = ({ Perception: 'Perception', Parts: 'Part History', Network: 'Analytics', History: 'Logs', Affect: 'Affect Analysis' } as Record<string, string>)[pageKey] ?? pageKey;
  const descriptions: Record<string, string> = {
    Primitives: 'Primitives are basic appraisals and action tendencies representing the Agent’s immediate reactions, such as curiosity, pleasure or aversion. Their trigger instructions describe when they would respond, but the current online architecture does not activate them; they remain available for researcher configuration.',
    Identity: 'Identity is the Agent’s persistent self-definition: its sense of who it is and how it wants to relate to the world. Self consults its self-definition traits when choosing among Part proposals; autobiographical traits preserve background without directly guiding that choice.',
    Dispositions: 'Dispositions are learned sensitivities representing what has become worth noticing to the Agent. They activate when current context matches their cues within eligible scopes, guiding memory recall and the formation of perspectives concerned with that situation.',
    Memories: 'Memories are subjective interpretations of psychologically meaningful experience, representing how the Agent has understood its past. Relevant memories are recalled into Part cognition to inform present interpretation; their meaning can develop while earlier versions remain preserved.',
    Parts: 'Parts are bounded, motivated perspectives representing different concerns and interpretations within the Agent. They form from activated disposition scopes and recalled memories, then think, predict and propose actions independently. Part History preserves their continuity and development after participation ends.',
    Predictions: 'Predictions are a Part’s assessable expectations about what is happening or what may happen next. Each Part can hold one open prediction; later evidence is checked against it to support learning and memory, preserving the Part’s interpretation of the outcome.',
    Network: 'Analytics is a researcher view of the relationships, lineage and provenance connecting the Agent’s Parts. It makes their development and associations visible without giving those connections decision authority or access to another Part’s private memories.',
    History: 'Logs are the recorded events and changes produced as the Agent thinks and develops. They let researchers inspect how the system behaved, while remaining separate from subjective memories and unavailable to Self as an authoritative account of its past.',
    Settings: 'Configure the models and inference instructions used by the Agent. These researcher controls support cognition without becoming part of the Agent’s psychological state.',
    'Model & key': 'Configure model providers and external inference access for the Agent’s cognitive processes.',
    Prompts: 'Inspect and edit inference instructions for the Agent’s cognitive processes. Runtime boundaries still determine each process’s access and authority.',
    Activation: 'Control disposition activation, independent thought capacity and when further attention pauses. Recall settings govern accessible subjective memories. Activation scores grant no action authority.',
    'Delete Agent': 'Agent deletion is a researcher operation that removes an Agent and its stored psychology and audit history. It acts outside cognition and requires confirmation before permanent removal.',
    Sleep: 'Offline consolidation of selected cognitive experiences, with preserved sleep-cycle history.',
    Dreams: 'Explore experiences from a chosen Agent base and inspect preserved before-and-after evidence.',
  };
  const description = descriptions[pageKey];
  componentHeaderDescriptions = descriptions;
  document.body.classList.toggle('component-view', Boolean(description));
  document.body.classList.toggle('simulation-dashboard-view', pageKey === 'Dreams' || pageKey === 'Sleep');
  content.replaceChildren(...(isChat || isBrain || isPerception || pageKey === 'Dreams' || pageKey === 'Sleep' ? [] : description ? [componentHeader(displayTitle, description)] : [node('h2', displayTitle)]));
  if ((isChat || isBrain) && state) {
    const chatHeader = node('div', '', 'chat-agent-header');
    chatHeader.append(node('h2', state.agent.name), threadViewButton(isBrain ? 'Perception' : 'Brain'));
    content.append(chatHeader);
  }
  if (!state) { content.append(card('Start with an Agent', 'Create an Agent to begin its subjective autobiography and inspect the perspectives that form during conversation.')); return; }
  if (threadLoading) { content.append(node('p', 'Loading thread…', 'muted')); return; }
  const views: Record<string, () => void> = {
    Affect: () => { void affectAnalysisPage(content, state!.agent.id, api, showCycleInspector, showError).catch(showError); },
    Executive: () => {
      const agentId = state!.agent.id; const databaseId = selectedDatabase;
      void executivePage(content, agentId, api, showError, { dialog: () => node('dialog'), cycle: showCycleInspector,
        considerSkill: async (proposalId, message) => {
          if (agentId !== selectedAgent || databaseId !== selectedDatabase) throw new Error('Agent selection changed; reopen the skill proposal');
          activeTab = 'Perception'; expandedSections.chat = true;
          await sendMessage(message, [proposalId]);
        } }).catch(showError);
    },
    'Perception': perceptionPage,
    Interaction: perceptionPage,
    Brain: brain,
    'Brain Monitor': brain,
    Parts: parts,
    Primitives: primitives,
    Dispositions: dispositionsPage,
    Predictions: predictionsPage,
    Memories: memoriesPage,
    Network: network,
    Sleep: () => sleepDashboard(content, { snapshot: state!, api, fail: showError, createDialog: () => node('dialog') }),
    History: history,
    Identity: identity,
    Settings: settings,
    'Model & key': () => { settingsSection = 'Model & key'; settings(); },
    Prompts: () => { settingsSection = 'Prompts'; settings(); },
    'Dreams': simulationTestPage,
  };
  views[activeTab]?.();
  sizeComponentHeaders();
  if (isBrain) {
    const panel = node('div', '', 'brain-panel');
    for (const child of Array.from(content.children).slice(1)) panel.append(child);
    content.append(panel);
  }
}

let cycleInspectionRequest = 0;
function showCycleInspector(cycleId: string, expectedAgentId = selectedAgent): void {
  const request = ++cycleInspectionRequest;
  const agentId = selectedAgent; const database = selectedDatabase;
  void api<{ cycle: Cycle; events: CognitiveEvent[] }>(`cycles/${encodeURIComponent(cycleId)}`).then(record => {
    if (request !== cycleInspectionRequest || selectedAgent !== agentId || selectedDatabase !== database) return;
    if (record.cycle.id !== cycleId || record.cycle.agentId !== expectedAgentId) throw new Error('Cycle inspection returned an unrelated record');
    renderCycleInspector(record.cycle, record.events);
  }).catch(showError);
}

function renderCycleInspector(cycle: Cycle, recordedEvents: CognitiveEvent[]): void {
  const cycleId = cycle.id;
  const existing = document.querySelector<HTMLDialogElement>('#cycle-inspector-modal');
  if (existing) existing.remove();

  const dialog = node('dialog', '', 'cycle-modal');
  dialog.id = 'cycle-inspector-modal';

  const cycleEvents = recordedEvents.filter(e => e.cycleId === cycleId);
  const reviewing = cycleEvents.some(event => event.type === 'execution.review_started');
  const monitored = cycle?.kind === 'attention_monitor' && !reviewing;

  const header = node('div', '', 'modal-header');
  const titleBox = node('div');
  titleBox.append(
    node('h3', `${reviewing ? 'Attention Review' : monitored ? 'Attention Checkpoint' : 'Cognitive Steps'} · Cycle ${cycle?.sequence ?? ''}`),
    node('p', monitored ? 'This checkpoint records read-only relevance monitoring. No Part generation, Self selection or intervention occurred.'
      : 'Inspect independent thoughts, proposal review and Self choices for this observation.', 'muted')
  );
  const closeBtn = button('✕', () => dialog.close(), true);
  closeBtn.className = 'modal-close-btn';
  closeBtn.setAttribute('aria-label', 'Close inspector');
  header.append(titleBox, closeBtn);
  dialog.append(header);

  const body = node('div', '', 'modal-body');
  const timeline = cognitionTimeline(cycleEvents);
  if (timeline.length) {
    const section = card('Asynchronous activity', 'Recorded order of activation, reasoning, proposal review and committed choices. Later updates to a proposal can appear after its originating observation completed. A choice is not proof of execution.');
    const scroll = node('div'); scroll.style.overflowX = 'auto';
    const rows = table(['Recorded at', 'Stage', 'Status', 'Meaning', 'Evidence'], timeline.map(row => [new Date(row.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }), row.phase,
      row.status.replaceAll('_', ' '), row.summary, details('Source record', cycleEvents.find(event => event.id === row.eventId))]));
    rows.style.minWidth = '720px'; rows.style.tableLayout = 'fixed'; rows.style.width = '100%';
    const columns = node('colgroup');
    for (const width of [100, 90, 105, 300, 125]) { const column = node('col'); column.style.width = `${width}px`; columns.append(column); }
    rows.prepend(columns);
    for (const cell of rows.querySelectorAll<HTMLElement>('td, th')) { cell.style.wordBreak = 'normal'; cell.style.overflowWrap = 'normal'; }
    for (const cell of rows.querySelectorAll<HTMLElement>('tr > :first-child')) cell.style.whiteSpace = 'nowrap';
    for (const disclosure of rows.querySelectorAll<HTMLElement>('details')) Object.assign(disclosure.style, { margin: '0', padding: '0', border: '0', borderRadius: '0', boxShadow: 'none' });
    for (const source of rows.querySelectorAll<HTMLElement>('summary')) { source.style.padding = '4px'; source.style.whiteSpace = 'nowrap'; source.textContent = 'Source'; }
    scroll.append(rows); section.append(node('p', 'Times include milliseconds. On smaller screens, scroll horizontally for meaning and source evidence.', 'muted'), scroll); body.append(section);
  }
  for (const event of cycleEvents) {
    if (event.type === 'execution.consultation_requested') body.append(card('Executive consultation request', event.payload.reason));
    if (event.type === 'execution.review_completed') body.append(card('Review outcome', event.payload.outcome === 'continued'
      ? 'Self retained the existing activity without a new handoff.' : event.payload.outcome === 'thoughts_only'
        ? 'Parts expressed thoughts without a bid; activity continued without mandatory arbitration.' : event.payload.outcome));
    if (event.type === 'execution.intervention') body.append(card('Selected pause', `${event.payload.state}. Original activity outcome: ${event.payload.parentStatus ?? 'Awaiting the worker outcome'}. Earlier effects are not reversed.`));
  }
  if (monitored) {
    const attention = cycleEvents.find(event => event.type === 'execution.attention');
    if (attention?.type === 'execution.attention') {
      const record = attention.payload;
      const summary = card(`Attention: ${record.state}`, `Relevance ${record.relevance} / 4; competence ${record.competence.confidence ?? 'unassessed'}; coverage ${record.competence.coverage ?? 'unassessed'}.`);
      summary.append(node('p', record.competence.evidence));
      for (const reason of record.reasons) summary.append(node('p', reason));
      body.append(summary);
    }
    const judgments = card('Independent disposition judgments');
    for (const event of cycleEvents) if (event.type === 'construction.judgment' && event.payload.input.task === 'disposition_activation') {
      for (const score of event.payload.scores) {
        const candidate = event.payload.input.candidates.find(item => item.id === score.partId);
        const context = candidate?.context as { disposition?: { name: string; concern: string }; activationPhase?: string } | undefined;
        judgments.append(node('p', `${context?.disposition?.name ?? 'Recorded disposition'} · ${context?.activationPhase ?? 'final'} · ${score.score} / 4`),
          node('p', context?.disposition?.concern ?? ''));
      }
    }
    body.append(judgments);
    const snapshot = cycleEvents.find(event => event.type === 'worldstate.frozen');
    if (snapshot?.type === 'worldstate.frozen') body.append(details('Recorded external observations', snapshot.payload.facts));
  }

  for (const event of cycleEvents) {
    if (event.type === 'self.affect_selection_started') {
      const section = card('Self affect selection', 'World-blind first pass over explicit orientations and mediated period feedback.');
      section.append(details('Restricted affect input', event.payload)); body.append(section);
    }
    if (event.type === 'self.affect_choice') {
      const section = card(`Affect choice: ${event.payload.mode}`, event.payload.reason);
      section.append(details('Independent proposal and control scores', event.payload.scores ?? [])); body.append(section);
    }
    if (event.type === 'self.affect_baseline') {
      const section = card('Non-enacting bid baseline', event.payload.choice.explanation);
      section.append(details('Original contributions and baseline choice', event.payload)); body.append(section);
    }
    if (event.type === 'self.affect_decision') {
      const section = card(`Focus boundary: ${event.payload.boundary}`, event.payload.selection.reason);
      section.append(details('Attributed period decision', event.payload)); body.append(section);
    }
    if (event.type === 'part.focused_bid_revision') {
      const section = card(`Focused bid revision: ${event.payload.bid_disposition}`, event.payload.response);
      section.append(details('Original and revised bid lineage', event.payload)); body.append(section);
    }
  }

  const thoughts = cycleEvents.filter(e => e.type === 'part.thought');
  const scores = cycleEvents.flatMap(e => e.type === 'activation.scored' ? e.payload.results : []);
  const primitiveScores = cycleEvents.flatMap(event => event.type === 'activation.scored' ? event.payload.primitives ?? [] : []);
  const selfChoice = cycleEvents.findLast(e => e.type === 'self.choice');
  const execution = cycleEvents.find(e => e.type === 'execution.status');

  const experienced = cycleEvents.find(event => event.type === 'worldstate.frozen');
  if (experienced?.type === 'worldstate.frozen' && experienced.payload.experienced) {
    const layers = experienced.payload.experienced;
    const experienceCard = card('Experienced WorldState', 'Subjective interpretations, imagined futures and selected posture influence Parts. Self sees only what active Parts express.');
    experienceCard.append(details('Selected interpretive and affective posture', layers.posture),
      details('Expressed remembered interpretations', layers.rememberedInterpretations),
      details('Trajectory futures', layers.prospective.filter(entry => entry.kind === 'trajectory')),
      details('Action-conditioned futures', layers.prospective.filter(entry => entry.kind === 'action_conditioned')),
      details('Unresolved-state hypotheses', layers.prospective.filter(entry => entry.kind === 'state_hypothesis')),
      details('Unclassified future alternatives', layers.prospective.filter(entry => entry.kind === 'unclassified')),
      details('Available expressed stance history', layers.stanceHistory ?? []),
      details('Carried voluntary focus', layers.selectedFocus ?? null));
    body.append(experienceCard);
  }
  const transition = cycleEvents.findLast(event => event.type === 'self.experienced_transition');
  if (transition?.type === 'self.experienced_transition') {
    const postureCard = card('Self experienced transition', transition.payload.revisitedStateId
      ? `Revisited stance ${transition.payload.revisitedStateId} with present experience retained.` : 'Selected subjective stance for subsequent cognition.');
    postureCard.append(details('Before choice', transition.payload.before), details('Chosen interpretations', transition.payload.chosen),
      details('Resulting posture', transition.payload.resulting));
    body.append(postureCard);
  }

  if (primitiveScores.length) {
    const appraisals = card('Primitive appraisals');
    for (const score of primitiveScores) {
      const entry = node('details'); entry.append(node('summary', `${score.name} · ${score.score.toFixed(1)}/4 · ${score.active ? 'surfaced' : 'implicit'} · threshold ${score.threshold}`), details('Score and distribution', score));
      const thought = cycleEvents.find(event => event.type === 'primitive.thought' && event.payload.primitive.id === score.primitiveId);
      if (thought?.type === 'primitive.thought') entry.append(node('p', thought.payload.output.thought), details('Thought and bid', thought.payload));
      appraisals.append(entry);
    }
    body.append(appraisals);
  }
  if (thoughts.length === 0) {
    body.append(node('p', 'No Part Thoughts recorded for this cycle.', 'muted'));
  } else {
    let stepNum = 1;
    for (const t of thoughts) {
      if (t.type !== 'part.thought') continue;
      const partId = t.payload.partId;
      const part = t.payload.partSnapshot ?? state?.parts.find(p => p.id === partId);
      const score = scores.find(s => s.partId === partId);
      const output = t.payload.output;

      const stepDetails = node('details', '', 'step-card');
      if (stepNum === 1) stepDetails.open = true;

      const summary = node('summary', '', 'step-summary');
      const titleSpan = node('span', `Step ${stepNum}: Part Thought · ${part?.name ?? partId}`, 'step-title');
      summary.append(titleSpan);
      if (score) {
        summary.append(node('span', score.reasons.includes('disposition_participation') ? 'Active through disposition' : `${score.score.toFixed(1)}/4 activation`, 'badge'));
      }
      stepDetails.append(summary);

      const contentDiv = node('div', '', 'step-content');
      if (part?.mission) {
        contentDiv.append(node('p', `Mission: ${part.mission}`, 'muted'));
      }
      contentDiv.append(card('Thought', output.thought));
      if (output.interpretation) {
        contentDiv.append(card('Interpretation', output.interpretation));
      }
      if (output.proposal) {
        const propCard = card(output.proposal.type === 'navigate' ? 'Proposed Stance Navigation' : output.proposal.type === 'deliberate' ? 'Proposed Internal Inquiry' : 'Proposed Behavioral Action', output.proposal.type === 'navigate' ? `Revisit ${output.proposal.stateId}: ${output.proposal.argument}` : output.proposal.type === 'deliberate' ? output.proposal.question : output.proposal.action.text);
        if (output.proposal.argument) propCard.append(node('p', `Argument: ${output.proposal.argument}`, 'muted'));
        contentDiv.append(propCard);
      } else {
        contentDiv.append(node('p', 'No behavioral action proposed (context contribution only).', 'muted'));
      }
      const legacyPrediction = (output as typeof output & { prediction?: { expectation: string } | null }).prediction?.expectation;
      const pred = legacyPrediction ?? cycleEvents.flatMap(event => event.type === 'part.prediction_created' && event.payload.partId === t.payload.partId && event.cycleId === t.cycleId ? [event.payload.expectation] : [])[0] ?? t.payload.predictionSnapshot?.expectation;
      if (pred) {
        contentDiv.append(card('Open Prediction', pred));
      }
      if (output.evidenceSummary && output.evidenceSummary.length > 0) {
        const evCard = card('Evidence Summary');
        const list = node('ul');
        for (const ev of output.evidenceSummary) list.append(node('li', ev));
        evCard.append(list);
        contentDiv.append(evCard);
      }
      contentDiv.append(details('Raw Part Output JSON', output));
      stepDetails.append(contentDiv);
      body.append(stepDetails);
      stepNum++;
    }

    if (selfChoice && selfChoice.type === 'self.choice') {
      const choiceDetails = node('details', '', 'step-card choice-step');
      choiceDetails.open = true;
      const summary = node('summary', '', 'step-summary');
      summary.append(node('span', `Step ${stepNum}: Self Arbitration & Selection`, 'step-title'));
      summary.append(node('span', 'Chosen Action', 'badge'));
      choiceDetails.append(summary);

      const choiceContent = node('div', '', 'step-content');
      choiceContent.append(card('Explanation', selfChoice.payload.explanation));
      if (selfChoice.payload.scores) choiceContent.append(details('Bid Scores and Marginal Rounds', selfChoice.payload.scores));
      if (selfChoice.payload.selectedBidIds) choiceContent.append(card('Selected Bids', selfChoice.payload.selectedBidIds.join(', ')));
      for (const event of cycleEvents) if (event.type === 'execution.status') choiceContent.append(card('Selected Action', (event.payload.speech?.text ?? event.payload.action.text)));
      if (selfChoice.payload.identityConflict) {
        choiceContent.append(card('Identity Conflict Noted', selfChoice.payload.identityConflict));
      }
      if (execution && execution.type === 'execution.status') {
        choiceContent.append(card('Executed Response', (execution.payload.speech?.text ?? execution.payload.action.text)));
      }
      choiceContent.append(details('Self Choice JSON', selfChoice.payload));
      choiceDetails.append(choiceContent);
      body.append(choiceDetails);
    }
  }

  dialog.append(body);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.body.append(dialog);
  dialog.showModal();
}

async function sendMessage(text: string, skillDocumentIds: string[] = []): Promise<void> {
  let trimmed = text.trim();
  if (!trimmed || pendingMessage) return;
  let source = 'user';
  if (/^--name(?:\s|=|$)/.test(trimmed)) {
    const named = /^--name(?:\s+|=)(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s"']+))\s+([\s\S]+)$/.exec(trimmed);
    if (!named || !(named[1] ?? named[2] ?? named[3])?.trim() || !named[4]?.trim()) {
      showError(new Error('Use --name Rowan Your message, or --name "Rowan Smith" Your message.'));
      return;
    }
    source = (named[1] ?? named[2] ?? named[3])!.trim();
    trimmed = named[4]!.trim();
  }
  const agentId = selectedAgent;
  const databaseId = selectedDatabase;
  let requestedSession = activeSessionId ? sessions.find(session => session.id === activeSessionId) : undefined;
  if (!requestedSession) {
    requestedSession = { id: `thread_${crypto.randomUUID()}`, agentId, title: trimmed.slice(0, 28), createdAt: new Date().toISOString(), cycleIds: [] };
    sessions.unshift(requestedSession); activeSessionId = requestedSession.id; saveSessions();
  }
  const requestedSessionId = requestedSession.id;
  let returnedCycle: Cycle | undefined;
  let sendError: unknown;
  pendingMessage = true;
  submittedChat = { requestId: crypto.randomUUID(), agentId, databaseId, threadId: requestedSessionId, text: trimmed, source };
  const submission = submittedChat;

  render();
  try { returnedCycle = (await api<{ cycle: Cycle }>(`agents/${agentId}/message`, 'POST', { text: trimmed, source, threadId: requestedSessionId, clientMessageId: submission.requestId,
    ...(skillDocumentIds.length ? { skillDocumentIds } : {}) })).cycle; }
  catch (error) { sendError = error; }
  try { await refresh(); }
  catch (error) { sendError ??= error; }

  if (agentId !== selectedAgent || databaseId !== selectedDatabase) return;
  if (submittedChat && submittedChat !== submission) return;
  const newCycle = returnedCycle ? state?.cycles.find(c => c.id === returnedCycle!.id) ?? returnedCycle : undefined;
  if (newCycle) {
    let activeSess = requestedSessionId ? sessions.find(s => s.id === requestedSessionId) : null;
    const snippet = trimmed.length > 28 ? trimmed.slice(0, 28) + '…' : trimmed;
    if (!activeSess) {
      activeSess = {
        id: `session_${newCycle.id}`,
        agentId: selectedAgent,
        title: snippet,
        createdAt: newCycle.startedAt || new Date().toISOString(),
        cycleIds: [newCycle.id],
      };
      sessions.unshift(activeSess);
    } else {
      if (!activeSess.cycleIds.includes(newCycle.id)) {
        activeSess.cycleIds.push(newCycle.id);
      }
    }
    saveSessions();
  }
  pendingMessage = false;
  if (submittedChat?.agentId === agentId) {
    if (newCycle) submittedChat.cycleId = newCycle.id;
    if (submittedChat.cycleId && events.some(event => event.cycleId === submittedChat?.cycleId && event.type === 'worldstate.frozen')) submittedChat = null;
    else if (!submittedChat.cycleId) submittedChat.error = sendError instanceof Error ? sendError.message : 'Message was not confirmed. Try again.';
  }
  render();
  if (sendError) showError(sendError);
}

function perceptionEditor(page: HTMLElement, draft: SensorDraft, facts: PerceptionFact[], current: boolean): void {
  const channelOf = (fact: PerceptionFact) => fact.source.startsWith('Sensor ') ? fact.source.slice(7) : 'general';
  const channels = [...new Set(['audio', 'visual', 'tactile', 'olfactory', 'gustatory', 'general', ...facts.map(channelOf), ...draft.items.map(item => item.channel)])];
  const editor = node('section', '', 'sensor-editor');
  const tabs = node('div', '', 'perception-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'WorldState channels');
  const items = current ? draft.items : facts.map(fact => ({ channel: channelOf(fact), text: fact.text, fact }));
  const changed = () => { draft.dirty = true; draft.requestId = crypto.randomUUID(); };
  for (const channel of channels) {
    const label = channel === 'general' ? 'General world facts' : channel[0]!.toUpperCase() + channel.slice(1);
    const tab = button(`${label} (${items.filter(item => item.channel === channel).length})`, () => { perceptionChannel = channel; render(); }, true);
    tab.id = `sensor-tab-${channel}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(channel === perceptionChannel));
    tab.setAttribute('aria-controls', 'sensor-panel'); tab.tabIndex = channel === perceptionChannel ? 0 : -1;
    tab.onkeydown = event => {
      const index = channels.indexOf(channel);
      const next = event.key === 'ArrowRight' ? (index + 1) % channels.length : event.key === 'ArrowLeft' ? (index + channels.length - 1) % channels.length : event.key === 'Home' ? 0 : event.key === 'End' ? channels.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); perceptionChannel = channels[next]!; render(); document.getElementById(`sensor-tab-${perceptionChannel}`)?.focus();
    };
    tabs.append(tab);
  }
  editor.append(tabs);
  const panel = node('div', '', 'sensor-channel'); panel.id = 'sensor-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `sensor-tab-${perceptionChannel}`);
  const entries = items.filter(item => item.channel === perceptionChannel);
  if (!entries.length) panel.append(node('p', 'No entries in this channel.', 'muted'));
  for (const item of entries) {
    const entry = node('article', '', 'perception-fact');
    if (current) {
      const input = node('textarea'); input.value = item.text; input.setAttribute('aria-label', `Edit ${perceptionChannel} observation`); input.disabled = perceptionControlPending;
      input.oninput = () => { item.text = input.value; changed(); };
      const remove = button('Delete entry', () => { draft.items.splice(draft.items.indexOf(item), 1); changed(); render(); }, true); remove.disabled = perceptionControlPending;
      entry.append(input, remove);
    } else entry.append(node('p', item.text));
    if (item.fact) entry.append(node('p', `${item.fact.source} · ${item.fact.kind} · ${item.fact.timestamp ?? 'Time unknown'}`, 'muted'));
    panel.append(entry);
  }
  if (current) {
    const add = (text: string) => { if (!text.trim() || perceptionControlPending) return; draft.items.push({ channel: perceptionChannel, text: text.trim() }); changed(); render(); };
    if (perceptionChannel === 'audio') {
      const chat = node('div', '', 'row');
      const speaker = node('input'); speaker.value = draft.speaker; speaker.setAttribute('aria-label', 'Speaker'); speaker.oninput = () => { draft.speaker = speaker.value; };
      const speech = node('input'); speech.value = draft.speech; speech.placeholder = 'Add speech…'; speech.setAttribute('aria-label', 'Audio chat'); speech.oninput = () => { draft.speech = speech.value; };
      const addSpeech = button('Add chat', () => { if (draft.speaker.trim() && draft.speech.trim()) { const text = `${draft.speaker.trim()} Says "${draft.speech.trim()}"`; draft.speech = ''; add(text); } }, true);
      for (const control of [speaker, speech, addSpeech]) control.disabled = perceptionControlPending;
      chat.append(speaker, speech, addSpeech); panel.append(chat);
    }
    const raw = node('div', '', 'row'); const input = node('textarea'); input.value = draft.raw[perceptionChannel] ?? ''; input.placeholder = 'Add an entry…'; input.setAttribute('aria-label', `Raw ${perceptionChannel} data`); input.oninput = () => { draft.raw[perceptionChannel] = input.value; };
    const addEntry = button('Add entry', () => { const value = draft.raw[perceptionChannel] ?? ''; if (value.trim()) { draft.raw[perceptionChannel] = ''; add(value); } }, true);
    input.disabled = perceptionControlPending; addEntry.disabled = perceptionControlPending; raw.append(input, addEntry); panel.append(raw);
    panel.append(node('p', draft.dirty ? 'Unsaved changes · Press Play to submit a new WorldState.' : 'Edit entries and press Play to submit a new WorldState.', 'muted'));
    const reset = button('Reset edits to latest WorldState', () => { draft.baseId = undefined; draft.dirty = false; render(); }, true); reset.disabled = perceptionControlPending; panel.append(reset);
  }
  editor.append(panel); page.append(editor);
}

function perceptionPage(): void {
  const snapshots = events.filter((event): event is Extract<CognitiveEvent, { type: 'worldstate.frozen' }> => event.type === 'worldstate.frozen').sort((a, b) => a.sequence - b.sequence);
  const selectedIndex = perceptionSnapshotId === null ? snapshots.length - 1 : snapshots.findIndex(event => event.payload.id === perceptionSnapshotId);
  const index = selectedIndex < 0 ? snapshots.length - 1 : selectedIndex;
  const snapshot = snapshots[index];
  const current = index === snapshots.length - 1;
  const page = node('section', '', 'perception-page');
  const transport = node('div', '', 'row perception-transport');
  transport.setAttribute('role', 'group'); transport.setAttribute('aria-label', 'WorldState playback');
  const seek = (target: number) => {
    perceptionSnapshotId = target === snapshots.length - 1 ? null : snapshots[target]!.payload.id;
    render();
  };
  const rewind = button('⏪ Rewind', () => seek(index - 1), true);
  rewind.setAttribute('aria-label', 'Previous WorldState'); rewind.disabled = index <= 0;
  const forward = button('Fast forward ⏩', () => seek(index + 1), true);
  forward.setAttribute('aria-label', 'Next WorldState'); forward.disabled = current;
  const position = node('span', `${Math.max(0, index + 1)} / ${snapshots.length} · ${current ? 'Current' : 'Historical'}`, 'muted');
  position.setAttribute('role', 'status');
  transport.append(node('h2', current ? 'Current WorldState' : 'Past WorldState'), rewind, position, forward);
  const agentId = selectedAgent; const databaseId = selectedDatabase;
  const threadId = state?.cycles.find(cycle => cycle.id === snapshot?.payload.cycleId)?.threadId ?? null;
  const draft = sensorDraft();
  const latest = snapshots.at(-1)?.payload;
  if (draft.baseId === undefined || (!draft.dirty && draft.baseId !== (latest?.id ?? null))) {
    draft.baseId = latest?.id ?? null;
    draft.items = (latest?.facts ?? []).map(fact => ({ channel: fact.source.startsWith('Sensor ') ? fact.source.slice(7) : 'general', text: fact.text, fact }));
  }
  const streamEvent = events.findLast(event => event.type === 'cognition.stream' && event.payload.threadId === threadId);
  const streamStatus = streamEvent?.type === 'cognition.stream' ? streamEvent.payload : null;
  const play = button(perceptionControlPending ? 'Starting…' : '▶ Play', async () => {
    if (perceptionControlPending || !current || events.findLast(event => event.type === 'worldstate.frozen')?.id !== snapshot?.id) return;
    if (draft.items.some(item => !item.text.trim())) { showError(new Error('Sensor observations cannot be empty. Remove empty items before playing.')); return; }
    perceptionControlPending = true; render();
    try {
      if (draft.dirty) {
        const facts = draft.items.map(item => item.fact && item.text === item.fact.text ? item.fact : { ...(item.fact ?? { source: item.channel === 'general' ? 'Researcher world facts' : `Sensor ${item.channel}`, kind: 'observes' as const, referenceId: null }), text: item.text, timestamp: new Date().toISOString() });
        await api(`agents/${agentId}/worldstate-observation`, 'POST', { facts, expectedSnapshotId: draft.baseId ?? null, threadId: threadId ?? `thread_${crypto.randomUUID()}`, clientMessageId: draft.requestId });
        draft.dirty = false; draft.baseId = undefined; draft.requestId = crypto.randomUUID();
        if (agentId === selectedAgent && databaseId === selectedDatabase) {
          await refresh();
          const recorded = await api<CognitiveEvent[]>(`agents/${agentId}/events`);
          if (agentId === selectedAgent && databaseId === selectedDatabase) events = recorded;
        }
      } else await api(`agents/${agentId}/cognition-control`, 'POST', { threadId, directive: 'resume' });
    } finally {
      perceptionControlPending = false;
      if (agentId === selectedAgent && databaseId === selectedDatabase) render();
    }
  });
  play.setAttribute('aria-label', 'Play cognition');
  play.disabled = !current || perceptionControlPending || (!draft.dirty && (!streamStatus || streamStatus.status === 'running'));
  play.title = draft.dirty && current ? 'Finalize sensor observations and continue cognition' : !current ? 'Return to the current WorldState to start cognition' : !streamStatus ? 'No resumable cognition stream recorded for this snapshot' : streamStatus.status === 'running' ? 'Cognition is already running' : 'Resume cognition with the configured activation allowance';
  transport.append(play);
  page.append(transport);
  page.append(node('p', 'Browse recorded immutable snapshots available to the Agent. Subjective context is shown separately from external observations. Self does not receive WorldState.', 'muted'));
  perceptionEditor(page, draft, snapshot?.payload.facts ?? [], current);
  if (current) page.append(node('p', streamStatus ? `Cognition: ${streamStatus.status} · ${streamStatus.reason}` : 'No resumable cognition stream recorded for this snapshot.', 'muted'));
  if (!snapshot) {
    page.append(node('p', 'No WorldState has been recorded for this Agent yet.', 'muted')); content.append(page); return;
  }
  const world = snapshot.payload;
  page.append(node('p', `Snapshot ${world.sequence} · ${world.capturedAt}`, 'muted'));
  const actions = node('div', '', 'row');
  actions.append(button('Inspect full WorldState', () => openWorldStateInfo(world), true), button('View Brain timeline', () => {
    activeSessionId = state?.cycles.find(cycle => cycle.id === world.cycleId)?.threadId ?? null;
    brainSeekSequence = null; activeTab = 'Brain'; render();
  }, true));
  if (snapshot.cycleId) {
    const cycleId = snapshot.cycleId;
    actions.append(button('Inspect source cycle', () => showCycleInspector(cycleId), true));
  }
  page.append(actions);
  const context = node('section');
  context.append(node('h3', 'Subjective context'));
  for (const thought of world.thoughtHistory ?? []) {
    const entry = node('article', '', 'perception-fact');
    entry.append(node('h4', thought.partName), node('p', thought.thought), node('p', `Age: ${thought.age} · ${thought.selectedBySelf ? 'Selected by Self' : 'Not selected by Self'}`, 'muted'));
    context.append(entry);
  }
  if (!world.thoughtHistory?.length) context.append(node('p', 'No carried thoughts recorded.', 'muted'));
  if (world.experienced) {
    for (const prediction of world.experienced.prospective) context.append(card('Prospective alternative', prediction.expectation));
    for (const memory of world.experienced.rememberedInterpretations) context.append(card('Remembered interpretation', memory.interpretation));
    for (const stance of world.experienced.posture) context.append(card(stance.name, stance.interpretation + (stance.affect ? ` · ${stance.affect}` : '')));
  }
  page.append(context);
  content.append(page);
}
function brain(): void {
  const threadCycleIds = new Set(state!.cycles.filter(cycle => activeSessionId && cycle.threadId === activeSessionId).map(cycle => cycle.id));
  const moments: { sequence: number; cutoff: number; cycleId: string; label: string }[] = [];
  for (const start of events.filter((e): e is Extract<CognitiveEvent, { type: 'cycle.started' }> => e.type === 'cycle.started')) {
    if (!start.cycleId || !threadCycleIds.has(start.cycleId)) continue;
    const inCycle = events.filter(e => e.cycleId === start.cycleId);
    const thoughts = inCycle.filter(event => event.type === 'part.thought' || event.type === 'primitive.thought');
    const scoreBatches = inCycle.filter((e): e is Extract<CognitiveEvent, { type: 'activation.scored' }> => e.type === 'activation.scored');
    if (!thoughts.length && scoreBatches.length) {
      const batch = scoreBatches.at(-1)!;
      moments.push({ sequence: batch.sequence, cutoff: inCycle.at(-1)?.sequence ?? batch.sequence, cycleId: start.cycleId, label: `Cycle ${start.payload.sequence} · Implicit appraisals` });
    }
    scoreBatches.forEach((batch, batchIndex) => {
      const nextBatch = scoreBatches[batchIndex + 1];
      const arbitration = inCycle.find(event => event.sequence > batch.sequence && event.type === 'self.arbitration_started');
      // Both contributor kinds belong to the same completed cognition phase.
      if (!arbitration || (nextBatch && arbitration.sequence > nextBatch.sequence)) return;
      const batchThoughts = thoughts.filter(thought => thought.sequence > batch.sequence && thought.sequence < arbitration.sequence);
      const lastThought = batchThoughts.at(-1);
      if (!lastThought) return;
      moments.push({ sequence: lastThought.sequence, cutoff: arbitration.sequence, cycleId: start.cycleId!, label: `Cycle ${start.payload.sequence} · Thought generation ${batchIndex + 1}` });
    });
  }
  moments.sort((a, b) => a.sequence - b.sequence);
  const currentIndex = brainSeekSequence === null ? moments.length - 1 : Math.max(0, moments.findIndex(frame => frame.sequence === brainSeekSequence));
  const currentMoment = moments[currentIndex];
  const cycleEvents = events.filter(e => e.cycleId === currentMoment?.cycleId);
  const worldEvent = cycleEvents.find((e): e is Extract<CognitiveEvent, { type: 'worldstate.frozen' }> => e.type === 'worldstate.frozen');
  const visible = cycleEvents.filter(e => e.sequence <= (currentMoment?.cutoff ?? Number.POSITIVE_INFINITY));
  const candidates = [...new Map(visible.flatMap(event => event.type === 'activation.vector_candidates' ? event.payload.candidates : []).map(candidate => [candidate.partId, candidate])).values()];
  const scores = visible.flatMap(e => e.type === 'activation.scored' ? e.payload.results : []);
  const thoughtByPart = new Map(visible.filter((e): e is Extract<CognitiveEvent, { type: 'part.thought' }> => e.type === 'part.thought').map(e => [e.payload.partId, e]));
  const predictions = visible.flatMap(e => e.type === 'part.prediction_created' || e.type === 'part.prediction_revised' ? [e.payload] : []);
  const board = node('div', '', 'brain-tiers');
  const thoughtIds = new Set([...thoughtByPart.keys()].filter(partId => scores.some(score => score.partId === partId && score.active)));
  const activatedThoughts = scores.filter(score => score.active && thoughtIds.has(score.partId));
  const jevEvaluated = scores.filter(score => !thoughtIds.has(score.partId));
  const topGrid = node('section', '', 'brain-tier brain-tier-thoughts');
  topGrid.append(node('h3', `Activated Parts · thoughts (${activatedThoughts.length})`));
  const thoughtGrid = node('div', '', 'brain-grid brain-grid-thoughts');
  const middleGrid = node('section', '', 'brain-tier brain-tier-evaluated');
  middleGrid.append(node('h3', `Working Parts · remaining (${jevEvaluated.length})`));
  const evaluatedGrid = node('div', '', 'brain-grid brain-grid-evaluated');
  const appendActivationTile = (partId: string, score: typeof scores[number], target: HTMLElement, size: 'large' | 'medium'): void => {
    const thought = thoughtByPart.get(partId);
    const candidate = candidates.find(c => c.partId === partId);
    const part = state!.parts.find(p => p.id === partId) ?? thought?.payload.partSnapshot;
    const active = score.active;
    const direct = score.reasons.includes('disposition_participation');
    const fallback = score.reasons.includes('identity_fallback_participation');
    const participationLabel = direct ? 'Active through disposition' : fallback ? 'Identity fallback' : null;
    const tile = node('article', '', `brain-part brain-part-${size}${active ? ' activated' : ''}${thought ? ' has-thought' : ''}`);
    if (participationLabel) {
      tile.append(node('span', participationLabel, 'brain-score'));
    } else {
      tile.style.setProperty('--activation', `${Math.max(0, Math.min(100, score.score / 4 * 100))}%`);
      tile.style.setProperty('--previous-activation', `${Math.max(0, Math.min(100, score.previous / 4 * 100))}%`);
      tile.append(node('span', '', 'brain-previous-fill'), node('span', '', 'brain-activation-fill'));
    }
    if (part?.stickiness.retained) {
      const pin = node('span', '📌', 'brain-sticky-pin');
      pin.setAttribute('aria-label', 'Sticky unresolved concern');
      pin.title = 'Sticky unresolved concern';
      tile.append(pin);
    }
    const hasOpenPrediction = predictions.some(p => p.partId === partId && p.status === 'open');
    tile.append(node('strong', part?.name ?? partId, 'brain-part-name'));
    if (thought) {
      tile.append(node('span', 'Thought', 'brain-thought-label'));
      tile.append(node('span', thought.payload.output.thought, 'brain-thought'));
    } else if (!participationLabel) tile.append(node('span', `${score.score.toFixed(1)} / 4`, 'brain-score'));
    if (candidate) {
      const bidEvent = visible.find((event): event is Extract<CognitiveEvent, { type: 'part.bid_created' }> => event.type === 'part.bid_created' && event.payload.partId === partId);
      const tools = node('span', '', 'brain-part-tools');
      const info = button('i', () => openPartInfo(partId, part, candidate, score, thought?.payload.output ?? null, bidEvent?.payload ?? null), true); info.className = 'brain-info'; info.setAttribute('aria-label', `Information about ${part?.name ?? 'Part'}`); tools.append(info);
      if (hasOpenPrediction) {
        const marker = node('span', '!', 'brain-prediction-mark');
        marker.setAttribute('aria-label', 'Open prediction');
        marker.title = 'Open prediction';
        tools.append(marker);
      }
      tile.append(tools);
    }
    tile.title = participationLabel ? `${part?.name ?? partId} · ${participationLabel}; no measured Part activation score` : `${part?.name ?? partId} · activation ${score.score.toFixed(1)} / 4 · previous ${score.previous.toFixed(1)} / 4 · ${active ? 'activated and passed to cognition' : 'candidate only'}`;
    target.append(tile);
  };
  for (const score of activatedThoughts) appendActivationTile(score.partId, score, thoughtGrid, 'large');
  for (const score of jevEvaluated) appendActivationTile(score.partId, score, evaluatedGrid, 'medium');
  if (!thoughtGrid.childElementCount) thoughtGrid.append(node('p', 'No completed activated thought set at this point.', 'muted'));
  if (!evaluatedGrid.childElementCount) evaluatedGrid.append(node('p', 'No other working Parts at this point.', 'muted'));
  topGrid.append(thoughtGrid); middleGrid.append(evaluatedGrid);
  board.append(topGrid, middleGrid);
  const primitiveThoughts = visible.filter(event => event.type === 'primitive.thought');
  const primitiveScores = visible.flatMap(event => event.type === 'activation.scored' ? event.payload.primitives ?? [] : []);
  if (primitiveScores.length || primitiveThoughts.length) {
    const appraisals = node('section', '', 'brain-tier');
    appraisals.append(node('h3', `Primitive appraisals · ${primitiveScores.filter(score => score.active).length} surfaced`));
    const grid = node('div', '', 'brain-grid brain-grid-evaluated');
    for (const score of primitiveScores) {
      const thought = primitiveThoughts.find(event => event.type === 'primitive.thought' && event.payload.primitive.id === score.primitiveId);
      const tile = node('article', '', `brain-part brain-part-medium${score.active ? ' activated' : ''}`);
      tile.style.setProperty('--activation', `${score.score / 4 * 100}%`); tile.style.setProperty('--previous-activation', `${score.previous / 4 * 100}%`);
      tile.append(node('span', '', 'brain-previous-fill'), node('span', '', 'brain-activation-fill'), node('strong', score.name, 'brain-part-name'),
        node('span', `${score.score.toFixed(1)} / 4 · ${score.active ? 'surfaced' : 'implicit'} · threshold ${score.threshold}`, 'brain-score'));
      if (thought?.type === 'primitive.thought') tile.append(node('span', thought.payload.output.thought, 'brain-thought'));
      const tools = node('span', '', 'brain-part-tools');
      const info = button('i', () => {
        const dialog = node('dialog', '', 'identity-trait-dialog');
        dialog.append(node('h3', `${score.name} · Primitive appraisal`), details('Activation score and distribution', score));
        if (thought?.type === 'primitive.thought') dialog.append(details('Thought and bid', thought.payload));
        dialog.append(button('Close', () => { dialog.close(); dialog.remove(); }, true));
        document.body.append(dialog); dialog.showModal();
      }, true);
      info.className = 'brain-info'; info.setAttribute('aria-label', `Information about primitive ${score.name}`); tools.append(info); tile.append(tools); grid.append(tile);
    }
    // Saved fallback-only cycles predate primitive activation scores.
    if (!primitiveScores.length) for (const event of primitiveThoughts) {
      if (event.type !== 'primitive.thought') continue;
      const tile = card(`${event.payload.primitive.name} (primitive)`);
      tile.append(node('p', event.payload.output.thought), details('Legacy primitive contribution', event.payload)); grid.append(tile);
    }
    appraisals.append(grid); board.append(appraisals);
  }
  const timeline = node('section', '', 'brain-timeline');
  timeline.append(node('div', '', 'brain-timeline-track'));
  const range = node('input'); range.type = 'range'; range.min = '0'; range.max = String(Math.max(0, moments.length - 1)); range.value = String(currentIndex); range.setAttribute('aria-label', 'Seek through cycles and complete thought sets'); range.disabled = moments.length < 2;
  range.oninput = () => { brainSeekSequence = moments[Number(range.value)]?.sequence ?? null; render(); };
  timeline.append(range);
  const dots = node('div', '', 'brain-timeline-dots');
  moments.forEach((moment, index) => {
    const dot = button('', () => { brainSeekSequence = moment.sequence; render(); }, true); dot.className = `brain-timeline-dot thought-set${index === currentIndex ? ' selected' : ''}`; dot.title = moment.label; dot.setAttribute('aria-label', moment.label); dots.append(dot);
  });
  timeline.append(dots);
  content.append(timeline, node('p', currentMoment?.label ?? 'No cycle moments recorded yet.', 'muted'));
  const conversationLayout = node('div', '', 'brain-conversation-layout');
  const conversation = node('section', '', 'worldstate-thread brain-thought-conversation');
  conversation.append(node('h3', 'Thought conversation'));
  const thoughtMessages = node('div', '', 'worldstate-messages');
  const contributorName = (id: string): string => {
    const thought = cycleEvents.find(event => event.type === 'part.thought' && event.payload.partId === id);
    if (thought?.type === 'part.thought') return thought.payload.partSnapshot.name;
    const primitive = cycleEvents.find(event => event.type === 'primitive.thought' && event.payload.primitive.id === id);
    if (primitive?.type === 'primitive.thought') return primitive.payload.primitive.name;
    return state!.parts.find(part => part.id === id)?.name ?? id;
  };
  const displayedInquiryQuestions = new Set<string>();
  // Like the final bid ranking, show the selected cycle's completed conversation,
  // including inquiries and replies recorded after its thought keyframe.
  for (const event of cycleEvents) {
    let label: string;
    let text: string;
    switch (event.type) {
      case 'part.thought': label = event.payload.partSnapshot.name; text = event.payload.output.thought; break;
      case 'primitive.thought': label = event.payload.primitive.name; text = event.payload.output.thought; break;
      case 'self.deliberation_started':
      case 'self.debate_started':
      case 'self.arbitration_started':
        displayedInquiryQuestions.clear();
        continue;
      case 'self.question':
        // Routing emits the same inquiry for each recipient, interleaved with replies.
        if (displayedInquiryQuestions.has(event.payload.question)) continue;
        displayedInquiryQuestions.add(event.payload.question);
        label = 'Self'; text = event.payload.question; break;
      case 'part.deliberation_response': label = contributorName(event.payload.partId); text = event.payload.response; break;
      case 'primitive.deliberation_response': label = contributorName(event.payload.primitiveId); text = event.payload.response; break;
      case 'part.debate_response': label = contributorName(event.payload.partId); text = event.payload.answer; break;
      case 'primitive.debate_response': label = contributorName(event.payload.primitiveId); text = event.payload.answer; break;
      default: continue;
    }
    const bubble = node('article', '', `worldstate-bubble brain-thought-bubble${label === 'Self' ? ' brain-self-bubble' : ''}`);
    bubble.append(node('strong', label, 'brain-conversation-label'), node('p', text));
    thoughtMessages.append(bubble);
  }
  if (!thoughtMessages.childElementCount) thoughtMessages.append(node('p', 'No thoughts recorded for this cycle.', 'muted'));
  conversation.append(thoughtMessages); conversationLayout.append(conversation);
  content.append(conversationLayout);
  if (worldEvent) {
    const thread = node('section', '', 'worldstate-thread');
    thread.append(node('h3', 'WorldState'));
    const messages = node('div', '', 'worldstate-messages');
    for (const fact of worldEvent.payload.facts) {
      const row = node('div', '', 'worldstate-message-row');
      const bubble = node('div', '', 'worldstate-bubble');
      bubble.append(node('p', fact.text), node('span', `${fact.timestamp ?? 'Time unknown'} · ${fact.source} ${String(fact.kind) === 'prior_output' || String(fact.kind) === 'utterance' ? 'says' : String(fact.kind) === 'execution' ? 'does' : String(fact.kind) === 'observation' ? 'observes' : fact.kind}`, 'worldstate-fact-meta'));
      row.append(bubble); messages.append(row);
    }
    if (!worldEvent.payload.facts.length) messages.append(node('p', 'This WorldState contains no facts.', 'muted'));
    const footer = node('div', '', 'worldstate-footer');
    const info = button('i', () => openWorldStateInfo(worldEvent.payload), true);
    info.className = 'brain-info worldstate-info'; info.setAttribute('aria-label', 'Inspect full WorldState'); info.title = 'Inspect full WorldState';
    footer.append(info); thread.append(messages, footer); conversationLayout.append(thread);
  }
  // Selection happens after the thought keyframe cutoff. Show the recorded
  // cycle result separately from the thoughts visible at this timeline moment.
  const finalChoice = cycleEvents.findLast(event => event.type === 'self.choice');
  const rankedBids = node('section', '', 'brain-tier brain-top-bids');
  rankedBids.append(node('h3', 'Top bids · ranked by Self score'));
  if (finalChoice?.type === 'self.choice' && finalChoice.payload.scores) rankedBids.append(details('Self bid Scores', finalChoice.payload.scores));
  // Use the final arbitration's current contributions: earlier bids may have
  // been replaced or withdrawn during deliberation. Marginal rounds assess
  // compatibility with selected bids and are not comparable initial ranks.
  const arbitration = cycleEvents.findLast(event => event.type === 'self.arbitration_started'
    && event.sequence < (finalChoice?.sequence ?? Number.POSITIVE_INFINITY));
  const initialScores = finalChoice?.type === 'self.choice'
    ? finalChoice.payload.scores?.filter(score => score.selectedBefore.length === 0) ?? [] : [];
  const currentBids = arbitration?.type === 'self.arbitration_started'
    ? arbitration.payload.contributions.flatMap(contribution => contribution.bid ? [contribution.bid] : []) : [];
  const orderedBids = currentBids.map(bid => ({ bid, score: initialScores.find(score => score.partId === bid.id)?.score }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const selectedIds = new Set(finalChoice?.type === 'self.choice'
    ? finalChoice.payload.selectedBidIds ?? [finalChoice.payload.choice] : []);
  for (const [index, { bid, score }] of orderedBids.entries()) {
    const contribution = arbitration?.type === 'self.arbitration_started'
      ? arbitration.payload.contributions.find(item => item.bid?.id === bid.id) : undefined;
    const owner = contribution?.name ?? bid.partId;
    const heading = score === undefined ? `Unranked · ${owner}` : `Rank ${index + 1} · ${owner} · ${score.toFixed(1)}/4`;
    const entry = card(heading, bid.action?.text ?? bid.argument);
    if (selectedIds.has(bid.id)) entry.append(node('p', 'Selected', 'muted'));
    entry.append(node('p', bid.argument), details('Inspect bid', bid));
    rankedBids.append(entry);
  }
  if (!orderedBids.length) rankedBids.append(node('p', 'No bids recorded for this arbitration yet.', 'muted'));
  else if (!initialScores.length) rankedBids.append(node('p', 'Bid ranks are unavailable for this saved arbitration.', 'muted'));
  content.append(rankedBids, board);
  content.append(node('p', 'Orange fill shows current activation. Dashed yellow outline shows previous activation. Pale yellow border means the Part was activated for cognition.', 'muted'));
  const pipeline = node('div', '', 'pipeline');
  const stages: [string, string[]][] = [
    ['Exactly what Self receives', ['self.arbitration_started']],
    ['Part participation and primitive scores', ['activation.scoring_started', 'activation.scored']],
    ['Selection and deliberation', ['self.choice', 'self.deliberation_started', 'self.deliberation_planned', 'self.question', 'part.deliberation_response', 'primitive.deliberation_response', 'part.bid_withdrawn', 'primitive.bid_withdrawn', 'self.debate_started', 'part.debate_response', 'primitive.debate_response']],
    ['External action and outcome', ['execution.handoff', 'speech.realization_started', 'execution.status']],
    ['Disposition scoring and ordered Part cognition', ['construction.inference_started', 'construction.judgment', 'construction.generated']],
    ['Working continuity and retirement', ['part.instance_retired']],
    ['Memory recall', ['memory.relevance_scored']],
    ['Prediction evaluation and development', ['prediction.evaluation', 'memory.episodic_created', 'part.mutation_applied']],
  ];
  for (const [title, kinds] of stages) pipeline.append(details(title, visible.filter(e => kinds.includes(e.type)).map(e => ({ type: e.type, ...e.payload }))));
  content.append(pipeline);
}


function openWorldStateInfo(world: unknown): void {
  const dialog = node('dialog', '', 'brain-info-dialog');
  dialog.append(node('h3', 'Full WorldState'), details('WorldState object', world, true));
  const close = button('Close', () => { dialog.close(); dialog.remove(); }, true);
  dialog.append(close); document.body.append(dialog); dialog.showModal();
}

function openPartInfo(partId: string, part: Part | undefined, candidate: { similarity: number; reasons: string[] } | undefined,
  activation?: { score: number; previous: number; delta: number; active: boolean; similarity: number; reasons: string[] },
  thought?: unknown, bid?: unknown): void {
  const dialog = node('dialog', '', 'brain-info-dialog');
  dialog.append(node('h3', part?.name ?? partId), node('p', part?.mission ?? 'Part details are not available in the current snapshot.', 'muted'));
  if (candidate) {
    if (!part?.instance) dialog.append(node('p', `Historical vector similarity: ${candidate.similarity.toFixed(3)}`));
    dialog.append(details('Candidate reasons', candidate.reasons));
  }
  if (activation) dialog.append(details('Activation information', activation));
  dialog.append(details('Thought object', thought ?? 'No thought recorded at this point in the timeline.'));
  dialog.append(details('Bid object', bid ?? 'No bid recorded at this point in the timeline.'));
  if (part) dialog.append(details('Perspective details', { beliefs: part.beliefs, triggers: part.triggers, strategies: part.strategies, stickiness: part.stickiness }));
  const actions = node('div', '', 'row');
  actions.append(button('Inspect Part', () => { dialog.close(); dialog.remove(); void showPart(partId); }, true), button('Close', () => { dialog.close(); dialog.remove(); }, true));
  dialog.append(actions); document.body.append(dialog); dialog.showModal();
}
function partEditor(part?: Part): void {
  const dialog = node('dialog', '', 'identity-trait-dialog');
  const header = node('div', '', 'modal-header');
  header.append(node('h2', part ? `Edit ${part.name}` : 'Create a Part'));
  const form = node('div', '', 'modal-body');
  form.append(node('p', 'Changes are recorded as researcher edits with immutable versions.', 'muted'));
  form.append(node('p', 'Name the feeling or motivation in fewer than six words. Mission: what best serves me as the Agent. Strategies: how I pursue it. Beliefs: what drives my relational interpretation. Use broad subjects for general Parts and named subjects only for specific relationships.', 'muted'));
  const name = field(form, 'Name', part?.name ?? '');
  name.placeholder = 'My Fear Of Dogs';
  const mission = field(form, 'Mission / concern', part?.mission ?? '');
  const beliefs = field(form, 'Beliefs · one per line', part?.beliefs.join('\n') ?? '', true);
  const strategies = field(form, 'Strategies · one per line', part?.strategies.join('\n') ?? '', true);
  const triggers = field(form, 'Trigger definitions · one per line', part?.triggers.join('\n') ?? '', true);
  const retrievalKeys = field(form, 'Retrieval keys · one per line · vector search only', part?.retrievalKeys?.join('\n') ?? '', true);
  retrievalKeys.placeholder = 'Person\nMethod\nEntity';
  const sticky = field(form, 'Unresolved sticky concern · leave blank to release', part?.stickiness.unresolved ? part.stickiness.concern : '');
  form.append(button('Save researcher change', async () => {
    const patch = { name: name.value, mission: mission.value, beliefs: lines(beliefs.value), strategies: lines(strategies.value), triggers: lines(triggers.value), retrievalKeys: lines(retrievalKeys.value),
      stickiness: { retained: Boolean(sticky.value.trim()), unresolved: Boolean(sticky.value.trim()), concern: sticky.value.trim() } };
    if (part) await api(`parts/${part.id}`, 'PATCH', { expectedVersion: part.version, patch, ...(activeSessionId ? { threadId: activeSessionId } : {}) });
    else {
      const draft: PartDraft = { ...patch, lifecycle: 'active', mode: 'perspective', temporary: false, associations: [], provenance: [], lineage: [], emotionalCharge: null, cognitiveCharacteristics: [] };
      await api(`agents/${selectedAgent}/parts`, 'POST', draft);
    }
    dialog.close(); await refresh(); render();
  }), button('Cancel', () => dialog.close(), true));
  dialog.append(header, form); document.body.append(dialog); dialog.showModal(); name.focus();
}
function emotionalChargeEmoji(charge: string | null): string {
  if (!charge?.trim()) return '😐';
  // Display hints only: preserve the Part's free-form emotional language and state.
  const hints: [RegExp, string][] = [
    [/\b(anger|angry|rage|furious|irritated|resentment|resentful|frustration|frustrated)\b/i, '😠'],
    [/\b(fear|fearful|afraid|scared|anxiety|anxious|worry|worried|dread|panic)\b/i, '😨'],
    [/\b(sad|sadness|grief|grieving|sorrow|lonely|loneliness|hurt|heartbreak)\b/i, '😢'],
    [/\b(shame|ashamed|guilt|guilty|embarrassed|embarrassment)\b/i, '😳'],
    [/\b(disgust|disgusted|revulsion)\b/i, '🤢'],
    [/\b(envy|envious|jealous|jealousy)\b/i, '😒'],
    [/\b(love|loving|affection|affectionate|care|caring|compassion|tenderness)\b/i, '🥰'],
    [/\b(joy|joyful|happy|happiness|delight|delighted|excitement|excited)\b/i, '😄'],
    [/\b(pride|proud|confidence|confident|determination|determined)\b/i, '😎'],
    [/\b(curiosity|curious|interest|interested|wonder)\b/i, '🧐'],
    [/\b(trust|trusting|hope|hopeful|optimism|optimistic)\b/i, '🙂'],
    [/\b(calm|peace|peaceful|relief|relieved|content|contentment|serenity)\b/i, '😌'],
    [/\b(surprise|surprised|shock|shocked)\b/i, '😮'],
    [/\b(ambivalence|ambivalent|conflict|conflicted|uncertain|uncertainty|confused|confusion)\b/i, '😕'],
    [/\b(tired|exhausted|exhaustion|fatigue|weary)\b/i, '😴'],
  ];
  return hints.find(([pattern]) => pattern.test(charge))?.[1] ?? '💭';
}
function parts(): void {
  const toolbar = node('div', '', 'identity-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = 'Search names, missions or lifecycle'; search.setAttribute('aria-label', 'Filter Parts');
  toolbar.append(search);
  componentCreationControls(plusButton('Create Part', () => partEditor()));
  const list = node('div', '', 'parts-list'); const draw = (): void => {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const visible = browse.apply(state!.parts.filter(p => `${p.name} ${p.mission} ${p.lifecycle} ${p.instance?.retirement ? 'retired' : p.instance ? 'working' : ''}`.toLowerCase().includes(query)));
    if (!query && !browse.active()) visible.sort((a, b) =>
      (b.instance ? recordDate(b.instance.createdCycle) ?? '' : '').localeCompare(a.instance ? recordDate(a.instance.createdCycle) ?? '' : ''));
    for (const part of visible) {
      const item = button('', () => showPart(part.id), true);
      item.className = 'part-list-item'; item.setAttribute('aria-label', `Inspect ${part.name}`);
      item.dataset.lifecycle = part.lifecycle; item.classList.toggle('temporary', part.temporary);
      // Emotional charge is free-form Part-owned language. Color identifies its text, without classifying its meaning.
      const charge = part.emotionalCharge?.trim().toLocaleLowerCase();
      if (charge) {
        let hash = 0; for (const character of charge) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
        const hue = (hash >>> 0) % 360;
        item.style.setProperty('--part-card-background', `hsl(${hue} 45% 93%)`);
        item.style.setProperty('--part-card-border', `hsl(${hue} 25% 77%)`);
      }
      item.title = `${part.emotionalCharge || 'No emotional charge recorded'} · ${part.lifecycle}${part.temporary ? ' · Temporary Part' : ''}`;
      const prediction = state!.predictions.find(prediction => prediction.partId === part.id && prediction.status === 'open');
      if (prediction) {
        const bubble = node('span', '', 'part-list-thought');
        bubble.append(node('span', prediction.expectation, 'part-list-thought-text'));
        bubble.title = `Active prediction: ${prediction.expectation}`; bubble.setAttribute('aria-label', bubble.title);
        item.append(bubble);
      }
      const emotion = node('span', emotionalChargeEmoji(part.emotionalCharge), 'part-list-emotion');
      emotion.title = part.emotionalCharge || 'No emotional charge recorded';
      emotion.setAttribute('role', 'img'); emotion.setAttribute('aria-label', emotion.title);
      item.append(node('span', part.name.toUpperCase(), 'part-list-name'), node('span', part.mission, 'part-list-mission'), emotion, node('span', `${part.instance ? part.instance.retirement ? 'Retired · ' : 'Working · ' : ''}v${part.version}`, 'part-list-version'));
      list.append(item);
    }
  };
  const browse = componentBrowse<Part>([
    { key: 'name', label: 'Name', value: item => item.name },
    { key: 'date', label: 'Created', value: item => recordDate(item.instance?.createdCycle ?? '') ?? '' },
    { key: 'lifecycle', label: 'Lifecycle', value: item => item.instance?.retirement ? 'retired' : item.instance ? 'working' : item.lifecycle, options: ['working', 'retired', 'active', 'dormant', 'archived'].map(value => [value, value]) },
    { key: 'type', label: 'Part type', value: item => item.instance ? 'constructed' : 'manual', options: [['constructed', 'Constructed'], ['manual', 'Persistent / researcher']] },
  ], draw);
  toolbar.append(...browse.controls);
  search.oninput = draw; draw();
  content.append(node('p', 'Parts form from experience and recalled memories. Working instances may span turns; retired instances stay here for inspection. Similar later experiences create new instances.', 'muted'));
  componentSearchControls(toolbar); content.append(list);
}

function inspectorSection(title: string, values: string[], checkmarks = false): HTMLElement {
  const section = node('section', '', 'part-detail-section'); section.append(node('h3', title));
  if (!values.length) section.append(node('p', 'None recorded', 'muted'));
  else {
    const list = node('ul', '', checkmarks ? 'part-beliefs' : 'part-detail-list');
    for (const value of values) {
      const item = node('li');
      if (checkmarks) { const check = node('span', '✓', 'part-belief-check'); check.setAttribute('aria-hidden', 'true'); item.append(check); }
      item.append(node('span', value)); list.append(item);
    }
    section.append(list);
  }
  return section;
}
function inspectorPopup(title: string, sections: HTMLElement[], actions: HTMLElement[] = []): HTMLDialogElement {
  const dialog = node('dialog', '', 'cycle-modal part-record-dialog'); dialog.setAttribute('aria-label', title);
  const header = node('div', '', 'modal-header');
  const close = button('✕', () => dialog.close(), true); close.setAttribute('aria-label', 'Close information');
  const controls = node('div', '', 'memory-inspector-actions'); controls.append(...actions, close);
  header.append(node('h3', title), controls);
  const body = node('div', '', 'modal-body'); body.append(...sections);
  dialog.append(header, body); document.body.append(dialog); dialog.showModal();
  return dialog;
}
function predictionsPage(): void {
  const toolbar = node('div', '', 'identity-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = 'Search predictions, Parts or status'; search.setAttribute('aria-label', 'Search predictions');
  toolbar.append(search);
  componentCreationControls(plusButton('Create prediction', () => componentAuthoring('prediction')), smartCreationButton('Smart create prediction', () => componentAuthoring('prediction', true)));
  const list = node('div', '', 'predictions-list');
  const predictions = state!.predictions.slice().sort((a, b) => (recordDate(b.createdCycle) ?? '').localeCompare(recordDate(a.createdCycle) ?? ''));
  const draw = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = browse.apply(predictions);
    if (!query && !browse.active()) {
      const section = (title: string, items: Prediction[], empty: string): HTMLElement => {
        const panel = node('section', '', 'part-record-container');
        panel.setAttribute('aria-label', title);
        panel.append(node('h3', title), ...items.map(predictionRow));
        if (!items.length) panel.append(node('p', empty, 'muted'));
        return panel;
      };
      list.replaceChildren(
        section('Active predictions', predictions.filter(prediction => prediction.status === 'open'), 'No active predictions.'),
        section('Recent predictions', predictions.filter(prediction => prediction.status !== 'open'), 'No recent predictions.'),
      );
      return;
    }
    const matches = visible.filter(prediction => `${prediction.expectation} ${partName(prediction.partId)} ${prediction.status} ${predictionDisplay(prediction).label}`.toLocaleLowerCase().includes(query));
    const results = node('section', '', 'part-record-container');
    results.append(...matches.map(predictionRow));
    if (!matches.length) results.append(node('p', predictions.length ? 'No predictions match your search.' : 'No predictions yet.', 'muted'));
    list.replaceChildren(results);
  };
  const browse = componentBrowse<Prediction>([
    { key: 'expectation', label: 'Expectation', value: item => item.expectation },
    { key: 'date', label: 'Created', value: item => recordDate(item.createdCycle) ?? '' },
    { key: 'confidence', label: 'Confidence', value: item => item.confidence },
    { key: 'status', label: 'Status', value: item => item.status, options: ['open', 'resolved', 'abandoned', 'expired', 'invalidated'].map(value => [value, value]) },
    { key: 'owner', label: 'Origin', value: item => item.partId ?? 'gap', options: [['gap', 'Coverage hypothesis'], ...state!.parts.map(item => [item.id, item.name] as [string, string])] },
  ], draw);
  toolbar.append(...browse.controls);
  search.oninput = draw; draw();
  componentSearchControls(toolbar); content.append(list);
}

function predictionRow(prediction: Prediction): HTMLElement {
    const result = predictionDisplay(prediction); const row = node('div', '', 'part-prediction-row');
    const marker = node('span', result.symbol, `prediction-marker ${result.kind}`); marker.title = result.label; marker.setAttribute('role', 'img'); marker.setAttribute('aria-label', result.label);
    const expectation = node('span', prediction.expectation, 'part-prediction-expectation'); expectation.title = prediction.expectation;
    const date = node('time', readableDate(recordDate(prediction.createdCycle))); const timestamp = recordDate(prediction.createdCycle); if (timestamp) date.dateTime = timestamp;
    const more = button('i', () => openPredictionInfo(prediction), true); more.className = 'part-record-info'; more.setAttribute('aria-label', `Prediction information: ${prediction.expectation}`);
    row.append(marker, expectation, date, more); return row;
}

function predictionDisplay(prediction: Prediction, useOutcomeCheck = true): { kind: string; label: string; symbol: string } {
  if (prediction.status === 'open') return { kind: 'open', label: 'Active', symbol: '◇' };
  const checked = useOutcomeCheck ? events.slice().reverse().find(event => event.type === 'prediction.outcome_checked' && event.payload.predictionId === prediction.id) : undefined;
  const outcome = checked?.type === 'prediction.outcome_checked' ? checked.payload.outcome : undefined;
  if (prediction.status === 'resolved' && (outcome === 'correct' || (!outcome && prediction.evaluation?.assessment === 'confirmed')))
    return { kind: 'correct', label: 'Correct', symbol: '✓' };
  if (prediction.status === 'resolved' && (outcome === 'incorrect' || (!outcome && prediction.evaluation?.assessment === 'contradicted')))
    return { kind: 'incorrect', label: 'Incorrect', symbol: '✕' };
  return { kind: 'inconclusive', label: `Irreconcilable / inconclusive · ${prediction.status}`, symbol: '' };
}
function recordDate(cycleId: string): string | undefined {
  return state?.cycles.find(cycle => cycle.id === cycleId)?.startedAt;
}
function readableDate(value?: string): string {
  return value ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable';
}
function predictionInfoSections(prediction: Prediction, current: boolean): HTMLElement[] {
  const result = predictionDisplay(prediction, current);
  const sections = [
    inspectorSection('Expectation', [prediction.expectation]),
    inspectorSection('Prediction details', [`Outcome: ${result.label}`, `Status: ${prediction.status}`, `Created: ${readableDate(recordDate(prediction.createdCycle))}`, `Confidence: ${prediction.confidence} (${prediction.confidence * 100}%)`, `Horizon: ${prediction.horizon}`, `Evaluate after cycle: ${prediction.evaluateAfterCycle ?? 'Not scheduled'}`, `Version: ${prediction.version}`]),
    inspectorSection('My interpretation', [prediction.capsule.interpretation]),
    inspectorSection('Context I retained', prediction.capsule.details),
    inspectorSection('Entities', prediction.capsule.entities),
    inspectorSection('Captured activation', [`Activation: ${prediction.capsule.activation}`, `Activation spike: ${prediction.capsule.spike}`]),
  ];
  if (prediction.evaluation) sections.push(
    inspectorSection('Evaluation', [`Assessment: ${prediction.evaluation.assessment.replaceAll('_', ' ')}`, prediction.evaluation.interpretation]),
    inspectorSection('Causal attribution', [prediction.evaluation.causalAttribution]),
    inspectorSection('Evidence', prediction.evaluation.evidence),
  );
  if (prediction.gapOrigin) sections.push(inspectorSection('Coverage hypothesis origin', [prediction.gapOrigin.gap, prediction.gapOrigin.consequentialValue, prediction.gapOrigin.existingStructureInsufficient, ...Object.entries(prediction.gapOrigin.futureInference).map(([kind, text]) => `${kind}: ${text}`)]));
  sections.push(inspectorSection('Record references', [`Prediction: ${prediction.id}`, `Agent: ${prediction.agentId}`, `Origin: ${prediction.partId ?? 'Coverage hypothesis without an owning Part'}`, `Schema version: ${prediction.schemaVersion}`, `Created cycle: ${prediction.createdCycle}`, ...prediction.capsule.sourceIds.map(id => `Source: ${id}`), `Memory: ${prediction.memoryId ?? 'None'}`, `Evidence WorldState: ${prediction.evaluation?.evidenceWorldId ?? 'None'}`]));
  return sections;
}
async function openPredictionInfo(prediction: Prediction): Promise<void> {
  const record = await api<{ prediction: Prediction; versions: VersionRecord<Prediction>[] }>(`predictions/${prediction.id}`);
  const history = node('div', '', 'prediction-version-list');
  for (const version of record.versions.slice().sort((a, b) => b.state.version - a.state.version)) {
    const current = version.state.version === record.prediction.version;
    const entry = node('details'); entry.setAttribute('name', `prediction-versions-${prediction.id}`);
    entry.append(node('summary', `Version ${version.state.version} · ${readableDate(version.at)}${current ? ' · Current' : ''}`));
    entry.open = current;
    entry.append(inspectorSection('Version history', [`Saved: ${version.at}`, `Origin: ${version.change.origin}`, `Reason: ${version.change.reason}`]), inspectorSection('Change source references', version.change.sourceIds), ...predictionInfoSections(version.state, current));
    const raw = button('Inspect raw prediction version', () => inspectorPopup('Raw prediction version', [details('Prediction version record', version, true)]), true);
    entry.append(raw); history.append(entry);
  }
  inspectorPopup('Prediction information', [history]);
}
type MemorySearchView = { query: string; mode: 'vector' | 'jev'; results: MemorySearchResult[] | null; busy: boolean; message: string };
const memorySearchViews = new Map<string, MemorySearchView>();
function invalidateMemoryResults(memoryId: string): void {
  for (const view of memorySearchViews.values()) {
    if (view.results?.some(result => result.memory.id === memoryId)) view.results = view.results.filter(result => result.memory.id !== memoryId);
  }
}
function memoryActionIcon(label: string, kind: 'pencil' | 'trash', action: () => Promise<void>): HTMLButtonElement {
  const control = button('', action, true); control.type = 'button'; control.title = label; control.setAttribute('aria-label', label);
  control.classList.add('memory-action-icon');
  control.innerHTML = kind === 'pencil'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
  return control;
}
function memoriesPage(): void {
  const agentId = selectedAgent;
  componentCreationControls(plusButton('Create memory', () => componentAuthoring('memory')), smartCreationButton('Smart create memory', () => componentAuthoring('memory', true)));
  let view = memorySearchViews.get(agentId);
  if (!view) { view = { query: '', mode: 'vector', results: null, busy: false, message: '' }; memorySearchViews.set(agentId, view); }
  const saved = view;
  let overview: MemoryOverview | null = null;
  let overviewError = '';
  const defaults = node('div', '', 'memory-default-rankings');
  const form = node('form', '', 'memory-search-toolbar');
  const query = node('input'); query.type = 'search'; query.placeholder = 'Search memories…'; query.value = saved.query;
  query.setAttribute('aria-label', 'Search memories'); query.maxLength = 4000;
  const resultList = node('ul', '', 'memory-search-results'); resultList.setAttribute('aria-label', 'Memory search results');
  const status = node('p', '', 'memory-search-status muted'); status.setAttribute('role', 'status');
  const paint = (): void => {
    resultList.replaceChildren(); defaults.replaceChildren();
    if (!saved.query.trim()) {
      status.textContent = overviewError || (overview ? overview.mostRecent.length ? '' : 'No memories yet.' : 'Loading memories…');
      const sections = browse.active()
        ? [['Memories', browse.apply(state!.memories).map(memory => ({ memory, timestamp: recordDate(memory.createdCycle) ?? null, accessCount: overview?.mostAccessed.find(entry => entry.memory.id === memory.id)?.accessCount ?? 0 }))]] as const
        : [['Most accessed memories', overview?.mostAccessed], ['Most recent memories', overview?.mostRecent]] as const;
      if (browse.active()) status.textContent = `${browse.apply(state!.memories).length} matching memories`;
      for (const [title, entries] of sections) {
        if (!entries?.length) continue;
        const section = node('section'); section.setAttribute('aria-label', title); section.append(node('h3', title));
        const list = node('ul', '', 'memory-search-results');
        for (const entry of entries) {
          const row = node('li', '', 'memory-search-result'); row.dataset.memoryId = entry.memory.id;
          const date = node('time', entry.timestamp ? new Date(entry.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date', 'memory-result-date');
          if (entry.timestamp) { date.dateTime = entry.timestamp; date.title = `Memory formed ${entry.timestamp}`; }
          const text = node('p', entry.memory.content, 'memory-result-text');
          const accesses = node('span', `${entry.accessCount} ${entry.accessCount === 1 ? 'recall' : 'recalls'}`, 'memory-result-activation');
          accesses.title = 'Times supplied to cognitive recall; researcher searches and inspection are excluded';
          const info = button('i', () => openMemoryInfo(entry.memory), true); info.type = 'button'; info.className = 'part-record-info';
          info.setAttribute('aria-label', `Memory information: ${entry.memory.gist}`); info.title = 'Inspect memory';
          row.append(date, text, accesses, info); list.append(row);
        }
        section.append(list); defaults.append(section);
      }
      return;
    }
    status.textContent = saved.busy ? 'Searching memories…' : saved.message || (saved.results === null ? 'Search to find relevant memories.' : saved.results.length ? `${saved.results.length} ${saved.results.length === 1 ? 'memory' : 'memories'} found.` : 'No relevant memories found.');
    const allowed = new Map(browse.apply((saved.results ?? []).map(result => result.memory)).map((memory, index) => [memory.id, index]));
    const visibleResults = (saved.results ?? []).filter(result => allowed.has(result.memory.id)).sort((a, b) => allowed.get(a.memory.id)! - allowed.get(b.memory.id)!);
    if (saved.results !== null && !saved.busy) status.textContent = visibleResults.length ? `${visibleResults.length} memories found` : 'No relevant memories found.';
    for (const result of visibleResults) {
      const row = node('li', '', 'memory-search-result'); row.dataset.memoryId = result.memory.id;
      const date = node('time', result.timestamp ? new Date(result.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date', 'memory-result-date');
      if (result.timestamp) { date.dateTime = result.timestamp; date.title = `Memory formed ${result.timestamp}`; }
      const text = node('p', result.memory.content, 'memory-result-text');
      const activation = node('span', result.activation.toFixed(2), 'memory-result-activation');
      activation.title = result.mode === 'jev' ? 'JEV memory relevance (0–1)' : 'Vector similarity (−1 to 1)';
      activation.setAttribute('aria-label', `Activation ${result.activation.toFixed(2)}`);
      const info = button('i', () => openMemoryInfo(result.memory), true); info.type = 'button'; info.className = 'part-record-info';
      info.setAttribute('aria-label', `Memory information: ${result.memory.gist}`); info.title = `Inspect memory · ${result.ownerName}`;
      row.append(date, text, activation, info); resultList.append(row);
    }
  };
  const search = async (mode: 'vector' | 'jev'): Promise<void> => {
    if (saved.busy) return;
    saved.query = query.value.trim(); saved.mode = mode;
    if (!saved.query) { saved.results = null; saved.message = ''; paint(); query.focus(); return; }
    saved.busy = true; saved.results = null; saved.message = ''; vector.disabled = jev.disabled = true; paint();
    try { saved.results = await api<MemorySearchResult[]>(`agents/${agentId}/memories/search`, 'POST', { query: saved.query, mode }); }
    catch (cause) { showError(cause); }
    finally { saved.busy = false; vector.disabled = jev.disabled = false;
      if (selectedAgent === agentId && activeTab === 'Memories' && !resultList.isConnected) render(); else paint(); }
  };
  const vector = button('Vector search', () => search('vector'), true); vector.type = 'button';
  const jev = button('JEV search', () => search('jev')); jev.type = 'button';
  vector.disabled = jev.disabled = saved.busy;
  query.oninput = () => { saved.query = query.value; if (!saved.query.trim()) { saved.results = null; saved.message = ''; } paint(); };
  form.onsubmit = event => { event.preventDefault(); void search(saved.mode); };
  const browse = componentBrowse<Memory>([
    { key: 'gist', label: 'Gist', value: item => item.gist },
    { key: 'date', label: 'Created', value: item => recordDate(item.createdCycle) ?? '' },
    { key: 'version', label: 'Version', value: item => item.version },
    { key: 'owner', label: 'Origin', value: item => item.synthesis ? 'synthesis' : item.partId ?? 'gap', options: [['synthesis', 'Disposition synthesis'], ['gap', 'Coverage hypothesis'], ...state!.parts.map(item => [item.id, item.name] as [string, string])] },
    { key: 'prediction', label: 'Prediction link', value: item => item.predictionId ? 'linked' : 'unlinked', options: [['linked', 'Linked to prediction'], ['unlinked', 'No prediction link']] },
  ], paint);
  form.append(vector, jev, query, ...browse.controls); componentSearchControls(form); content.append(status, defaults, resultList); paint();
  void api<MemoryOverview>(`agents/${agentId}/memories/overview`).then(result => { overview = result; paint(); }).catch(cause => { overviewError = 'Unable to load memories.'; showError(cause); paint(); });
}

function memoryProvenance(memory: Memory): HTMLElement {
  const ancestry = node('section', '', 'part-detail-section'); ancestry.append(node('h3', `Originating events · provenance · version ${memory.version}`));
  if (!memory.ancestorIds.length) ancestry.append(node('p', 'None recorded', 'muted'));
  for (const ancestorId of memory.ancestorIds) {
    const source = node('div', '', 'row');
    const inspect = button('Inspect originating event', async () => {
      let world: unknown;
      try { world = await api(`worlds/${ancestorId}`); } catch {
        inspectorPopup('Originating event unavailable', [node('p', 'The originating legacy log was discarded. This opaque reference preserves provenance; the subjective memory remains available.')]); return;
      }
      inspectorPopup('Originating event · objective audit record', [
        node('p', 'This is an objective source record, separate from the Part’s subjective memory.', 'muted'),
        details('Originating WorldState', world, true),
      ]);
    }, true);
    inspect.title = ancestorId; source.append(node('span', ancestorId), inspect); ancestry.append(source);
  }
  return ancestry;
}
function memoryInfoSections(memory: Memory): HTMLElement[] {
  return [
    inspectorSection('Gist', [memory.gist]), inspectorSection('My memory', [memory.content]),
    inspectorSection('Context', memory.context),
    ...(memory.synthesis ? [inspectorSection('Consolidated source lineage', [memory.synthesis.reason,
      `Disposition version: ${memory.synthesis.dispositionVersion}`, `Sleep run: ${memory.synthesis.runId}`,
      ...memory.synthesis.sources.map(source => {
        const current = state?.memories.find(memory => memory.id === source.memoryId);
        return `${current?.version === source.version ? current.gist : source.memoryId} · source version ${source.version} · ${source.memoryId}`;
      })])] : []),
    ...(memory.encoding ? [inspectorSection('Perspective when encoded', [memory.encoding.interpretation, memory.encoding.affect || 'No affect recorded']), inspectorSection('Fallible perceived details · effortful recall', memory.encoding.perceivedDetails)] : []),
    inspectorSection('Record details', [`Created: ${readableDate(memory.synthesis ? state?.consolidations.find(run => run.id === memory.synthesis!.runId)?.startedAt : recordDate(memory.createdCycle))}`, `Version: ${memory.version}`, `Memory: ${memory.id}`, `Agent: ${memory.agentId}`, `Formation origin: ${memory.synthesis ? `Disposition synthesis: ${state?.dispositions.find(disposition => disposition.id === memory.synthesis!.dispositionId)?.name ?? memory.synthesis.dispositionId}` : memory.partId ? `${partName(memory.partId)} (${memory.partId})` : `Coverage hypothesis ${memory.predictionId ?? 'unavailable'}`}`, `Schema version: ${memory.schemaVersion}`, `Deleted: ${memory.deleted ? 'Yes' : 'No'}`, `Created cycle: ${memory.createdCycle}`, ...(memory.predictionId ? [`Prediction: ${memory.predictionId}`] : [])]),
  ];
}
async function openMemoryInfo(memory: Memory): Promise<void> {
  const record = await api<{ memory: Memory; versions: VersionRecord<Memory>[] }>(`memories/${memory.id}`);
  const history = node('div', '', 'memory-version-list');
  const provenance = node('div', '', 'memory-provenance'); provenance.append(memoryProvenance(record.memory));
  for (const version of record.versions.slice().sort((a, b) => b.state.version - a.state.version)) {
    const entry = node('details');
    entry.setAttribute('name', `memory-versions-${memory.id}`);
    entry.append(node('summary', `Version ${version.state.version} · ${readableDate(version.at)}${version.state.version === record.memory.version ? ' · Current' : ''}`));
    entry.open = version.state.version === record.memory.version;
    entry.append(node('p', `${version.change.origin.replaceAll('_', ' ')} · ${version.change.reason}`, 'muted'), ...memoryInfoSections(version.state));
    entry.addEventListener('toggle', () => { if (entry.open) provenance.replaceChildren(memoryProvenance(version.state)); });
    history.append(entry);
  }
  const edit = memoryActionIcon('Edit memory', 'pencil', async () => {
    const body = dialog.querySelector<HTMLElement>('.modal-body')!;
    const form = node('form', '', 'memory-edit-form');
    const gist = field(form, 'Gist', record.memory.gist, true);
    const contentInput = field(form, 'Memory text', record.memory.content, true);
    const contextInput = field(form, 'Context (one detail per line)', record.memory.context.join('\n'), true);
    const error = node('p', '', 'memory-edit-error'); error.setAttribute('role', 'alert');
    const controls = node('div', '', 'row');
    const save = button('Save memory', async () => {
      try {
        await api(`memories/${memory.id}`, 'PATCH', { expectedVersion: record.memory.version,
          patch: { gist: gist.value, content: contentInput.value, context: lines(contextInput.value) } });
        dialog.close(); await refresh();
        for (const view of memorySearchViews.values()) if (view.results?.some(result => result.memory.id === memory.id)) { view.results = null; view.message = 'Memory updated. Search again to refresh results.'; }
        if (activeTab === 'Memories' || activeTab === 'Parts') render();
        await openMemoryInfo(memory);
      } catch (cause) { showError(cause); }
    });
    save.type = 'button';
    const cancel = button('Cancel', () => { body.replaceChildren(...sections); edit.disabled = false; }, true); cancel.type = 'button';
    controls.append(save, cancel); form.append(error, controls); form.onsubmit = event => { event.preventDefault(); save.click(); };
    body.replaceChildren(form); gist.focus();
  });
  const remove = memoryActionIcon('Delete memory', 'trash', async () => {
    await api(`memories/${memory.id}`, 'DELETE', { expectedVersion: record.memory.version });
    dialog.close(); invalidateMemoryResults(memory.id); await refresh();
    if (activeTab === 'Memories' || activeTab === 'Parts') render();
    notice.textContent = 'Memory deleted.';
  });
  edit.disabled = remove.disabled = Boolean(record.memory.deleted);
  const raw = details('All memory data', { memory: record.memory, formationTimestamp: record.versions[0]?.at ?? null, versions: record.versions });
  const recall = node('section', '', 'part-detail-section'); recall.append(node('h3', 'Effortful recollection'));
  const recallQuestion = field(recall, 'Question', 'What details do I remember that qualify my interpretation?');
  const recalled = node('p', '', 'muted');
  recall.append(button('Recall perceived details', async () => {
    const result = await api<{ recollection: string; uncertainty: string }>(`agents/${memory.agentId}/memories/${memory.id}/recall`, 'POST', { question: recallQuestion.value });
    recalled.textContent = `${result.recollection} ${result.uncertainty}`;
  }, true), recalled);
  const sections = [recall, inspectorSection('Formation date' , [readableDate(record.versions[0]?.at)]), history, raw, provenance];
  const dialog = inspectorPopup('Memory information', sections, [edit, remove]);
}
type PartThoughtEvent = Extract<CognitiveEvent, { type: 'part.thought' }>;
function partThoughtRow(thought: PartThoughtEvent): HTMLElement {
  const row = node('article', '', 'part-thought-row');
  const text = node('div', '', 'part-thought-text');
  text.append(node('p', thought.payload.output.thought));
  const date = node('time', readableDate(thought.at)); date.dateTime = thought.at;
  text.append(date);
  const more = button('i', () => inspectorPopup('Raw thought object', [details('Thought object', thought.payload, true), details('Event record', thought)]), true);
  more.className = 'part-record-info'; more.setAttribute('aria-label', `Thought information: ${thought.payload.output.thought}`);
  row.append(text, more); return row;
}
async function showPart(partId: string): Promise<void> {
  const info = await api<{ part: Part; versions: VersionRecord<Part>[]; memories: Memory[]; predictions: Prediction[] }>(activeSessionId ? `parts/${partId}/threads/${activeSessionId}` : `parts/${partId}`);
  const { part } = info;
  const layout = node('div', '', 'part-inspector');
  const timeline = node('nav', '', 'part-version-timeline'); timeline.setAttribute('aria-label', 'Part version timeline');
  timeline.append(node('h3', 'Part history'));
  const right = node('div', '', 'part-inspector-main');
  const description = node('article', '', 'part-description');
  const versions = info.versions.slice().sort((a, b) => b.state.version - a.state.version);
  const currentRecord = versions.find(record => record.state.version === part.version);
  const entries = [{ perspective: part, record: currentRecord }, ...versions.filter(record => record.state.version !== part.version).map(record => ({ perspective: record.state, record }))];
  const stars: HTMLButtonElement[] = [];
  const select = (perspective: Part, record?: VersionRecord<Part>): void => {
    stars.forEach(star => star.setAttribute('aria-pressed', String(star.dataset.version === String(perspective.version))));
    const isCurrent = perspective.version === part.version;
    predictions.hidden = memories.hidden = !isCurrent;
    description.replaceChildren();
    const heading = node('div', '', 'part-description-heading');
    const nameRow = node('div', '', 'part-inspector-name');
    const raw = button('i', () => inspectorPopup('Raw Part inspector data', isCurrent ? [
      details('Selected perspective', perspective, true), details('Current perspective', part),
      details('All Part versions', info.versions),
      details('Recent activations, bids and outcomes', events.filter(event => JSON.stringify(event.payload).includes(part.id)).slice(-30)),
    ] : [details('Selected perspective', perspective, true), ...(record ? [details('Version record', record)] : [])]), true);
    raw.className = 'part-record-info'; raw.setAttribute('aria-label', 'Raw Part inspector data');
    nameRow.append(node('h2', perspective.name), raw);
    if (isCurrent) nameRow.append(button('Edit perspective', () => partEditor(part), true));
    if (isCurrent && !part.instance?.retirement) nameRow.append(button(part.lifecycle === 'active' ? 'Archive' : 'Reactivate', async () => {
      await api(`parts/${part.id}`, 'PATCH', { expectedVersion: part.version, patch: { lifecycle: part.lifecycle === 'active' ? 'archived' : 'active' } }); await refresh(); await showPart(part.id);
    }, true));
    heading.append(nameRow);
    const badges = node('div', '', 'part-detail-badges');
    for (const label of [`Version ${perspective.version}`, perspective.version === part.version ? 'Current' : 'Historical', perspective.lifecycle, perspective.mode, perspective.instance ? perspective.instance.retirement ? 'Retired instance' : 'Working instance' : perspective.temporary ? 'Temporary' : 'Persistent']) badges.append(node('span', label, 'badge'));
    heading.append(badges); description.append(heading);
    if (perspective.instance) {
      description.append(inspectorSection('This perspective', [perspective.instance.interpretation,
        `Created in ${perspective.instance.createdCycle}`, `Thread: ${perspective.instance.threadId ?? 'default'}`,
        ...(perspective.instance.dispositionBindings?.length ? perspective.instance.dispositionBindings.map(binding => {
          const disposition = state!.dispositions.find(item => item.id === binding.dispositionId);
          return `Scope: ${disposition?.name ?? binding.dispositionId} · ${disposition?.scope ?? binding.entityId}`;
        }) : [perspective.name === 'self' ? 'Scope: Identity fallback' : 'Scope: Unbound recorded perspective']),
        ...(perspective.instance.retirement ? [`Retired: ${perspective.instance.retirement.reason}`] : ['Working concern remains open.'])]));
      for (const [label, ids] of [['Supporting memories', perspective.instance.evidenceMemoryIds], ['Contrary memories', perspective.instance.counterevidenceMemoryIds]] as const) {
        const evidence = node('section', '', 'part-detail-section'); evidence.append(node('h3', label));
        for (const memoryId of ids) {
          const memory = state!.memories.find(memory => memory.id === memoryId);
          evidence.append(memory ? button(memory.gist, () => openMemoryInfo(memory), true) : node('p', memoryId));
        }
        if (!ids.length) evidence.append(node('p', 'No memory evidence recorded; current experience may supply the interpretation.', 'muted'));
        description.append(evidence);
      }
    }
    if (perspective.emotionalCharge?.trim()) description.append(node('p', `I am feeling ${perspective.emotionalCharge}`, 'part-version-caption part-feeling'));
    if (record) description.append(node('p', `${readableDate(record.at)} · ${record.change.origin.replaceAll('_', ' ')} · ${record.change.reason}`, 'part-version-caption'));
    const pastThoughts = events.filter((event): event is PartThoughtEvent => event.type === 'part.thought' && event.payload.partId === part.id &&
      (isCurrent || event.payload.partSnapshot?.version === perspective.version)).sort((a, b) => b.sequence - a.sequence);
    thoughts.hidden = !isCurrent && !pastThoughts.length;
    thoughts.replaceChildren(node('h3', 'Last Thoughts'));
    if (!isCurrent) thoughts.append(node('p', `Recorded thoughts from version ${perspective.version}`, 'muted'));
    for (const thought of pastThoughts.slice(0, 5)) thoughts.append(partThoughtRow(thought));
    if (!pastThoughts.length) thoughts.append(node('p', 'No thoughts recorded yet.', 'muted'));
    thoughts.append(button('View complete history', () => {
      const history = node('div', '', 'part-thought-history');
      for (const thought of pastThoughts) history.append(partThoughtRow(thought));
      if (!pastThoughts.length) history.append(node('p', 'No thoughts recorded yet.', 'muted'));
      inspectorPopup('Complete thought history', [history]);
    }, true));
    description.append(inspectorSection('My mission', [perspective.mission]), inspectorSection(`My Beliefs (${Number(((perspective.beliefConfidence ?? 1) * 100).toFixed(2))}% Confident)`, perspective.beliefs, true), inspectorSection('My strategies', perspective.strategies), inspectorSection('What activates me', perspective.triggers), inspectorSection('Retrieval keys · vector search only', perspective.retrievalKeys ?? []));
    const extras = node('div', '', 'part-detail-grid');
    extras.append(inspectorSection('My ongoing concern', [perspective.stickiness.concern || 'No ongoing concern', `Unresolved: ${perspective.stickiness.unresolved ? 'Yes' : 'No'}`, `Retained for consideration: ${perspective.stickiness.retained ? 'Yes' : 'No'}`]), inspectorSection('How I think', perspective.cognitiveCharacteristics), inspectorSection('My relationships', perspective.associations.map(relation => `${isCurrent ? partName(relation.targetPartId) : relation.targetPartId} — ${relation.meaning}`)), inspectorSection('My origins', perspective.provenance), inspectorSection('My ancestry', perspective.lineage.map(id => isCurrent ? partName(id) : id)));
    description.append(extras);
    if (perspective.version !== part.version && !part.instance?.retirement) description.append(button('Restore this psychology as a new version', async () => {
      await api(`parts/${part.id}/restore`, 'POST', { version: perspective.version, expectedVersion: part.version }); await refresh(); await showPart(part.id);
    }, true));
  };
  for (const { perspective, record } of entries) {
    const current = perspective.version === part.version;
    const star = button('', () => select(perspective, record), true); star.className = `part-version-star${current ? ' current' : ''}`;
    star.dataset.version = String(perspective.version); star.setAttribute('aria-label', `${current ? 'Current' : 'Historical'} version ${perspective.version}`);
    const icon = node('span', '★', 'part-star-symbol'); icon.setAttribute('aria-hidden', 'true');
    star.append(icon, node('span', current ? `Current · v${perspective.version}` : `Version ${perspective.version}`), node('small', record ? new Date(record.at).toLocaleDateString() : ''));
    stars.push(star); timeline.append(star);
  }
  const predictions = node('section', '', 'part-record-container'); predictions.append(node('h3', 'My predictions'), node('p', 'Current active prediction and recorded outcomes', 'muted'));
  const slot = node('div', '', 'part-active-prediction'); slot.setAttribute('aria-label', 'Current active prediction');
  slot.append(node('span', 'ACTIVE PREDICTION', 'part-slot-label'));
  const open = info.predictions.find(prediction => prediction.status === 'open');
  slot.append(open ? predictionRow(open) : node('p', 'No active prediction', 'part-empty-slot')); predictions.append(slot);
  const history = info.predictions.filter(prediction => prediction.status !== 'open').sort((a, b) => (recordDate(b.createdCycle) ?? '').localeCompare(recordDate(a.createdCycle) ?? ''));
  for (const prediction of history) predictions.append(predictionRow(prediction));
  if (!history.length) predictions.append(node('p', 'No past predictions yet.', 'muted'));
  const thoughts = node('section', '', 'part-record-container part-last-thoughts');
  const memories = node('section', '', 'part-record-container'); memories.append(node('h3', 'My memories'));
  const bubbles = node('div', '', 'part-memory-bubbles');
  for (const memory of info.memories.slice().reverse()) {
    const bubble = node('article', '', 'part-memory-bubble'); const more = button('i', () => openMemoryInfo(memory), true);
    more.className = 'part-record-info'; more.setAttribute('aria-label', `Memory information: ${memory.gist}`);
    bubble.append(node('p', memory.gist), more); bubbles.append(bubble);
  }
  memories.append(bubbles); if (!info.memories.length) memories.append(node('p', 'No memories recorded yet.', 'muted'));
  right.append(description, predictions, thoughts, memories); layout.append(timeline, right); content.replaceChildren(layout); select(part, currentRecord);
}

function network(): void {
  content.append(node('p', 'Solid edges are associations. Dashed edges are lineage.', 'muted'));
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 900 440'); svg.classList.add('graph');
  const positions = new Map(state!.parts.map((p, i) => { const angle = 2 * Math.PI * i / state!.parts.length; return [p.id, { x: 450 + 290 * Math.cos(angle), y: 220 + 150 * Math.sin(angle) }]; }));
  const edges: string[][] = [];
  for (const part of state!.parts) {
    for (const relation of [...part.associations.map(a => ({ target: a.targetPartId, kind: 'association', meaning: a.meaning })), ...part.lineage.map(target => ({ target, kind: 'lineage', meaning: 'Developmental ancestor' }))]) {
      const from = positions.get(part.id)!; const to = positions.get(relation.target); if (!to) continue;
      const line = document.createElementNS(ns, 'line'); for (const [key, value] of Object.entries({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })) line.setAttribute(key, String(value)); line.setAttribute('class', relation.kind); svg.append(line);
      edges.push([part.name, relation.kind, partName(relation.target), relation.meaning]);
    }
    for (const trigger of part.triggers) edges.push([part.name, 'trigger', trigger, 'Current retrieval surface']);
    for (const source of part.provenance) edges.push([part.name, 'provenance', source, 'Historical source, not an activation trigger']);
    for (const memory of state!.memories.filter(m => m.partId === part.id)) for (const ancestor of memory.ancestorIds) edges.push([part.name, 'memory ancestry', ancestor, memory.gist]);
    if (part.stickiness.retained) edges.push([part.name, 'stickiness', part.stickiness.concern, 'Candidate retention only']);
  }
  for (const part of state!.parts) { const p = positions.get(part.id)!; const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', String(p.x)); circle.setAttribute('cy', String(p.y)); circle.setAttribute('r', '20');
    const text = document.createElementNS(ns, 'text'); text.setAttribute('x', String(p.x)); text.setAttribute('y', String(p.y + 40)); text.setAttribute('text-anchor', 'middle'); text.textContent = part.name; svg.append(circle, text); }
  content.append(svg, table(['Part', 'Relationship type', 'Target', 'Meaning'], edges));
}
async function openDispositionInfo(disposition: AgentSnapshot['dispositions'][number]): Promise<void> {
  type Disposition = AgentSnapshot['dispositions'][number];
  const agentId = selectedAgent;
  const databaseId = selectedDatabase;
  const record = await api<{ disposition: Disposition; versions: VersionRecord<Disposition>[]; activationHistory: DispositionActivationSample[]; statistics: { activatedCycles: number; associatedPredictions: number; correct: number; incorrect: number; incomplete: number; irrelevant: number } }>(`dispositions/${disposition.id}`);
  if (selectedAgent !== agentId || selectedDatabase !== databaseId || activeTab !== 'Dispositions') return;
  const panel = node('section', '', 'disposition-inspector part-description'); panel.setAttribute('aria-label', 'Disposition inspector');
  const header = node('div', '', 'disposition-inspector-header');
  header.append(button('← Back to dispositions', () => render(), true), node('h2', record.disposition.name));
  const edit = memoryActionIcon('Edit disposition', 'pencil', async () => { componentAuthoring('disposition', false, record.disposition); });
  const remove = memoryActionIcon('Delete disposition', 'trash', async () => {
    await api(`dispositions/${disposition.id}`, 'DELETE', { expectedVersion: record.disposition.version });
    if (selectedAgent === agentId && selectedDatabase === databaseId) { await refresh(); render(); }
  });
  header.append(edit, remove);
  const body = node('div', '', 'disposition-inspector-body'); body.append(node('p', `Recorded activation cycles: ${record.statistics.activatedCycles} · Associated predictions: ${record.statistics.associatedPredictions} · Correct: ${record.statistics.correct} · Incorrect: ${record.statistics.incorrect} · Incomplete: ${record.statistics.incomplete} · Irrelevant: ${record.statistics.irrelevant}`), node('h3', 'Version timeline'));
  body.insertBefore(dispositionActivationChart(record.activationHistory, cycleId => showCycleInspector(cycleId, agentId)), body.lastChild);
  for (const version of record.versions.slice().sort((a, b) => b.state.version - a.state.version)) {
    const item = version.state; const entry = node('details'); entry.setAttribute('name', `disposition-${item.id}`);
    entry.open = item.version === record.disposition.version;
    entry.append(node('summary', `Version ${item.version} · ${readableDate(version.at)}${entry.open ? ' · Current' : ''}`),
      node('p', `${version.change.origin.replaceAll('_', ' ')} · ${version.change.reason}`, 'muted'),
      node('h3', item.name), node('p', item.concern), inspectorSection('Cues', item.cues),
      inspectorSection('Scope', [item.scope ?? 'Broad direct cue']),
      inspectorSection('Activation associations', dispositionAssociations(item).map(associationLabel)),
      inspectorSection('Memory evidence', item.memoryIds.map(id => state!.memories.find(memory => memory.id === id)?.gist ?? id)),
      node('p', `Activation threshold: ${item.threshold} · ${item.active ? 'Active' : 'Inactive'} · ${item.temporary ? 'Temporary' : 'Durable'}`), details('Disposition record', version));
    if (item.scaffold) entry.append(inspectorSection('Temporary Prediction-Bound Disposition', [
      `Hypothesis: ${item.sourcePredictionId} · version ${item.scaffold.hypothesisVersion}`,
      `Origin: ${item.scaffold.createdCycle} · thread ${item.scaffold.threadId ?? 'unthreaded'}`,
      `Tracked distinction: ${item.scaffold.relevance.trackedDistinction}`,
      `Future value: ${item.scaffold.relevance.futureValue}`,
      `End: ${item.scaffold.endedCycle ?? 'Unresolved'} · ${item.scaffold.endReason ?? 'No end evidence'}`,
      ...item.scaffold.relevance.supportEvidence.map(text => `Supports: ${text}`),
      ...item.scaffold.relevance.contradictEvidence.map(text => `Challenges: ${text}`),
    ]));
    if (item.development) {
      const development = item.development;
      if (development.learnedConcern) entry.append(inspectorSection('Inherited concern and meaning', [development.learnedConcern.concern, development.learnedConcern.meaning]));
      if (development.concernInheritance) {
        const inheritance = development.concernInheritance;
        entry.append(inspectorSection('Concern inheritance rationale', [inheritance.continuityReason, inheritance.distinctnessReason,
          `Investigations: ${inheritance.predictionIds.join(', ')}`]),
          inspectorSection('Attributed source thoughts', inheritance.thoughts.map(thought =>
            `${thought.association} · cycle ${thought.sequence} · ${thought.cycleId} · thread ${thought.threadId ?? 'unthreaded'} · Part ${thought.partId} v${thought.partVersion} · event ${thought.eventId}: ${thought.thought}${thought.localGoal ? ` · Local concern: ${thought.localGoal}` : ''}`)),
          details('Concern inheritance provenance', inheritance));
      }
      entry.append(node('h3', 'Development'),
        node('p', `${development.status} · ${development.confidence}`),
        inspectorSection('Retrieval intent', [development.retrievalIntent]),
        inspectorSection('Experienced context', development.contextCues),
        inspectorSection('Internal conditions', development.internalStateCues),
        inspectorSection('Cue provenance', (development.cueEvidence ?? []).map(cue => `${cue.kind}: ${cue.cue} · ${cue.memoryIds.join(', ')}`)),
        inspectorSection('Preserved lineage', development.lineage.map(link =>
          `${state!.dispositions.find(source => source.id === link.dispositionId)?.name ?? link.dispositionId} · version ${link.version} · ${link.relationship.replaceAll('_', ' ')}`)),
        inspectorSection('Reconciliation evidence', development.evidence.map(evidence => {
          const memory = state!.memories.find(memory => memory.id === evidence.memoryId);
          return `${memory?.gist ?? evidence.memoryId} · ${evidence.reconciliation} · retrieval ${evidence.retrievalUsefulness} · ${evidence.relationship}. ${evidence.reason}`;
        })), details('Attributed evidence references', development.evidence));
    } else entry.append(node('p', 'Developmental evidence was not recorded for this version.', 'muted'));
    if (item.version !== record.disposition.version) entry.append(button('Restore this version', async () => {
      await api(`dispositions/${disposition.id}/restore`, 'POST', { expectedVersion: record.disposition.version, version: item.version });
      if (selectedAgent === agentId && selectedDatabase === databaseId) { await refresh(); render(); const current = state!.dispositions.find(value => value.id === disposition.id); if (current) await openDispositionInfo(current); }
    }));
    body.append(entry);
  }
  panel.append(header, body); content.replaceChildren(panel);
}

function dispositionsPage(): void {
  componentCreationControls(plusButton('Create disposition', () => componentAuthoring('disposition')));
  const search = node('input'); search.type = 'search'; search.placeholder = 'Search dispositions'; search.setAttribute('aria-label', 'Search dispositions');
  const list = node('div');
  const draw = (): void => {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const visible = browse.apply(state!.dispositions.filter(item => [item.name, item.concern, item.scope ?? '', ...item.cues, ...dispositionAssociations(item).map(associationLabel)].join(' ').toLowerCase().includes(query)));
    const temporary = visible.filter(item => item.temporary);
    const durable = visible.filter(item => !item.temporary);
    for (const [title, description, dispositions] of [
      ['Temporary Prediction-Bound Dispositions', 'Prediction-bound dispositions that help investigate unresolved hypotheses in later cycles.', temporary],
      ['Persistent dispositions', 'Durable learned scopes that guide attention and the formation of Parts.', durable],
    ] as const) {
      const section = node('section', '', 'disposition-group');
      section.setAttribute('aria-label', title);
      section.append(node('h3', title), node('p', description, 'muted disposition-description'));
      if (!dispositions.length) section.append(node('p', query || browse.active() ? 'No matching dispositions.' : 'No items yet.', 'muted'));
      const rows = node('div', '', 'disposition-list');
      section.append(rows); list.append(section);
      for (const disposition of dispositions) {
        const row = node('div', '', 'disposition-row');
        row.classList.toggle('temporary', disposition.temporary);
        const inspect = button('', () => { void openDispositionInfo(disposition).catch(showError); }, true);
        inspect.classList.add('disposition-summary'); inspect.setAttribute('aria-label', `Inspect ${disposition.name}`);
        const concern = node('span', '', 'disposition-concern'); const text = node('span', disposition.concern); concern.append(text);
        inspect.append(node('span', disposition.name, 'disposition-name'), node('span', '›', 'muted'), concern,
          node('span', '›', 'muted'), node('span', disposition.cues.join(' · '), 'disposition-cues'));
        const edit = memoryActionIcon(`Edit ${disposition.name}`, 'pencil', async () => { componentAuthoring('disposition', false, disposition); });
        row.append(inspect, edit);
        row.onclick = event => { if (!(event.target instanceof Element && event.target.closest('button'))) void openDispositionInfo(disposition).catch(showError); };
        row.addEventListener('focusin', () => row.dispatchEvent(new MouseEvent('mouseenter')));
        row.onmouseenter = () => {
          const overflow = text.scrollWidth - concern.clientWidth;
          concern.style.setProperty('--marquee-distance', `${-Math.max(0, overflow)}px`);
          concern.classList.toggle('overflows', overflow > 0);
        };
        rows.append(row);
      }
    }
    const attentionSection = node('section', '', 'disposition-group');
    attentionSection.setAttribute('aria-label', 'Temporary attention');
    attentionSection.append(node('h3', 'Temporary attention'), node('p', 'Evidence targets and cues attached to open predictions; only predictions with attention cues appear here.', 'muted disposition-description'));
    const attentionList = node('div', '', 'disposition-list');
    const attentionPredictions = state!.predictions.filter(prediction => prediction.status === 'open' && prediction.attention?.length);
    const matches = attentionPredictions.filter(prediction => [prediction.expectation, ...prediction.attention!.flatMap(item => [item.target, ...item.cues])].join(' ').toLowerCase().includes(query));
    for (const prediction of matches) {
      const row = node('div', '', 'disposition-row temporary');
      const inspect = button('', () => inspectorPopup('Temporary attention', [
        inspectorSection('Source prediction', [prediction.expectation]),
        ...prediction.attention!.map(item => inspectorSection(item.target, item.cues)),
        button('Inspect source prediction', () => openPredictionInfo(prediction), true),
        details('Attention record', { sourcePredictionId: prediction.id, attention: prediction.attention }),
      ]), true);
      inspect.classList.add('disposition-summary');
      inspect.setAttribute('aria-label', `Inspect temporary attention: ${prediction.expectation}`);
      const expectation = node('span', prediction.expectation, 'disposition-concern'); expectation.title = prediction.expectation;
      const targets = node('span', prediction.attention!.map(item => item.target).join(' · '), 'disposition-cues'); targets.title = targets.textContent ?? '';
      inspect.append(expectation, node('span', '›', 'muted'), targets);
      row.append(inspect); attentionList.append(row);
    }
    if (!matches.length) attentionList.append(node('p', query ? 'No matching temporary attention.' : 'No open predictions with attention cues.', 'muted'));
    attentionSection.append(attentionList); list.append(attentionSection);
  };
  const browse = componentBrowse<AgentSnapshot['dispositions'][number]>([
    { key: 'name', label: 'Name', value: item => item.name },
    { key: 'threshold', label: 'Activation threshold', value: item => item.threshold },
    { key: 'status', label: 'Status', value: item => item.active ? 'active' : 'inactive', options: [['active', 'Active'], ['inactive', 'Inactive']] },
    { key: 'duration', label: 'Duration', value: item => item.temporary ? 'temporary' : 'durable', options: [['temporary', 'Temporary'], ['durable', 'Durable']] },
    { key: 'scope', label: 'Scope', value: item => item.scope ?? 'Broad direct cue', options: [...new Set(state!.dispositions.map(item => item.scope ?? 'Broad direct cue'))].map(value => [value, value]) },
    { key: 'associations', label: 'Associations', value: item => dispositionAssociations(item).length ? 'associated' : 'direct', options: [['direct', 'Direct only'], ['associated', 'Has associations']] },
  ], draw);
  componentSearchControls(search, ...browse.controls); search.oninput = draw; draw(); content.append(list);
}

function history(): void {
  const filter = node('input'); filter.placeholder = 'Filter by cycle, Part ID, type, memory or prediction'; filter.setAttribute('aria-label', 'Logs filter');
  const list = node('div'); const draw = (): void => { list.replaceChildren(); for (const event of events.filter(e => JSON.stringify(e).toLowerCase().includes(filter.value.toLowerCase())).slice().reverse()) list.append(details(`${event.sequence} · ${event.type} · ${event.at}`, event)); };
  filter.type = 'search';
  filter.oninput = draw; draw(); componentSearchControls(filter); content.append(list);
}
const identitySortPreferences = new Map<string, { role: boolean; category: boolean; roleDirection: string; categoryDirection: string }>();
const identityFilterPreferences = new Map<string, { roles: string[]; categories: string[] }>();
function identity(): void {
  const current = state!.identity;
  const toolbar = node('div', '', 'identity-toolbar');
  const search = node('input');
  search.type = 'search'; search.placeholder = 'Search questions, answers or keywords';
  search.setAttribute('aria-label', 'Search Identity traits');
  const brain = smartCreationButton('Model Identity on a person or character', openIdentityAuthoring);
  brain.title = 'Model Identity on a person or character'; brain.setAttribute('aria-label', brain.title);
  toolbar.append(search);
  componentCreationControls(plusButton('Add trait', () => openIdentityTrait()), brain);
  const sortPreferences = identitySortPreferences.get(selectedAgent) ?? { role: false, category: false, roleDirection: 'asc', categoryDirection: 'asc' };
  identitySortPreferences.set(selectedAgent, sortPreferences);
  const categories: Record<string, { label: string; icon: string }> = {
    cognition: { label: 'Cognition', icon: '🧠' }, speech: { label: 'Speech', icon: '💬' },
    life: { label: 'Life', icon: '🌳' }, reactions: { label: 'Reactions', icon: '⚡' },
    responsiveness: { label: 'Responsiveness', icon: '✉️' },
  };
  const categoryOf = (keywords: string[]): string => keywords.map(keyword => keyword.trim().toLowerCase()).find(keyword => categories[keyword]) ?? 'general';
  const sortPanel = node('div', '', 'identity-sort-panel');
  sortPanel.setAttribute('popover', 'auto');
  sortPanel.setAttribute('role', 'dialog');
  sortPanel.setAttribute('aria-label', 'Sort Identity traits');
  const sortButton = button('Sort', () => {
    const bounds = sortButton.getBoundingClientRect();
    sortPanel.style.top = `${bounds.bottom + 6}px`;
    sortPanel.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
    sortPanel.togglePopover();
  }, true);
  sortPanel.addEventListener('toggle', () => {
    sortButton.setAttribute('aria-expanded', String(sortPanel.matches(':popover-open')));
  });
  sortButton.setAttribute('aria-haspopup', 'dialog');
  sortButton.setAttribute('aria-expanded', 'false');
  sortButton.setAttribute('aria-controls', 'identity-sort-panel');
  sortPanel.id = 'identity-sort-panel';
  for (const [key, label] of [['role', 'Trait Role'], ['category', 'Icon category']] as const) {
    const control = node('label', '', 'identity-sort-control');
    const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = sortPreferences[key];
    const direction = node('select'); direction.setAttribute('aria-label', `${label} sort direction`);
    for (const [value, text] of [['asc', 'Ascending'], ['desc', 'Descending']]) {
      const option = node('option', text); option.value = value!; direction.append(option);
    }
    const directionKey = key === 'role' ? 'roleDirection' : 'categoryDirection';
    direction.value = sortPreferences[directionKey]; direction.hidden = !enabled.checked;
    enabled.onchange = () => { sortPreferences[key] = enabled.checked; direction.hidden = !enabled.checked; draw(); };
    direction.onchange = () => { sortPreferences[directionKey] = direction.value; draw(); };
    control.append(enabled, node('span', label), direction); sortPanel.append(control);
  }
  sortPanel.append(node('p', 'When both are selected, Trait Role sorts first, then icon category.', 'muted'));
  const filterPreferences = identityFilterPreferences.get(selectedAgent) ?? {
    roles: ['self_definition', 'autobiographical'], categories: [...Object.keys(categories), 'general'],
  };
  identityFilterPreferences.set(selectedAgent, filterPreferences);
  const filterPanel = node('div', '', 'identity-sort-panel identity-filter-panel');
  filterPanel.id = 'identity-filter-panel'; filterPanel.setAttribute('popover', 'auto');
  filterPanel.setAttribute('role', 'dialog'); filterPanel.setAttribute('aria-label', 'Filter Identity traits');
  const filterButton = button('Filter', () => {
    const bounds = filterButton.getBoundingClientRect();
    filterPanel.style.top = `${bounds.bottom + 6}px`;
    filterPanel.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
    filterPanel.togglePopover();
  }, true);
  filterButton.setAttribute('aria-haspopup', 'dialog'); filterButton.setAttribute('aria-expanded', 'false');
  filterButton.setAttribute('aria-controls', filterPanel.id);
  filterPanel.addEventListener('toggle', () => filterButton.setAttribute('aria-expanded', String(filterPanel.matches(':popover-open'))));
  const filterChecks: HTMLInputElement[] = [];
  for (const [key, title, options] of [
    ['roles', 'Trait Role', [['self_definition', 'Self-definition'], ['autobiographical', 'Autobiographical']]],
    ['categories', 'Icon category', [...Object.entries(categories).map(([id, category]) => [id, `${category.icon} ${category.label}`]), ['general', '◇ General']]],
  ] as [ 'roles' | 'categories', string, string[][] ][]) {
    const group = node('fieldset'); group.append(node('legend', title));
    for (const [value, label] of options as [string, string][]) {
      const control = node('label', '', 'identity-sort-control');
      const check = node('input'); check.type = 'checkbox'; check.value = value; check.dataset.filterGroup = key;
      check.checked = filterPreferences[key].includes(value); filterChecks.push(check);
      check.onchange = () => {
        filterPreferences[key] = filterChecks.filter(item => item.dataset.filterGroup === key && item.checked).map(item => item.value);
        draw();
      };
      control.append(check, node('span', label)); group.append(control);
    }
    filterPanel.append(group);
  }
  filterPanel.append(button('Reset filters', () => {
    filterChecks.forEach(check => { check.checked = true; });
    filterPreferences.roles = ['self_definition', 'autobiographical'];
    filterPreferences.categories = [...Object.keys(categories), 'general']; draw();
  }, true));
  const sortToolbar = node('div', '', 'identity-sort-toolbar'); sortToolbar.append(filterButton, sortButton);
  const list = node('div', '', 'identity-traits');
  const draw = (): void => {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const filtersActive = filterPreferences.roles.length !== 2 || filterPreferences.categories.length !== Object.keys(categories).length + 1;
    filterButton.textContent = filtersActive ? 'Filter · Active' : 'Filter';
    const traits = current.traits.filter(trait =>
      filterPreferences.roles.includes(trait.role ?? 'self_definition') && filterPreferences.categories.includes(categoryOf(trait.keywords)) &&
      [trait.question, trait.answer, ...trait.keywords].join(' ').toLocaleLowerCase().includes(query));
    traits.sort((a, b) => {
      const roleLabel = (role: string | undefined): string => role === 'autobiographical' ? 'Autobiographical' : 'Self-definition';
      const roleComparison = sortPreferences.role ? roleLabel(a.role).localeCompare(roleLabel(b.role)) * (sortPreferences.roleDirection === 'desc' ? -1 : 1) : 0;
      if (roleComparison) return roleComparison;
      return sortPreferences.category ? (categories[categoryOf(a.keywords)]?.label ?? 'General').localeCompare(categories[categoryOf(b.keywords)]?.label ?? 'General') * (sortPreferences.categoryDirection === 'desc' ? -1 : 1) : 0;
    });
    for (const trait of traits) {
      const category = categoryOf(trait.keywords);
      const appearance = categories[category] ?? { label: 'General', icon: '◇' };
      const row = button('', () => openIdentityTrait(trait.id), true);
      row.classList.add('identity-trait'); row.dataset.category = category;
      row.setAttribute('aria-label', trait.question);
      const categoryIcon = node('span', appearance.icon, 'identity-trait-category');
      categoryIcon.title = appearance.label; categoryIcon.setAttribute('aria-hidden', 'true');
      const keywords = node('span', trait.keywords.join(' · '), 'identity-trait-keywords');
      keywords.title = keywords.textContent ?? '';
      const question = node('span', trait.question.length > 48 ? `${trait.question.slice(0, 44).trimEnd()}...?` : trait.question, 'identity-trait-question');
      question.title = trait.question;
      const answer = node('span', '', 'identity-trait-answer');
      const answerText = node('span', trait.answer.replace(/\s+/g, ' ').trim(), 'identity-trait-answer-text');
      answer.append(answerText);
      let marquee: Animation | undefined;
      const stopMarquee = (): void => { marquee?.cancel(); marquee = undefined; };
      const startMarquee = (): void => {
        stopMarquee();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const overflow = answerText.scrollWidth - answer.clientWidth;
        if (overflow <= 0) return;
        const travelTime = Math.max(2000, overflow / 35 * 1000);
        const duration = travelTime + 1600;
        marquee = answerText.animate([
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: 800 / duration },
          { transform: `translateX(-${overflow}px)`, offset: 1 - 800 / duration },
          { transform: `translateX(-${overflow}px)`, offset: 1 },
        ], { duration, iterations: Infinity, direction: 'alternate', easing: 'linear' });
      };
      row.onmouseenter = startMarquee;
      row.onmouseleave = stopMarquee;
      row.onfocus = startMarquee;
      row.onblur = stopMarquee;
      const autobiographical = trait.role === 'autobiographical';
      const roleIcon = node('span', autobiographical ? '📖' : '🗣️', 'identity-trait-role');
      roleIcon.title = autobiographical ? 'Autobiographical — excluded from Self' : 'Self-definition — supplied to Self';
      roleIcon.setAttribute('aria-hidden', 'true'); row.title = roleIcon.title;
      row.append(categoryIcon, question, answer, keywords);
      list.append(row);
    }
    if (!traits.length) list.append(node('p', current.traits.length ? 'No matching traits.' : 'Add a trait to define this Identity.', 'muted'));
  };
  search.oninput = draw; draw();
  componentSearchControls(search, sortToolbar);
  content.append(sortPanel, filterPanel, list);
  if (current.mask) content.append(details('Temporary Identity mask', current.mask));
}

function openIdentityAuthoringHelp(): void {
  const dialog = node('dialog', '', 'cycle-modal identity-guidance-dialog');
  dialog.setAttribute('aria-label', 'About Identity auto-fill');
  const header = node('div', '', 'modal-header');
  const close = button('✕', () => dialog.close(), true); close.setAttribute('aria-label', 'Close auto-fill help');
  header.append(node('h3', 'About Identity auto-fill'), close);
  const body = node('div', '', 'modal-body');
  body.append(
    node('p', 'This wizard uses an LLM to fill in the preset Identity questions you select, inspired by a person or fictional character you choose. Enter a name to see possible versions, such as different adaptations or periods of their life. Choose one version and add any details you want reflected in the answers.'),
    node('p', 'Finding versions does not change your Identity. When Delete All Existing Traits is checked, Generate replaces all current Identity traits with the selected answers, removing custom questions and edited answers. Uncheck it to keep existing traits and add the generated answers.'),
    node('p', 'Replacement happens only after every answer has been generated and validated. If generation fails or the Identity changes while generation is running, the current Identity is kept. Earlier versions remain stored in history.'),
    node('p', 'Generated answers are an interpretation of the selected person or character and may contain invented details. Review and edit the traits afterward. You can customize the clarification and answer prompts in Settings → Prompts.'),
  );
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
}

function openIdentityAuthoring(): void {
  document.querySelector('#identity-authoring-dialog')?.remove();
  const agentId = selectedAgent; const expectedVersion = state!.identity.version;
  const savedCharacter = state!.identityAuthoringSettings;
  const dialog = node('dialog', '', 'cycle-modal identity-trait-dialog'); dialog.id = 'identity-authoring-dialog';
  dialog.setAttribute('aria-labelledby', 'identity-authoring-title');
  const header = node('div', '', 'modal-header');
  const title = node('h3', 'Identity auto-fill wizard'); title.id = 'identity-authoring-title';
  const actions = node('div', '', 'identity-trait-actions');
  const information = button('ⓘ', openIdentityAuthoringHelp, true);
  information.title = 'About Identity auto-fill'; information.setAttribute('aria-label', information.title);
  const close = button('✕', () => dialog.close(), true); close.setAttribute('aria-label', 'Close Identity generation');
  actions.append(information, close); header.append(title, actions);
  const body = node('form', '', 'modal-body');
  body.append(node('p', 'Automatically fill selected preset Identity questions using a person or fictional character as inspiration. Enter a name, choose a version, and add details before generating.'));
  const name = field(body, 'Person or character name', savedCharacter?.name ?? ''); name.required = true; name.maxLength = 300;
  const find = node('button', 'Find versions'); find.type = 'submit'; body.append(find);
  const options = node('fieldset'); options.hidden = true;
  const extras = node('div'); extras.hidden = true;
  const extraDetails = field(extras, 'Additional details', '', true); extraDetails.maxLength = 16000;
  extras.append(node('p', 'Generate answers the selected questions. Choose below whether to replace or keep existing traits.', 'muted'));
  const questionSection = node('div', '', 'identity-wizard-questions');
  const questionControls = node('div', '', 'identity-wizard-question-controls');
  const questionList = node('div', 'Loading questions…', 'identity-wizard-question-list');
  questionList.setAttribute('role', 'group'); questionList.setAttribute('aria-label', 'Questions to answer');
  const checks: HTMLInputElement[] = [];
  const selectionCount = node('span', '', 'muted');
  const updateSelection = (): void => { selectionCount.textContent = `${checks.filter(check => check.checked).length} of ${checks.length} selected`; generate.disabled = busy || !checks.some(check => check.checked); };
  const selectAll = button('Select all', () => { checks.forEach(check => { check.checked = true; }); updateSelection(); }, true);
  const selectNone = button('Select none', () => { checks.forEach(check => { check.checked = false; }); updateSelection(); }, true);
  selectAll.type = selectNone.type = 'button';
  questionControls.append(selectAll, selectNone, selectionCount); questionSection.append(questionControls, questionList); extras.append(questionSection);
  const deleteLabel = node('label', '', 'identity-wizard-delete');
  const deleteExisting = node('input'); deleteExisting.type = 'checkbox'; deleteExisting.checked = true;
  deleteLabel.append(deleteExisting, node('span', 'Delete All Existing Traits — Warning Cannot Be Undone'));
  extras.append(deleteLabel);
  const generate = button('Generate', async () => {
    const selected = options.querySelector<HTMLInputElement>('input:checked');
    if (busy || !selected || !reference || !checks.some(check => check.checked)) return;
    setBusy(true); status.textContent = 'Generating answers to selected questions… This may take several minutes.';
    try {
      await api(`agents/${agentId}/identity-authoring/generate`, 'POST', { ...reference, version: selected.value, details: extraDetails.value, expectedVersion, deleteExistingTraits: deleteExisting.checked, questionIds: checks.filter(check => check.checked).map(check => check.value) });
      dialog.close();
      if (selectedAgent === agentId) { await refresh(); render(); }
    } catch (cause) { status.textContent = ''; showError(cause); }
    finally { setBusy(false); }
  });
  generate.type = 'button'; extras.append(generate);
  const status = node('p', '', 'identity-trait-error'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  body.append(options, extras, status);
  let busy = false; let reference: { name: string } | null = null;
  const setBusy = (value: boolean): void => {
    busy = value; find.disabled = value; name.disabled = value;
    deleteExisting.disabled = value; selectAll.disabled = value; selectNone.disabled = value; checks.forEach(check => { check.disabled = value; }); updateSelection();
    extraDetails.disabled = value; options.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = value; });
  };
  const invalidate = (): void => { reference = null; options.hidden = true; extras.hidden = true; status.textContent = ''; };
  name.oninput = invalidate;
  generate.disabled = true;
  void api<IdentityQuestionGroup[]>('identity-questions').then(groups => {
    questionList.replaceChildren();
    for (const group of groups) for (const question of group.questions) {
      const label = node('label', '', 'identity-wizard-question');
      const check = node('input'); check.type = 'checkbox'; check.value = question.id; check.checked = true; check.disabled = busy;
      check.onchange = updateSelection; checks.push(check);
      const text = node('span', question.question); text.title = question.question;
      label.append(check, text); questionList.append(label);
    }
    updateSelection();
  }).catch(cause => { questionList.textContent = ''; showError(cause); });
  const showCharacterOptions = (result: { question: string; options: { label: string; description: string }[] }, selectedVersion?: string): void => {
    options.replaceChildren(node('legend', result.question));
    result.options.forEach((option, index) => {
      const label = node('label', '', 'identity-version-option');
      const radio = node('input'); radio.type = 'radio'; radio.name = 'identity-version'; radio.value = option.description; radio.checked = selectedVersion ? option.description === selectedVersion : index === 0;
      radio.onchange = () => {
        if (selectedAgent === agentId && state!.identityAuthoringSettings) state!.identityAuthoringSettings.selectedVersion = radio.value;
        void api(`agents/${agentId}/identity-authoring/settings`, 'PATCH', { selectedVersion: radio.value }).catch(cause => { showError(cause); });
      };
      const text = node('div'); text.append(node('strong', option.label), node('p', option.description));
      label.append(radio, text); options.append(label);
    });
    options.hidden = false; extras.hidden = false;
  };
  if (savedCharacter) {
    reference = { name: savedCharacter.name };
    showCharacterOptions(savedCharacter, savedCharacter.selectedVersion);
  }
  body.onsubmit = event => {
    event.preventDefault(); if (busy || !name.value.trim()) return;
    reference = { name: name.value.trim() };
    options.hidden = true; extras.hidden = true; setBusy(true); status.textContent = 'Finding versions…';
    void api<{ question: string; options: { label: string; description: string }[] }>(`agents/${agentId}/identity-authoring/clarify`, 'POST', reference).then(result => {
      if (selectedAgent === agentId) state!.identityAuthoringSettings = { ...reference!, ...result, selectedVersion: result.options[0]!.description };
      showCharacterOptions(result);
      options.hidden = false; extras.hidden = false; status.textContent = '';
    }).catch(cause => { reference = null; status.textContent = ''; showError(cause); }).finally(() => setBusy(false));
  };
  dialog.append(header, body); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); name.focus();
}

function openIdentityTrait(traitId?: string): void {
  document.querySelector('#identity-trait-dialog')?.remove();
  const agentId = selectedAgent;
  const current = state!.identity;
  const trait = current.traits.find(item => item.id === traitId);
  const dialog = node('dialog', '', 'cycle-modal identity-trait-dialog');
  dialog.id = 'identity-trait-dialog';
  dialog.setAttribute('aria-labelledby', 'identity-trait-title');
  const header = node('div', '', 'modal-header');
  const title = node('h3', trait ? 'Identity trait' : 'New Identity trait'); title.id = 'identity-trait-title';
  const actions = node('div', '', 'identity-trait-actions');
  const body = node('form', '', 'modal-body');
  const questionField = node('div');
  const questionHeader = node('div', '', 'identity-question-header');
  const questionLabel = node('label', 'Question');
  const question = node('textarea'); question.id = 'identity-trait-question';
  question.value = trait?.question ?? ''; questionLabel.htmlFor = question.id;
  questionLabel.append(question); questionHeader.append(questionLabel); questionField.append(questionHeader); body.append(questionField);
  const roleLabel = node('label', 'Trait role');
  const role = node('select'); role.id = 'identity-trait-role'; roleLabel.htmlFor = role.id;
  for (const [value, label] of [['self_definition', 'Self-definition — supplied to Self'], ['autobiographical', 'Autobiographical — excluded from Self']]) {
    const option = node('option', label); option.value = value!; role.append(option);
  }
  role.value = trait?.role ?? 'self_definition';
  roleLabel.append(role); body.append(roleLabel);
  const answer = field(body, 'Answer', trait?.answer ?? '', true);
  const keywords = field(body, 'Keywords (one per line)', trait?.keywords.join('\n') ?? '', true);
  if (!trait) {
    const autofill = button('Autofill', async () => {
      await openIdentityQuestionPicker(example => {
        question.value = example.question;
        role.value = example.role;
        keywords.value = example.keywords.join('\n');
        answer.focus();
      });
    }, true);
    autofill.type = 'button'; questionHeader.append(autofill);
  }
  question.required = true; answer.required = true;
  question.maxLength = 16000; answer.maxLength = 16000;
  const error = node('p', '', 'identity-trait-error'); error.setAttribute('role', 'alert');
  const payload = () => ({ question: question.value, answer: answer.value, keywords: lines(keywords.value), role: role.value });
  const base = `agents/${agentId}/identity/traits`;
  let pending = false;
  const perform = async (path: string, method: string, data: Record<string, unknown>, showCopy = false): Promise<void> => {
    if (pending) return;
    pending = true; error.textContent = '';
    dialog.querySelectorAll('button').forEach(control => { control.disabled = true; });
    try {
      const next = await api<AgentSnapshot['identity']>(path, method, { expectedVersion: current.version, ...data });
      dialog.close(); await refresh(); render();
      if (showCopy && selectedAgent === agentId) {
        const copy = next.traits.find(item => !current.traits.some(old => old.id === item.id));
        if (copy) openIdentityTrait(copy.id);
      }
    } catch (cause) {
      showError(cause);
    } finally {
      pending = false;
      dialog.querySelectorAll('button').forEach(control => { control.disabled = false; });
    }
  };
  const iconButton = (label: string, paths: string[], action: () => Promise<void>): HTMLButtonElement => {
    const control = button('', action, true);
    control.type = 'button'; control.title = label; control.setAttribute('aria-label', label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
    control.append(svg); return control;
  };
  if (trait) {
    actions.append(iconButton('Duplicate trait', ['M9 9h12v12H9z', 'M15 9V3H3v12h6'], async () => {
      await perform(`${base}/${encodeURIComponent(trait.id)}/duplicate`, 'POST', {}, true);
    }));
    const trash = iconButton('Delete trait', ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7M14 10v7'], async () => {
      await perform(`${base}/${encodeURIComponent(trait.id)}`, 'DELETE', {});
    });
    trash.classList.add('identity-delete'); actions.append(trash);
  }
  const information = button('ⓘ', openIdentityAnswerGuidance, true);
  information.type = 'button'; information.title = 'Answer guidance';
  information.setAttribute('aria-label', 'Show answer guidance');
  actions.append(information);
  header.append(title, actions);
  if (trait) {
    const stamp = node('time', `Created ${new Date(trait.createdAt).toLocaleString()}`, 'muted');
    stamp.dateTime = trait.createdAt; stamp.title = trait.createdAt; body.append(stamp);
  }
  const footer = node('div', '', 'identity-trait-footer');
  const cancel = button('Cancel', () => dialog.close(), true); cancel.type = 'button';
  const save = node('button', trait ? 'Save trait' : 'Create trait'); save.type = 'submit';
  footer.append(cancel, save); body.append(error, footer);
  body.onsubmit = event => { event.preventDefault(); void perform(trait ? `${base}/${encodeURIComponent(trait.id)}` : base, trait ? 'PATCH' : 'POST', payload()); };
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal(); question.focus();
}

async function openIdentityAnswerGuidance(): Promise<void> {
  const dialog = node('dialog', '', 'cycle-modal identity-guidance-dialog');
  dialog.setAttribute('aria-labelledby', 'identity-guidance-title');
  const header = node('div', '', 'modal-header');
  const title = node('h3', 'Identity answer guidance'); title.id = 'identity-guidance-title';
  const close = button('✕', () => dialog.close(), true);
  close.type = 'button'; close.setAttribute('aria-label', 'Close answer guidance');
  header.append(title, close);
  const body = node('div', '', 'modal-body');
  const instructions = node('pre', 'Loading guidance…', 'identity-guidance-text'); body.append(instructions);
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  try {
    const result = await api<{ guidance: string }>('identity-guidance');
    if (dialog.open) instructions.textContent = result.guidance;
  } catch (cause) {
    instructions.textContent = ''; showError(cause);
  }
}

async function openIdentityQuestionPicker(select: (question: IdentityQuestionGroup['questions'][number]) => void): Promise<void> {
  const picker = node('dialog', '', 'cycle-modal identity-question-picker');
  picker.setAttribute('aria-labelledby', 'identity-question-picker-title');
  const header = node('div', '', 'modal-header');
  const title = node('h3', 'Choose an Identity question'); title.id = 'identity-question-picker-title';
  const close = button('✕', () => picker.close(), true);
  close.type = 'button'; close.setAttribute('aria-label', 'Close question picker');
  header.append(title, close);
  const body = node('div', '', 'modal-body');
  const search = node('input'); search.type = 'search';
  search.placeholder = 'Search questions or keywords'; search.setAttribute('aria-label', 'Search example questions');
  const list = node('div', 'Loading questions…', 'identity-question-options');
  body.append(search, list); picker.append(header, body); document.body.append(picker);
  picker.addEventListener('close', () => picker.remove()); picker.showModal(); search.focus();
  try {
    const groups = await api<IdentityQuestionGroup[]>('identity-questions');
    if (!picker.open) return;
    const draw = (): void => {
      list.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      let count = 0;
      for (const group of groups) {
        const questions = group.questions.filter(example => [group.category, example.question, ...example.keywords].join(' ').toLocaleLowerCase().includes(query));
        if (!questions.length) continue;
        list.append(node('h4', `${group.category} · ${questions.length}`));
        for (const example of questions) {
          const option = button('', () => { picker.close(); select(example); }, true);
          option.type = 'button'; option.classList.add('identity-question-option');
          option.setAttribute('aria-label', example.question);
          option.append(node('strong', example.question), node('span', `${example.role === 'autobiographical' ? 'Autobiographical · excluded from Self' : 'Self-definition · supplied to Self'} · Keywords: ${example.keywords.join(', ')}`, 'muted'));
          list.append(option); count++;
        }
      }
      if (!count) list.append(node('p', 'No matching questions.', 'muted'));
    };
    search.oninput = draw; draw();
  } catch (cause) {
    list.textContent = ''; showError(cause);
  }
}

function primitives(): void {
  const agentId = selectedAgent;
  const toolbar = node('div', '', 'identity-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = 'Search primitive names or aspects'; search.setAttribute('aria-label', 'Filter primitives');
  const list = node('div', '', 'primitives-list');
  toolbar.append(search); componentSearchControls(toolbar); content.append(list);
  const defaultIcons = ['✨', '😮', '😊', '😣', '🪄', '🔁', '🛑', '🔍', '🤝', '❓'];
  void api<PrimitiveSettings>(`agents/${agentId}/primitives`).then(configuration => {
    if (!list.isConnected || selectedAgent !== agentId) return;
    componentCreationControls(plusButton('Create primitive', () => editor()), resetMenuButton('Reset primitives to defaults', async () => {
      await api(`agents/${agentId}/primitives/reset-all`, 'POST', { expectedRevision: configuration.revision }); render();
    }));
    const iconButton = (label: string, paths: string[], action: () => void | Promise<void>): HTMLButtonElement => {
      const control = button('', action, true); control.title = label; control.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({ width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(key, value);
      for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
      control.append(svg); return control;
    };
    const draw = (): void => {
      list.replaceChildren();
      for (const item of browse.apply(configuration.items.filter(item => `${item.name} ${item.aspects.join(' ')}`.toLowerCase().includes(search.value.toLowerCase())))) {
        const tile = node('article', '', 'primitive-card');
        const index = Number(item.id.replace('primitive_', '')) - 1;
        tile.style.setProperty('--primitive-hue', String(((index >= 0 && index < 10 ? index : configuration.items.indexOf(item)) * 37 + 150) % 360));
        const actions = node('div', '', 'identity-trait-actions primitive-actions');
        actions.append(iconButton('Edit primitive', ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z', 'm15 5 4 4'], () => editor(item)));
        const icon = node('span', item.icon ?? defaultIcons[index] ?? '💭', 'primitive-card-icon');
        icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', `${item.name} icon`);
        const aspects = node('p', item.aspects.join(' · '), 'primitive-card-aspects');
        aspects.title = aspects.textContent ?? '';
        const bidsEnabled = item.bidsEnabled !== false;
        const bidStatus = node('span', bidsEnabled ? '💬' : '🔇', 'primitive-bid-status');
        bidStatus.setAttribute('role', 'img');
        bidStatus.title = bidsEnabled ? 'Bid production enabled' : 'Bid production disabled';
        bidStatus.setAttribute('aria-label', bidStatus.title);
        tile.append(icon, node('h3', item.name, 'primitive-card-name'), aspects, bidStatus, actions);
        list.append(tile);
      }
      if (!list.childElementCount) list.append(node('p', 'No primitives match your search.', 'muted'));
    };
    const browse = componentBrowse<Primitive>([
      { key: 'name', label: 'Name', value: item => item.name },
      { key: 'family', label: 'Family', value: item => item.family ?? ([5, 6, 7, 8].includes(Number(item.id.replace('primitive_', '')) - 1) ? 'action_tendency' : 'appraisal'), options: [['appraisal', 'Appraisal'], ['action_tendency', 'Action tendency']] },
      { key: 'bids', label: 'Bid production', value: item => item.bidsEnabled === false ? 'disabled' : 'enabled', options: [['enabled', 'Enabled'], ['disabled', 'Disabled']] },
      { key: 'threshold', label: 'Activation threshold', value: item => item.activationThreshold ?? 2 },
      { key: 'icon', label: 'Icon', value: item => item.icon ?? defaultIcons[Number(item.id.replace('primitive_', '')) - 1] ?? '💭', options: [...new Set(configuration.items.map(item => item.icon ?? defaultIcons[Number(item.id.replace('primitive_', '')) - 1] ?? '💭'))].map(icon => [icon, icon]) },
    ], draw);
    toolbar.append(...browse.controls);
    search.oninput = draw; draw();
    function editor(item?: Primitive): void {
      const dialog = node('dialog', '', 'identity-trait-dialog');
      const header = node('div', '', 'modal-header');
      const inspectorActions = node('div', '', 'identity-trait-actions');
      header.append(node('h2', item ? `Edit ${item.name}` : 'Create primitive'), inspectorActions);
      dialog.append(header);
      const name = field(dialog, 'Name', item?.name ?? '');
      const icon = field(dialog, 'Icon (emoji or symbol)', item?.icon ?? defaultIcons[Number(item?.id.replace('primitive_', '')) - 1] ?? '💭');
      const picker = node('div', '', 'primitive-icon-picker');
      for (const symbol of [...defaultIcons, '💭', '🌱', '🌟', '🧭', '👀', '💛', '🫧', '⚡']) {
        const pick = button(symbol, () => { icon.value = symbol; }, true);
        pick.setAttribute('aria-label', `Choose icon ${symbol}`); picker.append(pick);
      }
      icon.parentElement!.append(picker);
      const aspects = field(dialog, 'Aspects (one per line)', item?.aspects.join('\n') ?? '', true);
      const family = node('select'); family.setAttribute('aria-label', 'Primitive family');
      for (const [value, label] of [['appraisal', 'Appraisal'], ['action_tendency', 'Action tendency']]) { const option = node('option', label); option.value = value!; family.append(option); }
      family.value = item?.family ?? ([5, 6, 7, 8].includes(Number(item?.id.replace('primitive_', '')) - 1) ? 'action_tendency' : 'appraisal');
      const familyLabel = node('label', 'Primitive family'); familyLabel.append(family); dialog.append(familyLabel);
      const threshold = field(dialog, 'Surfacing threshold (0–4)', String(item?.activationThreshold ?? 2)) as HTMLInputElement;
      threshold.min = '0'; threshold.max = '4'; threshold.step = '0.1'; threshold.type = 'range';
      const activation = field(dialog, 'Activation instructions', item?.activationPrompt ?? 'Evaluate immediate registration through this primitive’s aspects. Weight relevant supplied temperament Traits without relying on learned Part beliefs.', true);
      dialog.append(node('p', 'Appraised every cycle in the same scoring request as Parts. Only scores meeting this threshold produce thoughts. The bid switch below controls whether this primitive can propose actions. Temperament self-definition Traits can use novelty_sensitivity, negative_reactivity, positive_reactivity, approach_bias, attention_persistence, soothing_rate, social_orientation or uncertainty_tolerance keywords.', 'muted'));
      const thought = field(dialog, 'Thought production prompt', item?.thoughtPrompt ?? 'Produce one short, basic first-person thought grounded in this primitive and the current context.', true);
      const bidsEnabled = node('input'); bidsEnabled.type = 'checkbox'; bidsEnabled.checked = item?.bidsEnabled !== false;
      const bidsLabel = node('label', 'Allow this primitive to produce bids'); bidsLabel.append(bidsEnabled); dialog.append(bidsLabel);
      const bid = field(dialog, 'Bid production prompt', item?.bidPrompt ?? 'Produce one basic say, ask or wait bid with no prediction or multi-step plan.', true);
      const updateBidFields = () => {
        bid.disabled = !bidsEnabled.checked;
        bid.closest('label')!.hidden = !bidsEnabled.checked;
      };
      updateBidFields(); bidsEnabled.onchange = updateBidFields;
      const status = node('p', '', 'muted');
      const close = () => { dialog.close(); dialog.remove(); };
      if (item) {
        const mutate = async (operation: 'reset' | 'delete'): Promise<void> => {
          try {
            await api(`agents/${agentId}/primitives/${item.id}${operation === 'reset' ? '/reset' : ''}`, operation === 'reset' ? 'POST' : 'DELETE', { expectedRevision: configuration.revision });
            close(); render();
          } catch (cause) { status.textContent = ''; showError(cause); }
        };
        inspectorActions.append(resetMenuButton('Reset primitive', () => mutate('reset'), dialog));
        const trash = iconButton('Delete primitive', ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7M14 10v7'], () => mutate('delete'));
        trash.classList.add('identity-delete'); trash.disabled = configuration.items.length === 1;
        inspectorActions.append(trash);
      }

      dialog.append(status, button('Save primitive', async () => {
        try {
          await api(`agents/${agentId}/primitives${item ? `/${item.id}` : ''}`, item ? 'PATCH' : 'POST', {
            expectedRevision: configuration.revision, name: name.value, icon: icon.value, bidsEnabled: bidsEnabled.checked,
            activationPrompt: activation.value, activationThreshold: Number(threshold.value), family: family.value,
            aspects: aspects.value.split('\n').map(value => value.trim()).filter(Boolean), thoughtPrompt: thought.value, bidPrompt: bid.value,
          }); close(); render();
        } catch (cause) { status.textContent = ''; showError(cause); }
      }), button('Cancel', close, true));
      dialog.addEventListener('cancel', () => dialog.remove());
      document.body.append(dialog); dialog.showModal();
    }
  }).catch(showError);
}

function deleteAgentSettings(): void {
  const agent = state!.agent;
  const panel = card('Delete Agent');
  panel.append(node('p', `Permanently delete ${agent.name} and all saved data, including Parts, Identity, memories, conversations, history, settings and credentials. This cannot be undone.`));
  const remove = button('Delete Agent', async () => {
    if (!window.confirm(`Permanently delete “${agent.name}” and all of its saved data? Parts, Identity, memories, conversations, history, settings and credentials will be removed. This cannot be undone.`)) return;
    remove.disabled = true;
    try {
      await api(`agents/${agent.id}`, 'DELETE', {});
      localStorage.removeItem(sessionStorageKey(agent.id));
      if (selectedAgent === agent.id) {
        stream?.close(); stream = null;
        selectedAgent = ''; state = null; events = []; sessions = []; activeSessionId = null;
        submittedChat = null; frozenCycle = ''; brainSeekSequence = null;
        localStorage.removeItem('prism-agent');
        settingsSection = 'Model & key'; activeTab = 'Perception';
      }
      await agents();
    } catch (error) { remove.disabled = false; showError(error); }
  });
  panel.append(remove); content.append(panel);
}
function settings(): void {
  if (settingsSection === 'Delete Agent') { deleteAgentSettings(); return; }
  if (settingsSection === 'Prompts') { promptSettings(); return; }
  if (settingsSection === 'Activation') { activationSettings(); return; }
  modelSettings();
}
function activationSettings(): void {
  const agentId = selectedAgent;
  const panel = card('Part activation');
  panel.append(node('p', 'JEV scores dispositions and memory relevance. Code assembles independent scopes; Parts form and think in parallel. Primitives are configured separately and do not participate in cognition.', 'muted'));
  content.append(panel);
  void api<{ includeProcessingDispositions: boolean; maxConcurrentThoughts: number; maxQueuedThoughts: number; activationPassLimit: number | null; memorySearchEnabled: boolean; memoryRelevanceThreshold: number; memoryRecallLimit: number | null; vectorSearchEnabled: boolean; reevaluateAfterDeliberation: boolean; primitivesFirst: boolean }>(`agents/${agentId}/activation-settings`).then(configuration => {
    if (agentId !== selectedAgent || settingsSection !== 'Activation' || !panel.isConnected) return;
    const thresholdLabel = node('label', 'Memory relevance threshold (0–1) ');
    const threshold = node('input'); threshold.type = 'range'; threshold.min = '0'; threshold.max = '1'; threshold.step = '0.05'; threshold.value = String(configuration.memoryRelevanceThreshold);
    thresholdLabel.append(threshold);
    const limitLabel = node('label', 'Maximum accessible memories (blank for unlimited) ');
    const limit = node('input'); limit.type = 'number'; limit.min = '1'; limit.max = '10000'; limit.step = '1'; limit.value = configuration.memoryRecallLimit === null ? '' : String(configuration.memoryRecallLimit);
    limitLabel.append(limit);
    panel.append(thresholdLabel, limitLabel, node('p', 'Accessibility scores select subjective episodes that can support or contradict a current perspective.', 'muted'));
    const processingLabel = node('label', 'Evaluate activation of dispositions that are thinking ');
    const processing = node('input'); processing.type = 'checkbox'; processing.checked = configuration.includeProcessingDispositions;
    processingLabel.append(processing);
    const concurrencyLabel = node('label', 'Maximum concurrent thoughts ');
    const concurrency = node('input'); concurrency.type = 'number'; concurrency.min = '1'; concurrency.max = '64'; concurrency.value = String(configuration.maxConcurrentThoughts); concurrencyLabel.append(concurrency);
    const queueLabel = node('label', 'Maximum queued thoughts ');
    const queue = node('input'); queue.type = 'number'; queue.min = '0'; queue.max = '10000'; queue.value = String(configuration.maxQueuedThoughts); queueLabel.append(queue);
    const passesLabel = node('label', 'Activation passes per observation before pause (blank for unlimited) ');
    const passes = node('input'); passes.type = 'number'; passes.min = '1'; passes.max = '10000'; passes.value = configuration.activationPassLimit === null ? '' : String(configuration.activationPassLimit); passesLabel.append(passes);
    panel.append(processingLabel, concurrencyLabel, queueLabel, passesLabel,
      node('p', 'Running thoughts retain their starting experience and finish without interruption. Rescoring updates activation without starting a second thought for that disposition.', 'muted'));
    const streamThread = activeSessionId;
    const streamState = node('p', 'Loading activation stream status…', 'muted');
    type StreamStatus = { status: string; passCount: number; passLimit: number | null; reason: string };
    const displayStream = (status: StreamStatus | null) => {
      streamState.textContent = status ? `${status.status} · ${status.passCount} activation passes · ${status.passLimit === null ? 'unlimited allowance' : `allowance ${status.passLimit}`} · ${status.reason}` : 'No activation stream recorded for the selected conversation.';
    };
    let latestStreamEvent = 0;
    const loadStream = async () => {
      const eventBeforeRequest = latestStreamEvent;
      const status = await api<StreamStatus | null>(`agents/${agentId}/cognition-control${streamThread ? `/${encodeURIComponent(streamThread)}` : ''}`);
      if (panel.isConnected && eventBeforeRequest === latestStreamEvent) displayStream(status);
    };
    const streamUpdated = (event: Event) => {
      const record = (event as CustomEvent<CognitiveEvent>).detail;
      if (record.type === 'cognition.stream' && record.agentId === agentId && record.payload.threadId === streamThread && record.sequence > latestStreamEvent) {
        latestStreamEvent = record.sequence; displayStream(record.payload);
      }
    };
    window.addEventListener('cognition-stream-updated', streamUpdated);
    const unmount = new MutationObserver(() => { if (!panel.isConnected) { window.removeEventListener('cognition-stream-updated', streamUpdated); unmount.disconnect(); } });
    unmount.observe(content, { childList: true });
    panel.append(node('h3', 'Selected conversation'), streamState,
      button('Pause further activation', async () => { await api(`agents/${agentId}/cognition-control`, 'POST', { threadId: streamThread, directive: 'pause' }); await loadStream(); }, true),
      button('Resume activation', async () => { await api(`agents/${agentId}/cognition-control`, 'POST', { threadId: streamThread, directive: 'resume' }); await loadStream(); }, true));
    void loadStream().catch(showError);
    panel.append(button('Save activation settings', async () => {
      await api(`agents/${agentId}/activation-settings`, 'PATCH', { memoryRelevanceThreshold: Number(threshold.value), memoryRecallLimit: limit.value === '' ? null : Number(limit.value), includeProcessingDispositions: processing.checked, maxConcurrentThoughts: Number(concurrency.value), maxQueuedThoughts: Number(queue.value), activationPassLimit: passes.value === '' ? null : Number(passes.value) });
      notice.textContent = 'Activation settings saved.';
    }));
  }).catch(showError);
}
function modelSettings(): void {
  const panel = card('Model inference for this Agent');
  panel.append(node('p', 'Choose the language model used for this Agent. Use the key for the selected provider. When changing providers, enter its key or clear the Agent key to use its server key. Keys are encrypted on this machine and never shown again.', 'muted'));
  content.append(panel);
  const agentId = selectedAgent;
  void api<{ model: string; thoughtRouting: { enabled: boolean; intuitiveModel: string; deliberativeModel: string; escalateAfterIncorrectPredictions?: number } | null; hasAgentKey: boolean; hasUsableKey: boolean; hasServerKey: boolean; availableModels: { id: string; label: string }[] }>(`agents/${agentId}/settings`).then(configuration => {
    if (agentId !== selectedAgent) return;
    const select = node('select'); select.setAttribute('aria-label', 'Model for this Agent');
    for (const item of configuration.availableModels) { const option = node('option', item.label); option.value = item.id; select.append(option); }
    select.value = configuration.model;
    const modelLabel = node('label', 'Model'); modelLabel.append(select); panel.append(modelLabel, node('h3', 'Per-thought resources'));
    const routingEnabled = node('input'); routingEnabled.type = 'checkbox'; routingEnabled.checked = configuration.thoughtRouting?.enabled ?? false;
    const routingLabel = node('label', 'Assess resources separately for each thought'); routingLabel.append(routingEnabled);
    const intuitive = node('select'); intuitive.setAttribute('aria-label', 'Intuitive thought model');
    const deliberative = node('select'); deliberative.setAttribute('aria-label', 'Deliberative thought model');
    const refreshRoutingModels = () => {
      for (const [control, configured] of [[intuitive, configuration.thoughtRouting?.intuitiveModel], [deliberative, configuration.thoughtRouting?.deliberativeModel]] as const) {
        const current = control.value || configured || select.value; control.replaceChildren();
        for (const model of configuration.availableModels.filter(model => (model.id === 'grok-4.3') === (select.value === 'grok-4.3'))) control.append(new Option(model.label, model.id));
        control.value = [...control.options].some(option => option.value === current) ? current : select.value;
      }
    };
    refreshRoutingModels(); select.addEventListener('change', refreshRoutingModels);
    const intuitiveLabel = node('label', 'Intuitive thought model'); intuitiveLabel.append(intuitive);
    const deliberativeLabel = node('label', 'Deliberative thought model'); deliberativeLabel.append(deliberative);
    panel.append(routingLabel, node('p', 'Optional workload assessment adds an inference call. Complex or uncertain thoughts use the deliberative model, including urgent thoughts. Models share this Agent’s provider key. These settings do not change disposition identity.', 'muted'), intuitiveLabel, deliberativeLabel);
    const escalation = field(panel, 'Consecutive incorrect predictions before escalation', String(configuration.thoughtRouting?.escalateAfterIncorrectPredictions ?? 2), false) as HTMLInputElement;
    escalation.type = 'number'; escalation.min = '1'; escalation.max = '10';
    const thoughtRouting = () => ({ enabled: routingEnabled.checked, intuitiveModel: intuitive.value, deliberativeModel: deliberative.value, escalateAfterIncorrectPredictions: Number(escalation.value) });
    const key = field(panel, 'Provider API key (leave blank to keep the current key)', '', false) as HTMLInputElement;
    key.type = 'password'; key.autocomplete = 'new-password'; key.placeholder = configuration.hasAgentKey ? 'Agent key saved · enter a replacement' : configuration.hasUsableKey ? 'Using server key · optional Agent override' : 'Required before saving';
    const status = node('p', configuration.hasAgentKey ? 'This Agent has its own encrypted key.' : configuration.hasUsableKey ? 'Using the server provider key.' : 'No key configured for this provider.', 'muted'); panel.append(status);
    const clear = button(configuration.hasServerKey ? 'Clear Agent key and use server key' : 'Clear Agent key (server key required)', async () => {
      await api(`agents/${agentId}/settings`, 'PATCH', { model: select.value, clearApiKey: true, thoughtRouting: thoughtRouting() }); render();
    }, true);
    clear.disabled = !configuration.hasAgentKey || !configuration.hasServerKey; panel.append(clear);
    panel.append(button('Save Agent model and key', async () => {
      const result = await api<{ model: string; hasAgentKey: boolean; hasUsableKey: boolean }>(`agents/${agentId}/settings`, 'PATCH', {
        model: select.value, thoughtRouting: thoughtRouting(), ...(key.value ? { apiKey: key.value } : {}),
      });
      key.value = ''; status.textContent = result.hasAgentKey ? 'Saved. This Agent has its own encrypted key.' : 'Saved. Using the server provider key.';
      notice.textContent = 'Agent inference settings saved.';
    }));
  }).catch(showError);
  const evidence = card('Observed model evidence'); content.append(evidence);
  evidence.append(node('p', 'Loading recorded model operations…', 'muted'));
  void api<ReturnType<typeof thoughtModelEvidence>>(`agents/${agentId}/thought-model-evidence`).then(report => {
    if (!evidence.isConnected || agentId !== selectedAgent) return;
    evidence.replaceChildren(node('h3', 'Observed model evidence'), node('p', report.limitations, 'muted'));
    if (!report.providers.length) { evidence.append(node('p', 'No recorded model operations yet.')); return; }
    const scroll = node('div'); scroll.style.overflowX = 'auto';
    scroll.append(table(['Actual provider / model', 'Calls returned / total', 'Measured adapter time', 'Prediction checks', 'Selected / proposed bids', 'Verified / reported executions'], report.providers.map(row => [
      row.provider, `${row.returned} / ${row.calls} · ${row.failed} failed`,
      row.measuredCalls ? `${(row.totalLatencyMs / row.measuredCalls).toFixed(0)} ms mean · n=${row.measuredCalls}` : 'Unmeasured',
      `${row.correct} correct · ${row.incorrect} incorrect · ${row.incomplete} incomplete · ${row.irrelevant} irrelevant / ${row.formedPredictions} formed`,
      `${row.selectedBids} / ${row.proposedBids}`, `${row.independentlyVerifiedReports} / ${row.executionReports}`,
    ])));
    evidence.append(scroll, node('p', `${report.unattributedThoughts} thoughts and ${report.unattributedBids} bids lack exact model provenance. No model is inferred from current settings.`, 'muted'), details('Recorded source links and counts', report));
  }).catch(showError);
}
type PromptRow = { task: string; title: string; category: string; version: string; original: string; effective: string; source: string;
  inspection: { variables: { name: string; description: string; schema: unknown }[]; outputSchema: unknown; outputNote: string } };
const promptPurposes: Record<string, string> = {
  thought_resources: 'Assess one immutable owning-scope workload for optional intuitive/deliberative model routing; independent difficulty, uncertainty and urgency estimates are not psychological traits or action authority.',
  memory_accessibility: 'Judge subjective memory relevance for the current disposition scope, including transferable methods, diagnostic exceptions and contrary evidence across different objects or situations.',
  disposition_activation: 'Score eligible attention conditions for entities, situations, methods, strategies and configurations independently against immutable WorldState. One association pass considers contributing/inhibiting keywords and frozen direct disposition scores; no prerequisite gating or recursive feedback.',
  part_cognition: 'Code assembles each scope and chooses continuity. Parallel LLM calls return formation, subjective reflection, gist and cognition in order. Each perspective reasons at its scope’s level about unresolved conditions and changing relevance. Only fallback self receives Identity; Self chooses and external systems execute.',
  hypothesis_outcome: 'Bounded gap hypothesis classification from its capsule and later factual evidence. No owning Part, imagination or durable promotion.',
  hypothesis_reflection: 'Subjective gap outcome interpretation and optional attributed memory. No fabricated owning Part, private state or structural edits.',
  cognition_coverage: 'Assess consequential gaps from immutable experience and expressed cognition; propose bounded testable hypotheses and temporary prediction-bound dispositions. No Identity, private Part state, selection or durable formation authority.',
  experiential_formation: 'After committed subjective experience, attach evidence to existing relevance structure. New hypotheses and temporary prediction-bound dispositions come from predictions; durable institutionalization remains offline. No raw WorldState access.',
  memory_reinterpretation: 'Conservatively reinterpret selected subjective episodes while preserving prior versions and continuity. No disposition edits or objective audit replay.',
  disposition_learning: 'Reconcile contextual memory relevance through explicit specialization, generalization, split, merge, dependency or archive proposals. Distinguish retrieval usefulness from prediction correctness; preserve memory content, prior versions and lineage. Abstain when evidence is insufficient.',
  effortful_recall: 'Deliberately recollect stored fallible perceived details. No objective ancestry or audit history is available to this task.',

  memory_relevance: 'Score the functional relevance of each owning Part’s exact subjective memories independently. This historical owner-scoped task remains for researcher searches; online cognition uses memory accessibility. Explicit researcher searches use this scorer without cognition, Part activation or committed experience.',
  speech: 'Express consecutive selected Say and Ask commands in the speaker’s voice using only Identity aspects explicitly tagged speech. Preserve the selected intentions and emotional stance, combine overlap into one coherent utterance, and return the words actually spoken. This external execution task receives no WorldState or private Part state.',
  simulation_evaluation: 'External researcher assessment of frozen simulation evidence using explicit semantic rubrics. Returns cited verdicts and alternatives; it cannot change Agent psychology or operational measures.',
  researcher_authoring: 'Researcher authoring: generate an editable memory or prediction draft from explicit researcher text only. No Agent state or WorldState is accessed; creation requires review and a separate validated save.',
  identity_clarification: 'Researcher authoring: propose distinguishable versions of a named person or character. Infers reference type from the name and offers clarification choices; does not mutate the Agent.',
  identity_answers: 'Researcher authoring: answer selected preset questions from the selected version and extra details. Receives authoring guidance and bounded question batches. Complete validated answers replace or append to the Trait collection according to the researcher’s delete-existing option, in one versioned edit.',
  prediction_outcome: 'Jev checks an open prediction against later evidence: correct, incorrect, incomplete, or irrelevant. Only correct/incorrect runs LLM reflection.',
  evaluation: 'After Jev classifies correct or incorrect, let a Part compare its open prediction with later factual evidence. The goal is to resolve the prediction with the owning Part’s interpretation and causal attribution, encoding its subjective interpretation as an episode. Online prediction evaluation does not apply permanent-Part rewrites or numeric belief-confidence learning.',
  arbitration: 'Score current bids by relevance, Identity consistency, contextual appropriateness and importance. Discount redundancy, conflict and poor support; select all current external bids scoring strictly above 2 in rank order when external behavior is chosen. Self receives only mediated contributions and Identity, and may select DELIBERATE for inquiry.',
  deliberation: 'After DELIBERATE, let world-blind Self identify why, select a primary and optional supporting C quality, identify missing information, target contributors and formulate one neutral inquiry in light of question-and-answer Identity traits before choosing again. Autobiographical traits are excluded by runtime. The goal is to clarify the available options through world-blind mediation.',
  answer: 'Let a Part answer Self’s deliberation question from its own perspective and available context. It answers first, then retains, replaces or withdraws its current bid in that same response. Self chooses again using the current bids and attributed answers.',
  consolidation: 'Let a Part reflect offline on selected psychologically meaningful traces across experiences. This owning-Part task applies to the offline Part-development profile; the memory/disposition profile uses disposition learning.',
  reconsolidation: 'Let the owning Part reconsider the meaning of its subjective memories when new experience makes that useful. Propose incremental revisions while preserving prior versions and meaningful continuity. These instructions accompany offline consolidation.',
  formation: 'Consider whether a new bounded perspective is warranted after considering adaptation, specialization, and existing Parts. Preserve relationship-specific knowledge and provenance while avoiding redundant formation. These instructions accompany offline consolidation.',
  replay: 'Exceptionally re-expose an owning Part to a selected ancestor experience for a stated developmental reason. Let its current perspective reinterpret an existing memory or retain its account; this is a separate exceptional request.',
};
function promptActionMenu(label: string, options: { label: string; action: () => void | Promise<void>; selected?: boolean }[]): HTMLElement {
  const holder = node('div', '', 'prompt-action-menu');
  const popup = node('div', '', 'prompt-action-popup'); popup.setAttribute('popover', 'auto'); popup.setAttribute('role', 'menu'); popup.setAttribute('aria-label', `${label} options`);
  const trigger = button(label === 'Reset' ? '↺' : label, () => {
    const bounds = trigger.getBoundingClientRect(); popup.style.left = `${bounds.left}px`; popup.style.top = `${bounds.bottom + 5}px`;
    popup.togglePopover(); if (popup.matches(':popover-open')) (popup.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? popup.querySelector<HTMLButtonElement>('button'))?.focus();
  }, label !== 'Save');
  trigger.setAttribute('aria-label', label); trigger.title = label;
  trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  popup.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(popup.matches(':popover-open'))));
  for (const option of options) {
    const item = button(label === 'Reset' ? `Reset ${option.label} to defaults` : option.label, async () => { popup.hidePopover(); await option.action(); }, true); item.setAttribute('role', option.selected === undefined ? 'menuitem' : 'menuitemradio');
    if (option.selected !== undefined) item.setAttribute('aria-checked', String(option.selected));
    popup.append(item);
  }
  popup.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const items = Array.from(popup.querySelectorAll<HTMLButtonElement>('button'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  });
  holder.append(trigger, popup); return holder;
}
function promptSettings(): void {
  const agentId = selectedAgent;
  const header = content.querySelector('.component-header')!;
  header.querySelector('.component-header-actions')?.remove();
  header.querySelector('.component-header-tools')?.remove();
  const headerControls = node('div', '', 'component-header-prompt-controls'); header.append(headerControls);
  const workspace = node('div', '', 'prompt-workspace'); content.append(workspace);
  void api<PromptRow[]>(`agents/${agentId}/prompts`).then(rows => {
    if (agentId !== selectedAgent || !workspace.isConnected) return;
    // Process categories group cognition, memory, sleep and refinement tasks.
    // Deliberation returns to choice, while offline tasks run on a separate timescale.
    const order = ['disposition_activation', 'cognition_coverage', 'hypothesis_outcome', 'hypothesis_reflection', 'part_cognition', 'arbitration', 'deliberation', 'answer', 'memory_accessibility', 'effortful_recall', 'memory_relevance', 'prediction_outcome', 'evaluation', 'experiential_formation', 'disposition_learning', 'memory_reinterpretation', 'consolidation', 'reconsolidation', 'formation', 'replay', 'speech', 'identity_clarification', 'identity_answers', 'researcher_authoring', 'simulation_evaluation'];
    rows.sort((a, b) => order.indexOf(a.task) - order.indexOf(b.task));
    if (!rows.some(row => row.task === selectedPromptTask)) selectedPromptTask = rows[0]?.task ?? '';
    const panels = new Map<string, HTMLElement>();
    const toolbars = new Map<string, HTMLElement>();
    const select = (task: string) => {
      selectedPromptTask = task;
      for (const [name, panel] of panels) panel.hidden = name !== task;
      headerControls.replaceChildren(toolbars.get(task)!);
    };
    for (const row of rows) {
      const panel = node('section', '', 'prompt-panel'); panel.id = `prompt-panel-${row.task}`;
      panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', row.title); panels.set(row.task, panel);
      const toolbar = node('div', '', 'prompt-toolbar');
      toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', `${row.title} controls`);
      toolbars.set(row.task, toolbar);
      const selector = promptActionMenu(`${row.title} ▾`, rows.map(option => ({
        label: option.title, selected: option.task === row.task,
        action: () => { select(option.task); headerControls.querySelector<HTMLButtonElement>('.prompt-selector button')?.focus(); },
      })));
      const menu = selector.querySelector('[role="menu"]')!;
      let previousCategory = '';
      const categoryNames: Record<string, string> = { Exec: 'Exec · External expression', Identity: 'Identity · Researcher authoring', Cog: 'Cog · Cognition', Mem: 'Mem · Memory formation and prediction', Slp: 'Slp · Sleep', RFN: 'RFN · Refine / consolidate' };
      Array.from(menu.children).forEach((item, index) => {
        const category = rows[index]!.category;
        if (category !== previousCategory) {
          const heading = node('div', categoryNames[category] ?? category, 'muted');
          heading.setAttribute('role', 'presentation'); menu.insertBefore(heading, item); previousCategory = category;
        }
      });
      selector.classList.add('prompt-selector');
      selector.querySelector('button')!.setAttribute('aria-label', `Select prompt (currently ${row.title})`);
      selector.querySelector('button')!.title = row.title;
      selector.querySelector('[role="menu"]')!.setAttribute('aria-label', 'Prompts grouped by process');
      toolbar.append(selector);
      const editor = node('textarea', '', 'prompt-editor'); editor.value = row.effective;
      editor.setAttribute('aria-label', 'Prompt text (Markdown / Twig template)'); editor.spellcheck = false;
      editor.addEventListener('input', () => editor.removeAttribute('aria-invalid'));
      const save = async (scope: 'agent' | 'global') => {
        try { await api(`agents/${agentId}/prompts/${row.task}`, 'PATCH', { scope, text: editor.value }); }
        catch (error) {
          showError(`Prompt not saved. ${error instanceof Error ? error.message : String(error)} Correct the prompt and try saving again.`);
          editor.setAttribute('aria-invalid', 'true'); editor.focus(); return;
        }
        notice.textContent = `${row.title} saved ${scope === 'agent' ? 'for this Agent' : 'as the global default'}.`; render();
      };
      toolbar.append(promptActionMenu('Save', [
        { label: 'To Agent', action: () => save('agent') },
        { label: 'Globally', action: () => save('global') },
      ]));
      toolbar.append(promptActionMenu('Reset', [
        { label: 'Agent', action: async () => { await api(`agents/${agentId}/prompts/${row.task}/reset`, 'POST', { scope: 'agent' }); render(); } },
        { label: 'Global prompts', action: async () => { await api(`agents/${agentId}/prompts/${row.task}/reset`, 'POST', { scope: 'global' }); render(); } },
        { label: 'Every prompt', action: async () => {
          if (!window.confirm('Reset all prompts for every Agent and the global defaults to the original built-in text?')) return;
          await api(`agents/${agentId}/prompts/reset-all`, 'POST', {}); notice.textContent = 'All prompts were reset to their original configuration.'; render();
        } },
      ]));
      const previewButton = button('preview', async () => {
        try {
          const preview = await api<{ text: string; worldId: string | null; cycleId: string | null; capturedAt: string | null; partName: string | null; note: string }>(`agents/${agentId}/prompts/${row.task}/preview`, 'POST', { text: editor.value });
          const dialog = node('dialog', '', 'prompt-preview'); dialog.setAttribute('aria-label', 'Compiled prompt preview');
          dialog.append(node('h3', `${row.title} preview`));
          if (preview.worldId) dialog.append(node('p', `${preview.capturedAt} · ${preview.worldId}${preview.partName ? ` · ${preview.partName}` : ''}`, 'muted'));
          dialog.append(node('p', preview.note, 'muted'), node('pre', preview.text));
          dialog.append(button('Close', () => dialog.close(), true));
          dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
        } catch (error) {
          showError(`Preview unavailable. ${error instanceof Error ? error.message : String(error)}`);
        }
      }, true);
      previewButton.setAttribute('aria-label', 'Preview');
      const provider = row.task === 'prediction_gate' ? 'JEV · Yes/No' : row.task === 'prediction_outcome' ? 'JEV · Choice' : ['activation', 'memory_relevance', 'memory_accessibility', 'disposition_activation'].includes(row.task) ? 'JEV · Score' : row.task === 'arbitration' ? 'JEV · Score' : 'LLM · Generation';
      const providerLabel = node('span', provider, 'prompt-provider');
      providerLabel.title = row.task.startsWith('identity_') ? 'Researcher authoring through the Agent-selected model.' : ['memory_relevance', 'activation', 'arbitration', 'prediction_gate', 'prediction_outcome'].includes(row.task) ? 'Bounded decision role; configured mock or Ollama fallback may handle this task.' : 'Generative reasoning role; the configured reasoning provider handles this task.';
      toolbar.insertBefore(providerLabel, selector);
      const source = node('span', row.source === 'original' ? 'Orig' : 'Modified', 'prompt-source muted');
      source.title = row.source === 'agent' ? 'Agent override' : row.source === 'global' ? 'Modified global default' : 'Original factory default';
      const scope = node('span', '[glob]', 'prompt-scope muted');
      scope.dataset.scope = row.source === 'agent' ? 'agent' : 'global';
      scope.title = row.source === 'agent' ? 'Agent-specific prompt' : 'Shared global prompt';
      if (row.source === 'agent') scope.setAttribute('aria-hidden', 'true');
      toolbar.append(source, scope);
      const phase = row.task === 'memory_relevance' ? 'Before Part cognition, before activation in memory discovery mode, or for explicit researcher searches' : row.task === 'prediction_gate' ? 'After cognition, when no prediction is open' : row.task === 'prediction_outcome' ? 'On later cycles, when a prediction is open' : row.task === 'prediction' ? 'Separate request after Jev selects yes' : ['consolidation', 'reconsolidation', 'formation'].includes(row.task) ? 'Combined offline consolidation request' : row.task === 'replay' ? 'Exceptional ancestor replay' : ['deliberation', 'answer'].includes(row.task) ? 'When Self chooses DELIBERATE; choice runs again afterward' : row.task === 'evaluation' ? 'After Jev classifies correct or incorrect' : '';
      const informationButton = button('(?)', () => {
        const dialog = node('dialog', '', 'prompt-information'); dialog.setAttribute('aria-label', `${row.title} information`);
        dialog.append(node('h3', row.title), node('p', promptPurposes[row.task] ?? row.inspection.outputNote), node('p', provider));
        if (phase) dialog.append(node('p', phase, 'muted'));
        dialog.append(button('Close', () => dialog.close(), true));
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.append(dialog); dialog.showModal();
      }, true);
      informationButton.classList.add('prompt-information-button');
      informationButton.title = 'Information'; informationButton.setAttribute('aria-label', 'Information');
      const body = node('div', '', 'prompt-editor-body'); const reference = node('aside', '', 'prompt-reference'); reference.hidden = true;
      const showReference = (kind: 'data' | 'output' | 'original') => {
        if (kind !== 'data') {
          const title = kind === 'output' ? 'Output Format' : 'Original built-in prompt';
          const dialog = node('dialog', '', 'prompt-preview'); dialog.setAttribute('aria-label', `${row.title} · ${title}`);
          dialog.append(node('h3', title));
          if (kind === 'output') dialog.append(node('p', row.inspection.outputNote), node('pre', schemaYaml(row.inspection.outputSchema)));
          else dialog.append(node('pre', row.original));
          dialog.append(button('Close', () => dialog.close(), true));
          dialog.addEventListener('close', () => dialog.remove(), { once: true });
          document.body.append(dialog); dialog.showModal(); return;
        }
        if (!reference.hidden && reference.dataset.kind === kind) { reference.hidden = true; return; }
        reference.hidden = false; reference.dataset.kind = kind; reference.replaceChildren();
        if (kind === 'data') {
          const heading = node('div', '', 'prompt-data-heading');
          const help = button('(?)', () => {
            const dialog = node('dialog', '', 'prompt-information'); dialog.setAttribute('aria-label', 'Using prompt data');
            dialog.append(node('h3', 'Using prompt data'), node('p', 'Click a variable to see its description and schema. Only fields referenced in your Twig template appear in the prompt.'),
              node('pre', '{{ variable.property }}\n{% for item in variable.list %}{{ item }}{% endfor %}'));
            if (row.task === 'cognition') dialog.append(node('p', 'Chat history is in world.facts; prior Part thoughts are in world.thoughtHistory.'),
              node('pre', '{% for fact in world.facts %}\n- [{{ fact.timestamp|default("Time unknown") }}] {{ fact.source }} {{ fact.kind }}: {{ fact.text }}\n{% endfor %}'));
            dialog.append(button('Close', () => dialog.close(), true));
              dialog.addEventListener('close', () => dialog.remove(), { once: true });
            document.body.append(dialog); dialog.showModal();
          }, true);
          help.setAttribute('aria-label', 'How to use prompt data');
          heading.append(node('h3', 'Data Available'), help); reference.append(heading);
          for (const variable of row.inspection.variables) {
            const item = node('details', '', 'prompt-variable');
            item.append(node('summary', `{{ ${variable.name} }}`), node('p', variable.description), node('pre', dataSchemaOutline(variable.name, compactDataSchema(variable.schema))));
            reference.append(item);
          }
        }
      };
      const rightActions = node('div', '', 'prompt-toolbar-right');
      rightActions.append(button('data', () => showReference('data'), true), button('output', () => showReference('output'), true), previewButton, button('view default', () => showReference('original'), true), informationButton);
      toolbar.append(rightActions);
      body.append(editor, reference); panel.append(body); workspace.append(panel);
    }
    select(selectedPromptTask);
  }).catch(showError);
}

let simulationMode: 'fixture' | 'configured' = 'fixture';
function simulationTestPage(): void {
  const sourceAgentId = selectedAgent;
  let definitions: SimulationTestDefinition[] = [];
  let request = 0;
  const load = async () => {
    const current = ++request;
    const result = await api<{ tests: SimulationTestDefinition[]; runs: SimulationRun[] }>('simulation-tests');
    if (!dashboard.element.isConnected || selectedAgent !== sourceAgentId || current !== request) return;
    definitions = result.tests;
    const runs = result.runs.filter(run => run.sourceAgentId === sourceAgentId || run.agentId === sourceAgentId);
    await dashboard.update(definitions, runs);
    if (runs.some(run => run.status === 'running' || run.status === 'paused' || run.assessments?.some(assessment => assessment.status === 'running')))
      setTimeout(() => { if (dashboard.element.isConnected) void load().catch(showError); }, 1500);
  };
  const launch = (testId: string) => {
    const dialog = node('dialog', '', 'rd-dialog'); dialog.setAttribute('aria-label', 'Launch dream');
    dialog.append(node('h2', 'Launch dream'));
    const form = node('form'); dialog.append(form);
    const launchMode = node('select'); launchMode.setAttribute('aria-label', 'Experience mode');
    launchMode.append(new Option('Dream · developed Agent base', 'dream'), new Option('Research test · fresh starting conditions', 'test'));
    const launchModeLabel = node('label', 'Experience mode'); launchModeLabel.append(launchMode); form.append(launchModeLabel);
    const base = node('select'); base.setAttribute('aria-label', 'Base Agent'); base.disabled = true;
    const baseLabel = node('label', 'Base Agent'); baseLabel.append(base); form.append(baseLabel);
    void api<Agent[]>('agents').then(agents => { if (!dialog.isConnected) return; for (const agent of agents) base.append(new Option(`${agent.name} · ${agent.id.slice(-8)}`, agent.id)); base.value = sourceAgentId; base.disabled = false; start.disabled = false; }).catch(showError);
    const keep = node('input'); keep.type = 'checkbox'; keep.checked = false;
    const keepLabel = node('label', 'Keep dream changes in the base Agent'); keepLabel.prepend(keep); form.append(keepLabel);
    const permanence = node('p', '', 'rd-caution'); form.append(permanence);
    const hypothesis = node('select'); hypothesis.setAttribute('aria-label', 'Scenario');
    const populate = () => { const value = hypothesis.value || testId; hypothesis.replaceChildren(); for (const definition of definitions.filter(item => launchMode.value === 'test' || (!item.executiveSandbox && !item.procedureLearning && !item.steps.some(step => step.executiveCheckpoint || step.settleExecutive || step.consolidateProcedures)))) hypothesis.append(new Option(definition.title, definition.id)); if ([...hypothesis.options].some(option => option.value === value)) hypothesis.value = value; }; populate();
    const hypothesisLabel = node('label', 'Scenario'); hypothesisLabel.append(hypothesis); form.append(hypothesisLabel);
    const mode = node('select'); mode.setAttribute('aria-label', 'Simulation inference mode');
    mode.append(new Option('Fixture · bundled mock providers', 'fixture'), new Option('Configured models · selected Agent settings', 'configured')); mode.value = 'configured';
    const modeLabel = node('label', 'Inference mode'); modeLabel.append(mode); form.append(modeLabel);
    const evaluate = node('input'); evaluate.type = 'checkbox'; evaluate.checked = true; const label = node('label', 'Automatically assess configured runs'); label.prepend(evaluate); form.append(label);
    const evaluator = node('select'); evaluator.setAttribute('aria-label', 'Simulation evaluator model');
    for (const [value, title] of [['', 'Same model as source Agent'], ['gpt-4.1-mini', 'GPT-4.1 mini'], ['gpt-4.1-nano', 'GPT-4.1 nano'], ['gpt-5-nano', 'GPT-5 nano'], ['grok-4.3', 'Grok 4.3']]) evaluator.append(new Option(title!, value!));
    const evaluatorLabel = node('label', 'Evaluator model'); evaluatorLabel.append(evaluator); form.append(evaluatorLabel);
    form.append(node('p', 'Dreams inherit the chosen Agent’s developed state without injecting scenario seeds. The base Executive must be disconnected. Research framing is kept outside cognitive inputs. Configured inference may incur provider costs.', 'rd-caption'));
    const explain = () => { keep.disabled = launchMode.value !== 'dream'; permanence.textContent = launchMode.value !== 'dream' ? 'Fresh research tests leave the base Agent unchanged.' : keep.checked ? 'Changes remain in the base Agent as experiences occur, including changes before a failure. Before-and-after records are preserved.' : 'Default: the base Agent stays unchanged. An isolated continuation and its changes remain available for analysis.'; };
    launchMode.onchange = () => { populate(); explain(); }; keep.onchange = explain; explain();
    const start = node('button', 'Start experience'); start.type = 'submit'; start.disabled = true; form.append(start);
    const status = node('p'); status.setAttribute('role', 'status'); form.append(status);
    form.onsubmit = event => { event.preventDefault(); if (!dashboard.element.isConnected || base.disabled || !base.value) return; start.disabled = true; simulationMode = mode.value as typeof simulationMode;
      void api<SimulationRun>('simulation-tests', 'POST', { testId: hypothesis.value, mode: mode.value, sourceAgentId: base.value, ...(launchMode.value === 'dream' ? { dream: { keepChanges: keep.checked } } : {}),
        evaluator: { enabled: evaluate.checked, ...(evaluator.value ? { model: evaluator.value } : {}) } }).then(async () => {
          dashboard.selectExperiment(hypothesis.value); dialog.close(); if (base.value !== selectedAgent) { selectedAgent = base.value; await agents(); } else await load();
        }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); showError(error); }).finally(() => { start.disabled = false; });
    };
    dialog.append(button('Close', () => dialog.close(), true)); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
  };
  const dashboard = simulationDashboard(content, { context: `${selectedDatabase}:${sourceAgentId}`, api, cycle: showCycleInspector, fail: showError, launch, refresh: load,
    agent: async id => { selectedAgent = id; activeTab = 'Parts'; await agents(); } });
  void load().catch(showError);
}

// Async settings, popup editors and generated wizard steps use the same field rows.
new MutationObserver(() => standardizeForms()).observe(document.body, { childList: true, subtree: true });
standardizeForms();
void api<{ reasoning: string; decisions: string }>('configuration').then(() => {
  return agents();
}).catch(showError);
