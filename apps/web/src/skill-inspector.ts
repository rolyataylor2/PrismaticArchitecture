import type { ExecutiveSkillInspection, SkillEpisodeInspection } from '../../../packages/sdk/src/skill-inspection.js';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const element = document.createElement(tag); element.textContent = text; return element;
};
const readable = (value: unknown) => value === null ? 'None' : typeof value === 'string' ? value
  : typeof value === 'number' ? String(value) : Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value.length ? value.join('\n') : 'None' : JSON.stringify(value, null, 2);
function details(parent: HTMLElement, title: string) {
  const detail = node('details'); detail.append(node('summary', title)); parent.append(detail); return detail;
}
function list(parent: HTMLElement, values: string[], empty: string) {
  if (!values.length) { parent.append(node('p', empty)); return; }
  const ul = node('ul'); for (const text of values) ul.append(node('li', text)); parent.append(ul);
}
function button(parent: HTMLElement, title: string, run: () => void) {
  const control = node('button', title); control.type = 'button'; control.onclick = run; parent.append(control); return control;
}
function table(parent: HTMLElement, headers: string[], rows: string[][]) {
  const table = node('table'); const head = node('thead'); const headings = node('tr');
  for (const title of headers) { const cell = node('th', title); cell.scope = 'col'; headings.append(cell); }
  head.append(headings); table.append(head); const body = node('tbody');
  for (const values of rows) { const row = node('tr'); for (const value of values) row.append(node('td', value)); body.append(row); }
  table.append(body); const wrapper = node('div'); wrapper.className = 'skill-table-scroll'; wrapper.append(table); parent.append(wrapper);
}

export function showSkillInspector(initial: ExecutiveSkillInspection, load: (skillId: string) => Promise<ExecutiveSkillInspection>,
  ui: { dialog: () => HTMLDialogElement; cycle: (cycleId: string) => void; package?: (digest: string) => Promise<{ name: string; files: Record<string, string> }> }, fail: (error: unknown) => void): void {
  let inspection = initial; let version = inspection.skill.version;
  const dialog = ui.dialog(); dialog.classList.add('skill-inspector'); dialog.setAttribute('aria-label', 'Skill development');
  const header = node('div'); header.className = 'modal-header'; const title = node('h2'); header.append(title); dialog.append(header);
  const body = node('div'); body.className = 'modal-body'; dialog.append(body);
  const versionLabel = node('label', 'Development version'); const versionChoice = node('select'); versionLabel.append(versionChoice); body.append(versionLabel);
  const tablist = node('div'); tablist.className = 'executive-tabs'; tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', 'Skill inspection sections'); body.append(tablist);
  const panels = ['Procedure', 'Development', 'Bids & Thoughts', 'Related Variants'].map((name, index) => {
    const panel = node('section'); panel.id = `skill-inspection-${initial.skill.id}-${index}-panel`; panel.setAttribute('role', 'tabpanel'); body.append(panel);
    const tab = node('button', name); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.id = `skill-inspection-${initial.skill.id}-${index}-tab`;
    tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id); tablist.append(tab); return { panel, tab };
  });
  const selectTab = (selected: number, focus = false) => panels.forEach(({ panel, tab }, index) => {
    panel.hidden = index !== selected; tab.setAttribute('aria-selected', String(index === selected)); tab.tabIndex = index === selected ? 0 : -1;
    if (focus && index === selected) tab.focus();
  });
  panels.forEach(({ tab }, index) => {
    tab.onclick = () => selectTab(index);
    tab.onkeydown = event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % panels.length : event.key === 'ArrowLeft' ? (index + panels.length - 1) % panels.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : null;
      if (next !== null) { event.preventDefault(); selectTab(next, true); }
    };
  });
  const render = () => {
    const selected = inspection.versions.find(item => item.skill.version === version)!;
    const skill = selected.skill; title.textContent = `Skill development: ${inspection.skill.name}`;
    versionChoice.replaceChildren(...inspection.versions.map(item => {
      const option = node('option', `Version ${item.skill.version} · ${item.skill.change.kind} · ${item.skill.status}`);
      option.value = String(item.skill.version); return option;
    })); versionChoice.value = String(version);
    const [procedure, development, sources, variants] = panels.map(item => item.panel) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    for (const { panel } of panels) panel.replaceChildren();
    procedure.append(node('h3', skill.name), node('p', `Version ${skill.version} · ${skill.status} · ${skill.scope === 'thread' ? 'Original thread' : 'Agent'} scope`),
      node('h4', 'Declared conditions')); list(procedure, skill.conditions, 'No declared conditions.');
    if (!skill.conditional) {
      procedure.append(node('h4', 'Success criterion'), node('p', skill.procedure.successCriteria), node('h4', 'Constraint declarations'));
      list(procedure, skill.procedure.constraints, 'No additional constraint declarations.');
    }
    if (skill.conditional) {
      procedure.append(node('h4', 'Conditional branches'), node('p', skill.conditional.reason));
      for (const branch of skill.conditional.branches) {
        const entry = node('article'); entry.append(node('h5', branch.when.join('; ')), node('p', branch.reason), node('p', `Recorded member version ${branch.version}. Application requires an explicit current selection.`));
        button(entry, 'Inspect branch method', () => { void load(branch.skillId).then(next => { if (!dialog.isConnected) return; inspection = next; version = next.skill.version; render(); selectTab(0); }).catch(fail); });
        procedure.append(entry);
      }
      procedure.append(node('h4', 'When to request cognition')); list(procedure, skill.conditional.escalate, 'No additional escalation conditions inferred.');
      procedure.append(node('p', 'The baseline method below supplies the preserved source criterion. It is never an implicit default branch.'));
    }
    procedure.append(node('h4', skill.conditional ? 'Baseline source method' : 'Recorded procedure'));
    if (skill.conditional) procedure.append(node('p', `Baseline source criterion: ${skill.procedure.successCriteria}. Each selected branch uses its own criterion and constraints.`));
    const steps = node('ol'); procedure.append(steps);
    for (const step of skill.procedure.steps) {
      const item = node('li', `${step.serverId} / ${step.toolName}`); steps.append(item);
      details(item, 'Tool inputs').append(node('pre', JSON.stringify(JSON.parse(step.argumentsJson), null, 2)));
    }
    if (skill.procedure.verification) {
      const check = skill.procedure.verification; procedure.append(node('h4', 'Independent verification'),
        node('p', `${check.serverId} / ${check.toolName}: ${check.path.length ? check.path.join(' → ') : 'result'} must equal ${check.expectedJson}.`));
      details(procedure, 'Verification inputs').append(node('pre', JSON.stringify(JSON.parse(check.argumentsJson), null, 2)));
    } else procedure.append(node('p', 'No independent verification method is recorded.'));
    details(procedure, 'Execution limits').append(node('pre', readable(skill.limits)));
    procedure.append(node('h4', 'Validation evidence'));
    if (!skill.validations.length) procedure.append(node('p', 'No validation evidence in this version.'));
    for (const validation of skill.validations) {
      const entry = node('article'); entry.append(node('p', `${validation.result} · ${new Date(validation.at).toLocaleString()}`));
      list(entry, validation.limitations, 'No limitations recorded.');
      const outcome = inspection.episodes.find(episode => episode.outcomes.some(item => item.execution.id === validation.executionId));
      if (outcome) button(entry, 'View validation episode', () => { selectTab(2); const episode = document.getElementById(`skill-episode-${outcome.contractId}`) as HTMLDetailsElement | null; if (episode) { episode.open = true; episode.scrollIntoView({ block: 'nearest' }); } });
      procedure.append(entry);
    }
    procedure.append(node('p', skill.conditional ? 'Branches retain exact methods. Inferred conditions and active status do not establish applicability, transfer or mature habit.' : 'This is an exact recorded method. Active status does not establish conditional transfer or mature habit.'));

    development.append(node('h3', 'How this skill developed'), node('p', skill.change.reason));
    development.append(node('h4', `Maturity: ${skill.maturity?.stage ?? 'Unassessed'}`));
    if (skill.maturity) {
      development.append(node('p', `Researcher assessment: ${skill.maturity.reason}`), node('p', skill.maturity.applicability));
      list(development, skill.maturity.limitations, '');
      details(development, 'Maturity evidence record').append(node('pre', readable(skill.maturity)));
    }
    development.append(node('h4', 'Recorded application evidence across versions'));
    table(development, ['Verified successes', 'Reported failures', 'Inconclusive', 'Pending', 'Rejected attempts'],
      [Object.values(inspection.applicationSummary).map(String)]);
    development.append(node('p', 'Each application is checked against its captured method and tool ledger. These counts do not establish transfer or maturity and are separate from administrative validation.'));
    if (skill.change.restoredVersion !== null) development.append(node('p', `Restored from preserved version ${skill.change.restoredVersion}.`));
    development.append(node('h4', 'Changes from the preceding version'));
    if (selected.changes.length) {
      table(development, ['Changed', 'Before', 'After'], selected.changes.map(change => change.label === 'Source instruction'
        ? [change.label, 'Earlier recorded handoff', 'New recorded handoff'] : [change.label, readable(change.before), readable(change.after)]));
      details(development, 'Exact change record').append(node('pre', readable(selected.changes)));
    }
    else development.append(node('p', version === inspection.versions[0]!.skill.version ? 'Initial recorded proposal.' : 'No method or evidence fields changed; the recorded decision is preserved.'));
    development.append(node('h4', 'Development timeline'));
    const timeline = node('ol'); timeline.className = 'skill-development-timeline'; development.append(timeline);
    for (const item of inspection.versions) {
      const row = node('li'); row.append(node('p', `Version ${item.skill.version} · ${item.skill.change.kind} · ${item.skill.status} · ${new Date(item.skill.change.at).toLocaleString()}`),
        node('p', item.skill.change.reason),
        ...(item.skill.change.reviewContractId ? [node('p', `Self-selected review contract: ${item.skill.change.reviewContractId}`)] : []));
      button(row, `View version ${item.skill.version}`, () => { version = item.skill.version; render(); }); timeline.append(row);
    }
    button(development, 'View the source bids and thoughts', () => selectTab(2));

    sources.append(node('h3', 'Bids, thoughts and outcomes'), node('p', 'Source instructions, linked guidance and validation episodes are shown separately. Other selected bids in the same cycle are context, not proof they built this method.'));
    for (const episode of inspection.episodes) renderEpisode(sources, episode, episode.contractId === skill.source.contractId, ui.cycle, ui.package, fail);
    if (inspection.missingContracts.length) list(sources, inspection.missingContracts.map(id => `Source contract unavailable: ${id}`), '');
    for (const limitation of inspection.limitations) sources.append(node('p', limitation));

    variants.append(node('h3', 'Recorded related variants'));
    if (!inspection.related.length) variants.append(node('p', 'No other method has a recorded source or invocation relationship. Versions of this method are available in Development.'));
    for (const related of inspection.related) {
      const row = node('article'); row.append(node('h4', related.name), node('p', `Version ${related.version}`), node('p', related.explanation)); variants.append(row);
      button(row, 'Inspect related method', () => {
        void load(related.id).then(next => { if (!dialog.isConnected) return; inspection = next; version = next.skill.version; render(); selectTab(0); }).catch(fail);
      });
    }
  };
  versionChoice.onchange = () => { version = Number(versionChoice.value); render(); };
  button(header, 'Refresh skill inspection', () => { void load(inspection.skill.id).then(next => {
    if (!dialog.isConnected) return; inspection = next; if (!next.versions.some(item => item.skill.version === version)) version = next.skill.version; render();
  }).catch(fail); });
  render(); selectTab(0); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
}

function renderEpisode(parent: HTMLElement, episode: SkillEpisodeInspection, open: boolean, showCycle: (cycleId: string) => void,
  loadPackage: ((digest: string) => Promise<{ name: string; files: Record<string, string> }>) | undefined, fail: (error: unknown) => void) {
  const labels = { selected_review: 'Self-selected skill review', instruction: 'Source instruction', ancestor: 'Earlier linked instruction', validation: 'Validation use',
    application: 'Recorded application', rejected_application: 'Rejected application attempt' };
  const entry = details(parent, `${labels[episode.relationship]} · Cycle ${episode.sequence} · ${episode.goal}`);
  entry.id = `skill-episode-${episode.contractId}`; entry.open = open;
  entry.append(node('p', new Date(episode.at).toLocaleString()));
  if (episode.methodRejection) entry.append(node('p', `Method was not applied: ${episode.methodRejection}`));
  if (episode.guidance) entry.append(node('h4', 'Selected corrective instruction'), node('p', episode.guidance.instruction));
  if (episode.correction) {
    const correction = details(entry, 'How this correction changed the procedure');
    correction.append(node('p', `Preserved ${episode.correction.completedPrefix.length} completed steps. ${episode.correction.verifiedReady ? 'The selected handoff reached readiness.' : 'No ready handoff is recorded.'}`));
    for (const [label, steps] of [
      ['Completed steps preserved', episode.correction.completedPrefix],
      ['Previous future steps replaced', episode.correction.discardedFuture],
      ['New selected future steps', episode.correction.selectedFuture],
    ] as const) {
      correction.append(node('h5', label));
      correction.append(node('pre', steps.length ? steps.map((step, index) => `${index + 1}. ${step.serverId}/${step.toolName}\n${step.argumentsJson}`).join('\n\n') : 'No tool steps.'));
    }
  }
  if (episode.usedMethod) entry.append(node('p', `Invoked a previously recorded method, version ${episode.usedMethod.version}.`));
  if (episode.usedMethod?.packageDigest) {
    const provenance = details(entry, 'Stored package provenance');
    provenance.append(node('p', `Method package: ${episode.usedMethod.packageDigest}`));
    if (episode.usedMethod.memberPackageDigest) provenance.append(node('p', `Selected branch package: ${episode.usedMethod.memberPackageDigest}`));
    if (loadPackage) {
      const inspect = (label: string, digest: string) => {
        const output = node('div');
        const control = button(provenance, label, () => {
          control.disabled = true;
          void loadPackage(digest).then(pack => {
            if (!output.isConnected) return;
            output.replaceChildren(node('h5', pack.name));
            for (const [path, contents] of Object.entries(pack.files)) details(output, path).append(node('pre', contents));
          }).catch(error => { if (output.isConnected) fail(error); }).finally(() => { control.disabled = false; });
        });
        provenance.append(output);
      };
      inspect('Inspect method package', episode.usedMethod.packageDigest);
      if (episode.usedMethod.memberPackageDigest) inspect('Inspect branch package', episode.usedMethod.memberPackageDigest);
    }
  }
  entry.append(node('h4', 'Expressed thoughts and reasons'));
  for (const thought of episode.thoughts) {
    entry.append(node('h5', `${thought.name} · ${thought.kind === 'answer' ? 'Deliberation response' : 'Thought'}`), node('p', thought.text));
    if (thought.interpretation) details(entry, 'Expressed interpretation').append(node('p', thought.interpretation));
  }
  entry.append(node('h4', 'Bids considered in this episode'));
  for (const bid of episode.bids) {
    const row = node('article'); row.append(node('h5', `${bid.name} · ${bid.role === 'source' ? 'Source bid' : bid.role === 'earlier_same_part' ? 'Earlier bid from this Part' : 'Other selected bid'}`),
      node('p', bid.text), node('p', `Reason: ${bid.argument}`), node('p', bid.selected ? 'Selected by Self' : 'Not selected'));
    if (bid.replacesBidId) row.append(node('p', 'Replaced an earlier proposal in the same episode.'));
    entry.append(row);
  }
  entry.append(node('h4', 'Self decisions')); list(entry, episode.decisions.map(decision => decision.explanation
    + (decision.identityConflict ? ` Identity conflict: ${decision.identityConflict}` : '')), 'No preserved Self decision text.');
  const activation = details(entry, 'Disposition activation context');
  for (const item of episode.activations) {
    activation.append(node('h5', `${item.name} · definition version ${item.version}`), node('p', item.concern),
      node('p', `${item.phase} judgment: ${item.score} / 4; activation threshold: ${item.threshold}.`)); list(activation, item.cues, 'No recorded cues.');
  }
  const observations = details(entry, `Encounter context · ${episode.observations.length} of ${episode.observationCount} recorded observations`);
  list(observations, episode.observations.map(fact => `${fact.source}: ${fact.text}`), 'No recorded external observations.');
  button(observations, 'Open full source cycle', () => showCycle(episode.cycleId));
  entry.append(node('h4', 'What happened'));
  for (const outcome of episode.outcomes) {
    entry.append(node('p', `Execution: ${outcome.execution.status}. ${outcome.execution.operational?.reason ?? ''}`));
    if (outcome.history.length) list(details(entry, 'Outcome history'), outcome.history.map(item => `${item.status}: ${item.reason ?? 'No operational reason recorded'}`), '');
  }
  if (!episode.outcomes.length) entry.append(node('p', 'No external execution outcome is recorded for this instruction.'));
  if (episode.reviews?.length) {
    entry.append(node('h4', 'Cognitive reviews and consultation requests'), node('p', 'These are recorded requests and reviews of the source activity. Their presence does not prove they caused skill formation or success.'));
    for (const review of episode.reviews) {
      const result = review.outcomes.map(outcome => outcome.outcome.replaceAll('_', ' ')).join(', ')
        || review.consultations?.map(request => request.outcome.replaceAll('_', ' ')).join(', ') || 'Outcome not recorded';
      const record = details(entry, `${review.consultations?.length ? 'Executive consultation' : 'Checkpoint review'} · Cycle ${review.sequence} · ${result}`);
      for (const request of review.consultations ?? []) record.append(node('h5', 'Why the Executive requested cognition'),
        node('p', request.reason), node('p', request.outcome === 'activity_ended' ? 'Activity ended before cognitive review.'
          : request.outcome === 'failed' ? 'Consultation failed; inspect the cycle for infrastructure evidence.'
            : request.outcome === 'pending' ? 'Consultation is awaiting review.' : 'Ordinary cognition reviewed this request.'));
      for (const thought of review.thoughts) record.append(node('h5', `${thought.name}${thought.kind === 'answer' ? ' · Deliberation answer' : ''}`), node('p', thought.text));
      for (const bid of review.bids) record.append(node('p', `${bid.selected ? 'Selected' : 'Not selected'}: ${bid.text}`), node('p', `Reason: ${bid.argument}`));
      for (const decision of review.decisions) record.append(node('p', `${decision.choice === 'CONTINUE_EXECUTION' ? 'Continue current execution' : 'Self decision'}: ${decision.explanation}`));
      for (const intervention of review.interventions) record.append(node('p', `Local pause ${intervention.state}${intervention.parentStatus ? `; original activity ${intervention.parentStatus}` : ''}.`));
      details(record, 'Recorded attention and expressed interpretations').append(node('pre', readable({ attention: review.attention, interpretations: review.thoughts.map(thought => thought.interpretation) })));
      button(record, 'Open checkpoint review', () => showCycle(review.cycleId));
    }
  }
  if (episode.tools.length) table(details(entry, 'Tool activity evidence'), ['Tool', 'Event', 'Recorded status'], episode.tools.map(tool => [tool.tool, tool.phase, tool.status ?? 'Not reported']));
  for (const limitation of episode.limitations) entry.append(node('p', limitation));
  details(entry, 'Record references').append(node('p', `Cycle ${episode.cycleId}; contract ${episode.contractId}`));
}
