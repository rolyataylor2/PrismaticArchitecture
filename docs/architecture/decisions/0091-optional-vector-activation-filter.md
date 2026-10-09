# ADR 0091: Per-Agent vector filtering can be disabled

## Status

Accepted, 2026-09-29.

## Decision

A persisted per-Agent activation setting controls whether high-recall vector filtering runs before independent shared-state activation scoring. It defaults to enabled. When disabled, every active-lifecycle Part becomes a candidate without computing or reading embeddings. Dormant and archived Parts remain excluded. The configured bounded decision provider (initially Jev) still scores each candidate independently against the same immutable WorldState; the ordinary activation policy still applies. This extends ADR 0067 with an optional bypass of approximate retrieval, not winner-take-all activation.

The runtime captures the setting once per cycle and uses it for every activation wave. Edits apply to subsequent cycles. Settings → Activation exposes the switch independently from provider credentials and editable task prompts. The switch does not select or change the decision provider.

## Inspection and prompts

Candidate events retain their existing shape. A `vector_disabled` reason identifies bypassed filtering; similarity is zero as an unused placeholder, not a measured similarity. Activation prompts and task responsibilities remain unchanged: they receive the candidate set and shared WorldState and request independent Scores. No cognitive access boundary expands.
