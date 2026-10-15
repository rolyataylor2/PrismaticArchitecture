# ADR 0169: Speech-only Executive default

Status: Accepted, 2026-10-15.
Source: Researcher request that the Executive be on by default, only for speech.

## Decision

Default profiles enable the Executive and Speaking, with Tool execution disabled. This supersedes the new-profile default in ADRs 0155 and 0167. Agents without a saved profile use this default. Explicitly saved profiles retain their existing settings; legacy serialized profiles without enablement remain disabled, and missing module fields retain the ADR 0167 compatibility interpretation.

The existing master and module gates continue to control dispatch. Say/Ask may execute by default; operational tools, capability discovery, skills and checkpoint feedback require explicit Tool execution enablement. Wait retains its existing master-switch semantics. No new cognitive authority, inference task or automatic replay is introduced.

Factory prompt review: current Part prompts describe conditional supported execution; speech realization uses selected intentions and Identity only. Those responsibilities and access boundaries are unchanged, so no factory prompt or task catalog edits are required.

Validation covers default speech with tool context excluded, explicit master disablement, persisted configuration, legacy parsing and browser checkboxes. These are operational checks, not psychological hypotheses.
