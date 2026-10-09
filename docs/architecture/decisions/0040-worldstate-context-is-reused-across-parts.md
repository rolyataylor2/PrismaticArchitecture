# ADR 0040: WorldState Context Is Reused Across Parts

## Decision

The canonical WorldState representation should be reused across activated Part inference whenever possible.

## Reason

Every Part must reason from identical external facts, and repeated processing of identical context wastes inference resources.

## Consequences

Context assembly should preserve reusable cache-friendly WorldState content. Provider-native prompt or KV caching should be exploited where available.

## Flexible implementation

Caching technology and provider-specific mechanisms remain replaceable.
