# Decision Probabilities

The Prism Agent Architecture may use probabilistic decision models for several semantic judgments.

These probabilities are useful but must not be confused with psychological state.

## Activation Score

Represents a candidate Part's graded activation assessment against WorldState according to its trigger pattern. Each candidate has its own value; values are not normalized against one another. The permanent scale remains experimental.

It does not directly represent emotional intensity, fear, desire, Part strength, bid authority, or control. Binary proposition probability is a different semantic question.

## Arbitration probability

Represents the decision model's uncertainty among currently supplied actions.

It does not directly represent how strongly Identity wants something, how important a Part is, or how emotionally charged the Agent is.

## Useful roles

Decision outputs may inform a separate experimental activation policy, debate policy, inspection, debugging, calibration, experiment analysis, and inference-resource allocation.

## Psychology must be explicit

If a future experiment uses a decision probability as input to a psychological mechanism, that relationship must be explicit and independently documented. Do not silently equate epistemic uncertainty with emotion or motivation.
