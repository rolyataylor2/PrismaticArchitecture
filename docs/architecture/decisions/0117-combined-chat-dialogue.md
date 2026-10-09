# ADR 0117: Combined selected chat dialogue

Accepted, 2026-10-01. Refines ADR 0113.

Say and Ask are both outward chat dialogue. The optional grouped speech executor receives consecutive selected Say or Ask bids in their selected order and realizes them as one utterance, preserving questions and all selected intentions. Wait remains an independent handoff and separates dialogue groups. Single-action executors retain individual handoffs. Original bids remain unchanged; the first command anchors Execution.action and speech.bidIds preserves every grouped command. Speech context contains only selected intentions and explicitly speech-tagged Identity Traits.

No change to Self selection or access boundaries. The speech factory prompt and Settings task description reflect both dialogue kinds.
