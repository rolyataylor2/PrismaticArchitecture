# Activation Propagation

The Activator may operate in multiple waves. Initial activation begins from objective WorldState. Later candidate activation may also consider bounded internal Activation Cues produced by already relevant Parts.

```text
WorldState Wₙ → initial vector retrieval → recognition Parts
→ bounded contextual cues → additional candidate retrieval
→ reactive Parts → full Part cognition
```

WorldState remains unchanged throughout this process. Internal cues do not become WorldState. Cues can help the Activator consider another Part; they do not give one Part authority over another or access to its private memories.

Future propagation should support finite budgets, termination, duplicate suppression, cycle prevention, decreasing relevance, and urgency handling. Additional candidates remain subject to the same independent graded Jev activation semantics as primary candidates; propagation does not become a winner-take-all choice or a central attention controller. Inhibition and resource limits are open experimental capabilities, not a sovereign motivational executive, and exact mechanisms remain undecided.
