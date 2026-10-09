# ADR 0037: Simulation Is Outside the Agent Engine

## Decision

Simulation is an optional external environment and training subsystem, not part of the canonical cognitive runtime.

## Consequences

Simulation interacts through WorldState and actions and must not become a dependency of Parts, Self, Identity, Activator, or bidding. Engines and adapters remain replaceable.
