# ADR 0148: Evidence-scoped procedural maturity

Status: Accepted implementation target; runtime implementation remains unfinished.
Date: 2026-10-08
Extends ADRs 0143, 0144 and 0147.

## Meaning and authority

Procedural maturity is a versioned assessment of a particular method and declared applicability, separate from permission to execute it. Candidate, Tested, Established and Deprecated are knowledge lifecycle states. Active, proposed, rejected and archived remain application administration states. Promoting maturity cannot approve a method, expand grants, change limits, alter preferences or choose an intention. Deprecated knowledge remains inspectable and should be excluded from fresh autonomous application; existing immutable execution contracts are never rewritten by a later assessment.

Legacy records have no recorded maturity assessment. Inspection may describe them as unassessed, but cannot fabricate historical promotions. New proposals begin as candidates. Replacing a source method, changing conditions or revising conditional membership starts a new candidate assessment; approval-only revisions do not erase prior evidence. Rollback appends history and restores recorded content without deleting later failures.

## Evidence and transitions

Each assessment records the previous and proposed maturity, reason, assessed method version, declared applicability, supporting execution references, counterevidence, limitations and assessment origin. Evidence must belong to the same Agent and match the exact captured method. Distinct executions count once; administrative revalidation of the same execution is not repeated practice. Conditional family evidence must identify the actual member/branch and its immutable version. A family's baseline source validation is not evidence that every branch works.

Tested requires independently checked operational evidence. Established additionally requires repeated distinct uses and an explicit assessment of the declared applicability and escalation conditions. Configurable minimum counts are necessary engineering gates, not sufficient proof of semantic applicability or calibrated confidence. A count threshold alone cannot establish a method. Failures, inconclusive runs, blocked/rejected requests and pending operations remain separate. Absence of observed failure is not proof of reliability. Contradictions may motivate narrowing, revision or deprecation through an explicit assessment rather than silent destructive mutation.

Deprecation records why a method is no longer recommended, preserves all source bids/thoughts and outcomes, and does not pretend every failure was caused by the procedure. Re-establishing deprecated knowledge requires a new evidence-backed assessment; toggling approval is insufficient. Researcher administration must be labeled as such. Ordinary cognitive assessment must use a selected Part proposal and world-blind Self choice through the normal pipeline; an external consolidation inference cannot impersonate that choice.

## Enforcement and inspection

Storage independently validates assessment references, immutable method identity, transition requirements and evidence preservation. SDK validation alone is insufficient. Host application checks deprecation separately from current approval and permissions. Public cognitive manifests may expose bounded maturity and limitations without raw audit history or private state; changing that manifest requires corresponding factory-prompt review. The inspector shows the maturity trail, reasons, evidence and missing applicability support separately from approval and numerical application summaries.

## Required verification

Verify that repeated validation does not count as repeated use, foreign/mismatched method evidence is rejected, failures remain preserved, family evidence does not silently cover unused branches, maturity cannot confer permission, deprecation prevents fresh application without canceling captured work, revisions restart assessment, and rollback preserves development history. Extend the shared Simulation Tests registry with repeated ordinary skill use, a failure or uncovered context, and changed preferences; prescribed plumbing output does not validate the learning hypothesis.

Automatic consolidation policy, autonomous maturity assessment, calibrated competence/application confidence and conditional transfer remain separate implementation requirements. This decision specifies their boundaries and does not claim their completion.

## Initial implementation

The SDK/API accepts explicitly attributed researcher assessments, preserving an immutable skill revision and application status. Storage independently checks scope, exact method equality, distinct passed executions and per-branch support. Tested requires one and Established requires two distinct passed executions per assessed branch, alongside an explicit applicability statement and limitations. These fixed initial engineering gates remain uncalibrated; configurable policy and ordinary cognitive assessment are unfinished. New source proposals remain unassessed until candidate assessment is explicitly recorded, rather than fabricating an assessment origin. Deprecation prevents fresh host resolution and marks public methods unavailable; captured historical contracts retain their original semantics.
