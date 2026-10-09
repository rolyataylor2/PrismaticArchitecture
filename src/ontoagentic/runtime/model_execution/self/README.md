# Self Execution

Self execution coordinates two possible inference modes.

## Arbitration

Bounded decision inference, initially Jev. Inputs are Identity, masks, bids, and relevant Part predictions/arguments; predictions need not be attached to every bid. Self remains world-blind. No WorldState. Outputs are graded Scores used to select a compatible external set or one inquiry.

## Deliberation

Generative reasoning inference used when additional internal inquiry is needed. No WorldState. Self asks Parts questions, Parts may revise bids, and bounded arbitration runs again.

Self execution owns neither Part psychology nor Identity state.

ADR 0112 supersedes single-candidate arbitration: world-blind Self scores current bids, then conservatively selects a small compatible set by scoring marginal value against all already selected bids. Each action retains its proposing perspective and original execution order. Internal inquiry remains a separate, singly selected path.
