# ADR 0050: Code Owns Cognitive Workflow

## Decision

Deterministic runtime code owns OntoAgentic execution sequencing. Models perform bounded decisions or semantic reasoning inside that workflow.

## Reason

No inference model should silently gain authority over cognitive architecture or external execution.

## Consequences

Models return results. Runtime code validates and routes those results to the next architectural stage.
