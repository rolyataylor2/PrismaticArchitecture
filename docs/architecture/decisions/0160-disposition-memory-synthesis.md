# ADR 0160: Optional disposition memory synthesis during sleep

Status: Accepted, 2026-10-11. Researcher sleep discussion and implementation request.

## Decision

Current-profile sleep optionally creates consolidated subjective memories, reviewing every distinct disposition independently activated during the selected completed cognitive period. Activation chooses review scope, not learning success or admission. Capture all scope inputs before any sleep writes. Each review receives only that disposition definition, relevant recalled/experienced/attached subjective memories and linked predictions with recorded outcomes. No raw WorldState, private Part state, Identity or another review's new synthesis enters inference. Review can abstain, including on empty or contradictory evidence.

A synthesis is a new Agent-owned subjective memory attributed to its disposition, not a fabricated Part episode or objective truth. It cites at least two distinct supplied source memories with immutable source versions, source disposition/version and sleep run. Preserve source ancestry, contradictory evidence, uncertainty and rejected explanations. A verified related fact does not prove a specific cause or general expertise. New disposition formation remains the existing evidence-gated structural reconciliation responsibility.

A separate default-off option replaces only explicitly cited source memories in the reviewed disposition's ordinary recall candidate set. Store versioned disposition-specific retrieval exclusions; never delete or globally archive the source memories, remove access for other dispositions or suppress exceptional direct recollection. The new synthesis is eligible through ordinary independent recall scoring, without guaranteed recall or priority. Runtime checks same-Agent ownership, supplied citations, current versions and duplicate lineage before commits. All review inputs are frozen before sequential review; accepted records remain versioned and inspectable. Repeating the identical sources/versions for the same disposition produces no duplicate synthesis.

Existing sleep behavior is unchanged when synthesis is disabled. Replacement requires synthesis. Historical persistent-Part consolidation does not support these options. Completed/failed run evidence includes options, scope/source selections, abstention reasons, synthesized memory IDs and retrieval replacements. Partial accepted stages survive later provider failure and remain inspectable.

## Verification

Boundary tests cover scope discovery including independently activated but deferred scopes, source gathering, immutable overlapping evidence, citation/version validation, duplicate prevention, per-disposition recall exclusions and preserved source history. Browser checks cover default-off dependent options and readable scope outcomes. Paired fresh-Agent Simulation Tests compare ordinary sleep, synthesis and synthesis with replacement using ordinary external cold-car experiences, failed door advice, qualified battery advice and supplied research findings. Fixture runs prove plumbing only; configured-model results may be inconclusive and never establish human psychology or the actual cause of a particular car fault.

## Adjustable detail retention

The researcher further requested a pre-sleep setting for judgments about omitted details and evaluative belief history. `preserve_details` is the conservative default; `trace_belief_changes` emphasizes explicit “I used to believe…” continuity; `compact_current_view` permits omission of conclusively unneeded explanations only for the reviewed perspective while retaining meaningful uncertainty. Optional researcher guidance tunes emphasis, never supplies lived evidence. Each cited source receives an inspectable model-authored judgment about retained meaning, omitted details and rationale. Policy/guidance are recorded with the sleep run and immutable synthesis lineage. Changing the policy can create a different synthesis from preserved original sources; ordinary retrieval exclusions do not block offline review. Identical source versions under identical policy/guidance do not duplicate a synthesis.
