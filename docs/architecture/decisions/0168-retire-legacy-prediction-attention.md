# ADR 0168: Retire legacy prediction attention

Status: Accepted, 2026-10-15. Source: researcher request to remove legacy prediction attention for new Agents, without a saved-Agent migration.

## Decision

Temporary Prediction-Bound Dispositions (ADRs 0138/0161) are the sole prediction-owned temporary relevance mechanism. Remove the legacy prediction `attention` target/cue field, synthesized activation scopes, and separate directory tiles. This supersedes ADR 0138's requirement to keep legacy attention readable as temporary scopes; earlier decisions remain historical records.

Predictions may propose zero or more `scaffolds`. These persist as versioned temporary dispositions with source prediction/version, origin thread/cycle, retrieval intent and evidence distinctions. Eligibility still requires an active disposition, an open source prediction, the originating thread and a later cycle. Ordinary independent activation, recall, Part cognition, world-blind Self, evidence preservation and offline usefulness-gated institutionalization remain unchanged.

## Compatibility and verification

No automatic migration or runtime fallback is provided for old live predictions containing `attention`; current writes and reads retain strict domain validation. Explicit researcher cleanup can append new prediction versions omitting the removed field and update affected prompt overrides. Historical prediction versions project only current schema fields for inspection and evidence selection; original stored bytes remain immutable. This read projection does not recreate attention scopes or admit legacy output. Historical ADRs and source evidence remain preserved.

Update factory prompts, versions, Settings task descriptions and deterministic fixtures together. Existing simulation experiments continue to exercise prediction-bound disposition formation, later-cycle eligibility, closure and learning through ordinary cognition. This cleanup introduces no new cognitive hypothesis or inference task. Executive checkpoint monitoring, activation budgets and Self's voluntary affect focus are separate mechanisms and are unaffected.
