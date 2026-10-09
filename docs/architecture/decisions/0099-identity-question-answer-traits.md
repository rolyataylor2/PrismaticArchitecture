# ADR 0099: Identity Question-and-Answer Traits

## Decision

Persistent Identity content is an ordered collection of Traits. Each Trait has a stable ID, an authored question, an authored answer, a list of context-search keywords, and an immutable UTC creation timestamp. Questions and answers have no prescribed categories or psychological schema. Empty keyword lists and empty Identity collections are valid.

Self reads these Traits as persistent self-definition while selecting among mediated Part proposals. Keywords support researcher context search; they neither grant authority nor introduce WorldState access or a new cognitive retrieval pipeline. Existing temporary masks remain separate contextual overlays, not Traits.

Researcher creation, editing, duplication and deletion append Identity versions. Duplication copies question, answer and keywords with a new ID and creation timestamp. Editing preserves ID and creation timestamp; deletion preserves earlier versions. These operations are privileged research edits, not environmental psychological development.

## Compatibility

This chooses the previously open representation in ADR 0020 while preserving ADRs 0023 and 0034. Legacy fixed-category content is converted losslessly into one Trait per entry, retaining category meaning in the question and keywords. A migration appends the converted current Identity; original version bodies remain immutable. Legacy history is interpreted on read with stable derived IDs and the Agent creation time as the best available original creation timestamp. The migration does not fabricate new psychological meaning.

Self arbitration and debate factory prompts, editable prompt variable descriptions, demo presets, storage and interfaces use the same representation. Existing custom prompt overrides remain researcher-authored and are not silently rewritten.


Researcher model-assisted authoring is specified separately in [ADR 0100](0100-researcher-identity-authoring.md).
