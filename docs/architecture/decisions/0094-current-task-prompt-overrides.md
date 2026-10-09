# ADR 0094: Store only current task prompt overrides

## Status

Accepted, 2026-09-29. Supersedes the revision-history portion of ADR 0088.

## Context

Prompt revision history adds persistent storage and Settings UI that researchers do not need. Current Agent and global prompt overrides still need to survive restarts, and reset operations still need clear inheritance behavior.

## Decision

Store at most one custom prompt override for each task at each scope: global, or one Agent. An Agent override takes precedence over the global override, which takes precedence over the bundled factory prompt. Reset deletes the override at that scope. Reset-all deletes every override.

Do not retain prompt edit/reset history in storage or expose a revision timeline in Settings. Migrate existing databases by retaining only each scope/task's latest custom prompt, then remove the obsolete revision records.

Factory prompt text remains source-controlled provider configuration. Prompt text does not alter Part, Identity, memory, or prediction state by itself.

## Consequences

- Prompt saves replace the current override for their scope and task.
- Agent resets reveal the current global override or factory prompt; global resets reveal the factory prompt.
- Prompt edits and resets leave no historical revision trail.
