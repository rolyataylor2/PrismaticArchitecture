# ADR 0015: Emotion Is Inferred From Perspective

## Decision

OntoAgentic does not require a fixed symbolic taxonomy of emotions as the foundation of Parts. Emotional meaning may be inferred from a Part's beliefs, memories, mission, relationships, predictions, and current context.

## Reason

Language models already contain rich learned representations of human emotional experience. Reducing them to a small fixed set of labels could remove useful nuance.

## Consequences

Parts do not require a permanent `emotion` field. The full range of human affect should remain representable. Emotional significance may contribute to formation and adaptation.

## Flexible implementation

Experimental emotion taxonomies, dimensions, or classifiers remain allowed but optional.
