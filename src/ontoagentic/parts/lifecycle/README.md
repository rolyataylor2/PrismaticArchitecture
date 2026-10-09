# Part Lifecycle

Coordinates formation, dormancy, reactivation, retirement, archival, splitting, merging, succession, and replacement. Dormancy and archival are not deletion.

The lifecycle should conceptually support temporary, persistent, dormant, reactivated, and archived states without requiring these names to become permanent enum values.

A temporary Part may complete its mission and fall away, remain temporarily useful after repeated success, adapt after failure, or broaden its mission and become persistent. Persistence is not always desirable.

## Semantic lifecycle operations

Lifecycle operations have psychological meaning and are not merely database maintenance.

### Update

Update changes an existing Part while preserving identity. Examples include different wording, new evidence, a revised strategy, a new trigger, or a narrower belief. Ordinary development should be incremental and versioned.

### Consolidate

Consolidation may make lived cognitive traces more coherent while preserving meaning and provenance. It primarily examines activated Parts, meaningful changes, co-activation, predictions/outcomes, recurrence, and salient referents; raw external records remain available as secondary evidence. It is not an optimizer for reducing Part count, and must not silently invent a new psychological conclusion. See [Offline Consolidation](../../../../docs/architecture/OFFLINE_CONSOLIDATION.md).

### Split

A Part may split when one perspective has become too broad or internally context-conflicted to remain action-guiding. For example, one relationship perspective may specialize differently for technical collaboration and emotional vulnerability. Splitting represents psychological specialization; descendants preserve lineage and the original remains historically recoverable.

### Merge

Parts may merge when repeated co-activation, similar missions, interpretations, proposals, and evidence reveal little useful disagreement. Merging reduces redundant internal voices, not merely database size. The merged descendant preserves ancestry to all source Parts, which remain historically recoverable.

### Archive

Archiving may follow a completed assignment, ended project, resolved event, unnecessary strategy, or concluded mission. An archived Part is no longer normally retrieved for active bidding; archive does not mean delete.

### Reactivate

An archived or dormant Part may become relevant again. Reactivation preserves prior developmental history and does not restart it as a new Part unless cognitive theory determines that a new Part is more appropriate.

## Semantic lifecycle decisions

Metrics may surface candidates for consolidation, splitting, merging, or archival, but semantic cognitive evaluation determines whether an operation makes sense. Do not make foundational psychological rules out of simple size, count, or co-activation thresholds.

Lifecycle hygiene asks psychological questions: does this Part still have something distinct to say; has its mission concluded; has it become internally contradictory; has it developed incompatible roles; does another Part now express essentially the same perspective; or is its evidence too large and in need of consolidation? The purpose is a coherent ecology of distinct perspectives, not ordinary garbage collection.
