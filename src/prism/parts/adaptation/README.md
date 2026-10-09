# Part Adaptation

Changes an existing Part while preserving continuity. Important changes should be explicit structured mutations or patches for history and inspection.

Adaptation is primarily semantic. A Part may change wording, specificity, conditionality, trigger patterns, mission interpretation, strategy, confidence language, prediction style, memory interpretation, or cognitive sophistication without requiring one numeric strength value. Structured values may support operational needs, but should not replace positioned language.

Conceptually, the mutation protocol is:

```text
CURRENT PART VERSION
        ↓
cognitive evaluation
        ↓
PROPOSED MUTATIONS
        ↓
mechanical validation
        ↓
APPLY VALID MUTATIONS
        ↓
NEW PART VERSION
        ↓
update retrieval/index surfaces as needed
```

Model-produced structured mutation instructions are preferred over allowing inference to directly modify persistence storage. A Part may propose changes to its own belief, memory interpretation, trigger, or strategy; cross-Part changes, Identity, WorldState, and audit history require the appropriate authority and mechanism.
