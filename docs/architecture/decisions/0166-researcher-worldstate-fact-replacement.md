# ADR 0166: Researcher WorldState fact replacement

Status: Accepted, 2026-10-15.

The researcher requested tabbed current and past WorldState inspection with per-entry current add/edit/delete.

Current edits stage a complete external fact set. Submission creates a new immutable observation through the ordinary Agent runtime, with an optimistic latest-snapshot check. It does not edit a recorded WorldState, subjective context, memory, predictions or in-flight cognition. Self access remains unchanged. Empty replacement sets are allowed.

Replacement snapshots record an external fact context boundary. Later recent-fact assembly in that thread retains replacement facts and subsequent external records, excluding earlier context from automatic carryover. Historical evidence remains available to researchers and ordinary psychological memory retains its existing ownership. This boundary is external context management, not a psychological conclusion. Existing inference tasks and prompts retain their responsibilities and access; no prompt changes are required.
