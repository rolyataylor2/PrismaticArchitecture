# ADR 0069: Parts May Carry Execution Order

## Status

Accepted.

## Decision

A Part's proposal may include a multi-step execution order.

## Reason

Persistent concerns often require several external actions. The sequence belongs to the Part's strategy rather than to a global planner.

## Consequences

Execution results return through WorldState and the Part may revise or continue its strategy during later cognition. Self remains the chooser at later decision points.

## Flexible implementation

Not every proposal needs an ordered sequence. No permanent representation or global execution graph is prescribed.
