# ADR 0004: World State Is Authoritative

## Decision

Simulation world state represents authoritative external reality. Narration and model generation do not independently create facts.

## Reason

Long-running simulations require consistency between objects, people, locations, events, resources, and consequences. Language models may hallucinate plausible but nonexistent facts.

## Consequences

State-changing proposals must pass through simulation mechanisms before becoming reality. Agent beliefs may disagree with authoritative world state.

## Flexible implementation

The specific world representation and validation system remain open.
