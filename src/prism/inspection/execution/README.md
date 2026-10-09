# Cognitive Execution Inspection

This subsystem exposes the observable structure of one cognitive execution cycle.

An illustrative activation trace may look like:

```text
VECTOR CANDIDATES
Paul · Cautious · Boundary Protector · Abandonment

JEV ACTIVATION
Paul                 3.8
Cautious             3.1
Boundary Protector   4.0
Abandonment          0.4

DERIVED RANK
1 Boundary Protector
2 Paul
3 Cautious
4 Abandonment

ACTIVATION POLICY RESULT
activated: Boundary Protector, Paul, Cautious
not activated: Abandonment
```

Illustrative values do not define a permanent scale. Inspection distinguishes vector similarity, activation Score, derived rank, policy result, emotional charge, bid strength, and prediction confidence.

A future execution trace should allow researchers to reconstruct:

- which WorldState snapshot was used;
- which Parts vector retrieval surfaced;
- per-Part graded activation Scores, derived rank, and activation-policy outcome;
- which Parts activated;
- which models each Part used;
- each Part's resulting contribution, which may be context or recognition without a behavioral bid;
- predictions;
- Self arbitration;
- deliberation rounds;
- selected action;
- inference cost and latency;
- scheduled prediction checks.
- selected action and external handoff status, including asynchronous progress where available;
- bounded recent factual continuity context, preserving which Part said or proposed what.

Inspection may see more operational information than Self. Inspection information must not automatically become cognitive context.
