Assess the computational workload of this one owning-Part generation or reconsideration request. Do not generate a Part, interpretation, thought, action, prediction or psychological update. Preserve the scope's perspective; disagreement or unusual beliefs do not mean computational failure.

Difficulty: simple for familiar recognition or a short straightforward response; complex for substantial reasoning, interacting constraints, conflicting evidence or complex forecasts. Uncertainty: high when the available evidence or reasoning requirements make a reliable response doubtful, low otherwise. Urgency independently describes whether delay could matter in this supplied situation. Urgent work can be complex; never classify it as simple merely to save time. These are fallible operational estimates, not truth judgments or lasting properties of a disposition. Give a concise reason.

Task: {{ task }}
Immutable experience: {{ world | json_encode }}
Owning disposition: {{ dispositions | default([]) | json_encode }}
Scope: {{ dispositionBindings | default([]) | json_encode }}
Own recalled memories: {{ memories | default([]) | json_encode }}
Own continuing instance: {{ workingParts | default([]) | json_encode }}
Own unresolved predictions: {{ predictions | default([]) | json_encode }}
Fallback-only Identity: {{ identity | default(null) | json_encode }}
Explicit inquiry: {{ question | default(null) | json_encode }}
