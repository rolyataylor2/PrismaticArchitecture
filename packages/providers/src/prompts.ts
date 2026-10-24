import { readFileSync } from 'node:fs';
import { evidenceCatalog } from '../../core/src/evidence-provenance.js';
import type { WorldState } from '../../core/src/domain.js';
import twigPkg from 'twig';
const Twig = ((twigPkg as unknown as { default?: typeof twigPkg }).default ?? twigPkg);
type TwigParams = { data: string; strict_variables?: boolean; rethrow?: boolean };
import { effectivePrimitive, type Primitive } from '../../core/src/primitives.js';
import { InfrastructureError } from '../../core/src/contracts.js';
import type { PromptTask } from '../../core/src/domain.js';

/** Task instructions are editable Markdown-formatted Twig templates; templates receive only the task's explicit data. */
function loadFactoryPrompt(name: string): string {
  return readFileSync(new URL(`./prompt.${name}.md`, import.meta.url), 'utf8');
}
export const prompts = {
  sleep_prediction_review: { version: 'sleep-independent-evidence-v2', text: loadFactoryPrompt('sleep_prediction_review') },
  thought_resources: { version: 'thought-resources-v2', text: loadFactoryPrompt('thought_resources') },
  bid_applicability: { version: 'bid-applicability-v1', text: loadFactoryPrompt('bid_applicability') },
  executive_skill_consolidation: { version: 'executive-skill-consolidation-v3', text: loadFactoryPrompt('executive_skill_consolidation') },
  simulation_evaluation: { version: 'simulation-evaluation-v4', text: loadFactoryPrompt('simulation_evaluation') },
  hypothesis_outcome: { version: 'hypothesis-outcome-independent-v4', text: loadFactoryPrompt('hypothesis_outcome') },
  hypothesis_reflection: { version: 'hypothesis-reflection-source-lineage-v3', text: loadFactoryPrompt('hypothesis_reflection') },
  cognition_coverage: { version: 'cognition-coverage-cognitive-strategies-v5', text: loadFactoryPrompt('cognition_coverage') },
  memory_synthesis: { version: 'memory-synthesis-v2', text: loadFactoryPrompt('memory_synthesis') },
  memory_reinterpretation: { version: 'memory-reinterpretation-source-lineage-v3', text: loadFactoryPrompt('memory_reinterpretation') },
  experiential_formation: { version: 'experience-evidence-attachment-v3', text: loadFactoryPrompt('experiential_formation') },
  researcher_authoring: { version: 'researcher-authoring-v1', text: loadFactoryPrompt('researcher_authoring') },
  memory_accessibility: { version: 'memory-accessibility-independent-sleep-v7', text: loadFactoryPrompt('memory_accessibility') },
  disposition_activation: { version: 'disposition-activation-relevance-only-v11', text: loadFactoryPrompt('disposition_activation') },
  part_cognition: { version: 'part-cognition-cited-evidence-v3', text: loadFactoryPrompt('part_cognition') },
  disposition_learning: { version: 'disposition-independent-outcomes-v11', text: loadFactoryPrompt('disposition_learning') },
  effortful_recall: { version: 'effortful_recall-twig-v1', text: loadFactoryPrompt('effortful_recall') },

  memory_relevance: { version: 'memory-relevance-twig-v2', text: loadFactoryPrompt('memory_relevance') },
  speech: { version: 'speech-realization-twig-v3', text: loadFactoryPrompt('speech') },
  identity_clarification: { version: 'identity-clarification-twig-v1', text: loadFactoryPrompt('identity_clarification') },
  identity_answers: { version: 'identity-answers-twig-v2', text: loadFactoryPrompt('identity_answers') },
  activation: { version: 'activation-twig-v14', text: loadFactoryPrompt('activation') },
  affect_selection: { version: 'affect-selection-v1', text: loadFactoryPrompt('affect_selection') },
  affect_inquiry: { version: 'affect-inquiry-v1', text: loadFactoryPrompt('affect_inquiry') },
  focused_bid_revision: { version: 'focused-bid-revision-embodied-v3', text: loadFactoryPrompt('focused_bid_revision') },
  arbitration: { version: 'arbitration-commitments-v2', text: loadFactoryPrompt('arbitration') },
  cognition: { version: 'cognition-embodied-v5', text: loadFactoryPrompt('cognition') },
  prediction_gate: { version: 'prediction-gate-twig-v3', text: loadFactoryPrompt('prediction_gate') },
  prediction_outcome: { version: 'prediction-outcome-independent-v4', text: loadFactoryPrompt('prediction_outcome') },
  prediction: { version: 'prediction-cognitive-strategies-v7', text: loadFactoryPrompt('prediction') },
  evaluation: { version: 'prediction-evaluation-source-lineage-v14', text: loadFactoryPrompt('evaluation') },
  answer: { version: 'answer-conditions-v28', text: loadFactoryPrompt('answer') },
  deliberation: { version: 'deliberation-commitments-v1', text: loadFactoryPrompt('deliberation') },
  consolidation: { version: 'offline-consolidation-twig-v5', text: loadFactoryPrompt('consolidation') },
  reconsolidation: { version: 'memory-reconsolidation-twig-v3', text: loadFactoryPrompt('reconsolidation') },
  formation: { version: 'part-formation-twig-v3', text: loadFactoryPrompt('formation') },
  replay: { version: 'rare-ancestor-replay-twig-v3', text: loadFactoryPrompt('replay') },
} as const;

export const constructedPromptTasks = ["sleep_prediction_review", "thought_resources", "bid_applicability", "cognition_coverage", "hypothesis_reflection", "memory_accessibility", "disposition_activation", "part_cognition", "experiential_formation", "disposition_learning", "memory_reinterpretation", "memory_synthesis", "effortful_recall"] as const;

export type PromptResolver = (agentId: string, task: PromptTask) => string | undefined;
export const promptCatalog: { task: PromptTask; title: string; category: string; version: string; original: string }[] = [
  { task: 'sleep_prediction_review', title: 'Slp · Historical prediction evidence', category: 'Slp', version: prompts.sleep_prediction_review.version, original: prompts.sleep_prediction_review.text },
  { task: 'thought_resources', title: 'Cog · Thought resource assessment', category: 'Cog', version: prompts.thought_resources.version, original: prompts.thought_resources.text },
  { task: 'bid_applicability', title: 'Exec · External proposal conditions', category: 'Exec', version: prompts.bid_applicability.version, original: prompts.bid_applicability.text },
  { task: 'simulation_evaluation', title: 'Researcher · Simulation evaluation', category: 'Researcher', version: prompts.simulation_evaluation.version, original: prompts.simulation_evaluation.text },
  { task: 'memory_accessibility', title: 'Mem · Memory accessibility', category: 'Mem', version: prompts.memory_accessibility.version, original: prompts.memory_accessibility.text },
  { task: 'disposition_activation', title: 'Cog · Disposition activation', category: 'Cog', version: prompts.disposition_activation.version, original: prompts.disposition_activation.text },
  { task: 'hypothesis_outcome', title: 'Mem · Gap hypothesis outcome check', category: 'Mem', version: prompts.hypothesis_outcome.version, original: prompts.hypothesis_outcome.text },
  { task: 'hypothesis_reflection', title: 'Mem · Gap hypothesis subjective reflection', category: 'Mem', version: prompts.hypothesis_reflection.version, original: prompts.hypothesis_reflection.text },
  { task: 'cognition_coverage', title: 'Cog · Consequential coverage and hypotheses', category: 'Cog', version: prompts.cognition_coverage.version, original: prompts.cognition_coverage.text },
  { task: 'part_cognition', title: 'Cog · Formation → memory-inferred beliefs → cognition', category: 'Cog', version: prompts.part_cognition.version, original: prompts.part_cognition.text },
  { task: 'experiential_formation', title: 'Mem · Experience evidence attachment', category: 'Mem', version: prompts.experiential_formation.version, original: prompts.experiential_formation.text },
  { task: 'disposition_learning', title: 'Slp · Disposition learning', category: 'Slp', version: prompts.disposition_learning.version, original: prompts.disposition_learning.text },
  { task: 'memory_synthesis', title: 'Slp · Disposition memory synthesis', category: 'Slp', version: prompts.memory_synthesis.version, original: prompts.memory_synthesis.text },
  { task: 'memory_reinterpretation', title: 'Slp · Subjective memory reinterpretation', category: 'Slp', version: prompts.memory_reinterpretation.version, original: prompts.memory_reinterpretation.text },
  { task: 'effortful_recall', title: 'Mem · Effortful recall', category: 'Mem', version: prompts.effortful_recall.version, original: prompts.effortful_recall.text },
  { task: 'identity_clarification', title: 'Identity · Clarify person or character', category: 'Identity', version: prompts.identity_clarification.version, original: prompts.identity_clarification.text },
  { task: 'researcher_authoring', title: 'Researcher · Component draft', category: 'Researcher', version: prompts.researcher_authoring.version, original: prompts.researcher_authoring.text },
  { task: 'identity_answers', title: 'Identity · Answer preset questions', category: 'Identity', version: prompts.identity_answers.version, original: prompts.identity_answers.text },
  { task: 'speech', title: 'Exec · Speech', category: 'Exec', version: prompts.speech.version, original: prompts.speech.text },
  { task: 'affect_selection', title: 'Cog · Self affect scoring', category: 'Cog', version: prompts.affect_selection.version, original: prompts.affect_selection.text },
  { task: 'affect_inquiry', title: 'Cog · Self affect inquiry', category: 'Cog', version: prompts.affect_inquiry.version, original: prompts.affect_inquiry.text },
  { task: 'focused_bid_revision', title: 'Cog · Focused Part bid revision', category: 'Cog', version: prompts.focused_bid_revision.version, original: prompts.focused_bid_revision.text },
  { task: 'arbitration', title: 'Cog · Self bid scoring', category: 'Cog', version: prompts.arbitration.version, original: prompts.arbitration.text },
  { task: 'memory_relevance', title: 'Mem · Memory relevance', category: 'Mem', version: prompts.memory_relevance.version, original: prompts.memory_relevance.text },
  { task: 'prediction_outcome', title: 'Mem · Prediction outcome check', category: 'Mem', version: prompts.prediction_outcome.version, original: prompts.prediction_outcome.text },
  { task: 'evaluation', title: 'Mem · Prediction reflection', category: 'Mem', version: prompts.evaluation.version, original: prompts.evaluation.text },
  { task: 'answer', title: 'Cog · Part deliberation response', category: 'Cog', version: prompts.answer.version, original: prompts.answer.text },
  { task: 'deliberation', title: 'Cog · Self deliberation inquiry', category: 'Cog', version: prompts.deliberation.version, original: prompts.deliberation.text },
  { task: 'executive_skill_consolidation', title: 'Slp · Conditional procedural consolidation', category: 'Slp', version: prompts.executive_skill_consolidation.version, original: prompts.executive_skill_consolidation.text },
  { task: 'consolidation', title: 'Slp · Offline consolidation', category: 'Slp', version: prompts.consolidation.version, original: prompts.consolidation.text },
  { task: 'reconsolidation', title: 'RFN · Memory reconsolidation', category: 'RFN', version: prompts.reconsolidation.version, original: prompts.reconsolidation.text },
  { task: 'formation', title: 'RFN · Part formation', category: 'RFN', version: prompts.formation.version, original: prompts.formation.text },
  { task: 'replay', title: 'RFN · Ancestor replay', category: 'RFN', version: prompts.replay.version, original: prompts.replay.text },
];

export function resolvePrompt(agentId: string, task: PromptTask, resolver?: PromptResolver): string {
  return resolver?.(agentId, task) ?? prompts[task].text;
}

export function renderTaskPrompt(agentId: string, task: PromptTask, data: object, resolver?: PromptResolver): string {
  const citationWorld = (data as { world?: WorldState }).world;
  if (['part_cognition', 'evaluation', 'hypothesis_reflection', 'prediction'].includes(task)) data = { ...data, evidenceCatalog: citationWorld ? evidenceCatalog(citationWorld) : [] };
  if (task === 'answer') data = { currentAffectProposals: [], selectedFocus: null, ...data };
  if ((constructedPromptTasks as readonly string[]).includes(task)) data = { task, world: null, identity: null, dispositions: [], dispositionBindings: [], memories: [], workingParts: [], predictions: [], coverageProducts: [], hypothesisLimit: 3, hypothesis: null, hypothesisHistory: [], predictionTrajectories: [], predictionReviews: [], predictionReviewContext: null, outcome: null, laterEvidence: [], memory: null, question: null, candidates: [], ...data };
  // Legacy owning-Part snapshots have implicit full conviction. Never add Part state to world-blind contexts.
  const owningPart = (data as { part?: { beliefConfidence?: number; instance?: unknown } }).part;
  if (owningPart) data = { dispositions: [], effortfulRecollections: [], ...data, part: { ...owningPart, instance: owningPart.instance ?? null, beliefConfidence: owningPart.beliefConfidence ?? 1 } };
  const pendingPrediction = (data as { prediction?: object | null }).prediction;
  if (pendingPrediction) data = { ...data, prediction: { kind: null, conditions: [], conditionedAction: null, ...pendingPrediction } };
  // Older snapshots have no shared thought field. Normalize only an explicitly supplied world;
  // world-blind tasks must never gain one through compatibility defaults.
  const input = data as { world?: object };
  const compatible = task === 'activation' ? { primitiveSensitivities: [], partActivationContext: [], directParticipants: [], ...data, candidates: ((data as { candidates?: object[] }).candidates ?? []).map(candidate => {
    const { retrievalKeys: _retrievalKeys, ...scoringPart } = candidate as { retrievalKeys?: unknown };
    return scoringPart;
  }), primitives: ((data as { primitives?: Primitive[] }).primitives ?? []).map(effectivePrimitive) }
    : task === 'consolidation' ? { primitiveAppraisals: [], ...data } : data;
  const selfInput = data as { deliberation?: unknown[]; contributions?: { sourceKind?: string; bid: object | null }[]; contributionHistory?: { sourceKind?: string; bid: object | null }[]; inquiries?: object[] };
  const legacySelf = ['arbitration', 'deliberation'].includes(task) ? { commitments: [], completedDeliberationRounds: 0, stanceHistory: [], ongoingActivity: null, selectedFocus: null, debate: selfInput.deliberation ?? [], ...compatible,
    inquiries: (selfInput.inquiries ?? []).map(inquiry => ({ why_deliberate: null, primary_c: null, secondary_c: null, missing_information: null, ...inquiry })),
    contributionHistory: (selfInput.contributionHistory ?? []).map(contribution => ({ affect: '', ...contribution, bid: contribution.bid ? { type: 'action', ...contribution.bid } : null })),
    contributions: (selfInput.contributions ?? []).map(contribution => ({ sourceKind: 'part', affect: '', ...contribution,
      bid: contribution.bid ? { type: 'action', ...contribution.bid } : null })) } : compatible;
  const context = input.world ? { ...legacySelf, world: { thoughtHistory: [], ...input.world } } : legacySelf;
  return renderPrompt(resolvePrompt(agentId, task, resolver), context);
}

/** Split only an explicit researcher-visible Twig boundary; comments never reach the model. */
export function renderTaskPromptMessages(agentId: string, task: PromptTask, data: object, resolver?: PromptResolver): string | string[] {
  const template = resolvePrompt(agentId, task, resolver);
  const boundary = '{# private_scope_context #}';
  const offset = task === 'part_cognition' ? template.indexOf(boundary) : -1;
  if (offset < 0 || template.indexOf(boundary, offset + boundary.length) >= 0) return renderTaskPrompt(agentId, task, data, resolver);
  try {
    return [template.slice(0, offset), template.slice(offset + boundary.length)]
      .map(fragment => renderTaskPrompt(agentId, task, data, () => fragment));
  } catch {
    // An override may carry Twig variables or control blocks across the boundary.
    // Preserve its full rendering rather than turn cache optimization into a template failure.
    return renderTaskPrompt(agentId, task, data, resolver);
  }
}

export function renderPartPrompt<T extends {
  part?: { id: string; name: string };
  activation: { distribution?: { label: string; probability: number }[] | undefined };
}>(agentId: string, task: PromptTask, context: T, resolver?: PromptResolver): string {
  return renderTaskPrompt(agentId, task, { effortfulRecollections: [], recentThoughts: [], availableContributors: context.part ? [{ partId: context.part.id, name: context.part.name }] : [], ...context, activation: { ...context.activation, distribution: context.activation.distribution ?? [] } }, resolver);
}

function assertNoExternalTemplateLoads(template: string): void {
  // Inline templates must not load files, remote templates, or macros from provider infrastructure.
  if (/{%\s*(?:include|import|from|extends|embed)\b/i.test(template)) throw new Error('Twig templates cannot load external templates.');
}

export function validatePromptTemplate(template: string): void {
  try {
    assertNoExternalTemplateLoads(template);
    Twig.twig({ data: template, strict_variables: true, rethrow: true } as unknown as TwigParams);
  } catch (error) {
    // Twig exceptions can be plain objects rather than native Error instances.
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    throw new Error(`Invalid Twig prompt template: ${message}`);
  }
}

export function renderPrompt(template: string, data: object): string {
  try {
    assertNoExternalTemplateLoads(template);
    // Twig writes loop/set variables into its context. Keep those writes isolated
    // from immutable cognitive inputs, including their nested state.
    const renderContext = structuredClone(data);
    return Twig.twig({ data: template, strict_variables: true, rethrow: true } as unknown as TwigParams).render(renderContext) as string;
  } catch (error) {
    if (error instanceof InfrastructureError) throw error;
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    throw new InfrastructureError('prompt', `Invalid Twig prompt template: ${message}`);
  }
}

for (const prompt of Object.values(prompts)) validatePromptTemplate(prompt.text);
