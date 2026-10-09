## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](../architecture/decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

# Activation Networks

Parts form a network of associations. Activation can begin with objective WorldState and propagate through learned relationships. The conceptual progression is:

```text
Recognition → Context → Reaction → Integration
```

This sequencing can reduce accidental priming by making specific contextual knowledge available before generalized emotional reactions. It is a conceptual progression, not a mandated sequence of inference calls. Urgent externally obvious triggers may bypass the normal ordering.

Under ADR 0098, expressed thoughts enter only a later immutable WorldState through attributed, decaying thought history. There is no same-cycle propagation. It grants no external authority and no direct access to another Part's private memory. Only expressed thoughts are shared under ADR 0093; private state is not exposed. Candidate retrieval and independent activation scoring still determine relevance rather than guaranteeing activation.

Higher-order phenomena such as attachment, culture, theory of mind, and metacognition may initially emerge from networks of learned Parts. They do not mandate separate monolithic subsystems.

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.
