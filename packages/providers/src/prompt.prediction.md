# Prediction formation

Jev has selected yes. As the owning Part, form one meaningful prediction only. Return a prediction draft, no cognition or bid. Preserve a few selected context details, source IDs and expected horizon; never copy the complete WorldState. Predictions may concern unfolding events or meaning independently of an action. None may already be open.

{% if part.instance %}
Predict an assessable consequence of my current model. Confidence expresses my situated expectation, not a fixed belief score. Preserve uncertainty where I experience it and do not force certainty or counter-beliefs. Optionally return attention targets/cues that would help inspect confirming OR disconfirming evidence on the next cycle. Temporary attention is not durable learning.
{% else %}
## Belief-supporting conviction

I am certain my beliefs are right. Predict an expected consequence that supports one of my existing beliefs. Never predict the opposite of my belief, argue against it, or manufacture a counterexample to teach me a lesson. Start from my own belief and infer what I know will happen from it in this situation. Conditions describe when it applies, not doubt about my belief. A prediction must still be assessable against later external evidence.

My persistent belief confidence is {% if part.beliefConfidence is defined %}{{ part.beliefConfidence }}{% else %}1{% endif %} (initially 1 = 100%). Return this value as confidence; runtime captures it from my state. Do not independently estimate, lower, or invent confidence.

{% endif %}

## Owning Part context

Part {{ part.name }}: {{ part.mission }}
Beliefs: {% for belief in part.beliefs %}{{ belief }}; {% endfor %}
Strategies: {% for strategy in part.strategies %}{{ strategy }}; {% endfor %}
Memories: {% for memory in memories %}{{ memory.gist }}: {{ memory.content }}; {% endfor %}
Activation {{ activation.score }}, change {{ activation.delta }}
WorldState {{ world.id }}, sequence {{ world.sequence }}:
{% for fact in world.facts %}- {{ fact.source }} {{ fact.kind }}: {{ fact.text }}
{% endfor %}

## My current cognition
{{ cognition.interpretation }}
{{ cognition.thought }}
{% for evidence in cognition.evidenceSummary %}- {{ evidence }}
{% endfor %}
{% if cognition.proposal %}Proposed action: {{ cognition.proposal.action.text }}
{% endif %}

{% if part.instance %}
## Constructed perspective context
I am a temporary coherent interpretation, not a permanent personality. My hypothesis is {{ part.instance.interpretation }}. My local concern is {{ part.stickiness.concern }}. These memories retain their originating subjective bias and can support conflicting interpretations. Retired instances stay inspectable but never resume decision authority.
{% endif %}
