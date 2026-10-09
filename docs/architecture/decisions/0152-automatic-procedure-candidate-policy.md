# ADR 0152: Automatic procedure candidate policy

Status: Accepted implementation target extending ADRs 0144/0147/0151.
Date: 2026-10-09

Executive configuration may request manual consolidation, automatic candidate inference after one independently verified ended execution, or inference after repeated independently verified uses of an identical whole procedure. Repeated success is a researcher-configured evidence prerequisite, not causal attribution or semantic generalization. Failed, pending, unverified and rejected executions cannot trigger this inference. Existing evidence bounds and source lineage apply.

The Application schedules external offline procedural inference after the originating cognitive cycle has ended, through existing per-Agent inference coordination. This is learning scheduling, not a global task planner, Part motivation or a second decision authority. External workers remain independently cancellable. Current and captured disabled learning policies prohibit automatic inference. Each execution may trigger at most one recorded automatic run; failure does not create an unbounded retry loop or restart replay.

Automatic output creates proposed candidates only. It cannot approve a procedure, promote maturity, select a branch, change psychology, weaken grants or perform tools. Manual consolidation remains available independently of automatic triggering. Current applicability, preferences, approval, exact stored versions and tool grants remain required for subsequent application. Reports retain the triggering execution and policy for researcher inspection.

Changing the automatic consolidation policy during inference invalidates that automatic result before candidate persistence. Retain the original input/output and the refusal as a failed learning report; the verified execution remains completed. Failure consumes that execution's trigger and does not retry automatically. A separately requested manual inference may reconsider the evidence later.

Assessment or scheduling failures before inference are retained as separate failed trigger reports naming the recorded execution. Do not fabricate a policy, supplied episode evidence or model output that was never obtained. An empty input on such a report means input assembly failed, not that no source history exists. If persistence itself is unavailable, it cannot roll back an already recorded operational result.
