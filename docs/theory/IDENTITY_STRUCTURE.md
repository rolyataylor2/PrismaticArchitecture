# Identity Structure

Identity represents the persistent self-definition of an OntoAgentic Agent.

Self is different: it is the temporary whole-agent perspective assembled when integrative cognition is useful. Self does not replace or duplicate persistent Identity.

It answers questions such as:

"Who am I?"

"Who do I want to be?"

"What kind of behavior feels like mine?"

"What principles or qualities do I want my choices to express?"

## Possible Identity content

Identity may eventually represent concepts such as:

- attributes;
- values;
- roles;
- commitments;
- preferences;
- aspirations;
- self-descriptions;
- behavioral ideals.

These concepts are expressed through authored question-and-answer Traits, with context-search keywords and creation timestamps (ADR 0099). The collection has no fixed psychological categories.

## Aspirational Identity

Identity is not limited to statements describing current behavior. An aspiration may remain part of Identity after an incongruent action.

## Identity is not evidence about the world

Identity does not need to contain danger predictions, remembered external events, probability estimates, specialized world models, or every active goal. Parts provide much of this information.

## Identity is not static

Identity has continuity but can develop through sustained experience and introspection.

## Identity versus behavior

Behavior is evidence about Identity but is not automatically identical to it. An Agent may choose something inconsistent with how it wants to behave, and the discrepancy can become developmentally important.

Identity Trait roles (ADR 0101): only `self_definition` Traits are supplied to Self. `autobiographical` Traits are researcher-authored background stored alongside self-definition, not authoritative autobiography or shared Part memory. Runtime filters them before arbitration and debate; no Part access is added.
