# Routing

Routing decides which available model or provider should service an inference request. It is separate from provider communication and selects computational resources; it does not decide what the agent wants.

Cognitive callers should request capabilities such as `bounded_semantic_decision`, `generative_part_reasoning`, or `generative_self_reasoning`. Initial routing may map bounded semantic decisions to Jev and generative capabilities to configurable language models, but this mapping does not belong in Part objects or the cognitive ontology.
