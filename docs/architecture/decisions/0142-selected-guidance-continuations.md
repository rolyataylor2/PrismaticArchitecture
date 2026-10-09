# ADR 0142: Self-selected supplemental guidance contracts

Status: Accepted.
Date: 2026-10-08
Extends ADR 0140 while preserving Self/private-state access boundaries and psychological ownership.

## Decision

A Part may answer an attributed guidance request through its ordinary operational proposal, adding `guidanceResponse` with the exact request ID and explicitly stated new information or instruction. Self must select that proposal. The host validates the response against a still-open, same-Agent, same-thread request before any external dispatch. The selected goal must remain identical and existing constraints must be preserved. Choosing another goal remains an independent action, not a disguised continuation.

Each immutable WorldState may carry bounded `externalExecutionRequests` for current open requests in its original thread. These report the exact expressed selected goal, constraint declarations and success criterion alongside the operational question, so a different normally activated Part can answer without reading the originating Part's private state or reconstructing it from audit. The source is the selected external handoff, not psychological memory. Capsules contain no raw tool arguments/results, Identity or Part snapshots. Runtime supplies the same current capsules to every Part once per cycle; they do not accumulate as facts and are excluded from factual-only prediction outcome contexts. Self receives them only through expressed Part products. Count is an explicit runtime context bound; omitted requests require more information rather than guessing.

For the currently supported no-submission pause, the host additionally verifies that the parent has no recorded submissions, its originating cycle did not fail, and the request has not already been consumed. An unverified submitted effect cannot use this path. A response records asserted new information; runtime text comparison rejects identical repeated assertions but does not establish their truth, usefulness or psychological meaning.

Resume creates a supplemental immutable contract and a new attributed execution segment. Original action, contract, request, events and predictions remain preserved. An atomic `execution.guidance_instruction` event consumes the request and marks its parent `continued`, naming the supplemental contract before external execution begins. `continued` is terminal for that segment, not proof that the goal completed. Failure after consumption is retained as an interrupted/failed successor, never permission to replay the parent. The successor's actual result supplies ordinary later-thread feedback. This is external execution lineage, not a global cognitive task manager.

The supplemental contract has fresh Self-selected exact tool authority and captures current settings and a new recorded deadline. This is an explicit new authorization, unlike recreating a gateway for the old contract. Permission changes still require framework administration. The original chain's guidance budget cannot increase: each consumed request increments preserved usage; remaining requests are bounded by both the original chain limit and the current profile. Parent constraints remain binding. A linked empty strategy may request guidance only within that remainder and with a new recorded assertion.

Invalid, foreign, closed, repeated or goal/constraint-changing responses receive a recorded rejected contract with no tool authority and compact blocked feedback. Adapters cannot bypass acceptance through status reporting or by calling a gateway. The framework verifies the recorded consumption, selected supplemental contract and parent lineage independently of the runtime. Generic reports cannot invent `continued` or change its target contract.

Part-cognition/answer prompts and Settings previews describe this optional response and preserve Self blindness. No new cognitive inference task, teacher routing or automatic activation is introduced. Procedural retention, general planning, submitted-effect recovery, shared skills and full runtime-adapter lifecycle remain separate requirements.

## Verification

Use the normal Agent pipeline and real local MCP for a successful later-cycle selected instruction. Preserve original snapshots and inspect both contracts, consumption, current grants and successor verification. Test cross-Agent/thread rejection, changed goals/constraints, replay, cumulative budgets across restart, identical assertions, adapter bypass and inability to claim completion for the parent. Prescribed providers test plumbing only; configured teaching observations require separate retained experiments.
