# OntoAgentic Architecture

This directory describes the architectural meaning of OntoAgentic.

These documents explain how the major systems fit together without prescribing one implementation.

The distinction is intentional.

OntoAgentic is an experimental architecture and many implementation mechanisms are expected to change.

## Experience and memory

Objective experience history, subjective Part memory, and memory development are distinct. See [Experience Digestion](../theory/EXPERIENCE_DIGESTION.md), [Memory Re-evaluation](../theory/MEMORY_REEVALUATION.md), and [State and History](STATE_AND_HISTORY.md). The governing rule is **digest first; re-open rarely**: ordinary cognition and sleep primarily use digested psychological traces, while objective ancestor replay is exceptional and interpreted by the current Part.

Future developers should preserve architectural meaning while remaining free to improve implementation.

## Recommended reading order

Before making a substantial architectural change, understand:

1. `SYSTEM_OVERVIEW.md`
2. `INVARIANTS.md`
3. the README for the subsystem being modified;
4. relevant documents under `decisions/`;
5. relevant lifecycle or integration documents.

`OPEN_QUESTIONS.md` identifies areas that are intentionally unresolved.

Do not treat an open question as an accidental omission.

## Documentation roles

The root `AGENTS.md` contains repository-wide development rules.

Subsystem `README.md` files define local ownership boundaries.

This directory describes how those subsystems compose into one architecture.

Decision records explain why important architectural choices exist.

None of these documents should be treated as requiring a particular class hierarchy, framework, database, prompt format, or algorithm unless explicitly stated.

## Subsystem documentation convention

As subsystem documentation evolves, README files should generally make the following information discoverable when relevant:

### Responsibility

What concept does this subsystem own?

### Non-responsibilities

Which tempting adjacent concerns explicitly belong elsewhere?

### Inputs

What kinds of information conceptually enter this subsystem?

### Outputs

What kinds of information conceptually leave it?

### Authority

What state or decisions is this subsystem authoritative for?

### Persistence

Which of its concepts must survive across sessions?

### History

Which changes should eventually be historically reconstructable?

### Inspection

What should a researcher eventually be able to observe about its behavior?

### Extension

Which mechanisms should remain configurable or replaceable?

### Open questions

What has intentionally not yet been decided?

These headings are a documentation convention, not a requirement for identical implementation structure.

Future developers should add them when useful.

## Infer implementation from contracts

Future implementation teams are expected to infer concrete software design from these documents.

The repository should explain the system well enough that a capable developer can decide what interfaces, classes, protocols, events, persistence mechanisms, and algorithms are appropriate.

If successful implementation requires undocumented architectural assumptions, improve the architecture documentation rather than relying on tribal knowledge.
