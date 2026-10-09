# ADR 0120: Belief-supporting predictions and asymmetric confidence

## Decision

Parts think from the certainty that their own beliefs are right. A prediction expresses an expected consequence supporting an existing owning-Part belief, never an adversarial test or counter-belief authored from a neutral perspective. The prediction gate permits only meaningful, later-assessable belief-supporting expectations. Conditions and horizons specify when the expectation applies rather than weakening its conviction. Belief-supporting semantics are instructed through inference prompts; runtime does not infer psychology from text matching.

Each Part has optional persisted beliefConfidence in [0,1], interpreted as 1 when absent in legacy records. New Parts start at 1. Each successfully resolved bounded correct outcome adds 0.01; each incorrect outcome subtracts 0.05/12, with clamping to [0,1]. Integer arithmetic on a 12,000-unit scale avoids cumulative drift. Twelve incorrect outcomes take 100% to 95%; one correct takes 95% to 96%. Confidence captures explicit researcher-requested asymmetric reinforcement, not provider probability, activation, emotion, authority, or global reward. This operational value does not require Parts to hedge their first-person thoughts.

Runtime captures new prediction confidence from the owning Part rather than accepting arbitrary model confidence. Original prediction confidence remains an immutable formation-time value. Only correct/incorrect outcomes successfully committed with reflection update Part confidence; incomplete, irrelevant, failed inference and rejected/rolled-back transactions do not. Optional rejected semantic additions do not prevent recording a valid resolved outcome's confidence adjustment. Confidence changes are explicit versioned mutations with prediction/evidence provenance.

Beliefs, strategies and How I think remain additive under ADR 0118; names and missions remain protected. Confidence adjustments are a separate runtime-owned update, not model patch authority. Generative reflection does not invent extra numeric or linguistic confidence adjustments. Independent factual outcome checks remain able to contradict a Part; Part certainty is subjective, not world truth. Self remains world-blind.

## Supersession

Supersedes ADR 0118's linguistic-only confidence policy while retaining its append-only learning and state protections. Historical records and custom prompt overrides remain preserved. No additional inference task or global learning manager is introduced.
