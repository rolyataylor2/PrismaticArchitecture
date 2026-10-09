# ADR 0067: Activation Uses Shared-State Independent Scoring

## Status

Accepted.

Supersedes ADR 0051 where it describes binary independent activation judgments.

## Decision

Part activation uses one shared semantic evaluation over a vector-filtered candidate set.

All candidates are evaluated against the same immutable WorldState.

Each candidate receives its own graded activation assessment.

## Principle

Activation is jointly contextualized but independently represented.

## Reason

OntoAgentic requires several Parts to be capable of strong simultaneous activation.

A winner-take-all Choice or normalized ranking would incorrectly force psychological competition too early.

Binary yes/no judgments also lose meaningful information about graded activation.

Shared evaluation preserves token efficiency while maintaining independent Part activation values.

## Consequences

Vector retrieval primarily removes irrelevant Parts.

Jev receives the surviving candidate Parts and WorldState together.

Jev produces one activation Score per candidate.

The runtime may rank these scores afterward.

Ranking does not define activation.

Activation values must not be normalized into a fixed total.

## Psychological boundaries

Activation Score does not automatically represent:

- emotional intensity;
- bid authority;
- motivation;
- prediction confidence;
- Identity congruence.

These remain separate concepts.

## Experimental concerns

Candidate-set composition may influence model outputs.

Future evaluation should test activation stability when irrelevant candidate Parts are added or removed.

## Flexible implementation

The permanent activation scale and runtime activation policy remain experimental.
