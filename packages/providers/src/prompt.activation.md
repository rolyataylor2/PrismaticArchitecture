# Shared Part and primitive activation scoring

## Output requirements

Return only the requested result. Give concise interpretations, evidence summaries and proposals, never hidden reasoning.

## Task instructions

Score every candidate Part and primitive independently on the ordered 0–4 scale. Do not rank, normalize or pick one winner. Several contributors may strongly activate simultaneously. Activation judges current resonance, not correctness, rationality, usefulness, morality, Identity alignment or whether Self should follow a bid. Maturity must not discount a young Part's activation. Plasticity is separate.

For current constructed working perspectives, consider the proposed interpretation, current situation, triggers, mission, beliefs, selected supporting or contrary subjective memories, open expectations, preceding factual actions, retained subjective thoughts and previous activation. Historical and retired instances are not candidates. Disposition-bound Parts participate directly and are omitted from these scoring questions. Only unbound generatively constructed Parts require Part activation scoring. Construction and memory accessibility already chose this working set; do not perform vector filtering or memory-owner discovery. Generic semantic similarity is not enough: the situation must meaningfully engage what this Part represents. Emotional charge, stickiness and historical provenance do not automatically determine activation or authority. Identity sensitivity information applies only to primitive questions and must not suppress learned perspectives.

When WorldState mentions time, take into account the temporal relationship between that time and each memory’s timestamp and any event timing expressed in its gist. Timestamps mark memory formation, not necessarily when the remembered event occurred. Do not invent missing times or automatically give recent memories greater activation weight.

For primitives, evaluate immediate registration through their own aspects and activation instructions, weighting only relevant supplied temperament self-definition Traits. Do not use learned Part beliefs, memories or forecasts to explain away immediate appraisal. Appraisal is subjective, not authoritative external reality. Distinguish appraisals from action tendencies. Addressed to me registers directed communication, while Respond is the tendency to answer it. Uncertain registers ambiguity; Signal uncertainty is the tendency to communicate missing knowledge, and Seek information is the tendency to ask for specific missing information. Score these independently; no appraisal requires its corresponding action tendency to activate. Agent caused this registers apparent responsibility of another intentional entity, not necessarily our own action. No remembered psyche, new predictions or complex planning is required. Missing temperament information means no supplied modulation, not a fabricated sensitivity value.

Ordered levels:
0 — Dormant: no meaningful resonance; incidental similarity.
1 — Stirred: weak/background resonance, unlikely to contribute.
2 — Active: meaningful engagement likely to attract attention or contribute.
3 — Strong: direct engagement and substantial pressure to contribute.
4 — Dominant: unusually intense engagement demanding attention. This level does not grant authority or automatically imply a spike.

Prioritize current-cycle stimulation; prior facts and thoughts provide recent context rather than making an old event new again. All questions share exactly this snapshot. Facts describe external evidence; attributed thoughts and owning-Part memories are subjective. Never pool private memories into another contributor's reasoning. Bid permission does not suppress appraisal: a primitive with bids disabled can still surface and contribute thoughts. Do not use surfacing thresholds to adjust Scores; runtime filtering happens afterward. Return exactly one score per requested ID, including primitives. The legacy output field partId carries the target ID for either contributor type.

## WorldState

World snapshot {{ world.id }} · cycle {{ world.cycleId }} · sequence {{ world.sequence }} · captured {{ world.capturedAt }}

{% for fact in world.facts %}- [{{ fact.timestamp|default('Time unknown') }}] {{ fact.source }} {{ fact.kind }}: {{ fact.text }}{% if fact.originCycleId is defined and fact.originCycleId == world.cycleId %} [current experience]{% endif %}
{% else %}(No facts in this snapshot.)
{% endfor %}

## Direct disposition participants

These Parts already participate without activation scoring. Their names/IDs provide participation context for primitive appraisal, including uncertainty about available perspectives. Never score these IDs or infer their private beliefs or memories.
{% for participant in directParticipants %}- {{ participant.name }} ({{ participant.partId }}) — active through disposition
{% else %}(None.)
{% endfor %}

## Candidates

{% for candidate in candidates %}
### {{ candidate.name }} ({{ candidate.id }})

- Agent: {{ candidate.agentId }}
- Mission: {{ candidate.mission }}
- Mode: {{ candidate.mode }} · lifecycle: {{ candidate.lifecycle }} · temporary: {{ candidate.temporary }}
- Emotional charge: {{ candidate.emotionalCharge }}
- Stickiness: retained {{ candidate.stickiness.retained }}, unresolved {{ candidate.stickiness.unresolved }}; concern: {{ candidate.stickiness.concern }}

#### Beliefs

{% for item in candidate.beliefs %}- {{ item }}
{% else %}(None.)
{% endfor %}

#### Strategies

{% for item in candidate.strategies %}- {{ item }}
{% else %}(None.)
{% endfor %}

#### Triggers

{% for item in candidate.triggers %}- {{ item }}
{% else %}(None.)
{% endfor %}

#### Cognitive characteristics

{% for item in candidate.cognitiveCharacteristics %}- {{ item }}
{% else %}(None.)
{% endfor %}

#### Memories (formation timestamp: gist)

{% for context in partActivationContext %}
{% if context.partId == candidate.id %}
{% for memory in context.memories %}- {{ memory.timestamp|default('Time unknown') }}: {{ memory.gist }}
{% else %}(No memories.)
{% endfor %}
{% endif %}
{% endfor %}
{% else %}(No candidates.)
{% endfor %}

## Internal Thought History

These are attributed subjective thoughts Memories and beliefs remain private and are not visible or noticable by any other entity. These do not represent the current world and instead are lingering thoughts that are fading out of existence. The older the thought the less activating its contents are.

{% if world.thoughtHistory is defined %}
{% for entry in world.thoughtHistory %}- {{ entry.partName }} ({{ entry.partId }}), cycle {{ entry.cycleId }}: {{ entry.thought }} — retention {{ entry.retention }}, age {{ entry.age }}, selected by Self {{ entry.selectedBySelf }}
{% else %}(No retained thoughts.)
{% endfor %}
{% else %}(No retained thoughts.)
{% endif %}


## Owning-Part activation context

{% for context in partActivationContext %}
### Part {{ context.partId }}
- Previous thread activation: {{ context.previous }}
- Open prediction: {% if context.prediction %}{{ context.prediction.expectation }}; status {{ context.prediction.status }}{% else %}none{% endif %}
{% endfor %}

## Primitive sensitivities from Identity

These researcher-authored self-definition Traits contextualize primitive reactivity and regulation only. They are not Part activation criteria or a separate temperament database. No autobiographical Traits are supplied.
{% for trait in primitiveSensitivities %}- {{ trait.question }}: {{ trait.answer }}; keywords {% for keyword in trait.keywords %}{{ keyword }}{% if not loop.last %}; {% endif %}{% endfor %}
{% else %}(No explicit temperament Traits supplied.)
{% endfor %}

## Primitive definitions (always appraised)

{% for primitive in primitives %}
### {{ primitive.name }} ({{ primitive.id }})
- Family: {{ primitive.family }}
- Aspects: {% for aspect in primitive.aspects %}{{ aspect }}{% if not loop.last %}; {% endif %}{% endfor %}
- Activation instructions: {{ primitive.activationPrompt }}
- Surfacing threshold: {{ primitive.activationThreshold }}/4 (runtime policy, not activation authority)
{% else %}(No primitive definitions supplied.)
{% endfor %}

Retrieval keys are vector-search metadata and are excluded from this scoring context. Judge activation using the supplied psychological record and WorldState.