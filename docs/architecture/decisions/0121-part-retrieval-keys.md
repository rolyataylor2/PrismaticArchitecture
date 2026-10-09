# ADR 0121: Part retrieval keys

Status: Accepted
Date: 2026-10-02

## Decision

Parts may persist a list of retrievalKeys: descriptive words identifying what they contain, track, or serve, including categories such as Person, Pet, Animal, Method, or Entity. Keys supplement current triggers in vector candidate retrieval; similarity remains candidate selection rather than activation.

Retrieval keys are excluded from activation-scoring candidate records and template inputs, including custom Jev prompts. This narrows the complete-record scoring contract of ADR 0096. Triggers and other existing psychological scoring context remain available. The Settings → Prompts activation description reflects this boundary.

Keys are explicitly editable and versioned through ordinary Part mutations. Legacy snapshots without keys read as having no keys; history is never rewritten. Existing Parts are populated through researcher edits, not inferred psychological development. The inspector displays keys for the selected version.
