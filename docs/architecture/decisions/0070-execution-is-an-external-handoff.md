# ADR 0070: Execution Is an External Handoff

## Status

Accepted.

## Decision

After Self selects an action, OntoAgentic hands execution to the external environment or interface.

## Reason

Tool use, physical execution, asynchronous operations, and automation are environment capabilities rather than psychological subsystems.

## Consequences

External execution may be synchronous, asynchronous, or proceed in parallel with later cognition. Its status may later appear as objective WorldState. No Faculty subsystem is required.

## Flexible implementation

The external handoff mechanism is outside the psychological architecture and may vary by host environment.
