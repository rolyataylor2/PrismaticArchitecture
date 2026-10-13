# ADR 0161: Temporary Prediction-Bound Dispositions

Status: Accepted, 2026-10-12. Source: researcher request to rename the temporary relevance scaffold concept.

## Decision

The structures defined as temporary relevance scaffolds in [ADR 0138](0138-prediction-led-relevance-scaffolds.md) are named **Temporary Prediction-Bound Dispositions**. In ordinary prose, use **prediction-bound dispositions** once their temporary lifecycle is established. Relevance scaffolding describes their function rather than their formal name.

A Temporary Prediction-Bound Disposition is a persisted, versioned temporary disposition bound to a source prediction, expressing what evidence, memories, or distinctions may matter while that prediction remains unresolved. A prediction can propose zero or more such dispositions. Both Part-origin and gap-origin predictions can propose them; “bound” identifies the source prediction and lifecycle, without requiring an owning Part.

## Preserved responsibilities and lifecycle

This is a terminology change. ADR 0138's boundaries remain: later-cycle eligibility, ordinary independent activation and recall, ordinary Part construction against the shared immutable snapshot, relevance-only meaning, no bid authority from existence, world-blind Self, and offline evidence-gated institutionalization. Revision preserves previous versions. Resolution, abandonment, invalidation or expiry ends temporary eligibility while records, evidence and memories survive. Durable descendants require ended investigations and repeated recorded usefulness; prediction correctness alone is insufficient.

## Compatibility and presentation

Use the new terminology in current documentation, interface labels, editable factory prompts and Settings task descriptions. Historical ADR wording, audit/source documents and recorded evidence remain preserved. Existing serialized `scaffold`/`scaffolds` fields, schema symbols, IDs and simulation registry identifiers remain unchanged for compatibility. These names represent prediction-bound dispositions; this decision requires no saved-state migration or new inference task.
