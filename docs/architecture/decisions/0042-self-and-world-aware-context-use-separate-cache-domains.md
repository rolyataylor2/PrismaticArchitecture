# ADR 0042: Self and World-Aware Context Use Separate Cache Domains

## Decision

Self inference must never reuse a cached context containing WorldState.

## Reason

Self is intentionally world-blind and understands circumstances through Parts. A caching optimization must not accidentally bypass this cognitive boundary.

## Consequences

World-aware and Self contexts require logically separate cache domains.

## Flexible implementation

Cache namespace implementation remains open.
