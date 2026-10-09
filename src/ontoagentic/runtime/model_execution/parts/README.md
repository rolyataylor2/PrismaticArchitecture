# Part Execution

Part execution invokes each activated Part independently.

Each receives the same WorldState snapshot, its own persistent state, its own subjective memory, and an appropriate reasoning-model capability. Part execution may produce interpretations, thoughts, questions, contextual contributions, predictions, and/or bids as appropriate. Predictions may precede bids, and Part execution preserves continuity with its single open prediction. Part calls may eventually run concurrently, but completion order must not contaminate another Part's independent first-pass reasoning.

## Separate prediction inference (ADR 0097)

Part cognition produces no prediction draft. A separate Jev yes/no gate permits a separate owning-Part prediction generation request only when no prediction is open. Later Jev outcome checks return correct, incorrect, incomplete, or irrelevant. Only correct/incorrect dispatch generative reflection and possible subjective memory or learning; incomplete remains open, and irrelevant is versioned as invalidated without LLM reflection. Bounded classifications do not dictate psychological meaning. See [ADR 0097](../../../../../docs/architecture/decisions/0097-separate-prediction-inference-and-bounded-gates.md).
