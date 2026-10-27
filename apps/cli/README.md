# CLI

## Single online loop (ADR 0128)

Application cognition always constructs temporary working perspectives. The previous runtime and candidate filtering are isolated in historical test fixtures, with no production import or selectable online fallback. Consolidation, structural Part-development facilities, their prompts and inspection remain available. The historical `architecture` field now identifies only the offline consolidation profile; browser selection belongs to Experiments → Dream. Online Activation exposes accessibility, deliberation re-evaluation and primitive ordering, with no vector or memory-owner discovery switches.


## Constructed revision

New CLI Agents use constructed perspectives. CLI creation has no alternate online-loop flag. Existing list/show/history commands retain retired Part inspection; reactivation of retired constructed instances fails with an explicit reason.

Local researcher commands invoke shared application services. The CLI may inspect privileged audit state; this grants no additional cognitive access to Self or Parts.

CLI exit cancels and settles local Executive workers before disconnecting MCP and closing storage. Background work can continue while an interactive/watch process stays alive; a standalone command does not leave a worker daemon behind. Interrupted saved work is never automatically replayed.

The optional `tsx apps/cli/src/embodied-session.ts PRIVATE_CONFIG_JSON` entrypoint owns existing embodied Agents in one private database. Its JSONL `status`, `observe` and `seal` commands coordinate an external episode driver. Config supplies `databasePath`, per-Agent `endpoint`/`threadId`/`expectedSnapshotId`, and optional bounded `drainTimeoutMs`. `seal` closes admission, pauses further activation, drains accepted work and closes Application/storage before returning cursors and exiting normally. The coordinator must observe both that response and exit code zero before snapshotting. It does not seed Agents, change settings, resume old work or capture external workspace/credential files. See [ADR 0183](../../docs/architecture/decisions/0183-embodied-session-process-boundary.md).
