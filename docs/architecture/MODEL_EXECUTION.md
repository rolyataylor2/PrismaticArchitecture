## Continuous cognition revision (ADR 0165)

ADR 0165 adds optional `thought_resources` workload assessment for initial generation, owning-Part answers and focused revisions. Assessment receives only that scope's permitted immutable input and explicit inquiry. Independent difficulty/uncertainty/urgency estimates select configured same-provider resources; serialized Self remains world-blind. Answers, requested recall, focused revisions and generative prediction reflection share bounded scope admission, with stale-version deferral rather than interruption or fabricated response. Host-only inference references support exact researcher attribution of thoughts and revised bids and never enter cognitive context.


[ADR 0165](decisions/0165-continuous-asynchronous-cognition.md) supersedes the online whole-batch completion barrier. Observation intake and bounded scoped reasoning overlap; validated scopes commit independently and Self decisions serialize per Agent. Each reasoning job retains its own immutable snapshot; jobs from different observations need not share a snapshot. Busy dispositions are excluded from activation by default; optional rescoring changes relevance telemetry without interrupting or duplicating thought. A one-pass activation allowance pauses the same runtime, rather than selecting a legacy synchronous mode. The [implementation audit](../development/CONTINUOUS_COGNITION_AUDIT.md) distinguishes verified behavior from remaining target work, including bid-pool applicability, commitment mediation and adaptive routing. Historical synchronous sequencing below is superseded where it conflicts with ADR 0165.

## Affect inference contracts (ADR 0157)

`affect_selection` is world-blind bounded scoring of explicit Part proposals and maintain/no-change/inquiry options. `affect_inquiry` authors a neutral ordinary deliberation question from that restricted input. `focused_bid_revision` gives an owning Part the identical cycle snapshot plus selected voluntary focus to retain, replace or withdraw its bid, with no memory/prediction/formation product. Jev handles affect scoring; OpenAI/xAI/Ollama handle the generative tasks, and Ollama provides an explicit generative bounded-decision fallback. Separate stateless requests enforce the access boundaries. Adapters, editable prompts, ordinary runtime orchestration and completed-cycle period persistence are implemented. Affect inquiry consumes the ordinary deliberation budget; focused revision does not add an inquiry round.

<!-- Current online flow: ADR 0133 -->

## Experienced and prospective state (ADR 0136)

[ADR 0136](decisions/0136-experienced-and-prospective-worldstate.md) extends ADR 0133 with attributed prospective predictions and natural-language selected posture in the immutable experienced WorldState. Predictions can activate dispositions but never become external facts. Self receives mediated expressed worlds and stance history only; prediction evaluation uses factual-only context. Selected stance carryover and bounded internal return-to-stance navigation supersede the prior removal of affect momentum. No working-state inference, affect eligibility filter or global planner is restored.


[ADR 0133](decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

## Current refinement (ADRs 0129–0131)

## Current cycle (ADR 0132)

[ADR 0132](decisions/0132-direct-worldstate-disposition-activation.md) supersedes the online perception stage: immutable WorldState + thread steering → direct independent Jev disposition activation → disposition-specific subjective memory accessibility → ordered construction/evidence/cognition. No perception inference runs. Prior-cycle prerequisites gate eligibility; each disposition's current scope is judged from WorldState. Compatibility binding IDs denote scopes, not inferred individual entities. Self remains world-blind; Identity guides and execution stays external.


Production cognition uses prior-cycle disposition prerequisites, chronological recall and one ordered construction/evidence/cognition generation per disposition binding or bootstrap request. Disposition Parts participate directly without Part activation scoring. Self remains world-blind. Earlier separate-prediction descriptions apply to historical fixtures. See [ADR 0129](decisions/0129-progressive-disposition-cognition.md).

# The Prism Agent Architecture Model Execution

## Current default revision (ADR 0126)

[ADR 0126](decisions/0126-constructed-perspectives-and-dispositions.md) supersedes older persistent-Part and private-only recall guidance for the default constructed architecture. Parts are temporary working perspectives reconstructed from subjective Agent autobiography; retired instances remain inspectable. Thread steering and gated entity-bound disposition graphs guide perception and recall. Self remains world-blind and Identity-guided; execution remains external. ADR 0128 removes the earlier online flow from application code. Historical regression fixtures and offline Part-development consolidation remain separate.

The Prism Agent Architecture deliberately separates workflow, judgment, and reasoning.

No single model is "the Agent."

The Agent emerges from persistent Parts, Identity, Self selection, and the runtime connecting them.

## Three computational roles

### Deterministic runtime

Ordinary program code owns:

- WorldState snapshots;
- lifecycle sequencing;
- candidate retrieval;
- context assembly;
- cache boundaries;
- inference dispatch;
- result validation;
- prediction scheduling;
- persistence;
- mutation application;
- action execution.

Code owns control flow.

### Decision inference

A bounded decision model handles narrow semantic judgments whose answer space is known in advance.

The initial implementation is Jev.

Primary uses are:

- Part activation;
- Self arbitration.

### Generative reasoning

Language models handle open-ended semantic reasoning.

Primary uses include:

- Part interpretation;
- emotional reaction;
- subjective reasoning;
- bid creation;
- forecasting;
- Part explanations;
- Self-mediated deliberation;
- Part adaptation.

## Model boundaries

A model call does not own workflow.

A model returns information to the runtime.

The runtime determines what stage happens next according to The Prism Agent Architecture architecture.

## Replaceability

Model roles should be expressed in capability terms rather than permanently bound to vendors.

Examples:

`decision_judgment`

`part_reasoning`

`self_deliberation`

Future routing may map these capabilities to different models.

## Canonical execution cycle

```text
                     EXTERNAL ENVIRONMENT
                              │
                              ▼
                    OBJECTIVE WORLDSTATE
                              │
                              ▼
                  FREEZE SNAPSHOT Wₙ
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           │
       VECTOR / MEMORY / NO FILTER             │
                │                           │
                ▼                           │
         candidate Parts                    │
                │                           │
                ▼                           │
       ONE SHARED-STATE JEV REQUEST ◄───────┘
                │
       per-Part activation Scores
                │
                ▼
          activated Parts
                │
       ┌────────┼────────┬────────┐
       ▼        ▼        ▼        ▼
     Part A   Part B   Part C   Part D

       EACH RECEIVES EXACT SAME Wₙ
       + OWN PRIVATE PART STATE
       + OWN SUBJECTIVE MEMORY

       GENERATIVE REASONING

       │        │        │        │
       ▼        ▼        ▼        ▼
     Bid A    Bid B    Bid C    Bid D
       │        │        │        │
       └────────┴────┬───┴────────┘
                     ▼
               SELF ARBITRATION
                     │
                     │ bounded decision model
                     ▼
        ┌────────────────────────┐
        │ Action A               │
        │ Action B               │
        │ Action C               │
        │ Action D               │
        │ DELIBERATE                 │
        └────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
       action                 DELIBERATE
          │                     │
          ▼                     ▼
       EXTERNAL HANDOFF   SELF LLM DELIBERATION
                                │
                         questions to Parts
                                │
                         Parts answer/revise
                                │
                                ▼
                         BOUNDED ARBITRATION
                              AGAIN
```

Self never receives Wₙ. Per-Part activation Scores and arbitration distributions are operational judgment telemetry, not psychological state. Activation Scores are independent and unnormalized; a runtime policy separately determines which Parts are activated.

After Self selects, the selected action is handed to the appropriate external interface or capability (for example, a tool, application API, robot controller, chat output, environment adapter, game control, or operating-system interface). External execution may be synchronous, asynchronous, or proceed in parallel with later cognition where the host permits. Factual status may return in a later WorldState. The Prism Agent Architecture does not require an internal Faculties system or generic automated-task infrastructure.

## Forecast and failure boundaries

A Part may form a prediction about an unfolding event, its meaning, a social response, an uncertainty, or action consequences. A prediction may precede or be independent of a bid; selected/non-selected pairs are not mandatory. A Part normally has one unresolved prediction. A committed prediction preserves Part-selected context and some expected evaluation horizon for later evidence and possible episodic encoding. Exact representation remains open.

Jev unavailability, model timeouts, invalid structured responses, provider rate limits, and cache failures are runtime failures. They must not automatically be interpreted as Part refusal, Self uncertainty, or Identity rejection. Retry and fallback policy remains open.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](decisions/0097-separate-prediction-inference-and-bounded-gates.md).

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.

## Continuous primitive appraisal (ADR 0104)

Every cycle scores all configured primitives alongside candidate Parts in one shared-state Jev request, with independent 0–4 Scores. Primitives always appraise but only those meeting their editable threshold generate memoryless, prediction-free thoughts and bids. Identity temperament Traits modulate primitive appraisal only; Part activation does not judge correctness, Identity alignment or maturity. Both contributor types use existing world-blind Self selection/deliberation. Primitive instructions and thresholds live in Agent Components → Primitives. Provider failures remain errors. See [ADR 0104](decisions/0104-continuous-primitive-appraisal.md) for scorer-only context and learning boundaries.

## Quality-guided deliberation (ADR 0105)

Self scores existing bids and `DELIBERATE`, selecting a compatible external set or one internal inquiry (ADR 0112). One ordered, world-blind inquiry generation selects a primary and optional supporting C quality before identifying missing information, targets and one question. Qualities are not choices or motivations. Selected Part inquiry bids use their original targets and question. Participants answer and retain, replace or withdraw their own current bid in one generation; other bids remain unchanged. Attributed responses return to the same bounded arbitration. See [ADR 0105](decisions/0105-quality-guided-self-deliberation.md).

## Optional post-deliberation activation (ADR 0108)

The per-Agent `reevaluateAfterDeliberation` switch defaults to false. When enabled, completed inquiry responses enter a new immutable, attributed subjective snapshot before activation is re-evaluated. Remaining active contributors retain bids; newly active contributors generate cognition; inactive contributors leave Self’s choice set. Self remains world-blind and ordinary deliberation limits apply. See [ADR 0108](decisions/0108-post-deliberation-activation.md).

## Score-based Self selection (ADR 0112)

Self arbitration now uses graded Scores and conservative marginal set selection, superseding single Choice arbitration. Only mediated current proposals are selectable; Identity guides and Self remains world-blind. See [ADR 0112](decisions/0112-score-based-self-selection.md).

## External speech realization (ADR 0113)

The chat Executor realizes selected consecutive Say commands through the Agent-selected generative provider using only selected intentions and speech-tagged Identity Traits. This is expression, not arbitration. Original proposals remain preserved, while speech text and source IDs record what was actually emitted. Self remains world-blind. See [ADR 0113](decisions/0113-identity-guided-speech-realization.md).

The per-Agent `primitivesFirst` cognition setting defaults to false. When enabled, surfaced primitive cognition completes before activated Part cognition in each cognition phase, including after deliberation re-evaluation. This changes execution order only: all contributors retain the same immutable snapshot, current-phase thoughts enter later snapshots, and Self remains world-blind. Inference task responsibilities, prompts and routing are unchanged.

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.

## Disposition participation (ADR 0130)

Disposition-bound working Parts participate directly without graded Part activation scoring or a threshold gate, including after deliberation. Their fixed activation record is an unscored participation marker, not a measured level. Generatively constructed unbound Parts and primitives retain independent scoring. The separate generative construction path remains available.

## Ordered construction, evidence and cognition (ADR 0131)

Cog 3, 4 and 6 are generated in one scoped LLM request, with construction → independent memory evidence → cognition as ordered output fields. Disposition bindings remain independent. Runtime validates and commits the products; no separate evidence scoring or initial cognition call follows for returned perspectives. Unbound activation and primitive appraisal remain separate.

## Hosted provider substitution

The replaceable generative provider may use xAI Responses (`grok-4.3`, reasoning effort `none`) as an alternative to OpenAI. This is inference transport configuration, not Part identity or an architectural change. It uses the existing task prompts, request-specific output contracts and runtime validation. No shared provider conversation or stored response grants cognitive access. Jev remains the independent bounded decision provider. Agent settings select the model and require provider-specific credentials; keys are never carried implicitly between providers. Compare biased/fantastical interpretation through the ordinary Simulation Tests pipeline and retain semantic uncertainty separately from provider failures.

Part cognition factories place shared instructions and the identical immutable cycle snapshot before a marked private scope suffix. Responses requests may separate these as two user messages, without adding cognitive access or provider conversations. xAI Part-cognition requests use a stable Agent/task cache-routing key; Self uses a separate stateless request without that shared-world input. Explicit prompt overrides remain authoritative. Request-specific schemas retain availability enforcement even when schema variation reduces cache reuse. Per-Agent constructed request usage is researcher audit only, never Agent memory. Cache hits are opportunistic, and concurrent cold calls may miss; measure cached input tokens rather than promise savings.

## Automated simulation assessment (ADR 0141)

Simulation Tests preserves operational measures and adds separate versioned model assessments of semantic criteria. Configured runs with real reasoning providers assess automatically unless disabled; fixture execution makes no evaluator requests. Select an evaluator model independently, or use the source Agent model. Assess saved run also supports completed historical reports. Evaluators use the appropriate existing Agent/server key and never reuse credentials across vendors.

Each assessment preserves its rubric, prompt, model, exact frozen input and hash, cited verdicts, alternatives, limitations and errors. Runtime rejects missing/duplicate criteria, invalid evidence pointers and decisive verdicts without citations. Evaluator failure does not fail a completed scenario or overwrite its measures. Fixture/mixed provenance remains explicit; model judgments are researcher assessments, never Agent cognition or proof of psychology. The `simulation_evaluation` task is editable and previewable under Settings → Prompts. See [ADR 0141](decisions/0141-simulation-model-assessment.md).
