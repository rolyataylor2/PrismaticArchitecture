# ADR 0068: Task Persistence Is Part Stickiness

## Status

Accepted.

## Decision

Long-running task persistence is primarily represented through persistent/sticky Parts rather than an Agent-level goal system.

## Reason

Motivation belongs to Parts. A task continues because the Part carrying that concern remains relevant across cycles.

## Consequences

Sticky unresolved Parts remain available for activation consideration, including when vector retrieval would otherwise omit them. Jev still determines current activation. Stickiness does not grant behavioral authority or guarantee selection.

## Flexible implementation

Stickiness dynamics and representation remain experimental. No global task manager, goal queue, or pinned-Part subsystem is required.
