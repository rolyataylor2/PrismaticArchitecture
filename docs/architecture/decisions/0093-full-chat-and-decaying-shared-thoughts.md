# ADR 0093: Full chat context and decaying shared thought history

## Status

Accepted, 2026-09-29, by explicit researcher instruction.

Supersedes ADR 0090's bounded chat window and private-only recent thought continuity. This explicitly permits prior cognitive thought text to be shared among Parts; private memories, beliefs, and other Part state remain private.

## Decision

Each immutable WorldState includes the full recorded chat transcript from its own thread, including the current incoming message. Chat is supplied as an external conversation record, not reconstructed autobiographical memory. Unthreaded calls retain a separate context. Other objective execution facts may accompany the transcript. There is no default transcript truncation or fixed snapshot fact-count cap. Hosts may still explicitly configure a bounded factual window.

WorldState additionally contains a separate `thoughtHistory`: attributed subjective thought text from prior cognitive turns in this thread. A thought's existence is recorded, but its contents are not authoritative external truth. This is an explicit public projection of cognitive output, never the complete thought event, Part snapshot, interpretation, private belief, subjective memory, prediction, or audit history. Thoughts generated while evaluating Wₙ first become eligible in Wₙ₊₁; Wₙ never changes during cognition.

Every retained entry contains source event and cycle IDs, originating Part ID and name, thought text, whether Self selected that Part's bid, age in thread turns, and retention. Selection uses actual Self choices and the corresponding bid owner, including bids revised during debate; external execution success is not required. Self chooses bids, not the truth of thoughts. No thought is automatically authoritative because of selection.

Initial experimental retention is linear: `max(0, 1 - age × decay)`. Age advances once per subsequent turn in the same thread, including turns without activation of the originating Part. Ordinary thoughts lose 0.2 per turn; thoughts from a Part whose bid Self selected lose 0.1. Entries disappear from new inference snapshots at zero. These rates are replaceable runtime options, not psychological strength, truth, activation, or authority. No wall-clock decay is implied. Original events and previously frozen snapshots remain immutable.

All activated Parts receive the exact same snapshot, including this shared thought history. Activator may use it as context without gaining access to private state. Self remains world-blind and receives only ordinary current Part contributions and debate. Subjective memory, Identity, prediction, and consolidation boundaries remain unchanged.

The existing `recentThoughts` task variable is retained for compatibility as an owning-Part projection of still-retained traces; factory cognition uses the shared thought history instead of duplicating this view. Older persisted WorldStates lacking `thoughtHistory` remain readable and render an empty shared history; the compatibility own-Part view retains its previous three-entry limit for these older snapshots.

## Consequences

- Full transcripts grow inference input and storage use; provider context limits still apply and failures remain infrastructure errors. No hidden summarization or truncation is introduced.
- Cognitive providers do not gain arbitrary storage or event access. Host code projects only approved fields.
- Decay changes future context inclusion, not psychological memory or persisted provenance.
- Prompt task variables and factory templates document shared thoughts as subjective, attributed context. Saved custom templates remain intact and can opt into the new field.
