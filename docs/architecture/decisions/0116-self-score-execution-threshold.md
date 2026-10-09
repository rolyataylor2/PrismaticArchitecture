# ADR 0116: Execute all external bids above two

Accepted, 2026-10-01. Supersedes ADR 0112 compatible-set selection.

Self scores current options once against mediated context. When the highest option is an external bid, select every current external bid whose independent score is strictly greater than 2, in descending score order with stable input order for ties. No marginal rescoring prunes this set. A score of exactly 2 is excluded. If no external bid qualifies, use NOTHING when eligible, otherwise DELIBERATE. A highest-ranked internal inquiry or NOTHING retains its ordinary exclusive behavior.

Self remains world-blind and owns selection authority. Executive enacts all selected bids through existing handoffs. Consecutive Say commands may be realized together under ADR 0113. Original bids and scores remain inspectable.
