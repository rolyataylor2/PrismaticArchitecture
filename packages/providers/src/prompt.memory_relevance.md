# Subjective memory relevance
Score each memory independently on 0–4. Do not normalize or choose one winner.
How much could recalling this memory materially affect its referencing Part's interpretation, prediction, emotional response or proposed action in the current situation? Consider functional associations and counterexamples, not just matching words. A memory preserves its originating Part's subjective perspective; the referencing Part may interpret it differently, not authoritative world truth. Formation time is not necessarily event time. Use current time and temporal scope expressed in WorldState; do not invent event dates. Relevance grants no activation or authority.
Purpose: {{ purpose }}
{% if purpose == 'search' %}This is an explicit researcher search. Score how relevant each subjective memory is to the search query in the supplied facts, considering the referencing perspective. No Agent cognition, Part activation or new experience occurs.{% endif %}
Current snapshot time: {{ world.capturedAt }}
WorldState: {{ world|json_encode }}
{% for entry in entries %}
Memory ID: {{ entry.memory.id }}
Referencing Part: {{ entry.part.id }} — {{ entry.part.name }}
Mission: {{ entry.part.mission }}
Beliefs: {{ entry.part.beliefs|json_encode }}
Strategies: {{ entry.part.strategies|json_encode }}
Formation timestamp: {{ entry.timestamp|default('unknown') }}
Gist: {{ entry.memory.gist }}
Exact subjective content: {{ entry.memory.content }}
Salient context: {{ entry.memory.context|json_encode }}
{% endfor %}
0 irrelevant; 1 slight association; 2 potentially useful; 3 strongly useful; 4 directly recall-worthy.
Return one score per memory ID, using that ID in partId. No memory rewriting or psychological mutation.
