# ADR 0115: Permanent researcher Agent deletion

Accepted, 2026-10-01. Supersedes ADR 0114 for new deletion requests.

An explicit researcher deletion permanently removes all records owned by the Agent: psychology, versions, memories, predictions, worlds, cycles, events, executions, consolidation, experiment reports, embeddings, thread state, settings, credentials and prompt overrides. Global settings and other Agents remain intact. This administrative operation is the narrow exception to storage history preservation; ordinary cognitive development and researcher edits continue to preserve history.

Deletion is atomic and rejected during running cycles, consolidation or pending/running execution. A transaction-local deletion marker permits immutable-record deletion only for the owning Agent; it is removed before commit. The browser confirms irreversible removal and clears its local thread metadata. Previously hidden Agents are not automatically purged on upgrade; explicit deletion can purge them. No inference tasks or prompts change.
