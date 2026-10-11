## Two-pass Self target (ADR 0157)

[ADR 0157](decisions/0157-two-pass-self-and-affect-exploration.md) extends the flow with Parts' affect proposals → separate world-blind Affect Selection → bounded focused Part bid revision → Bid Selection. Experienced affect, voluntary focus and selected-action posture remain distinct. Ordinary runtime now executes this sequence and persists same-thread focus through completed-cycle records. Read-only lifetime affect inspection is implemented; sourced experiments remain unfinished. See the Self affect thread audit.

## Executive connection (ADR 0155)

The Executive is disabled by default, including existing profiles without an explicit enabled setting. When off, cognition records selections without execution, operational context, feedback or checkpoint review. Enable it explicitly in Executive → Runtime. See [ADR 0155](decisions/0155-executive-disconnected-by-default.md).

## Conditional procedural knowledge (ADR 0147)

Offline external procedural inference may propose conditional skills from bounded ended selected experience and independently verified operations without explicit teaching. Conditions/reasons and source methods remain versioned. Ordinary Part/Self must explicitly select a branch under current preferences and constraints; the host checks approved current parent/member versions and current permission. No first-branch default, global planner, psychological mutation, causal proof or transfer guarantee is introduced. See [ADR 0147](decisions/0147-conditional-procedure-consolidation.md).

## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

## Prediction-led development (ADR 0138)

[ADR 0138](decisions/0138-prediction-led-relevance-scaffolds.md) replaces direct online durable formation with bounded cognition coverage, gap-origin hypotheses and versioned temporary relevance scaffolds. Ordinary Parts investigate through later-cycle activation/recall; factual outcome reflection and recorded usefulness feed conservative offline institutionalization. Self remains world-blind, snapshots immutable and execution external. The ADR defines the implementation target; see the prediction-scaffold audit for current completion evidence.

<!-- Current online flow: ADR 0133 -->

## Experiential disposition development (ADR 0137)

[ADR 0137](decisions/0137-experiential-disposition-development.md) defines the requested two-speed development extension: evidence attachment and narrow provisional formation after committed subjective experience, then conservative structural reconciliation during offline consolidation. Dispositions encode contextual memory relevance. Prediction failure and inappropriate retrieval are different evidence; old experiences and structural versions remain preserved. See the ADR's completion checklist for the implementation target.

## Experienced and prospective state (ADR 0136)

[ADR 0136](decisions/0136-experienced-and-prospective-worldstate.md) extends ADR 0133 with attributed prospective predictions and natural-language selected posture in the immutable experienced WorldState. Predictions can activate dispositions but never become external facts. Self receives mediated expressed worlds and stance history only; prediction evaluation uses factual-only context. Selected stance carryover and bounded internal return-to-stance navigation supersede the prior removal of affect momentum. No working-state inference, affect eligibility filter or global planner is restored.


[ADR 0134](decisions/0134-general-disposition-attention-and-development.md) defines dispositions as general attention sensitivities for entities, situations, activities, methods, strategies and configurations. Conditional relevance guides local navigation; conservative offline learning can refine these structures from subjective episodes, resolved predictions and selected activation/cognition trajectories without introducing a planner or raw-world replay.

[ADR 0133](decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

## Current refinement (ADRs 0129–0131)

## Current cycle (ADR 0132)

[ADR 0132](decisions/0132-direct-worldstate-disposition-activation.md) supersedes the online perception stage: immutable WorldState + thread steering → direct independent Jev disposition activation → disposition-specific subjective memory accessibility → ordered construction/evidence/cognition. No perception inference runs. Prior-cycle prerequisites gate eligibility; each disposition's current scope is judged from WorldState. Compatibility binding IDs denote scopes, not inferred individual entities. Self remains world-blind; Identity guides and execution stays external.


Production cognition uses prior-cycle disposition prerequisites, chronological recall and one ordered construction/evidence/cognition generation per disposition binding or bootstrap request. Disposition Parts participate directly without Part activation scoring. Self remains world-blind. Earlier separate-prediction descriptions apply to historical fixtures. See [ADR 0129](decisions/0129-progressive-disposition-cognition.md).

# System Overview

[ADR 0144](decisions/0144-correction-led-executive-learning-and-attention.md) records the researcher's updated Executive methodology: continuous selected activity, event-driven attention distinct from competence, selected interventions, conditional procedural consolidation with conservative maturity and late-bound preferences. Skill inspection must show actual version/variant development, source bids, expressed thoughts/reasons, activation context and outcomes. Existing exact-procedure teaching/use does not complete this extension; the Executive audit tracks the remaining implementation and experiments.

## Bounded external Executive

[ADR 0145](decisions/0145-executive-checkpoint-monitor-records.md) implements read-only opt-in checkpoint scoring: immutable monitor records, ordinary independent relevance, separate attributed operational competence/coverage and advisory cooldown/hysteresis. Background tools continue independently. These records preserve evidence without pretending that Parts or Self considered it; monitor-only cycles do not age cognitive thought or replace posture. [ADR 0146](decisions/0146-checkpoint-cognition-and-selected-pause.md) adds opt-in ordinary Part review against that identical snapshot, immediate world-blind Self continuation and separately authorized one-time local pause. Activation alone never interrupts. Modify/replace/resume after effects and conditional procedural consolidation remain required.

[ADR 0140](decisions/0140-bounded-teachable-executive.md) defines selected-intent contracts, shared MCP infrastructure outside replaceable runtimes, compact operational feedback and validated cognitive teaching of procedures. It preserves Self authority and ordinary subjective learning. The current runtime compiles immutable chat and exact-strategy operational contracts, with durable MCP configuration, captured profiles, native background work/cancellation and separately selected verification. [ADR 0142](decisions/0142-selected-guidance-continuations.md) adds selected supplemental contracts for no-submission guidance pauses, preserving lineage and cumulative request budgets. Bounded current public request contexts enter the shared immutable snapshot without exposing private Part state or reaching Self directly. [ADR 0143](decisions/0143-selected-procedure-teaching-and-use.md) adds explicit selected teaching after outcome persistence and fresh-contract exact-method invocation. Bounded public procedure manifests expose descriptions and evidence limitations without raw arguments or private state. Exact procedures have evidence-checked versioned administration through six Executive tabs. Flexible planning/recovery, ordinary cognitive approval, generalized/shared methods, full adapters and remaining configuration remain tracked in the [Executive audit](../development/EXECUTIVE_THREAD_AUDIT.md).

## Current default revision (ADR 0126)

[ADR 0126](decisions/0126-constructed-perspectives-and-dispositions.md) supersedes older persistent-Part and private-only recall guidance for the default constructed architecture. Parts are temporary working perspectives reconstructed from subjective Agent autobiography; retired instances remain inspectable. Thread steering and gated entity-bound disposition graphs guide perception and recall. Self remains world-blind and Identity-guided; execution remains external. ADR 0128 removes the earlier online flow from application code. Historical regression fixtures and offline Part-development consolidation remain separate.

The Prism Agent Architecture is a platform for constructing persistent cognitive agents composed of interacting Parts and exposing those agents to conversations, simulations, and other experiences.

The project contains several conceptually independent systems.

## Agent

An Agent is the persistent complete cognitive entity. An Agent may contain or coordinate identity, Parts, memory, cognition, executive processes, and developmental history. An Agent is not synonymous with an LLM.

## Parts

Parts are persistent bounded cognitive perspectives. They may notice patterns, maintain motivations, make predictions, interpret experiences, and advocate through bids. Parts develop through experience. Parts do not independently control the outside world.

## Canonical runtime

Cognition coordinates the internal processes through which observations become interpretations, proposals, deliberation, learning, and eventually behavior. The exact cognitive algorithm is intentionally open.

Normal cognition begins with objective WorldState. Activated Parts interpret it, react, forecast, and may propose behavior; a recognition/context Part need not bid. Relevant Bids carry advocacy to Self. Self does not receive WorldState directly: it selects using persistent Identity. The selected action is handed to an external interface for execution. Simulation is outside the Agent boundary. Prior attributed thoughts can make additional Parts relevant in the next cycle; same-cycle cue propagation is removed (ADR 0098); see [Activation Propagation](ACTIVATION_PROPAGATION.md).

The efficient conceptual path is:

```text
External Environment
        ↓
WorldState Snapshot
        ↓
┌──────────────────────────────┐
│ Activator                    │
│                              │
│ vector / memory candidates      │
│          ↓                   │
│ shared-state Jev scoring     │
│ independent Score per Part   │
└──────────────┬───────────────┘
               ↓
        Activated Parts
               │
               │ shared cached
               │ WorldState
               ↓
        independent Part
           evaluation
               ↓
              bids
               ↓
              Self
         [world-blind]
```

## Bidding, Memory, and Identity

Bidding represents structured advocacy and competition between relevant Parts. Bidding is not identical to activation. A Part may be highly relevant without requesting an external action.

Memory represents information from experience that remains cognitively available to the agent. Memory is not equivalent to storage and is not merely a transcript.

Identity represents the persistent self-model of the complete agent. Its content is an ordered collection of question-and-answer Traits with context-search keywords, stable IDs and creation timestamps (ADR 0099). Identity may interact with Parts while remaining conceptually distinct from them.

## Simulation

Simulation represents external worlds and experiences. Simulation owns authoritative external world truth. Simulations expose observations and accept attempted actions. Simulations do not own psychological interpretation.

## Providers, routing, history, storage, and inspection

Providers handle communication with inference systems. Providers are infrastructure.

Routing selects computational resources and may consider capabilities, cost, latency, privacy, context requirements, or cognitive importance. Routing does not determine what the agent wants.

History represents changes in persistent cognitive or simulation state over time. It should eventually support snapshots, ancestry, branches, comparison, and restoration.

Storage determines how information is persisted. Storage mechanisms must remain separable from the meaning of the information they store.

Inspection makes internal and external processes observable. Inspection does not own those processes.

Configuration assembles systems. Presets describe reusable starting conditions. A living persistent agent may evolve substantially beyond its original presets.

## Overall relationship

```text
environment → WorldState → Activator → Parts → Bids → Self + Identity
→ choice → external handoff → environment → future WorldState
```

Inference may be requested at several points: cognitive subsystem → router → provider → model/service. Model selection remains separate from the identity of the cognitive entity requesting inference.

See [`INFERENCE_CONTEXT_AND_CACHING.md`](INFERENCE_CONTEXT_AND_CACHING.md) for the context-reuse methodology.

Model execution is divided into deterministic orchestration, bounded decision inference, and generative reasoning. The runtime requests capabilities rather than exposing provider-specific model objects to cognitive domain code. After Self selects, the action is handed to an external interface; external execution may continue alongside later cognition and report factual status in a future WorldState. See [`MODEL_EXECUTION.md`](MODEL_EXECUTION.md), [`DECISION_MODELS.md`](DECISION_MODELS.md), and [`JEV_INTEGRATION.md`](JEV_INTEGRATION.md).

## Development through experience

```text
experience → activation level and possible activation spike → Part interpretation
→ optional prediction/context capture → thought and/or bid → Self selection
→ external outcome → prediction evaluation and possible waking episodic memory
→ adaptation → later sleep consolidation and possible lifecycle change
```

Possible lifecycle changes include strengthening, weakening, trigger or strategy changes, specialization, splitting, merging, dormancy, reactivation, succession, archival, and new Part formation. These changes should eventually be inspectable and versionable.

Online cognition handles the immediate interpretation/action cycle and relatively local learning. Offline consolidation is a distinct slower developmental process that starts from psychologically selected cognitive traces and may reason across experiences about relational structure, generalization, specialization, reconsolidation, associations, and lifecycle changes. It supplements rather than replaces the waking loop; see [Offline Consolidation](OFFLINE_CONSOLIDATION.md) and [Consolidation and Sleep](../theory/CONSOLIDATION_AND_SLEEP.md).

## Simulation relationship

**Simulations create experiences. Agents create psychological meaning.**

```text
authoritative world → perception → Agent → action → validation → authoritative world
```

The simulation must never directly create psychological conclusions inside the agent.

## Experimentation

The Prism Agent Architecture should permit researchers to vary components independently: same Parts with different identity, same agent with different model or routing, different life experiences, or different Parts-management policy. Replaceability is a core architectural characteristic.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](decisions/0097-separate-prediction-inference-and-bounded-gates.md).

Identity Trait roles (ADR 0101): only `self_definition` Traits are supplied to Self. `autobiographical` Traits are researcher-authored background stored alongside self-definition, not authoritative autobiography or shared Part memory. Runtime filters them before arbitration and deliberation; no Part access is added.

## Continuous primitive appraisal (ADR 0104)

Every cycle scores all configured primitives alongside candidate Parts in one shared-state Jev request, with independent 0–4 Scores. Primitives always appraise but only those meeting their editable threshold generate memoryless, prediction-free thoughts and bids. Identity temperament Traits modulate primitive appraisal only; Part activation does not judge correctness, Identity alignment or maturity. Both contributor types use existing world-blind Self selection/deliberation. Primitive instructions and thresholds live in Agent Components → Primitives. Provider failures remain errors. See [ADR 0104](decisions/0104-continuous-primitive-appraisal.md) for scorer-only context and learning boundaries.

## Quality-guided deliberation (ADR 0105)

Self scores existing bids and `DELIBERATE`, selecting a compatible external set or one internal inquiry (ADR 0112). One ordered, world-blind inquiry generation selects a primary and optional supporting C quality before identifying missing information, targets and one question. Qualities are not choices or motivations. Selected Part inquiry bids use their original targets and question. Participants answer and retain, replace or withdraw their own current bid in one generation; other bids remain unchanged. Attributed responses return to the same bounded arbitration. See [ADR 0105](decisions/0105-quality-guided-self-deliberation.md).

ADR 0110: Self choice receives complete mediated contribution and inquiry history for the cycle, with only current bids selectable. NOTHING is available only after two completed deliberation rounds. Self remains world-blind; historical contributions confer no renewed action authority.

## Score-based Self selection (ADR 0112)

Self arbitration now uses graded Scores and conservative marginal set selection, superseding single Choice arbitration. Only mediated current proposals are selectable; Identity guides and Self remains world-blind. See [ADR 0112](decisions/0112-score-based-self-selection.md).

## External speech realization (ADR 0113)

The chat Executor realizes selected consecutive Say commands through the Agent-selected generative provider using only selected intentions and speech-tagged Identity Traits. This is expression, not arbitration. Original proposals remain preserved, while speech text and source IDs record what was actually emitted. Self remains world-blind. See [ADR 0113](decisions/0113-identity-guided-speech-realization.md).

ADR 0118 restricts prediction reflection to subtle append-only beliefs, mission-serving strategies, and How I think nuances. Part names and missions remain unchanged. Confidence shifts are tiny and linguistic; subjective beliefs may be false or formed from trusted testimony. Runtime preserves existing entries and rejects other prediction-driven Part edits.

ADR 0120 supersedes linguistic-only prediction confidence: Parts start at 100% beliefConfidence, gain 1 percentage point per correct resolved outcome and lose 5/12 point per incorrect one, clamped to 0–100%. Predictions support existing beliefs and inherit current Part confidence; subjective thoughts retain conviction. Additive learning and unchanged names/missions remain enforced.

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.

## Agent memory storage (ADR 0125)

Subjective memories are Agent-owned records. Immutable `partId` attributes formation; explicit `referencingPartIds` controls Part access, with legacy records referencing their originating Part. `ancestorIds` links each interpretation to its own possibly overlapping set of WorldState snapshots, without fixed event groups or automatic source replay. Reference edits are versioned; archival preserves records. Formation behavior and originating-Part consolidation authority remain unchanged. See [ADR 0125](decisions/0125-agent-memory-and-worldstate-links.md).

Researcher disposition deletion appends a tombstone version and removes the disposition from live listings, activation and consolidation inputs while preserving saved versions and references. Researcher rollback appends a new current version from a selected historical disposition; it never erases intervening history. These administrative operations grant no cognitive authority.

## Automated simulation assessment (ADR 0141)

Simulation Tests preserves operational measures and adds separate versioned model assessments of semantic criteria. Configured runs with real reasoning providers assess automatically unless disabled; fixture execution makes no evaluator requests. Select an evaluator model independently, or use the source Agent model. Assess saved run also supports completed historical reports. Evaluators use the appropriate existing Agent/server key and never reuse credentials across vendors.

Each assessment preserves its rubric, prompt, model, exact frozen input and hash, cited verdicts, alternatives, limitations and errors. Runtime rejects missing/duplicate criteria, invalid evidence pointers and decisive verdicts without citations. Evaluator failure does not fail a completed scenario or overwrite its measures. Fixture/mixed provenance remains explicit; model judgments are researcher assessments, never Agent cognition or proof of psychology. The `simulation_evaluation` task is editable and previewable under Settings → Prompts. See [ADR 0141](decisions/0141-simulation-model-assessment.md).
## Automatic procedural candidate scheduling

ADR 0152 permits opt-in external candidate inference after independently verified ended execution, optionally requiring repeated identical whole-procedure success. The Application coordinates this learning behind cognition; it introduces no task planner, psychological mutation or goal authority. Manual is the default. Candidates remain unapproved and reports preserve their triggering execution/policy.

## Offline concern inheritance (ADR 0154)

Offline institutionalization may inherit an expressed concern and its meaning from attributed prediction-origin and investigation thoughts, with validated citations and repeated recorded usefulness. Temporary scaffolds remain relevance-only. Learned concern/meaning inform ordinary Part formation; audit trajectories remain outside online cognition and Self. Inspection preserves the inheritance rationale and source references.
