# Prediction outcome check

Return exactly one: correct, incorrect, incomplete, irrelevant. Compare the preserved expectation and capsule only with the explicitly supplied later factual evidence. The factual snapshot contains only admissible later observations. Earlier selected context is preserved in the capsule and subjective owning memories, never a separate channel of outcome evidence. Correct requires evidence supporting the expectation; incorrect requires evidence contradicting it. Incomplete means insufficient, mixed, ambiguous or not-yet-resolved evidence, including an unmet conditional horizon. Irrelevant means the original context or conditions no longer apply, not merely weak evidence or elapsed time. Do not infer unobserved facts, treat subjective thoughts as facts, form memory, or rewrite beliefs. Preserve uncertainty by choosing incomplete when unsure.
Prediction: {{ prediction.expectation }}
Horizon: {{ prediction.horizon }}; evaluate after sequence {{ prediction.evaluateAfterCycle }}
Capsule: {{ prediction.capsule.interpretation }}
{% for detail in prediction.capsule.details %}- {{ detail }}
{% endfor %}

## Owning Part context

Part {{ part.name }}: {{ part.mission }}
Beliefs: {% for belief in part.beliefs %}{{ belief }}; {% endfor %}
Strategies: {% for strategy in part.strategies %}{{ strategy }}; {% endfor %}
Memories: {% for memory in memories %}{{ memory.gist }}: {{ memory.content }}; {% endfor %}
Activation {{ activation.score }}, change {{ activation.delta }}
WorldState {{ world.id }}, sequence {{ world.sequence }}:
{% for fact in world.facts %}- {{ fact.source }} {{ fact.kind }}: {{ fact.text }}
{% endfor %}

## Evidence recorded after prediction formation
{% for fact in laterEvidence %}- {{ fact.source }} {{ fact.kind }}: {{ fact.text }}
{% else %}No known later evidence; choose incomplete.
{% endfor %}

{% if part.instance %}
## Constructed perspective context
I am a temporary coherent interpretation, not a permanent personality. My hypothesis is {{ part.instance.interpretation }}. My local concern is {{ part.stickiness.concern }}. These memories retain their originating subjective bias and can support conflicting interpretations. Retired instances stay inspectable but never resume decision authority.
{% endif %}

## Preserved forecast branch

{% if prediction.kind %}Kind: {{ prediction.kind }}{% else %}Kind unspecified in this historical prediction.{% endif %}
{% if prediction.conditions is defined %}Conditions: {{ prediction.conditions|json_encode }}{% endif %}
{% if prediction.conditionedAction is defined %}Action condition: {{ prediction.conditionedAction|json_encode }}{% endif %}
Evaluate the owning Part’s expectation against later available experience, not a privileged objective future. An unperformed or unobserved conditional action does not establish its counterfactual outcome. Distinguish absence of a feared event after avoidance from disconfirmation of what would have happened otherwise; preserve causal attribution and unresolved uncertainty. Never treat imagined experience as occurrence, or overwrite a subjective memory into neutral consensus.

A newly supplied record can describe an older event. Do not count an event predating the assessed claim version as a prospective test, even if its report is new. Repeated memories, own thoughts, own statements of the hypothesis or ambiguous interpretations are not independent outcomes. Confirm/contradict only when the actual predicted conditions occurred and the result is observable; do not substitute recall accuracy for a stronger effort-saving claim. Consider opposing and unobserved outcomes. An agent-induced response does not establish an unconditional worldview; action-conditioned causal tests must retain that distinction. Incomplete evidence remains incomplete, not confirmation by repetition.
