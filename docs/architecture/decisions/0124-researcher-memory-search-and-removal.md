# ADR 0124: Researcher memory search, editing and removal

Status: Accepted, 2026-10-02.

## Decision

Agent Components → Memories is a privileged researcher search interface, initially empty. Explicit queries choose vector similarity or the existing bounded memory relevance capability. Searches may span the selected Agent's current subjective memories, with an optional owning-Part restriction. Searches do not run cognition, activate Parts, create experience, or expose results to Self or another Part. JEV search uses the existing editable memory relevance task with a search-purpose context, containing the explicit query and current time. This context is transient researcher input, never a committed cognitive WorldState. Scores retain their distinction from psychological activation; the UI displays vector similarity or normalized JEV relevance as the result's activation value.

The inspector displays exact memory contents, metadata, owner, formation timestamp, provenance and immutable version history. Researcher edits append versions with optimistic concurrency and researcher_edit origins; editable fields are gist, remembered content and selected context. Ownership, formation identity and ancestry are preserved.

Researcher deletion appends a memory version marked deleted. Normal memory listings, search, recall, activation context and consolidation exclude deleted records. Direct audit lookup and prior versions remain available, preserving prediction references and developmental history. No physical deletion or rewriting of older versions occurs. Existing memories without the optional deleted flag remain available. No storage schema migration is required.

## Boundaries

The interface owns no cognitive state. Search delegates to application services and replaceable providers. Memory scoring validation and batching are shared with cognitive recall; search writes no cognitive recall events. The existing memory relevance factory task and inspection description gain a search purpose, with no new inference role or expanded cognitive authority. Deleted memories cannot be edited through the ordinary researcher endpoint. Concurrent writes conflict rather than overwrite.
