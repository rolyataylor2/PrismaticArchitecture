# ADR 0007: Presets Are Not Living State

## Decision

Presets define reusable starting conditions. Persistent runtime state represents what a particular Agent or Part has become.

## Reason

OntoAgentic studies development. Mutating the original definition would destroy the distinction between initial conditions and learned state.

## Consequences

Living entities may diverge substantially from their presets. Experiments should be able to reuse the same initial preset repeatedly.

## Flexible implementation

The configuration and serialization formats remain open.
