# Disposition memory synthesis

Review this one disposition's frozen subjective evidence from a selected sleep period. Create a useful new first-person consolidated memory only when at least two supplied episodes support synthesis. You may abstain with synthesis=null. Activation warrants review, never a forced conclusion. Other dispositions can retain differing meanings.

Preserve important contradictions, failed explanations, contextual distinctions and unresolved uncertainty. Distinguish what someone said, what was actually tested, what research established and what remains inferred. Verifying that battery heaters exist does not establish why this particular car failed or that warming its battery fixed it. One useful statement does not prove broad expertise. Pretraining cannot fabricate lived biography or unrecorded research. Predictions and proposed actions are not completed tests; open predictions remain unresolved.

Cite only distinct supplied sourceMemoryIds. Do not copy the entire source archive. Write concise content, gist and contextual recall cues. replaceSourceMemoryIds may contain only cited sources whose important meaning, qualifications and counterevidence the synthesis adequately preserves; leave irreplaceable episodes out. This is a suggestion: runtime applies replacement only when separately enabled, only for this disposition, and preserves original records. Synthesis creates neither objective truth nor a new disposition. Do not access raw WorldState, Identity or private Part state.

Disposition: {{ dispositions|json_encode }}
Selected subjective memories: {{ memories|json_encode }}
Linked predictions and recorded outcomes: {{ predictions|json_encode }}
Task: {{ task }}

Return JSON matching the supplied schema, with a reason explaining synthesis or abstention and replacement suitability.

## Adjustable detail judgment

Selected policy and additional researcher guidance: {{ synthesisPolicy|json_encode }}

Apply detailPolicy to this disposition's perspective only:
- preserve_details: conservatively retain meaningful evidence, contextual distinctions, failed explanations and belief history. Omit details irrelevant to this perspective, without rewriting their meaning for other dispositions.
- trace_belief_changes: emphasize current understanding and explicit evaluative continuity such as “I used to believe X; now…” or “I no longer believe X because…”. Preserve meaningful evidence and uncertainty; peripheral specifics can be omitted.
- compact_current_view: emphasize what currently informs this perspective. You may leave out an old explanation only when supplied evidence makes it conclusively unnecessary for this perspective and it has no meaningful continuing relevance. Do not hide unresolved contradictions, fabricate certainty or require rejecting a belief. Important trust, safety or causal qualifications may still warrant retaining a rejected explanation.

Additional guidance adjusts what to emphasize or omit; it cannot supply autobiographical evidence or override source preservation, uncertainty or access boundaries. These are adjustable experimental judgments, not rules equating compression with learning quality.

For every cited source provide exactly one detailDecisions entry: memoryId, retainedMeaning, omittedDetails and reason. Explain why omitted details are irrelevant, peripheral or superseded for this disposition. Leaving something out of the synthesis does not erase it from the source or establish that another disposition should discard it. Distinguish omissions from changed beliefs; belief-revision language belongs in the new memory when warranted by evidence and policy. Abstain if meaningful uncertainty cannot be preserved in a useful synthesis.
