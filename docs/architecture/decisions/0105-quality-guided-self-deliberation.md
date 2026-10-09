# ADR 0105: Quality-guided Self deliberation with retained bids

## Decision

Supersedes ADR 0053's DEBATE option and the earlier debate response contracts, without changing Self's bounded authority or world-blindness.

Self's top-level Choice is an available bid ID or DELIBERATE. The eight C qualities are guides for inquiry, never Choice options, competing intentions, Parts, or a numeric Self-state model.

After DELIBERATE, one world-blind structured generation produces, in schema order: why_deliberate, primary_c, secondary_c, missing_information, target_parts, question. The rationale is concise, not hidden chain-of-thought. Primary quality is required; secondary is nullable and must differ when present. Curiosity investigates; clarity distinguishes evidence and interpretation; compassion understands distress; courage examines avoided information; confidence questions without yielding; creativity explores overlooked possibilities; connectedness considers relationships; calm tolerates uncertainty. One minimum useful neutral question is routed only to available contributors.

Parts can propose a deliberate bid with explicit targets and a question. Selecting this bid routes its original inquiry without a second Self question generation or C reinterpretation. Internal inquiry is never handed to the external Executor. External action bids retain their existing action payload; deliberate bids have no external action. Legacy bids without a type are action bids.

A participating Part receives the exact immutable cycle WorldState, its own private context, its current bid, the inquiry, and explicitly mediated chronological inquiry responses. No other Part private state or Identity is supplied. One response generation emits response, bid_disposition (retain/replace/withdraw), new_bid in that order. Retain keeps the same bid ID (including retaining no bid); replace requires a proposal and creates a later bid with an opaque replacesBidId reference when applicable; withdraw requires null and removes the current bid from consideration. No separate re-evaluation pass or bid version layer is introduced. Nonparticipants' bids remain unchanged. Replacement can itself propose another inquiry.

Surfaced primitives retain their memoryless, prediction-free boundary. Their inquiry response uses the same disposition contract through a separate primitive response capability, with no Part context or learning.

Every completed inquiry returns to the exact same bounded Choice using Identity, current bids and attributed responses. Runtime enforces target availability, distinct qualities, disposition consistency and external handoff boundaries. Round exhaustion grants no invented action or automatic winner. Provider failures remain infrastructure failures. Self never receives WorldState, private Part state, autobiographical authoring Traits or objective audit history.

## Compatibility and inspection

Prompt task and event names use deliberation. Historical debate records and saved custom templates remain readable without rewriting immutable history. A renamed task resolves legacy debate prompt overrides as a read-time fallback; custom prompt text is not silently rewritten. Current factory prompts and Settings output contracts describe the new behavior. Inquiry plans, responses, dispositions, replacement ancestry and selected internal bids are inspectable.

## Consequences

Disagreement is only one reason to deliberate. Inquiry may clarify one Part, compare claims, seek a prediction explanation or request a Part-generated alternative. Self improves its decision process without inventing intentions or becoming a second motivated agent.
