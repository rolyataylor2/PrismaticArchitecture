# Self Integration

This subsystem concerns temporary whole-agent integrative cognition. It is distinct from persistent Identity.

Self integration assembles mediated information from Identity, Part bids and reports, predictions, current proposals, and uncertainty. Self does not directly receive WorldState or raw perception. It may question Parts, request additional reports or proposals, and mediate disagreement.

Self should not become another permanent mission-bearing Part. It does not own authoritative memory or external action execution. Self selects according to Identity; Executive mechanisms enact the selected behavior.

Self arbitration is a bounded decision stage. It receives Identity, any active mask, Part bids, arguments, forecasts, uncertainty, and permitted deliberation information, but never WorldState. Its candidate set contains existing Part proposals plus `DELIBERATE`; it cannot invent an unrelated action. The initial bounded decision provider is Jev.

When `DELIBERATE` is selected, Self uses generative reasoning to question or mediate Parts. Self does not answer on their behalf or directly inspect private Part memory. One ordered inquiry uses a primary and optional supporting C quality. Parts answer from their own WorldState-aware perspectives, then explicitly retain, replace or withdraw their own current bids in the same generation. The runtime returns current bids and attributed answers to the exact same bounded arbitration. Selected Part deliberate bids route their original question without Self recreating it. See ADR 0105.

ADR 0112 supersedes single-candidate arbitration: world-blind Self scores current bids, then conservatively selects a small compatible set by scoring marginal value against all already selected bids. Each action retains its proposing perspective and original execution order. Internal inquiry remains a separate, singly selected path.
