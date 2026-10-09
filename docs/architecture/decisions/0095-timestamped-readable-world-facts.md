# ADR 0095: Timestamped, readable WorldState facts

## Status

Accepted, 2026-09-30.

## Decision

New WorldState facts carry a timestamp recording when the external statement or observation was supplied. Dialogue uses `says`, observations use `observes`, and actions use `does`. Factory prompts show timestamp, source, plain-English kind, and content. Prior dialogue keeps its original speaker, kind, and timestamp; historical inclusion does not change it into a `prior_output` fact.

Opaque execution identifiers remain provenance metadata. Execution status descriptions must identify the action in ordinary language. Completed dialogue contributes the actual spoken words without an additional generic completion fact. Pending, running, failed, and otherwise outcome-free completed operations may supply factual status describing the action.

Facts introduced by a cycle retain `originCycleId` for transcript assembly, so copying a fact into subsequent snapshots does not duplicate it. This is provenance bookkeeping, not Agent memory.

Older immutable snapshots remain stored as originally recorded. Legacy fact kinds are interpreted on read. History assembly derives missing timestamps from the original snapshot or execution record when available; an unavailable time remains unknown rather than being invented. New external facts receive timestamps at ingestion if their source omitted one.

WorldState remains immutable within a cognitive cycle and contains no psychological interpretation. Self remains world-blind. Custom prompt overrides remain editable and are not silently rewritten.

Researcher preview normalizes legacy speaker labels and excludes obsolete operation-ID placeholders from rendered sample context. Raw persisted audit records remain unchanged.
