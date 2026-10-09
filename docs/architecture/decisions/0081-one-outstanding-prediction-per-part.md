# ADR 0081: One Outstanding Prediction per Part

## Decision

A Part should normally maintain at most one unresolved prediction. New evidence continues, revises, resolves, abandons, expires, or invalidates the existing prediction rather than accumulating simultaneous forecasts.

## Consequences

Revision preserves prior expectations. Exact representation and lifecycle policy remain open. This is Part learning, not a generic scheduled-task system.
