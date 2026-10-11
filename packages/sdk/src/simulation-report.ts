import type { SimulationRun } from './simulation-tests.js';
import type { SimulationAnalysis } from './simulation-analysis.js';
import type { SimulationReview, SimulationMetricReview, SimulationFinding, SimulationCandidate } from './simulation-research.js';

type Research = { reviews: SimulationReview[]; metricReviews: SimulationMetricReview[]; findings: SimulationFinding[] };
type Basis = 'operational_record' | 'observer_measure' | 'human_review' | 'subjective_assessment' | 'unreviewed_candidate' | 'recorded_change' | 'evidence_gap';
export type ReportEntry = { key: string; title: string; body: string; basis: Basis; evidenceReferences: string[];
  reviewId?: string; reviewVersion?: number; citations?: SimulationReview['citations']; alternatives?: string; followUp?: string };
const latest = <T extends { version: number }>(items: T[]) => items.slice().sort((a, b) => a.version - b.version).at(-1);
/** Contextual researcher report; only its supplied frozen records can support a statement. */
export function simulationReport(run: SimulationRun, analysis: SimulationAnalysis, research: Research, candidates: SimulationCandidate[], resolveEvidence: (reference: string) => SimulationReview['citations'][number]) {
  const worked: ReportEntry[] = []; const surprising: ReportEntry[] = []; const unknown: ReportEntry[] = [];
  const changed: ReportEntry[] = []; const inspectNext: ReportEntry[] = [];
  (run.status === 'completed' ? worked : run.status === 'failed' ? surprising : unknown).push({ key: 'operational-progress', title: 'Recorded scenario progress', basis: 'operational_record',
    body: `${run.status}: ${run.stages.length}/${run.totalSteps} stages captured. This describes operational progress; it does not establish the hypothesis.`,
    evidenceReferences: run.stages.length ? [`/stages/${run.stages.length - 1}`] : ['/specification'] });
  run.specification.criteria.forEach((criterion, index) => {
    const criterionId = `criterion-${index + 1}`; const review = latest(research.reviews.filter(item => item.criterionId === criterionId));
    const measureIndex = run.measures.findIndex(item => item.criterion === criterion); const measure = run.measures[measureIndex];
    if (review) {
      const entry: ReportEntry = { key: criterionId, title: criterion, basis: 'human_review', body: `${review.reviewer} reviewed this as ${review.outcome}: ${review.rationale}`,
        reviewId: review.id, reviewVersion: review.version, citations: review.citations, evidenceReferences: review.citations.map(item => item.reference) };
      (review.outcome === 'observed' ? worked : review.outcome === 'not_observed' ? surprising : unknown).push(entry);
    } else if (measure && measure.assessmentKind === 'operational' && measure.outcome !== 'inconclusive') {
      (measure.outcome === 'observed' ? worked : surprising).push({ key: criterionId, title: criterion, basis: 'observer_measure',
        body: `${measure.outcome}: ${measure.evidence}. This is an observer measure, not a human psychological judgment.`, evidenceReferences: [`/measures/${measureIndex}`] });
    } else {
      unknown.push({ key: criterionId, title: criterion, basis: 'evidence_gap',
        body: 'No decisive human criterion review is recorded. Semantic model judgments and inconclusive fixture measurements cannot establish this conclusion.',
        evidenceReferences: measure ? [`/measures/${measureIndex}`] : [`/specification/criteria/${index}`],
        followUp: 'Review the criterion against preserved baseline, comparison/control and later probe evidence; record limitations explicitly.' });
    }
  });
  for (const metric of analysis.metrics.dimensions) {
    const review = latest(research.metricReviews.filter(item => item.metricId === metric.id));
    const entry: ReportEntry = review ? { key: `dimension:${metric.id}`, title: metric.title, basis: 'human_review',
      body: `${review.verdict} by ${review.reviewer}. Method: ${review.operationalization}. ${review.rationale} Limitations: ${review.limitations}${review.value === null ? '' : ` Measurement: ${review.value} ${review.unit}.`}`,
      reviewId: review.id, reviewVersion: review.version, citations: review.citations, evidenceReferences: review.citations.map(item => item.reference) }
      : { key: `dimension:${metric.id}`, title: metric.title, basis: 'evidence_gap', body: `Not independently reviewed. ${metric.prerequisite}`, evidenceReferences: [], followUp: metric.prerequisite };
    (!review || review.verdict === 'inconclusive' ? unknown : review.verdict === 'supported' ? worked : surprising).push(entry);
  }
  for (const prediction of analysis.predictions.filter(item => item.expectationAssessment === 'contradicted')) {
    const stageIndex = prediction.versions.at(-1)!.stageIndex;
    const predictionIndex = run.stages[stageIndex]!.predictions.findIndex(item => item.id === prediction.prediction.id);
    surprising.push({ key: `contradiction:${prediction.prediction.id}`, title: 'A prediction received a contradictory subjective assessment',
      basis: 'subjective_assessment', body: `${prediction.ownerName}: “${prediction.prediction.expectation}”. ${prediction.prediction.evaluation?.interpretation ?? ''}`,
      evidenceReferences: [`/stages/${stageIndex}/predictions/${predictionIndex}`],
      alternatives: 'This is the recorded perspective’s interpretation of evidence; independent assessability and causal attribution remain review questions.',
      followUp: 'Inspect the prediction capsule, horizon, checks and factual evidence, then compare the later memory and held-out probe.' });
  }
  for (const key of new Set(research.findings.map(item => item.key))) {
    const finding = latest(research.findings.filter(item => item.key === key))!;
    const entry: ReportEntry = { key: `finding:${key}`, title: finding.title, body: `${finding.status}: ${finding.claim}`,
      basis: finding.status === 'unreviewed' ? 'unreviewed_candidate' : 'human_review', alternatives: finding.alternatives, followUp: finding.followUp,
      reviewId: finding.id, reviewVersion: finding.version, citations: finding.citations, evidenceReferences: finding.citations.map(item => item.reference) };
    (finding.status === 'insufficient_evidence' || finding.status === 'disputed' ? unknown : surprising).push(entry);
    inspectNext.push(entry);
  }
  for (const candidate of candidates.filter(item => !research.findings.some(finding => finding.key === item.key))) {
    const entry: ReportEntry = { ...candidate, body: candidate.claim, basis: 'unreviewed_candidate' };
    surprising.push(entry); inspectNext.push(entry);
  }
  analysis.stages.forEach(stage => {
    if (!stage.index) return; // Initial captured population is a baseline, not measured development.
    for (const [kind, entries] of Object.entries(stage.changes)) for (const entry of entries) {
      const collection = run.stages[stage.index]![kind as 'parts' | 'predictions' | 'memories' | 'dispositions'];
      const objectIndex = collection.findIndex(item => item.id === entry.id);
      changed.push({ key: `change:${stage.index}:${kind}:${entry.id}`, title: `${stage.name}: ${kind} ${entry.kind}`,
        basis: 'recorded_change', body: `${entry.id}: ${entry.before ? `version ${entry.before.version} → ${entry.after.version}` : `first captured at version ${entry.after.version}`}${entry.fields.length ? `; changed fields: ${entry.fields.map(item => item.field).join(', ')}` : ''}. A saved change does not prove benefit.`,
        evidenceReferences: [`/stages/${stage.index}/${kind}/${objectIndex}`, `/stages/${stage.index - 1}/${kind}`] });
    }
  });
  if (!changed.length) changed.push({ key: 'no-later-version-changes', title: 'No later object-version changes captured', basis: 'recorded_change',
    body: 'The initial snapshot is the baseline. Absence of later captured revisions does not prove that no psychological development occurred.',
    evidenceReferences: run.stages.length ? ['/stages/0'] : [] });
  if (run.error) { const entry: ReportEntry = { key: 'infrastructure-failure', title: 'Infrastructure failure', basis: 'operational_record',
    body: run.error, evidenceReferences: ['/error'], followUp: 'Inspect the failed attempt and provider/runtime diagnostics before interpreting missing observations.' }; unknown.push(entry); inspectNext.push(entry); }
  for (const gap of analysis.gaps) unknown.push({ key: `gap:${gap}`, title: 'Evidence limitation', body: gap, basis: 'evidence_gap', evidenceReferences: [] });
  for (const entry of unknown.filter(item => item.followUp)) inspectNext.push(entry);
  return { runId: run.id, agentId: run.agentId, evidenceBasis: run.evidenceBasis, status: run.status,
    hypothesis: run.specification.hypothesis, worked, surprising, unknown, changed, inspectNext,
    sources: [...new Set([...worked, ...surprising, ...unknown, ...changed, ...inspectNext].flatMap(item => item.evidenceReferences))].map(reference => {
      try { return { reference, citation: resolveEvidence(reference), unavailableReason: null }; }
      catch (error) { return { reference, citation: null, unavailableReason: error instanceof Error ? error.message : 'Recorded evidence is unavailable' }; }
    }),
    limitations: ['Researcher-side deterministic analysis; attributed judgments remain interpretations, not world truth.',
      'This report uses frozen run evidence and saved research records; it never consults current Agent psychology.',
      'Initial snapshots, revisions, operational completion and cognitive effectiveness remain distinct.'] };
}
export type SimulationReport = ReturnType<typeof simulationReport>;
