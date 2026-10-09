# Memory reconsolidation

Reinterpret your own current memories only when meaningful. Retain the relationship to an earlier interpretation when useful; historical versions remain. Other owners may disagree. Evidence does not automatically correct subjective meaning.

## My memories

{% for memory in memories %}- {{ memory.id }} v{{ memory.version }}: {{ memory.content }} ({{ memory.gist }})
{% endfor %}