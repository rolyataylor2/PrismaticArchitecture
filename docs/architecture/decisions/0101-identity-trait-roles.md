# ADR 0101: Identity Trait roles and autobiographical authoring context

## Decision

Traits carry an explicit `role`: `self_definition` or `autobiographical`. The Identity authoring collection may store both, but only self-definition Traits guide Self. Autobiographical Traits preserve researcher-authored background, relationships, experiences, and detailed psychological or behavioral descriptions; they are not authoritative world truth or shared Part memory.

Runtime context assembly excludes autobiographical Traits before Self arbitration, debate, inspection of Self input, and Self prompt previews. Editable prompts cannot recover excluded Traits. Parts may still express relevant history through ordinary attributed contributions. No new Part access, formation mechanism, or ongoing synchronization with authored background is introduced.

Every preset has an authored role. Preset selection and model-assisted generation copy it deterministically; the answering model does not classify or override roles. Broad self-descriptions, values, preferences, commitments and aspirations use self_definition. Biographical inventories, relationship-specific judgments, detailed reaction patterns and portrayal instructions use autobiographical. Mixed questions are classified conservatively as autobiographical. Researchers may explicitly change a Trait role through versioned editing.

Existing Traits without a role read as self_definition, preserving previous cognitive behavior and immutable stored history. Existing living psychology is not silently recategorized from question wording. New custom Traits default to self_definition. Duplication preserves role.

## Consequences

This extends ADR 0099's authoring representation without expanding Self's cognitive access. Identity self-definition remains distinct from biography and private Part psychology. Future use of autobiographical material for Part initialization requires a separate explicit design. Classification describes cognitive use, not truth, diagnosis, emotional intensity or permanence.
