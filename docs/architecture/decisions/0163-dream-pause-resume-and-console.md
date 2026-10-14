# ADR 0163: Dream pause, resume and execution console

Status: Accepted, 2026-10-13. Researcher request: resume dreams, show progress and play/pause controls, and inspect a live/historical console.

Extends ADR 0159. This is external experience-run coordination, not an Agent task manager or a cognitive task. No inference inputs, prompts or Self access boundaries change.

Pause is cooperative at stage boundaries. A pending pause finishes the current ordinary experience/sleep stage; paused runs have no live worker. Completed stages and their frozen evidence are never replayed. Paused state persists across restart and retains exclusive ownership of the dream Agent until resume. Failed dreams can be explicitly resumed from their first incomplete stage using the preserved Agent state. Resume requires disconnected Executive, no live Agent work or competing dream, and unchanged paused/terminal psychology. A resumed attempt records current engine/provider/prompt provenance; history is never rewritten to imply identical configuration.

Completed experience cycles in an interrupted stage are reused, not delivered again. An interrupted incomplete cognitive cycle may be retried explicitly; partial development remains preserved and the console identifies the retry. Completed sleep within an interrupted stage is recognized from stage-scoped events. Failed sleep can be retried over preserved state; this is not rollback or guaranteed identical replay. Restart never automatically resumes experiences. The same dream ID/thread/Agent and initial snapshots remain; terminal snapshots update with preserved resume receipts.

The console is a read-only chronological projection of persisted, run-attributed events, with bounded incremental pages, timestamps, stage/task names and reasons for errors or rejected learning. Current task comes from actual in-flight provider operations, not invented percentage estimates. Progress counts completed scenario stages out of the frozen protocol; model calls have no estimated completion percentage. Historical output remains available after completion/failure and console polling stops when closed or its page is detached. Privileged audit inputs and provider request bodies are not placed in the console or cognition.

Deterministic tests cover pause while inference runs, repeated resume exclusion, restart preservation, stage continuation, failed sleep retry without duplicate completed experience, source isolation, changed-state rejection, ordered console history and desktop/mobile controls. These verify coordination and presentation, not psychological hypotheses.

Factory prompts and Settings task descriptions were reviewed: this external run-control/inspection change adds no inference tasks and changes no cognitive responsibilities or access, so existing prompts remain unchanged. Resumption provenance participates in configuration grouping so mixed attempts are not silently pooled with uninterrupted runs.
