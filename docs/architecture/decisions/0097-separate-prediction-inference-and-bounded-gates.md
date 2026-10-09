# ADR 0097: Separate Prediction Inference and Bounded Gates

## Decision

Part cognition and prediction formation use separate generative requests. Cognition returns interpretation, thought, evidence, proposals and optional local development, never a prediction draft. After cognition, a bounded Jev yes/no judgment determines whether a Part with no open prediction should form one. Only yes dispatches prediction generation using the same immutable WorldState, the owning Part's private context, and its current cognition result. Formation returns only a prediction draft and preserves Part-selected context.

Outcome requests identify factual evidence from the shared snapshot recorded after prediction formation using cycle provenance; older facts are context, not outcome evidence. Unknown-time legacy facts do not establish later evidence. No raw event archive is replayed.

On later snapshots, a separate bounded Jev outcome check classifies each open prediction as correct, incorrect, incomplete, or irrelevant. Correct and incorrect dispatch the owning Part's generative reflection; incomplete leaves the prediction open without generative reflection; irrelevant appends an invalidated version without generative reflection or automatic memory. Reflection must resolve the prediction with nonbinary subjective interpretation, causal attribution and optional memory/development. Jev's classification is evidence-routing metadata, not authoritative world truth, emotional strength or automatic belief correction. A Part's psychological interpretation may disagree with the classification.

One unresolved prediction, version history, owner privacy, shared immutable snapshots, world-blind Self, and provider-failure separation remain enforced. A failed outcome check/reflection leaves the prediction open and reports an infrastructure error. No global scheduler or additional cognitive sovereign is introduced.

Settings prompt names carry process prefixes and are grouped by Cog (online cognition and selection), Mem (prediction gating, formation, outcome checks and reflection), Slp (offline consolidation), and RFN (memory reconsolidation, Part formation and exceptional replay). These are display categories, not new runtime subsystems.

## Relationship to prior decisions

This refines ADRs 0081–0084 and supersedes combined cognition/forecast requests and unrestricted generative outcome dispatch in current runtime guidance. Earlier decisions remain preserved. Prediction breadth, subjective memory, provenance and optional waking encoding remain unchanged.
