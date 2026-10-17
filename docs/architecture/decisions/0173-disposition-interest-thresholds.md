# ADR 0173: Disposition interests determine activation thresholds

Accepted 2026-10-17. Source: researcher request and the supplied full transcript of
https://chatgpt.com/share/6ad3c178-74e4-83e8-82df-7972c9696b54.

Each disposition owns long-term interest in [0, 1] and short-term interest in
[-1, 1]. Neutral interests are zero. Runtime derives its threshold as
`clamp(2 - 0.45 * longTermInterest - 0.35 * shortTermInterest, 1.4, 2.35)`.
The neutral threshold and bounds are fixed safeguards; coefficients, tiny
selection increments, and elapsed-time half-lives are per-Agent settings.
Researcher editing changes interests, never a disposition's activation threshold.
Legacy threshold fields remain readable historical data, not current authority.
Legacy dispositions without interests start neutral; no interest is inferred from
their former thresholds, Identity, prediction accuracy, or activation counts.

Actual Self selections of action, navigation or affect proposals gently reinforce
their owning dispositions. Count each proposal once, and each disposition at most
once in a single committed decision. Activation, inference frequency, unselected
bids, maintained affect and continued execution do not reinforce interest. Sources
and prior versions are preserved. Identity influences selection through the
existing Self boundary, without a new identity-affinity inference.

Interest decays exponentially toward zero on the experience clock: immutable
WorldState capturedAt timestamps, never activation pass counts. Short-term decay
is faster by default (30 minutes versus 30 days for long-term interest). Reading
or inspecting state does not write decay versions. Selection materializes decay
and appends a version. Older observations cannot reverse the interest clock.

The transcript does not specify an available, validated signal for meaningful
learning, voluntary versus obligatory attention, goal progress or unproductive
engagement. Prediction correctness and repetition alone do not establish these.
Do not invent those judgments, automatic satiation penalties, or accuracy rewards.
Negative short-term interest is supported through researcher edits; future
evidence-backed outcome adaptation requires an explicit decision.

JEV continues its existing direct and optional association phases (ADR 0139).
No additional environmental or interest inference is added. Its candidate input
contains only relevance definitions and frozen association signals, without
thresholds, interests, interest timestamps or settings. Runtime compares final
scores against the derived threshold. Thresholds and interests are researcher
telemetry only; Self's affect and bid inputs receive none of them. Ordinary Part
context also excludes interest traces so they cannot leak through Part products.
Activation remains independent of admission budgets and behavior authority.

Settings → Activation adds a Disposition interests card for coefficients,
selection increments and half-lives; disposition editors expose both interests
and a read-only threshold preview. Exact assessment thresholds remain recorded
separately from provider inputs, preserving historical charts and analysis.

The Simulation Tests registry includes matched selected-engagement and passive
exposure protocols through ordinary cognition. Deterministic tests establish
arithmetic, persistence and access boundaries, not psychological validity.
