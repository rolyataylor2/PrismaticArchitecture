# ADR 0051: Activation Uses Independent Bounded Judgments

## Status

Superseded by [ADR 0067](0067-activation-is-shared-state-independent-scoring.md) where this record describes binary independent activation judgments. The historical decision below is retained.

## Decision

Candidate Parts are individually judged for trigger applicability. Activation is not a relative winner-take-all classification.

## Reason

Several psychologically relevant Parts may activate simultaneously.

## Consequences

Each candidate receives an independent activation probability. Vector retrieval narrows candidates but does not determine activation.
