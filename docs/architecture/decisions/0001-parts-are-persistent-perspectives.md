# ADR 0001: Parts Are Persistent Perspectives

## Decision

A Part represents a persistent bounded cognitive perspective. It is not a temporary prompt or individual inference request.

## Reason

OntoAgentic is intended to study cognitive development over time. For Parts to develop, they need continuity across experiences.

## Consequences

Part identity must remain distinguishable from the model used to evaluate it. Part state may evolve. Part development should eventually be versionable and inspectable.

## Flexible implementation

This decision does not specify how Parts are stored, executed, prompted, learned, or represented internally.
