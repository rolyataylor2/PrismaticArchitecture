# ADR 0112: Score-based Self selection

Status: Accepted
Date: 2026-10-01
Supersedes the single Choice mechanism of ADRs 0105 and 0110.

Self scores current bids for relevance, Identity consistency, contextual appropriateness and importance, discounting redundant, conflicting and poorly supported proposals. Context means mediated contributions and inquiry history; Self never receives WorldState or private state.

The initial independent 0–4 Scores rank bids alongside DELIBERATE and, after two completed inquiries, NOTHING. Runtime selects the highest score, with stable input order for ties. An external bid starts a compatible set. Remaining external bids are rescored for their marginal value against the entire selected set; only a score of at least 3 (substantial distinct value, compatible and coherent) can extend it. Repeat until no qualifying addition remains. This conservative greedy policy prefers a small set; it is not an exact global subset optimizer. Score judgments do not grant authority or create new actions.

Selected external bids are handed off individually in ranked selection order, preserving each proposal and its Part-owned execution order. Runtime stops handoff on infrastructure failure; completed external operations remain recorded. Internal inquiries are selected alone and retain existing deliberation contracts. Historical bids remain unselectable. All scores, marginal rounds and selected IDs are inspectable. Legacy choice events and custom templates remain readable.
