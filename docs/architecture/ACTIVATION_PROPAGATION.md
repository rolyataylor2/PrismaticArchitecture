# Activation Propagation

Under ADR 0098, Part cognition produces no cues and cannot dispatch another activation wave in the current cycle.

```text
Wₙ → candidate retrieval → independent Jev activation → Part thoughts
→ later Wₙ₊₁ with attributed, decaying thought history
→ candidate retrieval → independent Jev activation → Parts
```

Retained thoughts participate in high-recall vector candidate retrieval and the shared-state activation request. They remain subjective rather than world truth and never automatically activate a Part or grant authority. All activated Parts receive the same immutable snapshot. Private beliefs and memories remain owner-scoped; only expressed thought text is shared under ADR 0093. Self remains world-blind.

The earlier bounded-cue mechanism is recorded in historical ADRs; it is superseded for current runtime behavior by [ADR 0098](decisions/0098-cognition-products-and-next-cycle-thought-activation.md).
