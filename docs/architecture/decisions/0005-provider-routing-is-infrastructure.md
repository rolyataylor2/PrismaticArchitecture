# ADR 0005: Provider Routing Is Infrastructure

## Decision

Model providers and routing remain beneath the cognitive architecture.

## Reason

Persistent cognitive entities should not be defined by whichever model happens to execute inference.

## Consequences

Provider-specific details should remain behind OntoAgentic provider interfaces. Routing selects resources rather than motivation or behavior.

## Flexible implementation

Provider libraries, model vendors, routing algorithms, and resource policies may change.
