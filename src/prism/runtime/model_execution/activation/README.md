# Activation Execution

```text
Wₙ
 ↓
vector filter
 ↓
candidate Parts
 ↓
one Jev activation request
 ↓
per-Part activation Scores
 ↓
activation policy
 ↓
activated Parts
```

Jev evaluates all surviving candidates against the same immutable WorldState in one shared request when practical. Candidate Parts receive independent graded activation values and do not compete. Scores are not normalized; several Parts may score highly. Choice and canonical binary Noul judgments are not activation primitives. The runtime policy is a separate experimental stage.
