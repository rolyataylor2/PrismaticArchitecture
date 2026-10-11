# Instructions for Coding Agents

## Analytics interface design

Whenever working on the analytics interface, read and follow [DASHBOARD_DESIGN.md](DASHBOARD_DESIGN.md), including dashboards, simulation analytics, comparisons, and evidence inspection views. Consult these standards before designing or implementing changes and use their definition of done when verifying the rendered interface.

## Automatic commits and pushes

After completing requested repository changes and passing the relevant checks, automatically commit the task's changes with a descriptive message and push the current branch to its configured remote. Do not ask for separate confirmation unless the user explicitly requests otherwise. Include only changes belonging to the task; keep secrets and ignored generated state excluded. Preserve existing history and never force-push. If committing or pushing fails, report the failure and the remaining local state.

## Current requested architecture

ADR 0138 extends ADRs 0133/0136 and supersedes direct online durable formation in ADR 0137. Bounded coverage can propose and adjust gap-origin predictions without an owning Part. Part and gap predictions propose versioned temporary relevance scaffolds, investigated through ordinary later-cycle activation/recall/Part generation. Independent activation remains distinct from admission under computation budgets. Online experience attaches evidence only; offline institutionalization waits for ended investigations and repeated recorded usefulness, preserving source lineage and memories. Self remains world-blind. Read ADR 0138 before modifying disposition formation, prediction ownership, investigation or consolidation.

ADR 0136 extends ADR 0133 with experienced WorldState: attributed subjective prospective alternatives, expressed remembered interpretations and Self-selected natural-language posture. Parts may experience the imagined future as inevitable; runtime does not impose an objective worldview or numeric affect weighting. Self remains blind to raw WorldState and synthesized future and receives only active Parts' expressed products plus mediated chosen stance history. Exclusive internal stance navigation retains current experience and history. Bounded deliberation may recruit nonparticipating eligible scopes through normal independent activation/recall/generation against the same immutable snapshot; previous-cycle prerequisites and next-cycle prediction attention remain enforced. Read ADR 0136 alongside the records below.

ADR 0133 is the current online revision, superseding affected ADR 0126–0132 stages. Code assembles scope continuity and chronological memories; one parallel independent generation per Part returns formation, reflection, gist and cognition in order. No steering or online primitive participation remains; thought carryover and decay remain. A fallback Part named self receives Identity when no disposition activates and is distinct from world-blind Self. Prediction checks stay separate; offline consolidation remains unchanged. Read ADR 0133 and ADR 0126 before modifying this pipeline. Older persistent-Part/private-memory rules below apply to retained offline consolidation and historical fixtures. Identity guides, Self chooses and execution stays external.

## Task persistence

Model long-running concerns through Part stickiness. Do not introduce a global Agent task manager.

### Stickiness

Stickiness means a Part remains difficult to forget while its concern is unresolved. It does not mean automatic activation, authority, emotional strength, or guaranteed selection. Sticky unresolved Parts may be retained for candidate consideration and still receive ordinary Jev activation scoring.

### Execution order

Parts may propose multi-step behavioral strategies. Execution order belongs to the proposing Part. Do not turn this into a global planner.

### External execution

Once Self chooses an action, execution is handed to the appropriate external system. Do not create an internal Faculties architecture. External operations may continue in parallel with cognition and later report factual status through WorldState.

### Intention Manager

An Intention Manager is only a possible conceptual Part. Do not give it dedicated runtime architecture or privileged decision authority.

### Automation

Generic automated tasks are outside this architecture. Prediction evaluation scheduling remains part of Part learning and is not equivalent to task automation.

## Canonical Agent flow

Before implementing cognitive runtime behavior, read `docs/architecture/CANONICAL_AGENT_FLOW.md`. The essential flow is WorldState → Activator → Parts → Bids → Self → Identity-guided choice → Execution → outcome → later Part prediction evaluation. WorldState has no goals; Parts own motivations, emotional interpretation, and forecasting; Self has no independent motivation or direct WorldState access; Self chooses; Identity guides; Executive enacts; simulation is outside the Agent engine.

This repository is an experimental cognitive architecture.

## Testable hypotheses and Simulation Tests

When a developer conversation or referenced thread introduces a testable hypothesis about cognition, disposition development, memory, prediction, behavior or learning, add or extend a runnable experiment in the sidebar's **Simulation Tests** section as part of that work. Record the hypothesis, source, initial conditions, ordinary experiences, comparison/control conditions, observable criteria and limitations. Use the shared simulation-test registry and preserve run evidence for inspection.

Experiments must exercise the normal Agent pipeline. Do not force the expected activation, prediction classification or learned conclusion in a provider fixture and present it as hypothesis validation. Separate deterministic plumbing tests from configured-model observations; identify mock/mixed providers and inconclusive results explicitly. Distinguish a hypothesis not observed from infrastructure failure. Simulations supply external experiences; only Agent cognition may create psychological meaning. Prefer isolated fresh test Agents, keep researcher-authored starting conditions explicit, and preserve source Agents. Hypotheses about human psychology require separate scientific evidence; one simulated result is not proof.

## Architecture documentation

Before implementing or substantially modifying a subsystem, read:

1. `docs/architecture/SYSTEM_OVERVIEW.md`
2. `docs/architecture/INVARIANTS.md`
3. the README inside the subsystem being modified;
4. relevant Architecture Decision Records under `docs/architecture/decisions/`.

Consult the lifecycle and integration documents when work crosses subsystem boundaries.

Check `docs/architecture/OPEN_QUESTIONS.md` before assuming an unspecified mechanism has already been decided.

### Architecture versus implementation

Architecture documentation describes:

- meaning;
- responsibilities;
- boundaries;
- authority;
- state ownership;
- lifecycle;
- required relationships.

It intentionally does not prescribe most implementation mechanisms.

Do not interpret the absence of a specific class, protocol, framework, database, prompt, or algorithm as permission to violate an architectural invariant.

Likewise, do not prematurely turn conceptual diagrams into rigid class hierarchies.

Implement the simplest design that satisfies the documented responsibilities and boundaries.

### Architectural changes

Before implementing an architectural change, update the relevant architecture documentation and verify that the proposed change is compatible with the documented invariants, decisions, and subsystem boundaries. Resolve documentation conflicts first; implementation must follow the agreed documented architecture.

If implementation work appears to require violating an architectural invariant or an existing decision record, treat this as an architectural question rather than silently changing the meaning of the system.

Document significant new architectural decisions using an Architecture Decision Record.

Do not rewrite old decision history to make a later design appear inevitable.

Read the root `README.md` before making architectural changes. Also read the `README.md` inside any directory you modify.

## Primary rule

Do not silently invent architecture. If a requested feature does not naturally fit the existing structure, prefer a small explicit implementation or document the architectural conflict rather than introducing a large abstraction.

## Preserve separation of concerns

A Part is not an LLM request. A provider is not a Part. A router is not a cognitive system. A simulation is not cognition. Storage is not history. Inspection is not decision-making. User interfaces should observe and manipulate the system through defined interfaces rather than becoming the owner of cognitive state.

## Scope discipline

When assigned a small task, keep it small. Do not implement unrelated future features merely because the directory structure suggests them. Prefer understandable Python, explicit data structures, small modules, and replaceable components. The architecture is expected to evolve substantially.

## Third-party source

External source is stored under `third_party/`. Treat third-party repositories as read-only unless explicitly instructed otherwise. Do not copy architectural patterns blindly from reference projects.

### any-llm

any-llm is infrastructure. Only the Prism Agent Architecture provider layer should eventually depend directly on it. Parts, cognition, bidding, identity, memory, simulations, history, and interfaces must not directly import any-llm.

### TextArena

TextArena is reference material for simulation design. The Prism Agent Architecture simulations should not become dependent on TextArena merely because its source is available.

### Dulwich

Dulwich is reference material for Git-like history concepts. Do not expose Git or Dulwich objects as The Prism Agent Architecture's public cognitive-history API. The Prism Agent Architecture domain model must remain independent from the persistence mechanism.

## Presets versus persistent state

Do not confuse files under `presets/` with living agent state. Presets define starting conditions. Persistent state records what an agent has become.

## Workspace

`workspace/` contains generated local development state. Framework code must not assume that the repository workspace is the only possible storage location.

## External model access

Provider API keys are secrets. Never place credentials in source files, presets, tests, examples, documentation, or committed configuration. Use environment variables or future secret-management abstractions.

## Simulation/psychology boundary

The governing rule is: **Simulations create experiences. Agents create psychological meaning.** Code under `prism.simulation` must not directly manipulate Parts, Part activation, motivations, identity, cognitive bids, psychological interpretations, or agent memory. Simulation integration should use narrow public agent/environment interfaces.

## World truth versus subjective reality

The simulation owns authoritative external world truth. Agents own beliefs, memories, interpretations, expectations, and psychological meaning. An agent may believe something false, and the world may contain facts an agent does not know.

## Generative AI is not authoritative

LLM output may propose actions, dialogue, narration, transitions, or authored content, but must not directly become world truth. State-changing proposals must be validated before authoritative state is committed.

## Events versus storylets

An Event records something that occurred. A Storylet describes a potential situation whose conditions may become satisfied. Do not treat storylets as fixed chapters.

## NPC cognition

An NPC may be scripted behavior or a complete Prismatic Agent. If it is a Prismatic Agent, its Parts belong to that agent, not the simulation.

## Simulation realism

Do not create one monolithic `LifeSimulator` class. Realism should be composable from independent world systems. Do not prematurely implement systems merely because they are documented.

## Parts architecture

Parts are persistent bounded perspectives, not disposable prompts or independent autonomous agents. They may request or advocate through cognitive/bidding systems, but the complete agent's Executive retains external authority.

The Part Manager manages the Part population and lifecycle; it must not absorb bidding, executive arbitration, routing, memory, history, simulation, identity, or inspection. Part identity is independent of provider/model names, and important changes should be structured and inspectable.

Do not create a new Part for every salient event; formation must consider adaptation, specialization, splitting, or whether a genuinely new perspective is warranted. Never destroy developmental provenance when Parts split, merge, become dormant, or are archived.

Simulation systems must never directly manipulate Parts. Experiences flow through the agent before psychological changes occur.

## Cognitive theory

Software implementations must preserve the theoretical meaning documented under:

`docs/theory/`

Before implementing Parts, Part formation, Part adaptation, Part cognition, Identity, deliberation, or perception routing, read the relevant theory documents.

### Do not flatten Parts into personas

Parts are not merely character descriptions or system prompts. Their persistent mission, bias, predictions, developmental history, and cognitive characteristics are part of the domain model.

### Do not normalize internal plurality

Do not automatically rewrite Parts so every perspective becomes moderate, objective, agreeable, or equivalent. Different biased perspectives are intentional.

### Do not confuse intelligence with identity

A Part's cognitive sophistication may change without destroying its continuity as the same Part.

### Identity authority

Self has final selection authority while reading Identity as persistent self-definition. Executive mechanisms enact Self's selected external action. Do not introduce a second sovereign decision-maker.

### Preserve experimental dimensions

When a theoretical characteristic is described as configurable, avoid hard-coding one interpretation throughout the repository. Prefer boundaries that allow competing implementations to be tested.

## Part memory and emotional theory

Do not assume Parts require symbolic emotion labels. Emotional meaning is generally expected to emerge from the interaction of mission, belief, memory, prediction, and context.

Do not architecturally exclude negatively valenced or socially uncomfortable human affective perspectives.

### Subjective memory

Do not create a globally authoritative autobiographical memory object and allow every Part to treat it as truth. Parts own subjective memories relevant to their perspectives. Different Parts may disagree about past events. A current Self episode may reconstruct events through Parts and other explicitly mediated cognitive interfaces.

### Part privacy

Do not permit one Part to transparently read another Part's private memory state unless an explicit future architectural decision changes this.

### Incremental development

Avoid destructive whole-Part rewrites. Persistent cognitive change should generally be representable as incremental development preserving continuity and history.

### Temporary Parts

Do not assume every Part is permanent. Short-lived mission-oriented Parts are an intended feature. Do not convert temporary-Part relationships into a recursive hierarchy of autonomous agents unless explicitly redesigned later.

### Self mediation

During Self integration, the temporary whole-agent perspective may help Parts learn by questioning them, sharing other perspectives, presenting evidence, trying alternate behavior, and observing results. Self does not automatically rewrite a Part merely because it disagrees with it.

## Identity theory

Identity is a persistent self-definition, not another mission-oriented Part or a generic outcome optimizer.

Parts and cognitive processes generate candidate approaches. Self chooses from that option space using Identity and may request more options or interrogate Parts, but must not silently receive unexplained perfect solutions.

Self may knowingly select self-incongruent behavior. Preserve the conflict as meaningful information rather than automatically rewriting Identity or behavior.

Identity may change through sustained experience, introspection, and mediated reflection. External environments must not directly modify Identity; environmental shaping occurs through outcomes and experience.

## Identity and Self are distinct

Do not use Identity and Self as simple synonyms. Identity is persistent self-definition. Self is temporary integrative whole-agent cognition.

### Self is bounded

Do not implement Self as an omniscient view over every database table. Self should only receive information available through defined cognitive access mechanisms.

### Awareness

Do not equate Part existence, retrieval, activation, influence, and Self awareness. These are conceptually distinct.

### Automatic cognition

Do not require a full Self deliberation for every action. Do not create an independent automatic-action agent; automatic behavior remains behavior of the same Agent.

### Audit separation

Developer and researcher audit state is not Agent memory. Do not expose privileged audit history to Self merely because the framework stores it.

### Cognitive security

Where practical, preserve the ability to run Self with mediated rather than raw external context. Do not assume internal Parts are trusted security authorities.

## WorldState context consistency and caching

Within one cognitive cycle, every activated Part must receive the exact same WorldState snapshot. Do not regenerate, summarize, reinterpret, or independently query WorldState for individual Parts.

### Activation pipeline

For the canonical activation pipeline, see **Part activation** below.

## Part activation

Part activation currently uses:

```text
WorldState
-> high-recall vector filtering
-> shared-state Jev activation scoring
-> activation policy
-> activated Parts
```

### Vector stage

Vector search primarily rejects obviously irrelevant Parts. Favor recall. Vector similarity is not activation.

### Jev stage

Jev receives the exact immutable WorldState and all surviving candidate trigger definitions in one shared request when practical. Each candidate receives its own graded activation Score. Parts do not compete for activation. Do not use one winner-take-all Choice or normalize activation levels across candidates.

### Score semantics

An activation Score means: “How activated is this Part by the current WorldState according to its trigger pattern?” It does not automatically mean emotional intensity, bid strength, control authority, prediction confidence, or importance.

### Ranking

A rank may be derived from independent activation Scores for operational purposes. Ranking does not define activation.

### Stability

Do not assume candidate-set composition is irrelevant. Activation stability under candidate-set perturbation should be tested experimentally.

### Context reuse

Treat the WorldState snapshot as shared reusable inference context. Where supported, structure provider requests to take advantage of prompt/KV caching. Part-specific context should be appended or otherwise isolated from the shared factual context.

### Self boundary

Self does not receive WorldState. Do not allow prompt caching, sessions, context reuse, batching, or provider-specific optimizations to leak WorldState into Self inference.

## Experience digestion

Do not treat objective experience history as the Agent's autobiographical memory. Parts own subjective memory.

### Ancestry

Part memories may retain opaque references to ancestor experiences. An ancestor reference is provenance, not automatic recall access.

### Normal cognition

Use current subjective Part memories directly. Do not reconstruct them from raw objective history.

### Sleep

Offline consolidation should primarily process psychologically digested traces. Do not reread the complete event archive as the default sleep mechanism.

### Rare replay

A developed Part may occasionally be re-exposed to an ancestor experience so it can reinterpret that experience from its current perspective. This must remain exceptional; selection criteria remain experimental.

### Re-evaluation

Objective history supplies evidence. The current Part supplies meaning.

### Versioning

Never overwrite old subjective memory versions. A later memory may explicitly preserve the relationship: “I used to think X; now I think Y,” when that continuity is psychologically meaningful.

### Self

Self may not inspect objective event history to determine which Part remembers correctly.

### Part privacy

Do not reuse one Part's private memories, beliefs, mission, or state as another Part's inference context.

### Immutable cycle

If the environment changes while Parts are evaluating Wₙ, create Wₙ₊₁ for the next cycle. Do not update Wₙ midway through cognition.

## Model execution

Read `docs/architecture/MODEL_EXECUTION.md` and `docs/architecture/JEV_INTEGRATION.md` before implementing inference orchestration.

### Computational roles

Do not treat every AI call as interchangeable. Score-style bounded inference is used for graded trigger activation; Choice-style bounded inference is used for Self arbitration. Generative reasoning is used for Part cognition, Part forecasting, Self debate, and Part adaptation.

Jev is the initial bounded decision provider. Keep Jev SDK objects behind a replaceable adapter; do not spread them through cognitive domain code.

Vector search narrows activation candidates. Independent graded Score-style judgments determine activation against shared state; never model activation as one Choice where only one Part can win or normalize values across candidates.

Every activated Part receives the exact same WorldState snapshot plus its own private state and reasons independently on the first pass.

Self receives Identity, masks, bids, forecasts, and Part arguments, but never WorldState. It may choose an existing proposal or `DEBATE`. Debate is a separate generative, world-blind loop in which Self asks Parts questions and Parts answer from their own perspectives before arbitration runs again.

Do not convert Jev probabilities directly into emotional intensity, Part strength, or bid authority. Models do not control the workflow; deterministic runtime code does. Provider failure remains distinct from cognition.

### Architecture changes and the Settings → Prompts menu

When architecture, an ADR, or an inference task's responsibilities or access boundaries change, review the corresponding factory prompts shown under Agent Settings → Prompts as part of the same work. Update affected prompt text and task descriptions so editable prompts continue to reflect the current architecture and preserve its boundaries. If an inference task is added, removed, or split, keep the task catalog, provider routing, and Settings → Prompts listing in sync. Do not change unrelated prompts, and do not treat editable prompt text as a substitute for runtime enforcement or architectural documentation.

## Dynamic Part state

Parts are language-first living perspectives. Do not reduce them to collections of numeric weights.

### Runtime versus meaning

Runtime code may persist, retrieve, index, schedule, validate, patch, and version. Runtime code should not invent psychological meaning.

### Relational reality

Part beliefs and memories may state their perspective as reality. Do not automatically rewrite:

"He abandoned me."

into:

"The Part believes it was abandoned."

The framework knows the first statement is subjective because of ownership and metadata.

### First-person boundary

A Part normally speaks as `I`. It may refer to the complete Agent as `we`. Do not flatten multiple Parts into one shared voice before Self receives their bids.

### Mutations

Persistent Part changes should be explicit and versioned. Avoid destructive whole-object rewrites for ordinary learning.

### Lifecycle

Split, merge, consolidation, archival, and reactivation are psychological lifecycle operations. Do not implement them solely as size/count thresholds.

### History

Rollback must not erase developmental history. Splits and merges must preserve ancestry.

### Prediction evidence

Parts should be able to retain what they recommended, what they predicted, what later occurred, and how they interpreted that result. Do not convert this automatically into one global reward score.

## Relational Parts

Parts may represent learned relationships with people, objects, contexts, concepts, internal states, or other Parts. Do not assume every Part is a behavioral action advocate.

### Specific versus generalized learning

Keep specific relational knowledge with the relevant relational Part. Keep transferable behavioral patterns in generalized Parts. Do not retain names on generalized retrieval surfaces merely because those people contributed to the Part's development.

### Provenance

Historical provenance is not a trigger. Do not automatically index every provenance reference for Part activation.

### Activation propagation

Parts may cause additional Parts to be considered through bounded Activation Cues. Do not propagate unrestricted raw Part prose as activation context.

### Recognition before reaction

Prefer specific low-reactivity recognition/contextualization before broad reactive activation where practical. Urgent direct triggers may interrupt.

### Consolidation

Offline consolidation should primarily reason over activated-Part traces and meaningful cognitive outcomes, using raw experience records only when necessary. Consolidation is conservative. If uncertain, preserve existing cognitive structure.

### Therapy

Do not build privileged therapy APIs that directly rewrite Parts. Therapeutic interaction must work through ordinary external experience, activation, prediction, Self mediation, outcomes, and incremental Part development.

### Higher-order psychology

Do not automatically add separate emotion, attachment, culture, theory-of-mind, or metacognition engines. First consider whether the phenomenon can emerge from learned Part relationships.

## Offline consolidation

Online cognition and offline consolidation are distinct developmental timescales. Online cognition interprets the present, activates Parts, proposes behavior, predicts, chooses, acts, observes outcomes, and may make local incremental updates. Offline consolidation supports cross-experience structural reasoning, including relational Part formation, generalization, specialization, split/merge, memory reconsolidation, association changes, dormancy, and archival. Do not make every ordinary cognitive cycle perform global psychological restructuring.

### Inputs

Prefer psychologically selected traces: activated Parts, predictions and outcomes, co-activation, repeated referents, meaningful changes, disagreements, and relevant experience references. Raw world/audit history remains secondary evidence and may be consulted when needed.

### Conservatism

If structural evidence is ambiguous, preserve existing psychology. Do not optimize for minimum Part count or maximum internal consistency.

## Reconsolidation

Subjective memories may change meaning when they become relevant alongside new evidence. Changes must be incremental and versioned; prior versions remain preserved. Objective history informs subjective memory but does not automatically overwrite it. A Part may resist revision.

## Specific versus generalized learning

Move relationship-specific knowledge toward relational Parts when appropriate while preserving transferable lessons in generalized Parts. Preserve provenance without automatically indexing it for activation. Generalized learning may outlive its originating relationship.

## Therapy benchmark

Therapy operates through ordinary external interaction and cognition; do not provide privileged mutation APIs. Benchmark baseline, therapeutic interaction, immediate retest, offline consolidation, same-context retest, novel analogous context, and longer-term durability. Measure durable development rather than conversational compliance.

## Activation spikes

A significant change in a Part's activation may be supplied to that Part as cognitive context. Do not equate spike magnitude with emotion, authority, or stickiness. A spike may invite a short-horizon prediction or encoding opportunity; it does not require either. No fixed threshold is established.

## Predictions

A Part carries at most one unresolved prediction. Predictions may describe what the Part thinks is happening, what will happen next, how an entity may respond, what an action may cause, or when an uncertainty should resolve. They may precede behavioral bids. Do not require paired selected/not-selected forecasts for every bid.

### Context capture

A committed prediction should preserve the details its owning Part believes matter while those details remain in bounded recent context. Do not copy the complete WorldState. Opaque source references may preserve provenance; ordinary evaluation uses the Part-selected capsule rather than reconstructing from objective history.

### Updating and evaluation

With an open prediction, prefer continuation, revision with history preserved, resolution, abandonment, expiry, or context invalidation over stacking another prediction. Evaluate against later factual evidence and preserve causal attribution; do not reduce evaluation to boolean success/failure. Prediction horizon is distinct from action duration and has no fixed timing policy.

### Memory

Prediction evaluation may form episodic Part memory during waking cognition. Confirmation, contradiction, and salient unpredicted experience may all support memory. Sleep later consolidates episodes; it is not required to create each episode.

## Motivated relational Part descriptions

Names describe the Part's feeling, need, fear, or motivation in fewer than six words, never merely an action or update operation. Missions state what the Part believes best serves the Agent from its ego-centric perspective; strategies state how, and beliefs state driving relational assumptions. Ego-centric service includes connection, dignity, competence, care, and curiosity and need not always be defensive. Generalized Parts refer to others or relevant broad classes rather than “The User”; specific relational Parts may name their referents. Preserve specific memories, provenance, continuity, and internal disagreement. Follow ADR 0092; do not automatically rewrite living psychology to satisfy style.

## Explicit shared thought context (ADR 0093)

Prior cognitive thought text may be shared through an attributed, decaying WorldState thought history, as explicitly authorized by the researcher. This narrow exception does not expose another Part’s private memories, beliefs, mission, snapshots, or other state. Thought contents remain subjective rather than authoritative external facts. Full same-thread chat is an external conversation record; Self remains world-blind and snapshots remain immutable.
