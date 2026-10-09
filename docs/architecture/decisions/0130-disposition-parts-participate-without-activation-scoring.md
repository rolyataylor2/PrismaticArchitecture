# ADR 0130: Disposition Parts participate without activation scoring

Status: Accepted, 2026-10-03. Requested by the researcher.

## Decision

Refines ADRs 0126 and 0129. Every current working Part formed or continued from an activated disposition participates in cognition without a second graded Part activation judgment or threshold gate. The same rule applies during optional post-deliberation refresh. Disposition scoring remains independent and entity-bound.

The separate generative perspective construction path remains available. Its unbound working Parts retain independent activation scoring. Primitives retain their independent appraisal scores and thresholds. Neither Self authority nor external execution changes.

For compatibility with existing activation records and cognition contexts, disposition Parts carry a fixed participation marker of 2 with previous 2 and delta 0, active true, and reason `disposition_participation`. This is not a measured activation level, emotional intensity or spike. Inspection must identify this marker as unscored participation. These Parts are omitted from bounded activation questions, and never emit activation spikes. Existing immutable history is preserved.
