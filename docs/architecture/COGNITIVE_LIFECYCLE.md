# Cognitive Lifecycle

The canonical lifecycle is:

```text
WorldState → Activator → activated Parts → interpretation / emotion / forecasts / proposals
→ bids → Self reads Identity → choice → Executive enactment → external outcome
→ later Part prediction evaluation → Part development
```

The Activator may use candidate retrieval as an optimization. Activated Parts receive WorldState and are the first psychological interpretation layer. Self receives bids and mediated answers, not WorldState. It may select quickly when the choice is clear or deliberate by questioning and mediating Parts when it is not. Attention may be an experiment but is not a mandatory post-bid stage.

Prediction evaluation and development occur when a Part's forecast becomes assessable. Simulation is an optional external environment that may produce WorldState and apply action consequences.

ADR 0123 adds scorer-only JEV memory candidate discovery as an alternative to vector filtering. Owner-scoped JEV recall selects exact current subjective memory versions for Part contexts against the same immutable snapshot. Cross-owner discovery does not grant private memory access to another Part, Self or primitives.
