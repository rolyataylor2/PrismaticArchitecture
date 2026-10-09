# Identity Model

This directory concerns the domain representation of the persistent Agent self-definition.

Identity content is an ordered collection of Traits with a stable ID, question, answer, context-search keywords and immutable UTC creation timestamp. Questions and answers have no fixed psychological categories. Researcher edits append Identity versions; duplication creates a new ID and timestamp, and deletion preserves history. See ADR 0099.

Identity should not absorb subjective Part memories, specialized predictions, Part missions, or provider configuration. Identity is persistent and developmental.
