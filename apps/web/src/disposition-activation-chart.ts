import type { DispositionActivationSample } from '../../../packages/sdk/src/disposition-activation-history.js';

export function dispositionActivationChart(samples: DispositionActivationSample[], inspect: (cycleId: string) => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'disposition-activation-history';
  section.setAttribute('aria-label', 'Historical disposition activation');
  const heading = document.createElement('h3'); heading.textContent = 'Activation history';
  const explanation = document.createElement('p');
  explanation.textContent = `${samples.filter(sample => sample.score !== null && sample.phase !== 'baseline').length} final judgments · Independent relevance, 0–4. Gaps are unmeasured; activation is not emotional intensity or action authority.`;
  section.append(heading, explanation);
  if (!samples.length) { const empty = document.createElement('p'); empty.textContent = 'No recorded activation assessments for this disposition.'; section.append(empty); return section; }
  const threads = document.createElement('select'); threads.setAttribute('aria-label', 'Activation history thread');
  const all = document.createElement('option'); all.value = '*'; all.textContent = 'All threads'; threads.append(all);
  for (const thread of new Set(samples.map(sample => sample.threadId))) {
    const option = document.createElement('option'); option.value = JSON.stringify(thread); option.textContent = thread ?? 'Unthreaded'; threads.append(option);
  }
  const plot = document.createElement('div'); plot.style.overflowX = 'auto';
  const records = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Exact judgments and source evidence'; records.append(summary);
  const render = () => {
    const visible = samples.filter(sample => threads.value === '*' || JSON.stringify(sample.threadId) === threads.value);
    const latest = visible.findLast(sample => sample.phase !== 'baseline');
    const measured = visible.findLast(sample => sample.score !== null && sample.phase !== 'baseline');
    explanation.textContent = `${visible.filter(sample => sample.score !== null && sample.phase !== 'baseline').length} final judgments${measured ? ` · Last measured ${measured.score}/4 at WorldState ${measured.sequence}` : ''}${latest?.score === null ? ' · Latest assessment unmeasured' : ''}. Independent relevance, 0–4; gaps are unmeasured. Activation is not emotional intensity or action authority.`;
    plot.replaceChildren(); records.replaceChildren(summary);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 720 240');
    svg.style.width = '100%'; svg.style.minWidth = '480px'; svg.style.maxHeight = '300px'; svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Activation relevance over WorldState sequence; points open source cycles');
    const first = Math.min(...visible.map(sample => sample.sequence)); const last = Math.max(...visible.map(sample => sample.sequence));
    const x = (sequence: number) => 45 + (sequence - first) / Math.max(1, last - first) * 645;
    const y = (score: number) => 200 - score * 43;
    for (let score = 0; score <= 4; score++) {
      const line = document.createElementNS(ns, 'line'); line.setAttribute('x1', '40'); line.setAttribute('x2', '695'); line.setAttribute('y1', String(y(score))); line.setAttribute('y2', String(y(score))); line.setAttribute('stroke', '#888'); line.setAttribute('opacity', '.2'); svg.append(line);
      const label = document.createElementNS(ns, 'text'); label.setAttribute('x', '20'); label.setAttribute('y', String(y(score) + 4)); label.setAttribute('fill', 'currentColor'); label.textContent = String(score); svg.append(label);
    }
    // Join only within a thread, and break at exclusions. Baselines remain evidence rows.
    for (const thread of new Set(visible.map(sample => sample.threadId))) {
      let previous: DispositionActivationSample | undefined;
      for (const sample of visible.filter(sample => sample.threadId === thread && sample.phase !== 'baseline')) {
        if (sample.score === null) { previous = undefined; continue; }
        if (previous?.score !== null && previous) {
          const line = document.createElementNS(ns, 'line');
          for (const [key, value] of Object.entries({ x1: x(previous.sequence), y1: y(previous.score), x2: x(sample.sequence), y2: y(sample.score) })) line.setAttribute(key, String(value));
          line.setAttribute('stroke', '#5687b8'); line.setAttribute('stroke-width', '2'); svg.append(line);
        }
        const point = document.createElementNS(ns, 'circle'); point.setAttribute('cx', String(x(sample.sequence))); point.setAttribute('cy', String(y(sample.score))); point.setAttribute('r', '5'); point.setAttribute('fill', '#5687b8');
        const label = `WorldState ${sample.sequence} · ${sample.score}/4 · threshold ${sample.threshold} · ${sample.threadId ?? 'unthreaded'} · ${sample.capturedAt}`;
        point.setAttribute('tabindex', '0'); point.setAttribute('role', 'link'); point.setAttribute('aria-label', label);
        const title = document.createElementNS(ns, 'title'); title.textContent = label; point.append(title);
        point.onclick = () => inspect(sample.cycleId); point.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(sample.cycleId); } }; svg.append(point); previous = sample;
      }
    }
    const axis = document.createElementNS(ns, 'text'); axis.setAttribute('x', '45'); axis.setAttribute('y', '230'); axis.setAttribute('fill', 'currentColor'); axis.textContent = `WorldState sequence ${first}–${last}`; svg.append(axis); plot.append(svg);
    const scroll = document.createElement('div'); scroll.style.overflowX = 'auto';
    const table = document.createElement('table'); table.style.minWidth = '720px'; table.style.overflowWrap = 'normal'; const head = table.createTHead().insertRow();
    for (const text of ['Observed at', 'Thread', 'Version', 'Phase', 'Score / 4', 'Threshold', 'Evidence']) { const th = document.createElement('th'); th.textContent = text; head.append(th); }
    const body = table.createTBody();
    for (const sample of visible) {
      const row = body.insertRow();
      for (const value of [sample.capturedAt, sample.threadId ?? 'Unthreaded', sample.dispositionVersion, sample.phase, sample.score ?? 'Unmeasured', sample.threshold]) row.insertCell().textContent = String(value);
      const link = document.createElement('button'); link.textContent = `Cycle ${sample.sequence}`; link.onclick = () => inspect(sample.cycleId); row.insertCell().append(link);
      if (sample.reasons.length) row.title = sample.reasons.join('; ');
    }
    scroll.append(table); records.append(scroll);
  };
  threads.onchange = render; section.append(threads, plot, records); render(); return section;
}
