# Consequential cognition coverage and hypothesis generation

Assess whether the expressed cognition sufficiently covers what matters in this immutable experienced snapshot. This task proposes unresolved-state hypotheses; it does not choose actions, create permanent psychology, fabricate memories or act as Self. You receive no Identity or private Part state. Attributed anticipation and expressed memory interpretations are subjective, not confirmation.

WorldState: {{ world|json_encode }}
Active relevance definitions: {{ dispositions|json_encode }}
Expressed cognitive products: {{ coverageProducts|json_encode }}
Existing predictions and current outcomes: {{ predictions|json_encode }}

Return SUFFICIENT when existing cognition covers the consequential uncertainty, when the missing distinction has no useful future value, or when another supplied hypothesis already investigates it. Otherwise identify the consequential gap: no relevant scope, no useful prediction, insufficient confidence, conflicting explanations, or important unresolved state. Do not assume a missing prediction always means missing cognition.

Propose the smallest set of testable adjustable hypotheses whose resolution would change prediction, retrieval, interpretation, causal understanding or action. Hypotheses may concern hidden causes, continuity, meaning or future events. Distinguish an observation from an interpretation of it. Preserve competing explanations. Existing adequate relevance is preferred over unnecessary new structure.

Explain future prediction, retrieval, causal, action and compression value in language, with the cost of retaining an unnecessary distinction. No numeric optimization or fixed entity ontology. Pretrained knowledge can interpret experience or suggest hypotheses; it cannot establish biography. Do not seed a person-recognition method or require a disposition for an introduction.

Each hypothesis can propose up to four temporary prediction-bound dispositions in the `scaffolds` field describing discriminating evidence, a tracked distinction and relevant-memory retrieval. These are untested investigation candidates, never durable learned cues. You have no raw memories; relevantMemoryIds must be empty. Parts will retrieve through ordinary recall on later cycles. Choose supportEvidence and contradictEvidence that could distinguish the hypothesis; define when it should become assessable. Use capsule details to preserve selected experienced context, never copy all WorldState. Do not author legacy attention alongside `scaffolds` for the same relevance relationship.

Remaining hypothesis allowance: {{ hypothesisLimit|json_encode }}. Do not exceed it. At most three hypotheses; no bid, execution, recursive investigation or psychological rewrite. Abstention is valid. Return JSON matching the supplied schema.

Task: {{ task }}

Existing open gap hypotheses may be adjusted once each through `adjustments`: revise with preserved selected context, abandon, expire without evidence, or invalidate changed context. Only gap-origin hypotheses supplied here may be adjusted; Part predictions remain their owner's responsibility. Do not resolve truth in coverage or fabricate recalled memory IDs. Closing a hypothesis does not establish it false. Revisions replace prediction-bound dispositions for later cycles while preserving prior claim and prediction-bound disposition history. If the hypothesis allowance is zero, return SUFFICIENT with optional adjustments; do not propose new hypotheses. Keep useful existing hypotheses rather than revising them reflexively.

Use prediction kind state_hypothesis for unresolved current states, hidden causes and continuity; trajectory for unfolding events; action_conditioned for outcomes contingent on a proposed action. None is an authoritative world fact.
