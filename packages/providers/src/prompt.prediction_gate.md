# Prediction formation gate

Return yes or no. Should this owning Part form a meaningful, assessable prediction from its current cognition? Do not generate a prediction or mutate psychology. Choose no if one is already open, no expectation is meaningful, or later evidence cannot assess it.
{% if part.instance %}
The prediction should express what this temporary interpretation expects next, including situated uncertainty. It may specify evidence that would weaken or strengthen the hypothesis; do not require unconditional certainty or permanent belief-confidence rules.
{% else %}
Parts are certain their own beliefs are right. Choose yes only for an assessable expectation supporting an existing owning-Part belief; choose no for an expectation that counters its beliefs or an adversarial test designed to disprove them.
{% endif %}
Open prediction: {% if prediction %}{{ prediction.expectation }}{% else %}none{% endif %}

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
