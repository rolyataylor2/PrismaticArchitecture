# ADR 0088: Task prompts are editable, scoped, and versioned

## Status

Accepted, 2026-09-29. Revision history is superseded by [ADR 0094](0094-current-task-prompt-overrides.md).

## Decision

Researchers may edit the task prompt text used by inference providers. Prompt tasks have stable names and group labels. A persistent Agent may override its inherited global default; absent either edit, providers use the bundled factory prompt. Runtime code resolves prompts by Agent ID and task at each inference call, including bounded activation and arbitration.

Prompt edits and resets append immutable chronological revisions in SQLite. Resetting an Agent prompt returns it to global inheritance. Resetting one global prompt selects the bundled original. Reset-all appends a factory-default revision for every global prompt and an inheritance revision for every Agent and task. No revision is deleted.

Factory prompt text remains source-controlled provider configuration. Prompt text is not Agent psychology and does not alter Part, Identity, memory, or prediction state by itself.

## Consequences

- Prompt changes affect future inference requests for the selected scope.
- Global default edits affect all Agents that do not have a custom override for that task.
- Researchers can inspect the factory prompt and chronological custom/reset history per task.
- Reset-all applies across all Agents and preserves the complete earlier prompt history.
