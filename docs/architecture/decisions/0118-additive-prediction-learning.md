# ADR 0118: Subtle additive prediction learning

## Decision

Prediction outcome reflection may append beliefs, mission-serving strategies, and cognitive characteristics (How I think). It may not rename a Part, rewrite its mission, replace existing entries, or modify other Part fields. Runtime enforces this boundary even for edited prompts. Exact duplicate entries are retained only once; storage limits reject an overflowing proposal without deleting older psychology. Researcher edits and offline consolidation retain their existing contracts.

Correct or incorrect predictions invite only a tiny increase or decrease in linguistic confidence, expressed as a subtle cognitive-characteristic nuance. Confidence is not activation, authority, emotional charge, or a reward score. No numeric Part confidence or automatic psychological rewrite is introduced. The original prediction confidence stays unchanged.

The owning Part infers optional subtle learning from its interpretation of observations and preserved prediction context. Beliefs need not be objectively true or independently verified: a trusted person's anecdote may become a belief. Observing that someone spoke does not make their account authoritative world truth. Preserve biased first-person meaning, uncertainty, continuity, and disagreement. Strategies serve the existing mission; thinking nuances may add logic and emotionality without replacing the existing perspective.

## Relationship to prior decisions

Refines ADRs 0097 and 0098: outcome routing, subjective memory, causal attribution, world-blind Self, privacy, and immutable history remain unchanged. Prediction reflection no longer has general Part-patch authority. Existing prompt overrides remain saved but cannot bypass runtime enforcement.
