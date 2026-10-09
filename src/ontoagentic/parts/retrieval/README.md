# Part Retrieval

Identifies potentially relevant Parts before activation or inference. Retrieval asks which Parts might matter; activation asks how strongly; bidding asks what they want.

## Part retrieval surface

Parts may expose a searchable active retrieval surface derived from mission, triggers, relational anchors, current beliefs, relevant memories, and current specialization. Historical/provenance material may be retained for inspection and explicit recall without automatically entering this activation surface. In particular, a person named only as the source of a generalized lesson is not thereby a current trigger. The active surface helps candidate discovery; it is not the Part's complete psychological state and vector similarity does not equal activation.

The canonical path remains:

```text
Objective WorldState
    ↓
cheap vector candidate retrieval
    ↓
shared-state Jev activation Scores (one independent graded value per candidate)
    ↓
actual activation
```

Object presence alone is not a reason to form or retrieve an object-anchored Part. Cognitive significance is required.

See [Generalization and Specificity](../../../../docs/theory/GENERALIZATION_AND_SPECIFICITY.md) for the distinction between current retrieval information and historical provenance.

ADR 0121: Parts have optional descriptive retrievalKeys for vector candidate retrieval alongside triggers. Keys never enter activation scoring; the inspector and editor expose versioned keys. Legacy versions without keys remain readable.
