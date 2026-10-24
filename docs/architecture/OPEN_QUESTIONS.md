## Continuous cognition (ADR 0165)

[ADR 0165](decisions/0165-continuous-asynchronous-cognition.md) defines the current online execution target: immutable observations, independent activation, bounded scope inference, versioned expressed bids and serialized world-blind Self decisions. Activation-pass allowances, busy-scope policy, commitment/affect persistence and optional per-request resource routing are explicit. One runtime supports one-pass pause and continued attention; the former synchronous production loop is removed. The older flow summaries below preserve design context and do not reopen superseded decisions.

Open empirical questions include when repeated thought is useful, how workload estimates and escalation thresholds affect quality/latency, which attention budgets prevent starvation without suppressing useful reconsideration, and how to compare matched consumed computation. Current simulation protocols expose these questions without prescribing psychological conclusions.

## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

<!-- Current online flow: ADR 0133 -->

[ADR 0133](decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

# Open Architectural Questions

## Earlier cycle revision (ADR 0132)

[ADR 0132](decisions/0132-direct-worldstate-disposition-activation.md) supersedes the online perception stage: immutable WorldState + thread steering → direct independent Jev disposition activation → disposition-specific subjective memory accessibility → ordered construction/evidence/cognition. No perception inference runs. Prior-cycle prerequisites gate eligibility; each disposition's current scope is judged from WorldState. Compatibility binding IDs denote scopes, not inferred individual entities. Self remains world-blind; Identity guides and execution stays external.


## Earlier constructed revision (ADR 0126)

[ADR 0126](decisions/0126-constructed-perspectives-and-dispositions.md) supersedes older persistent-Part and private-only recall guidance for the default constructed architecture. Parts are temporary working perspectives reconstructed from subjective Agent autobiography; retired instances remain inspectable. Thread steering and gated entity-bound disposition graphs guide perception and recall. Self remains world-blind and Identity-guided; execution remains external. ADR 0128 removes the earlier online flow from application code. Historical regression fixtures and offline Part-development consolidation remain separate.

The following areas are intentionally unresolved. Developers should not assume that absence of a decision means one implementation is preferred.

## Part representation and formation

The permanent representation of Parts, and the process determining when a new Part forms, are undecided.

## Split, merge, bidding, and executive architecture

No permanent split or merge algorithm has been selected. ADR 0140 now defines the Executive boundary: immutable selected-intent contracts, framework-owned permissions, compact feedback and cognitively supervised procedural learning. Concrete adapters and operational signal calibration remain implementation and experimental work. The integration of Parts, Identity, subjective memory, Part missions, and constraints remains open; this does not imply a global Agent goal or mission.

## Identity, memory, and subjective models

ADR 0101 distinguishes Self-facing Identity self-definition from autobiographical authoring Traits stored alongside it. Future use of that background for Part initialization and the relationship between Part identity, autobiographical self-models, and evolving self-narrative still require further design. Memory types, retrieval, consolidation, forgetting, reconstruction, and relationships with Parts remain open. Agents will eventually require beliefs that may differ from authoritative reality; the permanent architecture for these models remains undecided.

## Computational and simulation implementation

Parts may use language models, smaller models, classifiers, deterministic systems, learned adapters, or hybrids. No single implementation is required. The permanent simulation authoring format is undecided. Evennia is being evaluated but has not been adopted as an irreversible dependency.

## History, concurrency, learning, and performance

Git-like history is desired, but its persistence mechanism is undecided. ADR 0165 selects asynchronous online scope inference with serialized Self decisions. Empirical resource policies and retained offline evaluation mechanisms remain open. Prediction-to-adaptation rules should remain configurable. Indexing, caching, embeddings, batching, model allocation, and other optimizations should respond to real performance requirements rather than prematurely define the architecture.

## Part semantic development

The following remain open:

- When does a semantic change preserve identity versus create a successor Part?
- How should a Part decide which accumulated evidence remains active versus consolidated?
- How much raw subjective memory should be placed into one Part inference?
- When should a Part split rather than merely learn contextual strategies?
- When are two Parts similar enough to merge without losing useful disagreement?
- How should linguistic confidence interact with optional structured confidence?
- How should archived Parts influence later formation without directly bidding?
- How should the system distinguish temporary role evolution from permanent mission change?

## Offline consolidation and reconsolidation

- Which psychologically selected experiences are replayed, and how do charge, prediction error, surprise, recurrence, and unresolved conflict inform selection?
- When is repeated co-activation or a referent's recurrence sufficient evidence for a new Part, and how should existing sufficient structure be recognized?
- Which features across experiences are transferable, and when should a generalization broaden, narrow, become conditional, specialize, split, or remain unresolved?
- What makes a subjective memory meaningfully relevant or unstable enough to revisit, and how should resistance to revision be represented?
- Can unused associations weaken, and should change be semantic, time-based, evidence-based, or a combination?
- How should emotional charge develop without reducing affect to a scalar reward system?
- How should bounded activation terminate without a central attention sovereign?
- What inspection evidence best distinguishes a change created by offline consolidation from a waking mutation merely preserved by it?

## Therapy and Identity development

- What distinguishes durable therapeutic development from context-bound conversational compliance?
- When should repeated Part change contribute to Identity development through the existing mediated path?
- How should benchmarks distinguish a relationship-specific exception from appropriately generalized learning without treating either as inherently wrong?

## Primitive-only development

ADR 0104 adds continuously scored primitive appraisals, but automatic Part formation from primitive-only experience is still undecided. Current formation operates on psychologically digested owning-Part traces during consolidation. Do not silently convert primitive configuration into persistent Parts.

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.
## Sleep historical evidence selection (ADR 0180)

The initial policy uses bounded linked/recent same-thread subjective memory candidates and skips unchanged prediction/source fingerprints. Review budgets are experimentally adjustable. Whether this selection retrieves sufficiently old useful comparisons, and how alternative selection policies affect inference cost and learning quality, remain empirical questions. Historical support alone does not bypass existing ended-investigation/repeated-usefulness gates; no new retrospective evidence-count promotion threshold is established. No new trace store, metacognitive controller or extra activation pass is implied.

## Independent evidence calibration (ADR 0181)

The provenance and novelty boundaries are specified by ADR 0181. Empirical questions remain about contradiction retrieval under bounded search, recognizing differently worded reports of the same event, semantic condition/outcome classification, action-influenced causation and comparative-cost evidence. Configured-model comparisons must measure these limits; deterministic provenance gates do not establish psychological truth.
