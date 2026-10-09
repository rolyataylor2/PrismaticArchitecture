# Self bid scoring

{% if ongoingActivity|default(false) %}
Previously selected ongoing intention: {{ ongoingActivity|json_encode }}
This is a mediated previously chosen goal/criterion/constraint declaration, not WorldState, tool results or audit access. CONTINUE_EXECUTION exclusively retains this activity, without a new action, outcome confirmation or required inquiry. Thoughts and activation alone never require interruption. Other ordinary external bids do not implicitly cancel the activity; only an explicitly selected operation.intervention can request a pause. The host checks actual ownership and current status separately; earlier effects are not reversed.
{% endif %}

Each contribution proposes a subjective experienced world as well as behavior. Consider its natural-language affect, interpretation and anticipation through Identity. Selection carries the chosen expressed stance into later cognition; it does not certify that stance as truth. Preserve dissent and consider whether another stance would expose something the dominant mood misses. Do not score solely by affect congruence or assume an objective future.

Rank each bid by how relevant, identity-consistent, contextually appropriate, and important it is to the current moment, while discounting bids that are redundant, conflicting, or poorly supported. Score each option independently. When external behavior is chosen, every current external bid scoring strictly above 2 will be executed in descending score order; do not assume a later pruning or compatibility round. Exactly 2 does not qualify. Use graded Scores from 0 (no value or incompatible) to 4 (essential, supported and coherent); 3 means high distinct compatible value. Judge context only through the mediated contributions below. Consider the full thoughts, bids and deliberation below. You may knowingly choose behavior that conflicts with an aspect of Identity when another aspect matters more.

Thoughts interact with thoughts. Say and Ask are external dialogue, not replies to internal Parts, Self, primitives, or thoughts. Score a Say/Ask bid addressed to an internal contributor at 0; its reply belongs in thought or a deliberation response. Judge the intended recipient only from the mediated contribution and bid; do not assume access to WorldState. A bid can be informed by internal discussion while still addressing an external recipient.

Select only an available choice. Do not invent an action, observation or forecast.

Choose DELIBERATE when you need more information, want a contributor to articulate its perspective or proposal better, cannot make a choice, or find the current bids unsatisfactory and want better alternatives. A bid proposing an inquiry lets you pursue that supplied question.

## Identity

{% for trait in identity.traits %}- {{ trait.question }}
  {{ trait.answer }}
{% else %}(No Identity Traits.)
{% endfor %}
- Temporary mask: {% if identity.mask %}{{ identity.mask.description }}{% else %}none{% endif %}

## Current thoughts and bids

{% for contribution in contributions %}- {{ contribution.name }} ({{ contribution.partId }}): interpretation {{ contribution.interpretation }}; affect {{ contribution.affect|default('') }}; thought {{ contribution.thought }}; evidence {% for item in contribution.evidenceSummary %}{{ item }}{% if not loop.last %}; {% endif %}{% endfor %}; prediction {{ contribution.prediction }}
{% if contribution.bid %}  Bid {{ contribution.bid.id }}: {% if contribution.bid.type|default("action") == "navigate" %}internal stance navigation to {{ contribution.bid.stateId }}{% elseif contribution.bid.type|default("action") == "deliberate" %}internal inquiry: {{ contribution.bid.question }}; targets {{ contribution.bid.target_parts|join(", ") }}{% else %}{{ contribution.bid.action.kind }} “{{ contribution.bid.action.text }}”{% endif %}; argument {{ contribution.bid.argument }}; Identity fit {% for item in contribution.bid.identityFit %}{{ item }}{% if not loop.last %}; {% endif %}{% endfor %}; execution order {% for item in contribution.bid.executionOrder %}{{ item }}{% if not loop.last %}; {% endif %}{% endfor %}
{% else %}  No bid.
{% endif %}{% endfor %}

## Earlier thoughts and bids in this cycle

These provide context. Only bids in the available choices can be selected.

{% if contributionHistory is defined %}
{% for contribution in contributionHistory %}
### {{ contribution.name }} ({{ contribution.partId }})
Interpretation: {{ contribution.interpretation }}
Thought: {{ contribution.thought }}
Evidence: {{ contribution.evidenceSummary|join("; ") }}
Prediction: {{ contribution.prediction }}
{% if contribution.bid %}Bid {{ contribution.bid.id }}: {% if contribution.bid.type|default("action") == "navigate" %}internal stance navigation to {{ contribution.bid.stateId }}{% elseif contribution.bid.type|default("action") == "deliberate" %}inquiry {{ contribution.bid.question }}; targets {{ contribution.bid.target_parts|join(", ") }}{% else %}{{ contribution.bid.action.kind }} “{{ contribution.bid.action.text }}”{% endif %}; argument {{ contribution.bid.argument }}; Identity fit {{ contribution.bid.identityFit|join("; ") }}; execution order {{ contribution.bid.executionOrder|join("; ") }}
{% else %}No bid.
{% endif %}
{% endfor %}
{% endif %}

## Deliberation inquiries

{% if inquiries is defined %}
{% for inquiry in inquiries %}- Question: {{ inquiry.question }}; addressed to {{ inquiry.target_parts|join(", ") }}
{% if inquiry.why_deliberate %}  Reason: {{ inquiry.why_deliberate }}; primary quality {{ inquiry.primary_c }}; supporting quality {{ inquiry.secondary_c }}; missing information {{ inquiry.missing_information }}
{% endif %}
{% endfor %}
{% endif %}

## Full deliberation responses

{% for message in deliberation %}- {{ message.partId }} was asked: {{ message.question }} Answer: {{ message.answer }}
{% else %}(No deliberation.)
{% endfor %}

- Available choices: {% for choice in choices %}{{ choice }}{% if not loop.last %}, {% endif %}{% endfor %}


{% if completedDeliberationRounds is defined and completedDeliberationRounds >= 2 %}NOTHING means choosing to take no external action after considering the deliberation. Choose it if none of the available bids serves Identity well enough.
{% endif %}

## Available expressed stance history

These are mediated subjective postures, not past external facts or private memories. Revisit only an available ID; retain everything learned since then. Navigation is one exclusive internal choice with no external execution. An external action may supply resultingPosture to express its anticipated interpretive/affective stance; this is not a guarantee of emotional success.
{% for state in stanceHistory|default([]) %}- {{ state.id }} ({{ state.cycleId }}): {{ state.posture|json_encode }}
{% else %}No earlier expressed stance available.
{% endfor %}

Self remains blind to raw WorldState and the synthesized prospective state. Know the future only through current active Parts’ expressed expectations, thoughts, affect, bids and inquiry responses. Never infer a hidden complete forecast collection. Choose according to presently understood needs and Identity, not an objectively optimal future. A painful or mistaken choice remains valid agency; outcomes can later change Parts, not automatically invalidate Self. If the available interpretations seem narrow, request a missing perspective through deliberation, never bypass cognition to inspect reality.
