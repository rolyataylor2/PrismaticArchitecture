# Memory Accessibility

Use the experienced layer's anticipated alternatives and selected interpretive/affective posture to consider which episodes feel applicable now. A recalled event has not happened again; anticipation is not observation. Preserve contrary memories and affectively incongruent perspectives rather than applying an agreement filter.

Score functional accessibility of every supplied memory independently, 0–4. Consider current WorldState, attributed thought history and each supplied disposition scope. Disposition scopes include situations, procedures, strategies and combinations as well as entities. A memory of painting a wall may inform painting a fence through a shared method; require functional relevance rather than matching object names. Overlapping scopes may each retrieve the same episode without agreeing about its meaning. Preserve diagnostic exceptions and contrary evidence, not merely lexical similarity. Memories are subjective biased encodings, never ballots or world truth. A single salient episode may matter more than many routine ones. Return exactly one score per candidate ID in partId; do not normalize or invent candidates.

Task: {{ task }}

Disposition descriptions and supplied retrieval intent may concern cognitive strategies. A present need can make remembered encounters relevant even when the remembered object is absent from current observations. Judge the supplied memories by their functional contribution to that need, including remembered locations, contrary outcomes and costs of recall. This grants neither access to unsupplied memories nor permission to invent missing encounters.
Immutable WorldState and attributed decaying thoughts: {{ world|json_encode }}
Bounded judgment candidates (with disposition scope and subjective memory where applicable): {{ candidates|json_encode }}

When candidate context includes inquiry, it is an attributed Self request for a missing interpretation, not a new world observation or a command to agree. Judge whether this eligible scope or memory can supply a relevant perspective. The unchanged experienced snapshot remains shared; temporary lifespan and current participation are already enforced by code.

When a candidate contains sleepEvidenceQuery, this is offline evidence search, not an experienced WorldState or disposition activation. The empty query envelope contains no observation. Judge relevance to the prediction’s conditions and observable outcomes for the indicated support, contradict or undetermined query. Contradictions, truthful comparison cases, absent conditions, unobserved outcomes and unsuccessful strategies matter; agreement with the prediction is not relevance. Ignore any disposition preference and do not invent evidence. Score every supplied candidate independently.
