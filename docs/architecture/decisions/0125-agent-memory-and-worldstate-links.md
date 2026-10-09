# ADR 0125: Agent memory storage and overlapping WorldState ancestry

Status: Accepted, 2026-10-03.

## Decision

Subjective memories are Agent-owned versioned records, separate from the immutable WorldState timeline. A memory's `ancestorIds` identifies the particular WorldState snapshots involved in its formation. These sets may overlap, span nonconsecutive snapshots, or be empty for existing records; there is no fixed event grouping or one-memory-per-snapshot rule. WorldState records observations and attributed subjective thoughts, not omniscient truth.

`partId` remains immutable formation attribution for compatibility. `referencingPartIds` records explicit Part references to a memory, independent of its originating Part. Missing references on legacy records mean the originating Part alone. Explicit empty references retain the memory without making it available to a Part. Reference changes append memory versions; original text, ancestry and earlier references remain inspectable. All references belong to the same Agent. Archival does not delete memories or WorldStates.

Ordinary Part recall uses explicitly referenced subjective records. Explicit reference is the narrow exception to ADR 0016's ownership boundary; unrelated private beliefs and other Part state remain inaccessible. Shared interpretation text does not become authoritative truth. Self remains world-blind and receives no raw memories or ancestor snapshots. Ancestry is provenance, not automatic recall access.

Formation, prediction evaluation and lifecycle behavior are unchanged. Existing formation continues to attribute and initially reference its proposing Part. Consolidation edits remain restricted to the originating Part; a reference does not grant mutation authority. Historical opaque ancestry remains readable. WorldState references added when editing an existing memory must resolve to same-Agent snapshots. Initial legacy/import records without explicit Part references may retain opaque ancestry; new explicit-reference records require real source snapshots. Existing formation continues to supply real WorldState IDs.

## Consequences

The timeline and subjective accounts survive independently of active Part population. Multiple memories can cover overlapping portions of the timeline, and multiple Parts can reference one interpretation without copying it. This establishes storage and compatibility only; automatic reference selection and new memory formation policies are deferred.
