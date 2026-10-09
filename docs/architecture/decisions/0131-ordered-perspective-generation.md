# ADR 0131: Ordered perspective generation

Status: Accepted, 2026-10-03. Requested by the researcher.

## Decision

Combine Cog 3 (construction), Cog 4 (evidence) and Cog 6 (initial cognition) into one generative request per disposition/entity binding, or one bootstrap request when no dispositions activate. Answer construction, independent support/contradiction evidence for each accessible memory, then cognition in that order within each returned perspective. No separate bounded evidence call or initial Part cognition call follows for these generated perspectives. Output ordering is part of the schema and factory prompt contract. No hidden reasoning is requested.

Distinct bindings retain independent requests and scoped chronological memories. A bound request preserves its disposition concern and may continue only its supplied working instance. Bootstrap may preserve distinct conflicting perspectives. Each product is validated before creation/continuation; runtime owns IDs, memory references, predictions, bids and storage. Evidence is subjective diagnostic strength, never a truth verdict or vote.

Disposition Parts participate directly (ADR 0130). Unbound generative Parts retain independent activation scoring; only active outputs become cognitive contributions. Existing unresolved instances omitted from construction may still receive ordinary cognition, and newly eligible post-deliberation contributors may require a later call. Pending predictions supplied to the combined request prohibit a second unresolved prediction. Self remains world-blind and execution external. Primitive cognition, perception, accessibility, disposition scoring, outcome evaluation and offline learning remain separate.

Settings → Prompts exposes one Cog 3/4/6 template. The old evidence factory template remains readable for historical judgments but is removed from Settings → Prompts; standalone cognition is labeled supplemental. Stored history and editable overrides are preserved; existing construction overrides must satisfy the new combined schema.

Combined generation occurs before later prediction outcome checks; an open prediction in that input prevents a new prediction even if it resolves later in the cycle. The primitivesFirst setting orders publication of generated Part contributions relative to primitive cognition; combined generation itself happens during construction.
