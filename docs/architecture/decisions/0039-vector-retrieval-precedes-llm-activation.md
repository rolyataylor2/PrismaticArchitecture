# ADR 0039: Vector Retrieval Precedes LLM Activation

> Historical wording in this record referred generically to an LLM. The current execution model uses shared-state independent Score-style activation; see ADR 0067.

## Decision

Large Part populations may first be narrowed through approximate semantic retrieval before psychological activation is evaluated.

## Reason

Running activation inference against every stored Part would become increasingly expensive as Agents develop.

## Consequences

Vector similarity identifies candidates only. An LLM or other activation mechanism determines actual triggering.

## Flexible implementation

Vector databases, embedding models, candidate counts, and activation decision models remain replaceable.
