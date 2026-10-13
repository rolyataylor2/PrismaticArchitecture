# ADR 0138: Prediction-led relevance scaffolds

Terminology update: [ADR 0161](0161-temporary-prediction-bound-dispositions.md) names these structures **Temporary Prediction-Bound Dispositions**. The original terminology below is preserved as decision history.

Status: Accepted, 2026-10-07. Researcher request: implement the [prediction/disposition discussion](https://chatgpt.com/share/6ac6ac9c-bdbc-83e8-8fd8-1ff9c94f9fb1). Decoded source is preserved under `docs/development/PREDICTION_SCAFFOLD_THREAD_SOURCE.md`.

Extends ADRs 0133/0136 and supersedes ADR 0137's direct online creation of persistent provisional dispositions. ADR 0137 evidence preservation, conservative structural reconciliation and separate subjective-memory reinterpretation remain. Historical decisions are preserved.

## Coverage and hypothesis formation

A prediction is a testable, adjustable proposition about an unresolved state, including a hidden cause, interpretation, continuity or future event. Ordinary Parts still generate predictions with at most one unresolved prediction per Part. In addition, a bounded architectural coverage task can generate gap-origin predictions without an owning Part. This task is neither Self nor an autonomous investigator. It has no bids, execution authority, Identity, private Part state or persistent mission.

After ordinary cognition has expressed products and older predictions have been evaluated, coverage examines the unchanged experienced snapshot, active disposition definitions, expressed thoughts/bids, expressed predictions and factual outcome products. It identifies consequential missing coverage: absent relevant dispositions, absent useful predictions, inadequate confidence, conflicting explanations or unresolved uncertainty. Salience and importance are generative judgments, not hard-coded psychological thresholds. Existing hypotheses are supplied to prevent duplicative investigation. It may abstain. Coverage can explicitly revise, abandon, expire or invalidate supplied open gap hypotheses, preserving prior versions; it cannot resolve truth or change Part-owned predictions. Revising replaces temporary attention on later cycles and preserves prior scaffolds. Expiry without evidence does not mean falsity. The bounded output identifies the gap, what resolving it would change, smallest competing hypotheses, discriminating support/contradiction evidence, and expected future inferential value. Runtime caps hypotheses, open gap predictions, scaffolds per hypothesis and temporary Part admissions per cycle (including recruitment). Every eligible candidate still receives an independent activation judgment; score-based admission under a computation budget does not redefine activation or imply psychological importance. Deferred scopes remain recorded; no recursive same-cycle inference or external investigation occurs.

This replaces the missing-disposition conversational review. Nonprediction memories remain valid; an episode alone does not authorize direct online durable structure creation. Failed predictions may motivate explanatory hypotheses without imposing a runtime causal explanation. Existing sufficient structures are preferred.

## Temporary relevance and ordinary cognition

Both Part-origin and gap-origin predictions can author multiple temporary relevance scaffolds: what evidence matters, what memories could help, what distinction needs tracking, and what would confirm, weaken or differentiate the hypothesis. These are relevance relationships, not truth claims, goals, permanent psychology or action programs. One prediction may have none or several. Generic persistent-cause discovery can concern any recurring source, condition, relationship or strategy; no person ontology, introduction rule or seeded resolver is added.

Scaffolds are persisted versioned dispositions with `temporary=true` and explicit source prediction, origin cycle/thread and relevance metadata. They become eligible only in a later cycle, undergo normal independent activation and recall, and embody ordinary Parts through the same immutable-snapshot parallel pipeline. They do not bypass prerequisite eligibility, confer bid authority, expose private state or run independent agents. Current-cycle hypotheses cannot change the frozen activation set or speak directly to Self. Self remains world-blind and receives only active Parts' expressed products.

Legacy prediction attention remains readable as temporary scope definitions. New scaffolds retain recorded activation versions, recall and expressed products. Resolving, abandoning, invalidating or expiring a hypothesis ends its temporary attention eligibility; records and evidence survive. Temporary Parts retire through ordinary scope disappearance, without restoring retired owners. Outcome correctness is distinct from scaffold usefulness.

## Evidence and consolidation

Outcome reflection remains generative subjective interpretation, with factual-only later evidence and the selected hypothesis capsule. Gap-origin reflection has no fabricated owning Part or private-memory access. Its memory is attributed explicitly to the gap hypothesis; normal Parts may recall the resulting Agent-owned subjective episode. No automatic rewriting of psychology or objective truth occurs. Prediction, subjective episode and temporary structure retain their relationship and history.

Online experience may attach evidence to existing structures, including temporary scaffolds, but cannot promote them. Consolidation considers selected scaffold histories, unresolved/resolved hypotheses, supporting and contradictory subjective memories and ordinary-use trajectories. Explicit operations retain, refine, merge, split, archive or institutionalize useful relevance relationships. Persistent creation waits until originating investigations end and requires recorded usefulness, not a single correct outcome; configurable conservative gates are operational experimental policy. Failed or irrelevant hypotheses can leave useful reusable relevance behind; correct guesses can leave none. Empty evidence and ambiguous cases permit no change. Archival preserves history and memory.

The generative developmental pressure is future inference value: prediction, retrieval, causal, action and compression gains against unnecessary complexity. These are linguistic rationales, not numeric affect weights or global optimization. Pretrained knowledge can propose explanations but cannot fabricate biography. Identity continuity remains a fallible learned hypothesis about persistent causes, refined by ordinary evidence. A reusable resolution method can itself become a disposition through repeated demonstrated usefulness.

## Integration and verification

Separate coverage and gap-outcome tasks, schemas, routing, editable factories, preview contexts and Settings descriptions must reflect these access boundaries. Inspection distinguishes hypothesis origin, temporary scaffolds, lifespan, evidence, learning decisions and persistent descendants. No deleted history or raw-audit replay is introduced.

Sourced Simulation Tests exercise blank bootstrapping, uncertain/conflicting coverage, same-cycle isolation, temporary resolution/retirement, failure-driven explanation, useful versus merely correct scaffolds, learned recurring-source resolution and nonperson controls. They use ordinary external experiences on isolated Agents and record initial conditions, controls, provider provenance and inconclusive results. Deterministic tests establish plumbing and boundaries, not model-discovered cognition or human psychology.

This ADR defines the full target. Completion requires requirement-level code, runtime, persistence, prompt, inspection and experiment evidence; it does not itself assert completion.
