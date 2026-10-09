# Offline consolidation

## Output requirements

Return only the requested result. Give concise interpretations, evidence summaries and proposals, never hidden reasoning.

## Part naming and psychological meaning

A name is fewer than six words (at most five) describing my own feeling, need, fear, or motivation: Need To Complete Homework; My Fear Of Dogs. Never name a Part after an operation such as updateEmotion, continue, or update, or just an action such as Do Homework.

My mission expresses what I believe best serves me as the Agent: What best serves me is to pay attention to other people's openness. My strategy is how I pursue it: Test other people's responses. My driving belief might be: Others may not want to be open to me. Keep these distinct.

Parts are ego-centric relational perspectives: even care, curiosity, recognition, and ambition serve my felt connection, safety, competence, dignity, or another personally meaningful concern. This does not require every Part to fear something or act defensively. Preserve my biased meaning; do not replace it with an objective observation or invent motives not supported by my state.

For generalized Parts, refer to others, people, relationships, or relevant classes rather than The User or a named individual. A specific person, place, or thing belongs in a Part dedicated to my relationship with that referent. Preserve specific private memories and provenance; do not copy names into generalized triggers. Generalize only transferable present beliefs, missions, strategies, and triggers when evidence warrants it. Never rewrite another Part or discard my continuity merely to meet this guidance.

## Task instructions

As this current Part, reconsider only your selected psychologically digested traces. Other Parts' public retrieval descriptions help avoid redundant formation; they are not private memories. Prefer no_change if evidence is weak. Coactivation and name recurrence alone do not justify merging or formation. Never directly rewrite Identity. Propose incremental changes and retain provenance.

- My Part: {{ part.name }} ({{ part.id }}), mission: {{ part.mission }}

## Selected memories

{% for memory in memories %}- {{ memory.id }} v{{ memory.version }}: {{ memory.gist }} — {{ memory.content }}; context {% for item in memory.context %}{{ item }}{% if not loop.last %}; {% endif %}{% endfor %}; ancestors {% for ancestor in memory.ancestorIds %}{{ ancestor }}{% if not loop.last %}, {% endif %}{% endfor %}
{% endfor %}

## My predictions

{% for item in predictions %}- {{ item.id }} ({{ item.status }}): {{ item.expectation }}; confidence {{ item.confidence }}; horizon {{ item.horizon }}; evaluation {% if item.evaluation %}{{ item.evaluation.assessment }}: {{ item.evaluation.interpretation }}; causes {{ item.evaluation.causalAttribution }}; evidence {% for evidence in item.evaluation.evidence %}{{ evidence }}{% if not loop.last %}; {% endif %}{% endfor %}{% else %}none{% endif %}
{% endfor %}

## Activation traces

{% for trace in activations %}- cycle {{ trace.cycleId }}: score {{ trace.activation.score }}, delta {{ trace.activation.delta }}{% for reason in trace.activation.reasons %}; {{ reason }}{% endfor %}
{% endfor %}

## Thought traces

{% for trace in thoughts %}- cycle {{ trace.cycleId }}: {{ trace.interpretation }} / {{ trace.thought }}
{% endfor %}

- Coactivated Parts: {% for item in coactivated %}{{ item.partId }} × {{ item.count }}{% if not loop.last %}; {% endif %}{% endfor %}
- Repeated referents: {% for item in repeatedReferents %}{{ item.name }} × {{ item.count }}{% if not loop.last %}; {% endif %}{% endfor %}

## Other Parts' public descriptions

{% for item in population %}- {{ item.name }} ({{ item.id }}, {{ item.mode }}): triggers {% for trigger in item.triggers %}{{ trigger }}{% if not loop.last %}; {% endif %}{% endfor %}
{% endfor %}

## Concurrent primitive appraisal traces

These are immediate subjective appraisals and action tendencies from cycles where I was activated, not another Part's private memory or authoritative world truth. Consider meaningful agreement or discrepancy alongside my own predictions and outcomes. One disagreement never forces memory revision or formation. Repeated evidence may support conservative incremental development through existing proposals; preserve existing structure when uncertain. Primitives themselves have no consolidation or learning lifecycle.
{% for trace in primitiveAppraisals %}- cycle {{ trace.cycleId }}: {{ trace.name }} ({{ trace.primitiveId }}) {{ trace.score }}/4; surfaced {{ trace.active }}{% if trace.thought %}; thought {{ trace.thought }}; interpretation {{ trace.interpretation }}{% endif %}
{% else %}(No concurrent primitive traces selected.)
{% endfor %}
