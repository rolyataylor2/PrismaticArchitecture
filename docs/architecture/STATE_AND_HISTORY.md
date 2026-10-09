# State and History

The Prism Agent Architecture distinguishes current state, starting configuration, persistence, and history. These concepts must not collapse into one another.

## Preset

A preset describes a reusable starting condition, such as Part, identity, Agent, or simulation configuration. It does not represent what a living entity has become.

History should preserve Identity-development episodes rather than overwrite prior self-definitions. Researchers should eventually be able to compare versions, their conflicts and proposed changes, deliberation, resulting Identity, and later consequences.

## Live and persistent state

Live state represents an entity at the current point in execution. Persistent state allows live development to survive process boundaries and future sessions.

## Historical state, storage, history, and lineage

Historical state represents earlier versions and ancestry. Storage answers how states are persisted. History answers what changed relative to previous state and how versions relate. Lineage describes developmental ancestry between distinct Parts resulting from splitting, merging, specialization, or succession.

## Desired long-term capabilities

The architecture should eventually allow snapshots, diffs, named checkpoints, restoration, branches, alternate histories, ancestry, replay, and comparison. An Agent might be restored to age eight, undergo a different experience, and produce a branch comparable with the original adult Agent.

Rollback changes active state, but should not imply that knowledge of the abandoned branch must be destroyed. The exact persistence mechanism remains undecided.

## External event history

This is a record of what the simulation or external environment says occurred.

## Cognitive memory, cognitive history, and audit history

Cognitive memory is what the Agent or a Part can remember and use. Cognitive history records how internal state changed. Audit history is a privileged technical record for developers or researchers, potentially more complete than the Agent's subjective knowledge. Audit history is not automatically exposed to Self.

The architecture distinguishes at least four related histories:

- **World/experience history:** what objectively happened.
- **Part memory history:** what a Part remembered, including its current subjective content.
- **Memory version history:** how that remembered meaning changed across immutable versions.
- **Part development history:** how the Part itself changed over time.

These histories are related through provenance and ancestry but are not interchangeable. Objective ancestry does not make an event an ordinary recall source.

## Subjective Part memory

This is a stored subjective interpretation formed by a particular Part, independently referenced by Parts under ADR 0125. It may span overlapping WorldState snapshots rather than a fixed event group.

## Memory-development history

This describes how a Part's representation of an experience changed through time. These are separate historical dimensions and future inspection should be able to compare them.

```text
WORLD HISTORY: 3:42 PM — person left building
PART A, version 1: "They abandoned us without warning."
PART A, version 5: "They left suddenly. I assumed it was abandonment."
PART B: "They said earlier that they needed to leave for work."
SELF CURRENT RECONSTRUCTION: "Part A remembers abandonment; Part B remembers a stated work reason. I do not have an objective event record to settle this."
```

For Parts, future architecture should keep distinct:

```text
current Part state
Part state versions
individual semantic mutations
subjective memory versions
lifecycle lineage
external event history
```

These should not collapse into one generic log. Current state belongs to Parts; historical change and ancestry remain separate domain concepts.

## Agent memory storage (ADR 0125)

Subjective memories are Agent-owned records. Immutable `partId` attributes formation; explicit `referencingPartIds` controls Part access, with legacy records referencing their originating Part. `ancestorIds` links each interpretation to its own possibly overlapping set of WorldState snapshots, without fixed event groups or automatic source replay. Reference edits are versioned; archival preserves records. Formation behavior and originating-Part consolidation authority remain unchanged. See [ADR 0125](decisions/0125-agent-memory-and-worldstate-links.md).
