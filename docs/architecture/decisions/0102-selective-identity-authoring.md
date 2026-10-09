# ADR 0102: Selective Identity authoring

## Decision

Extending ADR 0100, researcher generation accepts a nonempty, unique selection of known preset question IDs. Only selected questions are supplied to the answering model and exact coverage is validated for those questions. Runtime retains catalog keywords and roles. Omitted selection preserves legacy all-question generation.

The wizard initially selects all questions and offers Select all / Select none. Its checked-by-default Delete All Existing Traits option replaces the current collection; unchecking appends newly generated Traits while preserving existing IDs and content. Earlier versions remain immutable. Empty or invalid selection, inference failure, or a version conflict commits no changes.

These remain researcher authoring operations outside cognition. No cognitive access or Part formation mechanism changes.
