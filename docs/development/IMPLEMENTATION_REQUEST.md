You are taking over development of an existing research software project implementing a persistent-parts cognitive architecture.

Your job is **not to redesign the theory**.

Your job is to turn the existing architectural scaffolding into a working end-to-end system using **Node.js/TypeScript**, with:

- a complete executable cognitive runtime;
- persistent storage;
- model-provider integration;
- a CLI;
- a web application;
- live inspection of the Agent's internal cognitive activity;
- a Part-management interface;
- history/version inspection;
- prediction inspection;
- sleep/consolidation controls;
- experiment/benchmark support;
- enough tests and deterministic fallbacks that the system can actually be demonstrated locally.

The repository's existing documentation and ADRs are the architectural source of truth.

Do not casually replace the architecture with a conventional LLM-agent framework.

---

# ABSOLUTE FIRST TASK: CREATE A RESUMABLE DEVELOPMENT LEDGER

Before making substantive code changes, inspect the repository and create or update:

```text
TODO.md
```

and:

```text
docs/development/CURRENT_STATE.md
```

If `docs/development/` does not exist, create it.

These are mandatory.

They exist because development may be interrupted by token limits or session boundaries.

---

# `TODO.md`

This must be the persistent development plan.

Use checkboxes.

Organize work into phases and small tasks.

Example structure:

```markdown
# OntoAgentic Development TODO

## Phase 0 — Repository audit
- [x] Read architecture documentation
- [x] Read ADRs
- [x] Identify existing implementation
- [ ] ...

## Phase 1 — Runtime foundations
- [ ] ...

## Phase 2 — Part persistence
- [ ] ...

## Phase 3 — Cognitive cycle
- [ ] ...

## Phase 4 — CLI
- [ ] ...

## Phase 5 — Web inspection
- [ ] ...

## Phase 6 — Consolidation
- [ ] ...

## Phase 7 — Demo scenarios
- [ ] ...

## Phase 8 — Validation
- [ ] ...
```

Tasks must be granular enough that a future model can resume from the first unchecked item without rereading the entire development history.

Update this file continuously.

Do not wait until the end of a session.

---

# `CURRENT_STATE.md`

This is a handoff document.

Maintain:

```markdown
# Current Development State

## Last updated

...

## What works now

...

## Current architecture implementation status

...

## Current task

...

## Next exact task

...

## Known problems

...

## Important implementation decisions

...

## Commands to run

...

## Tests currently passing

...

## Files currently being worked on

...
```

Update it whenever a meaningful milestone is completed.

Before ending any work session:

1. update `TODO.md`;
2. update `CURRENT_STATE.md`;
3. ensure the repository still builds where reasonably possible;
4. record failing tests or blockers;
5. explicitly identify the next task.

---

# RESUME PROTOCOL

Every time you begin or resume work:

1. Read `TODO.md`.
2. Read `docs/development/CURRENT_STATE.md`.
3. Read any files referenced as currently active.
4. Run the relevant tests/build if feasible.
5. Continue from the first appropriate incomplete task.

Do not restart planning from scratch unless the repository state contradicts the ledger.

---

# ARCHITECTURE IS AUTHORITATIVE

Before implementing cognition, read at minimum:

```text
AGENTS.md

docs/architecture/CANONICAL_AGENT_FLOW.md
docs/architecture/INVARIANTS.md
docs/architecture/MODEL_EXECUTION.md
docs/architecture/DECISION_MODELS.md
docs/architecture/JEV_INTEGRATION.md
docs/architecture/PART_RUNTIME_PROTOCOL.md
docs/architecture/PART_VERSIONING.md
docs/architecture/PART_ASSOCIATION_NETWORK.md
docs/architecture/ACTIVATION_PROPAGATION.md
docs/architecture/OFFLINE_CONSOLIDATION.md
docs/architecture/STATE_AND_HISTORY.md
docs/architecture/INSPECTION_MODEL.md
```

Read relevant theory documents including:

```text
PART_ONTOLOGY.md
PART_MEMORY.md
PART_STICKINESS.md
PART_EXECUTION_ORDER.md
RELATIONAL_REALITY.md
RELATIONAL_PARTS.md
LANGUAGE_FIRST_LEARNING.md
EXPERIENCE_DIGESTION.md
MEMORY_RECONSOLIDATION.md
MEMORY_REEVALUATION.md
PREDICTION_LIFECYCLE.md
PREDICTION_CONTEXT.md
EPISODIC_MEMORY_FORMATION.md
CONSOLIDATION_AND_SLEEP.md
THERAPEUTIC_CHANGE.md
IDENTITY*.md
SELF*.md
```

Then inspect the ADRs.

Later ADRs supersede earlier contradictory ADRs.

Do not delete historical ADRs.

---

# DO NOT COLLAPSE THIS INTO A NORMAL AGENT FRAMEWORK

The canonical conceptual boundary is:

```text
WORLDSTATE
knows facts

PARTS
interpret
care
remember
predict
propose

SELF
chooses among Part perspectives
against Identity

IDENTITY
describes who the Agent understands /
wants itself to be

EXTERNAL EXECUTION
performs the selected action

OUTCOMES
feed later cognition

SLEEP
digests accumulated psychological experience
```

There is:

- no required Agent-wide goal;
- no omniscient executive;
- no single canonical autobiographical memory;
- no Self access to raw WorldState;
- no central planner that owns motivation;
- no Faculties subsystem;
- no mandatory Intention Manager subsystem;
- no generic automated-task architecture.

---

# IMPORTANT COGNITIVE INVARIANTS

Preserve these in code.

## WorldState

One cognitive cycle produces exactly one immutable:

```text
Wₙ
```

WorldState contains factual/observable information.

It may include factual records such as:

```text
Part A previously produced thought X.

Self selected action Y.

External action Z is still running.
```

It must not contain psychological conclusions such as:

```text
Paul is malicious.

The Agent should finish the assignment.

This event is emotionally important.
```

---

# Activator

Activation is:

```text
freeze Wₙ
    ↓
high-recall vector filtering
    ↓
candidate Parts
    +
sticky Parts that must remain considered
    ↓
ONE shared Jev-style activation request
    ↓
independent graded activation Score
for every surviving Part
    ↓
activation policy
    ↓
active Part constellation
```

Important:

> Activation is jointly contextualized but independently represented.

Do not use winner-take-all activation.

Do not normalize activation scores across Parts.

Several Parts may simultaneously be highly activated.

Vector similarity is not activation.

Vector search is primarily a cheap rejection mechanism.

It should err toward false positives rather than false negatives.

---

# Activation spike

Track conceptually:

```text
current activation

previous activation

activation change / spike
```

Do not equate these.

A meaningful activation spike may be passed to the Part as context.

A spike may invite a prediction.

It does not force one.

Activation spike is different from:

- emotional charge;
- stickiness;
- prediction confidence;
- bid authority.

---

# Parts

A Part is a persistent or temporary learned perspective/relationship.

A Part may represent:

- a person;
- relationship;
- concern;
- behavior;
- threat;
- project;
- task;
- responsibility;
- place;
- concept;
- community;
- internal state;
- another Part;
- generalized learned pattern.

Parts are intentionally biased.

Do not force Parts to speak like balanced assistants.

A Part can say:

```text
"He betrayed me."
```

rather than:

```text
"I possess a belief that he betrayed me."
```

The framework knows this is subjective.

---

# Part state

Implement a practical initial representation capable of supporting at least:

```text
stable ID

name

current mission / concern

current language-first beliefs

current strategies

trigger definitions

subjective memories

stickiness

associations

provenance

lineage

lifecycle status

prediction state

version identity

optional emotional-charge representation

optional cognitive characteristics
```

Do not pretend this schema is theoretically final.

Make schema evolution possible.

---

# Part stickiness

Stickiness means:

> Once relevant, how strongly does this Part tend to remain available across later cycles while its concern remains unresolved?

Sticky Parts must remain candidate-eligible even when ordinary vector retrieval would forget them.

Stickiness does NOT mean:

- automatic activation;
- high emotion;
- guaranteed bidding;
- behavioral authority;
- guaranteed Self selection.

---

# Part execution order

A Part proposal may include a multi-step strategy.

Example:

```text
proposal:
Finish report

execution order:
1. finish results
2. write conclusion
3. proofread
4. submit
```

This is the Part's strategy.

It is not a global planner.

External execution only performs actions selected through normal cognition.

---

# Subjective memory

Subjective autobiographical memory belongs primarily to Parts.

Different Parts may remember the same experience differently.

Current subjective memory must be directly retrievable from persistence.

Do NOT regenerate current memory by rereading objective history on every access.

---

# Experience digestion

Implement the principle:

```text
experience
    ↓
Part interpretation
    ↓
subjective memory / beliefs / predictions / relationships
    ↓
future cognition primarily uses those psychological products
```

Objective experience/audit history may exist.

It is not ordinary autobiographical memory.

Rule:

> Digest first. Re-open rarely.

---

# Memory ancestry

Subjective memories may have opaque ancestry references to objective experiences.

Example:

```text
Memory M17
originExperienceId = E42
```

Normal memory retrieval does not automatically load E42.

Objective ancestor replay is a controlled, exceptional developmental operation.

---

# Predictions

Prediction is a major cognitive mechanism.

A Part may maintain at most:

```text
ONE unresolved prediction
```

at a time.

A prediction may describe:

- what the Part thinks is happening;
- what happens next;
- how someone will respond;
- whether an interpretation will be validated;
- what an action will cause;
- when uncertainty should resolve.

Predictions are not restricted to behavioral bids.

Do not require paired:

```text
if selected
if not selected
```

forecasts for every proposal.

Those remain possible when natural.

---

# Prediction lifecycle

Support:

```text
none
 ↓
formed
 ↓
open
 ↓
continued / revised
 ↓
resolved
or
abandoned
or
expired
or
context invalidated
 ↓
evaluated
 ↓
possible episodic memory
```

Prediction revisions must preserve history.

---

# Prediction context capsule

When a prediction is committed, preserve the details the Part believes are important **while they are still available**.

Do not copy all of Wₙ.

The Part should select relevant context.

Possible contents:

```text
expectation

current interpretation

important words

observable behaviors

social reactions

important entities

current activation

activation spike

confidence

expected horizon

opaque WorldState / experience references
```

This preserved context survives decay of ordinary active context.

Prediction becomes an encoding anchor.

---

# Prediction evaluation

Later, provide the owning Part with:

```text
original prediction

prediction-time context

later factual evidence

relevant external execution facts

interruptions

unexpected external changes
```

The Part determines whether it was:

- correct;
- partly correct;
- wrong;
- ambiguous;
- invalidated;
- defeated by external circumstances.

Preserve causal attribution.

Do not implement simplistic reward/punishment learning.

---

# Episodic memory

Meaningful prediction evaluation may create subjective episodic memory during waking cognition.

Example flow:

```text
experience
 ↓
Part activation
 ↓
prediction
 ↓
outcome
 ↓
evaluation
 ↓
episodic Part memory
 ↓
later sleep consolidation
```

Prediction is not the only memory path.

Highly salient unpredicted experiences may also become memories.

---

# Self

Self is:

- world-blind;
- unmotivated;
- a chooser/mediator.

Self receives:

```text
Identity

optional Identity mask

Part bids

Part explanations

Part predictions

debate responses
```

Self does NOT receive:

```text
WorldState

raw user message

raw environment state

objective event history
```

unless a future explicitly documented experiment changes this.

---

# Self arbitration

Fast arbitration may use a bounded Choice-style model.

Candidates are:

```text
Part proposal A

Part proposal B

Part proposal C

...

DEBATE
```

Self may not magically invent an unexplained action outside the proposed cognitive option space.

If existing proposals are insufficient:

```text
DEBATE
```

---

# Self debate

Debate remains world-blind.

Self asks Parts questions.

Example:

```text
"Why do you think that?"

"What evidence are you using?"

"Can you propose something less extreme?"

"Part B disagrees. Why?"
```

The relevant Part can receive Wₙ and its own private state again.

Self receives the Part's response, not Wₙ.

---

# Identity

Identity is a persistent self-definition/reference.

It may contain:

- values;
- roles;
- commitments;
- self-conceptions;
- desired qualities;
- aspirations.

Identity is not an active environmental observer.

Identity does not directly choose behavior.

Self chooses using Identity as reference.

---

# External execution

Execution is outside the psychological architecture.

After Self selects an action:

```text
selected action
    ↓
external execution adapter
```

Possible adapters include:

- CLI/chat response;
- demo simulation;
- tools;
- HTTP actions;
- game environment;
- future robot interface.

External operations may continue in parallel.

Later status can enter a future WorldState as fact.

Do not create an internal Faculties architecture.

---

# Sleep / offline consolidation

Implement a first working version of the offline consolidation pipeline.

Sleep is slower cross-experience development.

It works primarily from psychologically selected traces such as:

- recent episodic memories;
- activated Parts;
- activation spikes;
- co-activation;
- predictions;
- prediction evaluations;
- repeated referents;
- Part mutations;
- recurring conflicts;
- Identity incongruity.

It should not simply reread the complete raw event log.

---

# Sleep may propose

- Part update;
- relational Part formation;
- generalized Part formation;
- specialization;
- trigger narrowing;
- trigger broadening;
- association changes;
- memory reconsolidation;
- split;
- merge;
- dormancy;
- reactivation;
- archival.

For the initial demo, implement only a manageable subset if necessary, but structure the code so all of these are representable.

At minimum demonstrate:

1. normal Part update;
2. possible new Part formation;
3. memory reinterpretation;
4. trigger/association adjustment.

---

# Sleep is conservative

When uncertain:

```text
do nothing
```

is a valid outcome.

Do not optimize for:

- fewest Parts;
- smallest memory;
- maximum consistency.

Contradiction and redundancy can be psychologically meaningful.

---

# Memory reconsolidation

A Part may revise the meaning of an old subjective memory.

Preserve versions.

Example:

```text
v1:
"He deliberately humiliated me."

v2:
"I thought he deliberately humiliated me.
Now I think he was showing off and didn't care that it hurt me."
```

Do not delete v1.

---

# Rare objective ancestor replay

Implement support for the concept, but it does not need to be prominent in the initial demo.

A controlled consolidation process may retrieve an objective ancestor experience and allow the **current developed Part** to reinterpret it.

Self does not get this capability.

Ordinary Part recall does not automatically use it.

---

# Relational consolidation

Demonstrate specific versus generalized learning.

Example:

```text
Paul Part:

"Paul often asks intrusive personal questions."
```

versus:

```text
Cautious Part:

"I become guarded when people persistently ask personal questions."
```

Provenance may record that Cautious learned partly through Paul.

Paul must not automatically remain on Cautious's trigger surface merely because of provenance.

---

# Association types must remain distinct

Represent or at least model distinctly:

```text
trigger

association

provenance

lineage

memory reference

stickiness
```

Do not collapse these into generic graph edges without type.

---

# Therapy benchmark

Therapy is not a subsystem.

Therapy is a benchmark.

Build an experiment harness capable of testing:

```text
baseline
 ↓
ordinary therapeutic conversation
 ↓
immediate retest
 ↓
sleep/consolidation
 ↓
same-context retest
 ↓
novel analogous scenario
```

The benchmark should reveal whether apparent conversational change became persistent Part development.

Do not give the therapist privileged internal mutation APIs.

---

# DEMO GOAL

The working demo must make the internal architecture **visible**.

The strongest demo is not merely:

```text
user talks to chatbot
```

It is:

```text
user talks to Agent

AND CAN WATCH:

WorldState freeze

vector candidates

Jev activation scores

activation spikes

active Parts

Part thoughts

Part predictions

Part bids

Self arbitration

Self debate

chosen action

prediction outcomes

memory formation

Part mutations

sleep consolidation

Part relationships
```

The web UI should make the cognitive process legible to a non-developer.

---

# TECHNOLOGY TARGET

Use Node.js with TypeScript.

Prefer a modern supported Node version.

Use the repository's existing package manager if one exists.

Otherwise use a conventional Node workspace setup.

A reasonable structure is:

```text
packages/
    core/
    storage/
    providers/
    sdk/

apps/
    server/
    cli/
    web/
```

but do not reorganize working existing code merely to match this example.

Preserve existing documentation paths.

---

# CORE PACKAGE

Create an implementation that cleanly separates domain logic from interfaces.

Conceptual modules should include:

```text
worldstate

parts

activation

predictions

memory

identity

self

bidding

consolidation

history

inspection

execution

providers
```

Avoid a single enormous `Agent` class.

Prefer explicit domain services and typed contracts.

---

# STORAGE

For the local demo, use a durable embedded database.

SQLite is preferred unless the repository already establishes another option.

Persist at minimum:

```text
Agents

Identities

Identity versions/masks if implemented

Parts

Part versions

Part memories

Memory versions

Part triggers

Part associations

Part lineage

Predictions

Prediction versions

Prediction evaluations

WorldState snapshots

Cognitive cycles

Activation results

Part cognition outputs

Bids

Self decisions

Debate messages

External execution records

Consolidation runs

Mutations

Audit/inspection events
```

Do not treat the database schema as the final psychological ontology.

Support migrations.

---

# EVENT STREAM / BRAIN TELEMETRY

Build an explicit structured cognitive event stream.

Every important cognitive operation should emit an inspectable event.

Examples:

```text
cycle.started

worldstate.frozen

activation.vector_candidates

activation.scored

activation.part_activated

activation.spike

part.reasoning_started

part.thought

part.prediction_created

part.prediction_revised

part.bid_created

self.arbitration_started

self.choice

self.debate_started

self.question

part.debate_response

execution.handoff

execution.status

prediction.evaluation

memory.episodic_created

part.mutation_proposed

part.mutation_applied

consolidation.started

consolidation.replay_selected

consolidation.mutation_proposed

consolidation.completed
```

Use structured typed payloads.

This event stream should drive both:

- CLI inspection;
- live web UI.

---

# LIVE WEB STREAMING

Use WebSocket or Server-Sent Events for live cognitive events.

A user should be able to keep the Brain Monitor open while interacting with the Agent and watch the cycle unfold.

Do not require page refreshes.

---

# WEB APPLICATION

Build a functional web application.

It should have several major surfaces.

---

# 1. Agent Interaction

A chat/demo surface where the user can interact with the Agent.

Show:

- conversation;
- pending external action if relevant;
- ability to trigger next turn;
- active Agent identity.

Do not clutter the basic interaction view with every debugging detail.

---

# 2. Brain Monitor

This is one of the most important components.

Create a live cycle visualization.

At minimum display:

```text
Cycle ID

WorldState snapshot

vector candidates

activation Scores

activation changes/spikes

active Parts

Part thoughts

open predictions

bids

Self arbitration

debate if any

selected action

outcome/evaluation
```

Make it possible to pause/freeze inspection of an old cycle while new cycles continue.

---

# Suggested cycle visualization

A vertical pipeline is acceptable:

```text
WORLDSTATE

↓

CANDIDATE PARTS

↓

ACTIVATION

↓

PARTS

↓

BIDS

↓

SELF

↓

ACTION

↓

OUTCOME
```

Each stage should be expandable.

---

# Part cards

For each active Part show:

```text
name

activation Score

activation change

stickiness

mission

short current interpretation

current prediction

bid if any
```

Clicking a Part should open its detailed inspector.

---

# 3. Part Manager

Build a full Part-management UI.

Capabilities should include:

```text
list Parts

search/filter Parts

inspect Part

create Part manually

edit current Part state

archive/reactivate Part

inspect triggers

inspect stickiness

inspect associations

inspect memories

inspect current prediction

inspect prediction history

inspect mutations

inspect version history

inspect lineage
```

Manual edits should use the same versioned mutation architecture where practical.

Do not silently overwrite state.

---

# Part detail page

Display sections for:

```text
Overview

Mission / concern

Current beliefs

Strategies

Triggers

Stickiness

Associations

Subjective memories

Open prediction

Prediction history

Version timeline

Mutation history

Lineage

Provenance

Recent activations

Recent bids

Recent outcomes
```

---

# 4. Memory Inspector

Allow inspection of subjective memory.

Show:

```text
memory owner Part

current remembered content

gist

context if available

ancestor experience reference

version history

reconsolidation history
```

Objective ancestor content should be hidden behind an explicit research/debug action rather than displayed as ordinary memory.

Label it clearly as:

```text
Objective ancestor / audit record
```

not:

```text
True memory
```

---

# 5. Prediction Monitor

Provide a dedicated prediction view.

Show:

```text
Part

current open prediction

prediction version

prediction-time context capsule

confidence

created cycle

evaluation horizon

current status

later evidence

evaluation

causal attribution

memory created
```

Also show Parts with no open prediction.

This will be important for debugging the one-prediction invariant.

---

# 6. Part Network

Create an inspectable graph or network view.

Edges must be typed.

Examples:

```text
trigger

association

provenance

lineage

memory ancestry
```

Do not make the visualization imply all edge types behave identically.

A simple graph library is fine.

Usability matters more than visual spectacle.

---

# 7. Sleep / Consolidation Console

Create a UI for manually triggering a consolidation cycle for the demo.

Show:

```text
input time/cycle range

selected psychological traces

repeated referents

co-activation patterns

selected memories

proposed changes

accepted changes

rejected/no-change decisions
```

Allow:

```text
Run consolidation
```

in the research/demo interface.

This is a development control, not a cognitive ability available to Self.

---

# 8. History / Timeline

Provide a chronological event timeline.

Filter by:

```text
cycle

Part

event type

prediction

memory

Self decision

consolidation

mutation
```

This should make debugging possible without reading console logs.

---

# 9. Identity Inspector

Show:

```text
core Identity

values / roles / self-conceptions

active mask if any

Identity version/history where applicable
```

Make clear that Identity is not the active chooser.

---

# 10. Experiment Panel

Support running predefined experiments.

Initial experiments should include at least:

```text
activation stability

task persistence / stickiness

prediction correction

memory formation

sleep consolidation

therapy benchmark
```

Results should be saved.

---

# CLI

Build a genuinely useful CLI, not merely a server launcher.

Suggested command shape:

```text
ontoagentic agent list
ontoagentic agent create

ontoagentic chat <agent>

ontoagentic cycle run <agent>
ontoagentic cycle show <cycle-id>

ontoagentic parts list <agent>
ontoagentic parts show <part-id>
ontoagentic parts create
ontoagentic parts edit <part-id>
ontoagentic parts archive <part-id>
ontoagentic parts reactivate <part-id>
ontoagentic parts history <part-id>

ontoagentic memories list <part-id>
ontoagentic memories show <memory-id>
ontoagentic memories history <memory-id>

ontoagentic predictions list <agent>
ontoagentic predictions show <prediction-id>

ontoagentic identity show <agent>
ontoagentic identity edit <agent>

ontoagentic sleep run <agent>

ontoagentic inspect live <agent>
ontoagentic inspect cycle <cycle-id>

ontoagentic experiment run <name>
```

Exact syntax may vary.

Make commands discoverable with `--help`.

---

# CLI LIVE BRAIN VIEW

Create a terminal mode that streams cognition.

Something conceptually like:

```text
[CYCLE 142]

WORLDSTATE
User: "Were you upset by what Bill said?"

VECTOR
18 / 247 Parts retained

ACTIVATION
Social Caution       3.8 ↑1.9
Bill                 3.7 ↑0.4
Conflict Avoidance   2.9 ↑1.5

PART: Social Caution
Thought:
"I may have misunderstood him."

Prediction:
"If we ask directly, I think he'll say he was joking."

PART: Conflict Avoidance
Thought:
"We don't need to make this a confrontation."

SELF
Choice:
Ask Bill for clarification

EXECUTION
chat.response
```

This alone should be enough to demonstrate the architecture over SSH or without the web frontend.

---

# PROVIDER ARCHITECTURE

Keep model providers replaceable.

Implement interfaces such as conceptually:

```text
DecisionModelProvider

ReasoningModelProvider

EmbeddingProvider
```

Do not let domain code import vendor SDKs directly.

---

# JEV

Implement Jev behind the decision provider adapter if credentials/API access are available.

The activation call should support:

```text
shared Wₙ

+

multiple candidate-specific Score questions

→ per-Part activation Scores
```

Self arbitration may use Choice-style judgment.

If Jev cannot be run locally because credentials/service access are unavailable, implement:

1. the real adapter contract;
2. configuration hooks;
3. a clearly labeled development fallback.

Do not pretend the fallback is Jev.

---

# GENERATIVE MODEL PROVIDERS

Support at least one real LLM provider available from configuration.

Prefer environment configuration.

Example:

```text
OPENAI_API_KEY
```

or equivalent based on what the repository already supports.

Do not hardcode secrets.

Provide a deterministic/mock reasoning provider for tests.

---

# EMBEDDINGS

Implement an embedding provider abstraction.

For the first demo, candidate retrieval may use a straightforward persisted embedding table and cosine similarity.

Do not overengineer a distributed vector database.

Correctness and inspectability matter more than scale at this stage.

---

# PROMPTS

Prompt templates should live in explicit files/modules.

Do not bury large prompts in random functions.

Version important cognitive prompts.

At minimum distinguish prompts for:

```text
activation preparation if needed

Part cognition

Part prediction formation/update

Part prediction evaluation

Self arbitration

Self debate

Part debate response

sleep consolidation

memory reconsolidation

Part formation
```

The prompts must preserve cognitive access boundaries.

---

# STRUCTURED OUTPUT

Where practical, use schema-validated model outputs.

Do not require hidden chain-of-thought.

Request concise structured cognitive products such as:

```text
interpretation

thought

prediction update

proposal

evidence summary

mutation proposal
```

Do not store or depend upon hidden model reasoning.

---

# MUTATION ENGINE

Implement explicit versioned Part mutation.

Conceptually:

```text
current Part
    ↓
proposed mutation
    ↓
validate
    ↓
apply
    ↓
new immutable Part version
```

Mutations should be inspectable.

Never silently overwrite psychologically important state.

---

# Useful mutation types

Support enough flexibility for:

```text
belief changed

belief added

trigger changed

strategy changed

stickiness changed

association changed

memory added

memory revised

prediction changed

lifecycle changed
```

Implementation can use a general patch/event approach.

Avoid an explosion of bespoke mutation code if a typed patch model works cleanly.

---

# HISTORY

Distinguish:

```text
WorldState history

cognitive-cycle history

Part version history

memory version history

prediction history

mutation history

external execution history

consolidation history
```

Do not call current storage "history" merely because it persists.

---

# DEMO SIMULATION

For the demo, implement a small controlled text environment if the repository does not already have one.

It should make it easy to produce psychologically meaningful situations.

Example scenario:

```text
Agent meets Bill.

Bill jokes.

Bill insults.

Other people react.

Agent can ask questions.

Bill responds.

Relationship develops over multiple encounters.
```

The environment's job is to produce objective facts and consequences.

It must not directly modify Parts.

---

# SEED AGENT

Provide a useful demo seed.

Do not make it too psychologically elaborate.

Create enough Parts to demonstrate plurality.

For example:

```text
Social Caution

Connection Seeking

Conflict Avoidance

Boundary Protection

Curiosity

Task Completion
```

plus one or two relational Parts after development.

Give the Agent an Identity sufficient to demonstrate Self arbitration.

Keep seed data inspectable.

---

# DEMO STORY

Create one end-to-end scripted demo that demonstrates:

1. WorldState.
2. Vector filtering.
3. Multiple active Parts.
4. Activation Scores.
5. Activation spike.
6. One Part creates a prediction.
7. Different Parts disagree.
8. Self chooses.
9. External environment responds.
10. Prediction is contradicted or confirmed.
11. Episodic memory forms.
12. Part state changes.
13. Later similar event behaves differently.
14. Sleep/consolidation runs.
15. A generalized or relational change is visible.
16. Web UI shows the change.
17. CLI can inspect the same state.

This should be reproducible.

---

# THERAPY DEMO / BENCHMARK

Also create a small benchmark where:

```text
Part belief:
"If I express vulnerability, people will reject me."
```

A therapist-like external participant interacts normally.

No privileged state editing.

Measure:

```text
baseline prediction

therapeutic interaction

prediction outcome

episodic memory

immediate Part change

sleep consolidation

novel analogous scenario
```

The goal is not to prove therapy works.

The goal is to demonstrate that the architecture can measure whether durable psychological development occurred.

---

# TESTING

Build tests alongside implementation.

At minimum cover important invariants.

---

# WorldState tests

Verify:

```text
Wₙ immutable within cycle

all activated Parts get same Wₙ

Self does not get Wₙ
```

---

# Activation tests

Verify:

```text
vector filter is candidate-only

multiple Parts may score high

activation Scores are not normalized

sticky Part can remain candidate

candidate ranking does not define activation
```

---

# Prediction tests

Verify:

```text
one open prediction per Part

revision preserves history

context capsule persists

prediction can resolve early

prediction can expire/abandon/invalidate

evaluation is not binary only
```

---

# Memory tests

Verify:

```text
subjective memory belongs to Part

same event may produce different memories

current memory directly retrievable

versions immutable

objective ancestor not loaded automatically
```

---

# Self tests

Verify:

```text
Self input excludes Wₙ

Self can choose candidate bid

Self can choose DEBATE

debate still excludes Wₙ

Self cannot invent unexplained action in fast arbitration
```

---

# Consolidation tests

Verify:

```text
uses psychological traces

may choose no change

does not automatically merge co-activated Parts

mutations are versioned

provenance survives
```

---

# ACCESS CONTROL TESTS

Write explicit tests for cognitive access boundaries.

This is important.

Examples:

```text
Self cannot query objective experience history.

Part A cannot directly load Part B private memory.

ordinary memory retrieval cannot automatically dereference objective ancestor.

web inspector CAN display privileged audit information,
because inspection is external to cognition.
```

---

# WEB/CLI USE THE SAME BACKEND

Do not duplicate cognitive logic in the web client or CLI.

The runtime/core is authoritative.

Expose application services/API used by:

```text
CLI

web server

tests

experiments
```

---

# SERVER API

Build a coherent API.

Possible endpoints:

```text
/api/agents

/api/agents/:id

/api/agents/:id/message

/api/agents/:id/cycles

/api/cycles/:id

/api/agents/:id/parts

/api/parts/:id

/api/parts/:id/history

/api/parts/:id/memories

/api/predictions/:id

/api/agents/:id/consolidate

/api/agents/:id/events

/api/experiments
```

Exact design is yours.

Use typed request/response contracts.

---

# ERROR HANDLING

Infrastructure failures must remain distinguishable from cognition.

Examples:

```text
provider unavailable

invalid structured response

database failure

embedding failure
```

must not appear psychologically as:

```text
Part refused

Self was confused

prediction failed
```

Make infrastructure errors visible in inspection.

---

# DETERMINISTIC DEMO MODE

Create a local deterministic/mock mode.

This is important.

A user should be able to run:

```text
npm install
npm run demo
```

or equivalent and see the application work even without paid model credentials.

Mock mode should exercise the architecture honestly.

Label it clearly as deterministic/mock inference.

When API keys are supplied, real providers can replace the mock providers.

---

# DEVELOPER EXPERIENCE

Provide root scripts such as conceptually:

```text
npm run dev

npm run dev:web

npm run dev:server

npm run cli

npm run test

npm run typecheck

npm run lint

npm run demo
```

Exact scripts may vary.

Document them.

---

# README

Update root README with:

```text
What OntoAgentic is

architecture summary

how to install

how to configure providers

how to launch demo

how to launch web UI

how to use CLI

how to inspect cognition

how to create/edit Parts

how to run consolidation

how to run therapy benchmark

mock versus real model mode
```

---

# IMPLEMENTATION PHASES

Use roughly this sequence.

Do not try to build the entire UI before the cognitive runtime works.

---

## PHASE 0 — Audit and ledger

- read docs;
- inspect repository;
- create TODO;
- create CURRENT_STATE;
- identify contradictions/blockers;
- establish Node project structure.

---

## PHASE 1 — Domain types and persistence

Implement:

- IDs;
- Agent;
- Part;
- Identity;
- WorldState;
- memory;
- prediction;
- association;
- mutation;
- version/history persistence.

Write tests.

---

## PHASE 2 — Provider interfaces

Implement:

- reasoning provider;
- decision provider;
- embedding provider;
- deterministic mocks;
- real provider adapters where practical.

---

## PHASE 3 — WorldState and event stream

Implement:

- immutable Wₙ;
- recent-context support;
- cognitive event stream;
- persistence of cycles/events.

---

## PHASE 4 — Activation

Implement:

- trigger embeddings;
- high-recall vector filtering;
- sticky candidate inclusion;
- shared-state per-Part activation scoring;
- activation delta/spike calculation;
- event telemetry.

Test thoroughly.

---

## PHASE 5 — Part cognition

Implement:

- Part context assembly;
- private memories;
- language-first reasoning;
- interpretation;
- thoughts;
- optional prediction;
- optional bid/context output.

---

## PHASE 6 — Predictions

Implement:

- one-open-prediction invariant;
- context capsule;
- revision;
- evaluation horizon;
- evaluation;
- causal attribution;
- history;
- episodic memory creation.

---

## PHASE 7 — Self

Implement:

- world-blind context construction;
- bounded arbitration;
- DEBATE path;
- questions to Parts;
- revised bids;
- final selection.

Test access boundaries.

---

## PHASE 8 — External action loop

Implement:

- selected-action handoff interface;
- demo environment;
- execution status;
- future WorldState generation.

Do not build Faculties.

---

## PHASE 9 — Part mutation/versioning

Implement:

- proposed mutations;
- validation;
- immutable versions;
- history;
- rollback-as-new-version semantics.

---

## PHASE 10 — Sleep/consolidation

Implement a minimal working consolidation pass.

Focus first on:

- replay selection;
- repeated referent detection;
- memory reinterpretation;
- simple Part update/new-Part proposal;
- conservative mutation application.

Then expand.

---

## PHASE 11 — CLI

Build full management and inspection CLI.

---

## PHASE 12 — Server and live events

Build HTTP API + live event streaming.

---

## PHASE 13 — Web interface

Build:

- interaction;
- Brain Monitor;
- Part Manager;
- prediction monitor;
- memory inspector;
- network;
- history;
- consolidation console;
- experiments.

---

## PHASE 14 — Demo scenarios

Build reproducible scenarios.

---

## PHASE 15 — Therapy benchmark

Implement experiment harness and UI/CLI reporting.

---

## PHASE 16 — Hardening

Run:

- tests;
- typecheck;
- lint;
- build;
- mock demo;
- real-provider smoke test if credentials available.

Fix architecture drift.

---

# PRIORITIZE A VERTICAL SLICE

Before building every feature, get one complete cognitive cycle working end-to-end:

```text
user input

→ Wₙ

→ vector candidates

→ activation Scores

→ active Parts

→ Part thoughts/bids

→ world-blind Self

→ choice

→ response

→ persisted cycle

→ visible CLI inspection
```

Then extend it.

A small working system is better than fifty disconnected modules.

---

# AFTER THE FIRST VERTICAL SLICE

Add:

```text
activation spike

prediction

prediction context

outcome

prediction evaluation

episodic memory

Part mutation
```

Then add sleep.

Then web visualization.

---

# BRAIN MONITOR IS NOT OPTIONAL

Do not treat observability as polish to add at the end.

The architecture is experimental.

We need to understand why the Agent behaved as it did.

Every major cognitive event must be inspectable.

The demo is only successful if a human can watch the cognitive process and understand:

```text
which Parts existed

why they were considered

how activated they became

what each thought

what each predicted

what each proposed

what Self saw

why the selected option won

what happened later

what the Parts learned
```

---

# PART MANAGEMENT IS NOT OPTIONAL

The researcher must be able to:

- inspect Parts;
- seed Parts;
- manually create Parts;
- change experimental Part state;
- view triggers;
- view stickiness;
- inspect associations;
- inspect memories;
- inspect predictions;
- inspect versions;
- archive/reactivate;
- see lineage.

This is an experimental cognitive architecture, so researchers need direct management tooling.

Manual research edits must be visibly marked as researcher-originated changes.

Do not pretend they were organically learned.

---

# AUDIT ORIGIN

Where practical, tag mutations/events with origins such as conceptually:

```text
organic_cognition

prediction_evaluation

consolidation

researcher_edit

seed

migration
```

This will be extremely useful when evaluating whether observed development actually arose from the architecture.

---

# SECURITY / ACCESS BOUNDARY IN THE UI

The web inspector can see privileged state.

The Agent cannot.

Do not confuse:

```text
researcher can inspect WorldState + Parts + audit log
```

with:

```text
Self can inspect all of these
```

The UI is outside the cognitive boundary.

---

# WHEN THEORY IS AMBIGUOUS

If implementation reaches a question the docs intentionally leave unresolved:

1. do not silently invent a permanent theoretical answer;
2. choose the simplest reversible implementation that allows experimentation;
3. document the assumption in `CURRENT_STATE.md`;
4. if architecturally meaningful, add an implementation note or proposed ADR;
5. preserve configurability.

Examples include:

- activation cutoff;
- spike threshold;
- exact stickiness representation;
- prediction horizon format;
- consolidation cadence;
- emotional-charge representation;
- replay selection.

---

# DO NOT OVERENGINEER FIRST

For the demo:

- SQLite is enough;
- local cosine vector search is enough;
- a small event bus is enough;
- one server process is enough;
- one web app is enough.

Do not introduce:

- Kubernetes;
- distributed queues;
- microservices;
- Kafka;
- complex cloud infrastructure;
- unnecessary orchestration.

The difficult problem is cognition, not deployment.

---

# CODE QUALITY

Use:

- TypeScript strict mode;
- explicit interfaces;
- schema validation at model/API boundaries;
- migrations;
- testable services;
- dependency injection where useful;
- clear separation of domain and provider code.

Avoid:

- giant files;
- global mutable state;
- undocumented magic constants;
- vendor SDK calls scattered throughout cognition;
- silent state mutation.

---

# DOCUMENT WHILE BUILDING

When an implemented mechanism differs from an architectural document because the document is outdated:

Do not silently follow whichever is convenient.

Determine which ADR/document is authoritative.

Update stale docs if the newer decision is clear.

If genuinely ambiguous, record the discrepancy rather than inventing theory.

---

# COMPLETION DEFINITION

The project is not complete merely because a chat page works.

The demo should support this end-to-end workflow:

```text
1. Launch application.

2. Open web UI.

3. Select/create Agent.

4. Inspect Identity and initial Parts.

5. Chat with Agent.

6. Watch WorldState freeze.

7. Watch vector candidate filtering.

8. Watch per-Part activation Scores.

9. Watch activation spikes.

10. Inspect active Part thoughts.

11. See a Part create/revise a prediction.

12. See Parts submit different proposals.

13. See exactly what world-blind Self receives.

14. Observe arbitration/debate.

15. See selected external action.

16. Observe later outcome.

17. Watch prediction evaluation.

18. Inspect episodic memory creation.

19. Inspect Part mutation/version.

20. Run additional interaction.

21. Trigger sleep/consolidation.

22. Inspect proposed and accepted developmental changes.

23. Compare Part state before/after sleep.

24. Run a related scenario and observe changed cognition.

25. Perform all important inspection from CLI as well.

26. Restart application.

27. Verify Agent psychology persisted.
```

---

# TOKEN / SESSION SURVIVAL

This requirement is critical.

Assume you may be interrupted at any time.

After every significant unit of work:

```text
update TODO.md
update CURRENT_STATE.md
```

Do not leave essential knowledge only in your conversation context.

If you are approaching a context/token limit:

1. stop beginning large new tasks;
2. complete the smallest safe unit;
3. update tests/build status;
4. update TODO;
5. update CURRENT_STATE;
6. explicitly record the exact next file/function/task.

The repository must contain enough information for another advanced model with no prior conversation to continue development correctly.

---

# WORKING STYLE

Do not repeatedly ask the user for permission to continue.

Proceed through the TODO.

When a theoretical ambiguity is not blocking, use a reversible experimental implementation and document it.

When a genuine architectural contradiction blocks implementation, surface it clearly.

Prefer functioning vertical slices over large amounts of empty scaffolding.

Tests and observability should be built alongside cognition rather than afterward.

---

# START NOW

Perform the following first:

1. inspect repository;
2. read `AGENTS.md`;
3. read the canonical architecture and latest ADRs;
4. inventory existing code versus documentation;
5. create/update `TODO.md`;
6. create/update `docs/development/CURRENT_STATE.md`;
7. establish the Node.js/TypeScript workspace if not already present;
8. identify the smallest end-to-end cognitive vertical slice;
9. begin implementing it;
10. continue through the TODO until blocked or the available development session ends.

Do not stop after writing a plan.

Build the system.