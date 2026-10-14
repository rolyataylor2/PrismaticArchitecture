# Disposition reconciliation

Improve contextual memory relevance while preserving prior experience and developmental lineage. Dispositions are hypotheses, not facts. Use pretrained knowledge to interpret supplied experience, never as evidence of biography. Do not edit memories in this operation.

Return explicit operations: NO_CHANGE, INSUFFICIENT_EVIDENCE, INSTITUTIONALIZE, ASSESS_HYPOTHESIS, SPECIALIZE, GENERALIZE, SPLIT, MERGE, ADD_ASSOCIATION, REMOVE_ASSOCIATION or ARCHIVE. Preserve alternatives and source lineage; explain why the change preserves prior learning. Every cue cites selected memories. Code validates recorded evidence and commits versions.

Distinguish prediction correctness from retrieval usefulness. Relevant memories can accompany failed predictions because circumstances changed. Do not split merely on failure. Contrast appropriate and misleading retrieval to identify the smallest experienced contextual distinction, without invented hidden causes. Abstain on noisy or insufficient evidence. Generalize only across distinct repeated contexts sharing relevance. Merge requires repeated same-context coactivation, overlapping recall and shared retrieval intent. Archive only with evidence of redundancy or persistent unhelpfulness throughout its scope. Specialization and differentiation remain provisional, tested by later ordinary experience; preserve parent structure and all memories.

Selected memories: {{ memories|json_encode }}
Resolved predictions: {{ predictions|json_encode }}
Current dispositions: {{ dispositions|json_encode }}
Preserved versions: {{ dispositionHistory|json_encode }}
Recorded observations: {{ observations|json_encode }}
Selected attributed trajectories: {{ learningTraces|json_encode }}

No raw WorldState, private Part snapshots or audit replay. Proposed actions are not completed outcomes. Return JSON matching the supplied schema.

Task: {{ task }}

ASSESS_HYPOTHESIS changes only linguistic confidence and provisional/established status after repeated later-cycle retrieval experience. Establishment requires appropriate retrieval judgments; unknown or failed predictions do not automatically promote a hypothesis. Refuted distinctions may be refined or conservatively archived while preserved parents remain available.

INSTITUTIONALIZE creates a durable descendant from one or more preserved temporary prediction-bound dispositions. Cite repeated recorded ordinary-use cycles, recalled or experienced memories and appropriate usefulness judgments. Correct prediction classification alone cannot authorize persistence. A false hypothesis may have useful relevance; a correct guess may have none. Preserve all source prediction-bound dispositions, outcomes and memories. Consider linguistic future prediction, retrieval, causal, action and compression value against unnecessary complexity. Durable definition cues require lived memory support. Temporary ended scopes cannot be revived by structural rewrites; their reusable value is retained through explicit institutionalization. Abstain when evidence is insufficient.

Institutionalization waits until source hypotheses have ended; open investigations are not yet durable psychology. Selected ended source predictions may be resolved, abandoned, expired or invalidated. Their capsule and status explain investigation history; an untested closure is not confirmation or contradiction. Repeated recorded useful relevance remains necessary in every case.

Selected preserved hypothesis versions: {{ hypothesisHistory|json_encode }}
Read the source version recorded by each temporary prediction-bound disposition. Later revisions and closures preserve earlier alternative claims; no version is authoritative world truth or evidence of usefulness by itself.

Activation associations are soft contributing/inhibiting keyword or disposition cues. Use activationAssociations in drafts and leave prerequisites empty. ADD_ASSOCIATION / REMOVE_ASSOCIATION require the same selected lived evidence and explicit rationale as structural changes; repeated coactivation alone is insufficient. Read baselineScore separately from final score: association-induced activation is not independent evidence for strengthening its own link. Do not automatically strengthen, decay or fabricate relationships. Preserve alternatives, memories and lineage. Legacy dependency operations remain compatibility aliases only.

## Inheriting an expressed concern (ADR 0154)

Selected investigation trajectories: {{ predictionTrajectories|json_encode }}

Only INSTITUTIONALIZE may optionally include inheritedConcern: concern, meaning, thoughtEventIds, continuityReason and distinctnessReason. Ground it in an originating thought plus later expressed cognition from the source investigations. Explain what concern persists, how experience changed its meaning, and why a distinct descendant helps rather than leaving the concern with an existing disposition. Desire, curiosity, inquiry and combinations remain linguistic judgments: do not classify them from keywords or convert an unwanted confirmed prediction into a motive. Association with a prediction does not establish that a thought develops its concern. originating_disposition denotes scope continuity, including new Part instances; it does not imply that the prediction was supplied to that Part. Read attributed localGoal and proposal as expressed products, never executed outcomes.

Cite only supplied trajectory eventIds, including an origin and a later cycle; missing origin or insufficient/ambiguous evidence requires relevance-only institutionalization or abstention. OmittedThoughtCount discloses bounded evidence, not absence of other history. Gap-origin predictions have no fabricated originating desire. Temporary prediction-bound dispositions remain relevance-only and gain no motivational mission online. Repeated usefulness and ended-investigation gates still apply. The durable learned concern/meaning can shape ordinary Part formation; citation records remain audit provenance rather than online memories, activation cues or authority.

Runtime rejects and logs individual proposals that fail structural citation, evidence or lifecycle gates, preserving existing psychology while continuing sleep. Rejection does not authorize promotion or weaken these gates. Prefer INSUFFICIENT_EVIDENCE when support is insufficient.
