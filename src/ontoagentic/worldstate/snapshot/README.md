# WorldState Snapshot

A WorldState snapshot is the immutable factual environmental state used for one cognitive cycle.

A snapshot should eventually support concepts such as cycle identity, source identity, version, creation time where relevant, canonical serialized representation, and content fingerprint or hash. These are conceptual requirements rather than a fixed schema.

## One snapshot per cycle

All activated Parts in the same cognitive cycle must reference the same snapshot. Do not query the environment independently for each Part or allow Part execution order to change facts supplied to later Parts.

## Environment changes

External changes after snapshot creation belong to another snapshot:

```text
W₀ → W₁ → W₂ → W₃
```

## Reproducibility

Historical inspection should eventually determine which WorldState snapshot a Part used when producing a bid.
