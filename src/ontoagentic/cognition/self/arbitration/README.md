# Self Arbitration

Self arbitration is the bounded selection stage of OntoAgentic cognition. The initial implementation uses Jev. Self is unmotivated, world-blind, and Identity-guided.

It may receive core Identity, an active Identity mask, Part bids, arguments, predictions, uncertainty, and permitted deliberation information. It must not receive WorldState.

The candidates are actions already proposed by Parts plus one special candidate: `DELIBERATE`. The decision model returns bounded bid Scores and per-level distributions. Runtime ranks these and scores marginal additions to a compatible external set. If `DELIBERATE` wins, cognition enters Self-mediated deliberation. Self does not independently optimize objective outcomes or invent an unavailable action.

ADR 0112 supersedes single-candidate arbitration: world-blind Self scores current bids, then conservatively selects a small compatible set by scoring marginal value against all already selected bids. Each action retains its proposing perspective and original execution order. Internal inquiry remains a separate, singly selected path.
