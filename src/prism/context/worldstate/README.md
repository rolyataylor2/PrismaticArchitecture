# WorldState Context

For each cognitive cycle, The Prism Agent Architecture creates one immutable WorldState snapshot.

Conceptually:

current external facts

    ↓

snapshot Wₙ

    ↓

canonical serialization

    ↓

reused by every Part evaluating cycle n

## Immutable cycle snapshot

Once Part evaluation begins, Wₙ must not change. If the external environment changes during processing, that change belongs to a future WorldState snapshot.

Conceptually:

Wₙ

-> cognition

-> selected action

-> environment changes

-> Wₙ₊₁

This prevents different Parts in one decision from reasoning from different realities.

## Canonical serialization

Equivalent WorldState should be represented deterministically where practical. Avoid random key ordering, nondeterministic object ordering, changing whitespace, irrelevant serialization-time timestamps, and dynamically generated prose whose wording changes while facts remain identical.

Stable serialization improves reproducibility, hashing, debugging, prompt-prefix reuse, and provider caching. The exact serialization format remains open.

Where feasible, place stable information in stable locations to reduce unnecessary token movement between cycles. A conceptual ordering is:

```text
WORLDSTATE

stable environmental facts
stable entities
stable relationships
current conditions
recent changes
current incoming event
```

This is a serialization optimization. It must not omit or distort facts or summarize differently for different Parts.

## No psychological content

WorldState context contains objective facts only. It must not contain Agent goals, Part goals, emotional interpretations, recommendations, salience labels, desired outcomes, or Identity preferences.
