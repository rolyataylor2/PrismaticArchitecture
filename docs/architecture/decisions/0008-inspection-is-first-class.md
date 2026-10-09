# ADR 0008: Inspection Is First-Class

## Decision

Inspectability is an architectural requirement.

## Reason

OntoAgentic is intended to support experimentation with cognitive development. Researchers must be able to understand why Parts activated, what they predicted, what they advocated, what actions occurred, and how Parts subsequently changed.

## Consequences

Important cognitive processes should eventually expose structured observable information. Inspection should not depend entirely on raw logs or hidden prompts.

## Flexible implementation

The event format, UI, storage, visualization, and instrumentation mechanisms remain open.
