# ADR 0109: Timestamped memory gists in activation descriptions

Status: Accepted
Date: 2026-10-01
Supersedes the three-memory limit in ADR 0104 and the factory full-field rendering rule in ADR 0096.

## Decision

Activation scoring receives every current subjective memory of each candidate as a timestamp and gist, scoped to its owning Part. The timestamp is the original memory formation time from the first immutable storage version, not an inferred time of the remembered event or its latest revision. Missing historical timestamps remain explicitly unknown. No historical memory contents or audit records are supplied to cognition through this timestamp lookup.

The factory activation template places these timestamp:gist entries inside the owning Part description and omits memory IDs and full memory content. It also omits Part version, schema version, associations, lineage and provenance from rendered descriptions; stored Part records and developmental history remain preserved. Part IDs remain required for Score routing.

When WorldState mentions time, activation considers the temporal relationship to memory formation and any event timing expressed in the gist. Recency does not automatically imply greater activation, and formation time is not assumed to be event time. Memories remain subjective, scorer-only context, never shared with other Parts or Self. Independent scoring, immutable WorldState, candidate retrieval, open-prediction context and primitive boundaries remain unchanged.

Settings → Prompts exposes the timestamp/gist context. Existing researcher template overrides retain their text; resetting activation selects the updated factory template. Requests grow with memory count; no truncation or relevance filter is applied to gists.
