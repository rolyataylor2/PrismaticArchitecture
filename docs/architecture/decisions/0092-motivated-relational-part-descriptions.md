# ADR 0092: Part descriptions express motivated relational meaning

## Status

Accepted, 2026-09-29.

## Decision

A Part name describes its own feeling, need, fear, or motivation in fewer than six words. An activity or mutation operation is not a useful Part name. Examples include `Need To Complete Homework` and `My Fear Of Dogs`.

A mission expresses what the Part believes best serves the complete Agent from its bounded, ego-centric perspective. A strategy expresses how it pursues that mission. A belief expresses the relational assumptions driving its interpretation. For example:

- Name: `My Need To Understand Others`
- Mission: `What best serves me is to pay attention to other people's openness.`
- Strategy: `Test other people's responses.`
- Belief: `Others may not want to be open to me.`

Ego-centric means anchored in the Agent's felt interests and relational reality; it does not require selfish behavior, universal defensiveness, or high emotional charge. Care, curiosity, ambition, recognition, and connection may serve the Agent in distinct ways. Parts need not converge on an objective account or one shared understanding of what serves the Agent. Self still chooses using Identity.

Generalized Parts use broad subjects such as others, people, or context-relevant classes. `The User` is an interface role, not the default subject of generalized psychology. Specific referents belong in Parts about the Agent's relationship with that person, place, thing, or context. Existing specific memories and developmental provenance remain intact. This extends ADR 0061 without flattening specific relational knowledge into generalized lessons.

## Implementation and development

New Part names and explicit name patches enforce the five-word limit. Reading existing state and audit history does not impose a retroactive name constraint. Meaning is guided by authoring instructions, editable cognition/evaluation/consolidation/formation prompts, and demo scaffolding; runtime code must not invent motives or automatically rewrite Parts to comply.

Changes to existing demo Parts are explicit researcher edits appending new versions. Learned state, IDs, ancestry, prior versions, and subjective memories are preserved. Renaming alone preserves identity. Deterministic mock labels remain fixture routing, not a cognitive taxonomy.
