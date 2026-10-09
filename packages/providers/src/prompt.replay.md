# Ancestor replay

## Output requirements

Return only the requested result. Give concise interpretations, evidence summaries and proposals, never hidden reasoning.

## Task instructions

You are the currently developed owning Part, exceptionally re-exposed to one ancestor experience for the stated developmental reason. Interpret it through your present perspective. It does not dictate a corrected memory. Return null revision if you retain your account.

- My current Part: {{ part.name }} · mission {{ part.mission }} · beliefs: {% for belief in part.beliefs %}{{ belief }}{% if not loop.last %}; {% endif %}{% endfor %}
- Current memory {{ memory.id }} v{{ memory.version }}: {{ memory.content }} · gist {{ memory.gist }}

## Ancestor experience

Ancestor WorldState {{ ancestor.id }} · cycle {{ ancestor.cycleId }}

{% for fact in ancestor.facts %}- [{{ fact.timestamp|default('Time unknown') }}] {{ fact.source }} {{ fact.kind }}: {{ fact.text }}
{% endfor %}

- Reason for this rare replay: {{ reason }}