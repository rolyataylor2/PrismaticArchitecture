# ADR 0098: Cognition Products and Next-Cycle Thought Activation

## Decision

Part cognition returns exactly interpretation, thought, evidenceSummary, and an optional proposal. It produces no activation cues, prediction drafts, memories, or persistent Part mutations. Interpretation, thought, and evidence remain mediated subjective contributions to Self; proposals remain candidates for Self selection.

Additional Parts may become relevant in the next cycle through ADR 0093's attributed, decaying shared thought history in the next immutable WorldState. Both high-recall vector retrieval and independent Jev activation scoring consider retained thoughts. Thought content remains subjective and does not grant authority or force activation. New thoughts never update the current snapshot or dispatch additional same-cycle activation waves. Private memories, beliefs and other Part state are not shared by this path.

Ordinary waking episodic memory formation and persistent Part mutation occur only in the owning Part's prediction outcome reflection after Jev classifies correct or incorrect, following ADR 0097. Cognition itself cannot commit either operation. Offline consolidation/reconsolidation and explicit researcher edits remain separate existing paths; this decision does not remove them or erase historical memory/mutation events. Persistent changes remain validated and versioned.

## Relationship to prior decisions

This supersedes same-cycle bounded Activation Cue propagation in ADR 0059 and the current activation-network guidance, narrows ADR 0097's optional local development in cognition, and supersedes ADR 0085 for ordinary waking memory formation. ADRs 0093 and 0097 otherwise remain in force. Historical decisions and saved events remain intact.
