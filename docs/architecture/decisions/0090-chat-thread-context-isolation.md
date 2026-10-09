# ADR 0090: Chat threads isolate conversation continuity while sharing learned psychology

## Status

Accepted, 2026-09-29.

## Decision

A chat cycle has a persisted thread association. Recent conversation facts, previous activation scores, Part sticky concerns, and bounded recent private thought traces carry over only within that thread. The browser's session list is a presentation of this association, not its runtime authority. CLI and simulation calls without a thread retain a separate unthreaded context.

The same Agent and Parts retain their identities across threads. Learned missions, beliefs, strategies, triggers, subjective memories, predictions, and Identity remain shared Agent psychology, as explicitly selected by the user. Thread isolation does not remove these learned influences or create independent Agents. The one-open-prediction-per-Part invariant remains Agent-wide.

Stickiness remains owned by its Part. Each thread holds that Part's current sticky concern; a fresh thread starts without an unresolved conversation concern. Thread-scoped stickiness changes are explicit Part mutations, advance the Part version, and preserve their projected state in immutable mutation events. Other Part fields persist as shared learning. The storage projection does not invent psychological meaning.

WorldState uses bounded incoming message and execution records from the same thread. A Part may also receive its own three most recent thought traces from that thread as private context. Other Parts cannot read those traces, and Self receives only the normal mediated contributions. Shared subjective memories remain distinct from these bounded conversation traces.

Brain inspection selects one thread and displays only its completed thought-generation keyframes and matching WorldState. Existing browser session memberships may be registered in a separate cycle-to-thread table without rewriting historical worlds or events. Old recorded cross-thread context cannot be undone retroactively; subsequent cycles obey the new boundary.

## Consequences

- New-thread greetings do not inherit another thread's conversation facts, activation baseline, sticky concerns, or private recent thoughts.
- Returning to a thread resumes that thread's continuity, including after restart.
- Shared learned psychology may still influence other threads intentionally.
- Agent Settings → Prompts documents the own-Part, same-thread recent-thought input. Factory Part cognition prompts render it; Self prompts remain world-blind.
