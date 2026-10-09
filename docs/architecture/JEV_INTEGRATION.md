<!-- Current online flow: ADR 0133 -->

[ADR 0133](decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

## Current refinement (ADR 0129)

## Current cycle (ADR 0132)

[ADR 0132](decisions/0132-direct-worldstate-disposition-activation.md) supersedes the online perception stage: immutable WorldState + thread steering → direct independent Jev disposition activation → disposition-specific subjective memory accessibility → ordered construction/evidence/cognition. No perception inference runs. Prior-cycle prerequisites gate eligibility; each disposition's current scope is judged from WorldState. Compatibility binding IDs denote scopes, not inferred individual entities. Self remains world-blind; Identity guides and execution stays external.


Production cognition uses prior-cycle disposition prerequisites, disposition-specific chronological recall and one independent combined cognition/prediction call per active Part. Self remains world-blind. Earlier separate-prediction descriptions apply to historical fixtures. See [ADR 0129](decisions/0129-progressive-disposition-cognition.md).

# Jev Integration

## Current default revision (ADR 0126)

[ADR 0126](decisions/0126-constructed-perspectives-and-dispositions.md) supersedes older persistent-Part and private-only recall guidance for the default constructed architecture. Parts are temporary working perspectives reconstructed from subjective Agent autobiography; retired instances remain inspectable. Thread steering and gated entity-bound disposition graphs guide perception and recall. Self remains world-blind and Identity-guided; execution remains external. ADR 0128 removes the earlier online flow from application code. Historical regression fixtures and offline Part-development consolidation remain separate.

Jev is the initial System-One decision model used by The Prism Agent Architecture.

It is infrastructure rather than cognitive identity.

The Prism Agent Architecture should interact with Jev through a replaceable decision-model adapter.

## Current intended uses

### Activation

The activation adapter renders one shared human-readable prompt from the immutable WorldState Wₙ, complete current candidate Part records (ADR 0096), owning-Part context with every current memory’s formation timestamp and gist (ADR 0109), configured primitive definitions, explicit temperament self-definition Traits (ADR 0104), and the attributed retained thought history in Wₙ (ADR 0098). It sends that prompt as the request's shared state and asks a candidate-specific activation Score question in one request when practical:

```text
state = rendered activation Twig template(Wₙ, candidates, partActivationContext, primitives, primitiveSensitivities)

questions:
Score activation for candidate A
Score activation for candidate B
Score activation for candidate C
Score primitive registration for Novel
Score primitive registration for Aversive
...
```

Each candidate receives an independent graded activation level. The results are not shares of a common pool and are not normalized across candidates. Do not use one Choice among Parts or canonical binary Noul judgments for activation. Binary judgments may remain useful in experiments.

### Self arbitration

Jev scores existing Part and surfaced primitive bids and the option to continue deliberation. Runtime ranks these Scores and conservatively scores marginal additions to a compatible set (ADR 0112).

## Shared-state advantage

Jev can evaluate several independent semantic questions against shared state. For activation, the candidate Parts are jointly contextualized in one request while their Score-style results remain independent. This supports consistent context and runtime efficiency without making Parts compete.

## Structured uncertainty

Jev returns probabilities. The Prism Agent Architecture should preserve these results for inspection, performance evaluation, policy decisions, debugging, and calibration experiments. They should not automatically become Part psychology.

## Vendor independence

The rest of The Prism Agent Architecture should not directly import Jev-specific SDK types. A future decision model should be replaceable without rewriting Parts, Self, Identity, bidding, WorldState, simulation, or history.

For Activator, WorldState is permitted. Its template may select which available WorldState fields become the shared prompt text. For Self arbitration, WorldState is forbidden. Self's rendered prompt is built only from Identity, mediated Part/primitive contributions, deliberation and available choice IDs; the adapter must not expand cognitive access merely because Jev supports larger state. Jev's typed Score/Choice question IDs, criteria and model remain provider protocol fields around the rendered human-readable prompt.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](decisions/0097-separate-prediction-inference-and-bounded-gates.md).

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.

## Continuous primitive appraisal (ADR 0104)

Every cycle scores all configured primitives alongside candidate Parts in one shared-state Jev request, with independent 0–4 Scores. Primitives always appraise but only those meeting their editable threshold generate memoryless, prediction-free thoughts and bids. Identity temperament Traits modulate primitive appraisal only; Part activation does not judge correctness, Identity alignment or maturity. Both contributor types use existing world-blind Self selection/deliberation. Primitive instructions and thresholds live in Agent Components → Primitives. Provider failures remain errors. See [ADR 0104](decisions/0104-continuous-primitive-appraisal.md) for scorer-only context and learning boundaries.

ADR 0109: Activation descriptions include every owning-Part current memory as formation timestamp:gist, with no memory IDs or full content. Factory descriptions omit Part version/schema version, associations, lineage and provenance. Temporal relevance is considered when WorldState mentions time; formation time is distinct from event time. This remains scorer-only access.

## Score-based Self selection (ADR 0112)

Self arbitration now uses graded Scores and conservative marginal set selection, superseding single Choice arbitration. Only mediated current proposals are selectable; Identity guides and Self remains world-blind. See [ADR 0112](decisions/0112-score-based-self-selection.md).

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.

Constructed activation and recall preserve the full immutable WorldState while packing candidate batches. A provider-signaled context limit may cause an oversized batch to split recursively; candidate content is preserved, each successful candidate is scored exactly once, and single-candidate or unrelated failures remain infrastructure errors. No truncation, summarization or mock fallback occurs. Successful sub-batches remain inspectable; candidate-set sensitivity remains an experimental limitation. Jev currently documents a 32k state-plus-longest-question and 64k total-request token budget.
