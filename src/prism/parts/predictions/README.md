# Part Predictions

> A Part carries at most one unresolved prediction.

A prediction is a Part's prospective model of an unfolding experience. It may concern what an event means, what happens next, how an entity responds, consequences of an action, or resolution of current uncertainty. Predictions are not limited to behavioral bids and may precede a bid. A Part may propose an information-gathering action to test its expectation.

A meaningful prediction preserves Part-selected context before bounded recent history decays. While open, it may continue, revise with history preserved, resolve early, be abandoned, expire unresolved, or become context-invalidated. Prediction evaluation remains the Part's learning process, not generic task automation. A bid may refer to the Part's current prediction; do not require paired selected/non-selected forecasts or manufacture predictions to satisfy a schema.

See [context](context/README.md), [lifecycle](lifecycle/README.md), [evaluation](evaluation/README.md), and [attribution](attribution/README.md). The representation remains experimental.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](../../../../docs/architecture/decisions/0097-separate-prediction-inference-and-bounded-gates.md).
