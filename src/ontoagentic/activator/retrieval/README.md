# Activation Candidate Retrieval

Candidate retrieval is a performance optimization: it identifies Parts that might plausibly match objective WorldState before Jev evaluates activation. A vector database or semantic index is optional. Its purpose is primarily to reject obviously irrelevant Parts, and it should favor high recall.

```text
many stored Parts
        ↓
high-recall vector filtering + sticky unresolved Parts retained for consideration
        ↓
small candidate set
        ↓
shared-state Jev activation Scores
        ↓
actually activated Parts
```

False positives are cheap; false negatives may be psychologically consequential. The vector stage should generally err toward leaving uncertain Parts for Jev to evaluate. Sticky unresolved Parts may also be retained for consideration so retrieval does not make an ongoing concern disappear between cycles. They enter the same candidate pool; stickiness does not force activation or alter Jev's independent graded assessment. Vector similarity is not activation level, emotional charge, bid strength, importance, or control authority. Retrieval supplies candidate Parts only; Jev supplies each candidate's independent graded activation assessment.
