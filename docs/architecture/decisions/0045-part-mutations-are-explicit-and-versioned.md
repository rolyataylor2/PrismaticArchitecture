# ADR 0045: Part Mutations Are Explicit and Versioned

## Decision

Persistent Part changes occur through identifiable mutations producing new versions. Ordinary adaptation should not silently replace complete Part state.

## Reason

Explicit incremental change preserves continuity, provenance, inspection, and later reconstruction.

## Consequences

Rollback creates another historical version rather than deleting the versions being rolled back from. Runtime validates and applies semantic proposals but does not invent their psychological meaning.

## Flexible implementation

Patch representation and persistence mechanisms remain open.
