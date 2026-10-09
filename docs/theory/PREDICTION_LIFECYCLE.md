## Constructed cognition refinement

[ADR 0129](../architecture/decisions/0129-progressive-disposition-cognition.md) governs production: predictions are optional products of each Part’s single independent cognition call; sufficient subjective episodes may also form from salient nonprediction experience. Older separate-gate and prediction-only rules below remain historical.

# Prediction Lifecycle

A prediction is a Part's prospective model of an unfolding experience. It may concern what an event means, what may happen next, how another entity may respond, an action's consequences, or when an uncertainty may resolve. It may precede a bid or be action-conditioned. Paired selected/non-selected forecasts are not required.

A Part may normally carry **at most one unresolved prediction**. If evidence arrives while one is open, the Part may continue, revise, resolve early, abandon, expire, or treat it as context-invalidated. Revisions preserve earlier versions rather than rewriting the original expectation. Routine cognition does not produce a fresh prediction merely because a cycle or token occurred.

Conceptual lifecycle:

```text
no open prediction → formation → open
→ continuation / revision / early resolution / abandonment / expiry / context invalidation
→ evaluation → possible episodic encoding and development → no open prediction
```

A meaningful prediction includes some notion of when it should become knowable. Its horizon may be seconds, days, or conditional; it is not the duration of an action and need not be a precise timestamp. Decisive evidence can permit evaluation before the expected horizon. Expiry without evidence is not automatically confirmation or contradiction.

Evaluation supplies preserved prediction-time context, later factual evidence, execution and interruption facts where relevant, and causal context. The owning Part interprets confirmation, partial confirmation, contradiction, ambiguity, and causes. Runtime may retain information needed to surface evidence, but prediction evaluation is Part learning, not generic scheduling or task automation. Representations, timing, and policies remain experimental.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](../architecture/decisions/0097-separate-prediction-inference-and-bounded-gates.md).

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.

ADR 0118 restricts prediction reflection to subtle append-only beliefs, mission-serving strategies, and How I think nuances. Part names and missions remain unchanged. Confidence shifts are tiny and linguistic; subjective beliefs may be false or formed from trusted testimony. Runtime preserves existing entries and rejects other prediction-driven Part edits.

ADR 0120 supersedes linguistic-only prediction confidence: Parts start at 100% beliefConfidence, gain 1 percentage point per correct resolved outcome and lose 5/12 point per incorrect one, clamped to 0–100%. Predictions support existing beliefs and inherit current Part confidence; subjective thoughts retain conviction. Additive learning and unchanged names/missions remain enforced.
