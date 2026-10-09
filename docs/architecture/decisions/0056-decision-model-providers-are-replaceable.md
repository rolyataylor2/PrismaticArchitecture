# ADR 0056: Decision-Model Providers Are Replaceable

## Decision

Jev is the initial decision-model provider, not part of OntoAgentic's cognitive ontology.

## Reason

The architecture should survive changes in external model technology.

## Consequences

Activator and Self arbitration depend upon an OntoAgentic decision capability rather than TypeSafe-specific domain objects.
