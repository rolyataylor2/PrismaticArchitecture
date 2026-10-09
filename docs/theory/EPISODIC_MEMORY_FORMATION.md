## Constructed cognition refinement

[ADR 0129](../architecture/decisions/0129-progressive-disposition-cognition.md) governs production: predictions are optional products of each Part’s single independent cognition call; sufficient subjective episodes may also form from salient nonprediction experience. Older separate-gate and prediction-only rules below remain historical.

# Episodic Memory Formation

Meaningful Part-specific episodes may be encoded during waking cognition, under ADR 0098 only when prediction evaluation connects a preserved experience with later evidence:

```text
salient experience → gated prediction formation
→ later outcome → Part evaluation → subjective episodic memory
→ later sleep/consolidation
```

Under ADR 0098, prediction outcome reflection is the only ordinary waking encoding path; earlier nonprediction encoding guidance is superseded. Strong confirmation, contradiction, partial or ambiguous outcomes, salient unexpected events, activation spikes, conflict, and unusual success or failure may each create an encoding opportunity. A spike or prediction does not guarantee a memory.

A prediction-based episode may draw on the Part-selected prediction context, what later happened, the Part's evaluation and causal attribution, and what the experience means to that Part now. It is not a copy of WorldState or prediction capsule alone. Different Parts may form different memories from one objective event, without forced reconciliation. Preserve subjective ownership, directly retrievable current content, immutable prior versions, and opaque ancestry linking memory to prediction/experience where useful.

Memory may support layered retrieval (gist, context, episode, interpretation/development), but no permanent representation is selected. Sleep primarily consolidates already formed episodes into broader patterns. Generalization does not delete its episodic evidence. Objective history remains secondary evidence and is not ordinary autobiographical memory.

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.
