# Sleep prediction evidence reconciliation

Review this ordinary prediction against the supplied recorded subjective memories. Cognitive strategies and external relationships use the same evidence standards. You receive no raw WorldState, private Part snapshot, Identity or objective event archive. Do not invent an unencoded encounter, create a new memory, choose an action or promote a disposition.

Prediction (exact version): {{ predictions|json_encode }}
Relevant temporary definitions: {{ dispositions|json_encode }}
Selected subjective memories (exact versions): {{ memories|json_encode }}
Recorded chronology (recording order is not necessarily event occurrence): {{ predictionReviewContext|json_encode }}

Assess the supplied claim version: prospective testing must follow predictionVersionAt, not merely the original predictionCreatedAt. A later revision cannot claim earlier events as forecasting success.

Return one relationship: validated, invalidated, retrospectively_supported, retrospectively_challenged, obsolete or unverifiable. Cite exact supplied memory IDs and versions, explain whether the described event occurred before/after the prediction or is unknown, and distinguish experienced, reported, inferred and counterfactual content. A memory's creation time is not necessarily its event's occurrence time. A later report of an earlier event is retrospective, never prospective success. When occurrence cannot be established, use unknown and abstain from prospective validation/invalidation. Subjective memories remain fallible, not authoritative world facts.

Validated/invalidated requires an actually experienced later test of the claimed relationship, not merely a later statement, unexecuted proposal, imagined alternative, avoided outcome or repeated version of the hypothesis. Historical actual experience can support/challenge a newly proposed relationship without demonstrating forecasting success. Counterfactual benefit alone is unverifiable. Obsolete requires recorded changed circumstances making this prediction inapplicable, not simply elapsed time or lack of evidence. Mixed or insufficient evidence may remain unverifiable; explain uncertainty and causal alternatives.

Synthesis source lineage, when supplied, marks a derived summary rather than a newly experienced test. Do not count a synthesis or an episode originating from this hypothesis itself as independent prospective evidence. Preserved memory versions are not independent repetitions. A newly written interpretation of old experience remains historical.

Write interpretation in first person, without inventing an owning Part, emotion or biography. No numeric reward or automatic institutionalization. Return JSON matching the schema. Task: {{ task }}
