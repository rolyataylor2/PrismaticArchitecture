# ADR 0006: History Is Not Storage

## Decision

History and storage are distinct architectural concepts.

## Reason

Persistence answers how state is saved. History answers how states relate through change. OntoAgentic requires developmental ancestry, comparison, rollback, and branching beyond basic serialization.

## Consequences

The cognitive-history domain model should remain independent from one database or Git implementation.

## Flexible implementation

The underlying persistence and versioning technologies remain open.
