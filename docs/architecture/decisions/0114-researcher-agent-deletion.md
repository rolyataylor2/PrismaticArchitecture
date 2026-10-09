# ADR 0114: Researcher Agent deletion

Accepted, 2026-10-01.

Agent Settings may delete an Agent through the researcher API. Deletion is a persistent tombstone: the Agent disappears from selection and ordinary access fails, including new cognition and edits. Existing psychology, immutable versions and audit records remain preserved in storage. This is researcher administration, not psychological archival or cognitive development.

Deletion is atomic and rejected while a cycle, consolidation or external execution is pending or running. Saved Agent credentials and current prompt overrides are removed. Global settings and other Agents are unaffected. The browser confirms deletion and clears local thread metadata before selecting another Agent or offering creation.
