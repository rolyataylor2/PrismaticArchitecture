# ADR 0038: One WorldState Snapshot Per Cognitive Cycle

## Decision

All Parts evaluating one cognitive cycle receive the same immutable WorldState snapshot.

## Reason

Differences in Part response should arise from psychology rather than environmental context drift. The same representation also enables efficient context reuse.

## Consequences

Environment changes occurring during cognition belong to a future cycle. The snapshot should be canonically identifiable.

## Flexible implementation

Snapshot representation and serialization remain open.
