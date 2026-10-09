# ADR 0086: Local TypeScript runtime and explicit cognitive contexts

## Status
Accepted implementation decision, 2026-09-28, following the requested Node.js/TypeScript implementation.

## Decision
Implement the executable demo in strict TypeScript on Node 24, retaining existing architecture documentation and Python subsystem scaffolding. Use npm and SQLite through Node's embedded driver for local persistence. Domain contracts do not import that driver.

Current entities and immutable versions are separately stored. Version writes use optimistic concurrency and transactions. Research edits, seeds, cognition, prediction evaluation and consolidation have distinct origins. Rollback appends a version and preserves developmental ancestry.

Cognitive providers receive explicitly assembled immutable value contexts, never repository handles. Part input contains the same frozen WorldState plus only its own psychology. Self input contains Identity and mediated contributions only. Research inspection has separate privileged access.

## Experimental defaults
Activation initially uses a configurable 0–4 graded scale with a default cutoff of 1.5; vector retrieval uses a low cosine cutoff of 0.05 to reject near-zero matches while favoring recall. The local hash embedding is a labeled development approximation, not a semantic embedding model. Stickiness retains unresolved concerns among candidates and has no selection authority. Prediction horizons are descriptive with an optional expected evaluation cycle; later evidence can resolve predictions early. Bounded recent context and debate budgets are operational choices, not psychological laws.

## Consequences
No Python runtime is replaced because none exists. Node's SQLite API may issue an experimental warning. Schema migrations allow future representation changes. Deterministic inference must be labeled mock and cannot be presented as Jev or empirical psychological development. Real provider integration remains replaceable.
