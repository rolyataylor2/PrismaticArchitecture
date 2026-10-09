# ADR 0108: Optional activation re-evaluation after deliberation

## Decision

An experimental per-Agent activation setting, `reevaluateAfterDeliberation`, defaults to false. When enabled, every completed Self or Part-originated DELIBERATE inquiry reruns ordinary vector candidate retrieval, independent shared-state Part and primitive scoring, and threshold policy before the next bounded Self choice. Existing deliberation round limits still apply.

This narrowly supersedes ADRs 0093/0098's next-external-cycle-only shared-thought timing: completed inquiry responses become attributed subjective thought entries in a new immutable deliberation snapshot. External facts remain unchanged. The original snapshot is preserved; every contributor within a phase uses exactly the same new snapshot. Private Part state and objective audit records are not projected. Self remains world-blind.

Contributors remaining active retain their current contributions and inquiry-updated bids. Contributors no longer active leave the choice set. Newly active contributors generate ordinary cognition against the new snapshot, with ordinary owning-Part prediction gating; unresolved predictions are not re-evaluated again. Primitives retain their memoryless, prediction-free boundary. Activation does not itself revise psychology or authorize execution. If a contributor later reactivates, it generates a new contribution. Inquiry history remains attributed and available through the existing mediation boundary.

Snapshots and scoring are recorded through existing inspection records. Additional snapshots share the containing cycle ID and sequence but have unique snapshot IDs. This does not create a task manager, planner, or an additional chooser.
