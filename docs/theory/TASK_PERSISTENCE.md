# Task Persistence

Task persistence is a property of continued Part relevance and strategy, not a separate Agent-level goal subsystem.

An unfinished concern can persist because the Part carrying it remains cognitively available while the concern is unresolved. The task itself does not possess motivation; the Part does. Parts may have dynamic stickiness, and their proposals may include an execution order for multi-step behavior.

## Across cognitive cycles

Ordinary candidate retrieval uses high-recall vector filtering. Candidate assembly may also retain sticky unresolved Parts and other explicitly due/relevant Part sources already supported:

```text
high-recall vector survivors
+ sticky unresolved Parts retained for consideration
        ↓
one shared Jev activation request
        ↓
independent activation Score per Part
        ↓
activation policy
```

Sticky Parts remain in the candidate population; they are not assigned maximum activation. Jev evaluates each against the exact shared immutable WorldState Wₙ. Stickiness, activation, and emotional charge are distinct. Stickiness does not grant authority, guarantee a bid, or ensure Self selects the Part.

A behavioral proposal may contain a sequence belonging to that Part's strategy. After Self selects a proposal, execution is handed to the appropriate external interface. Objective execution results can appear in a later WorldState, allowing the Part to recognize completed steps and continue or revise its strategy. At each later decision point, Self remains the chooser.

## Interruption and resumption

Other Parts may become strongly activated and Self may select their proposals. Interruption does not automatically erase an unresolved sticky concern or lock the Agent into it. The concern may become relevant again in later cycles through retained candidate consideration, objective evidence of prior progress, and the Part's remaining strategy.

## Resolution and forgetting

When a concern resolves, stickiness will normally decline. A Part may then remain normally available, become dormant, archive, change mission, or cease active participation if temporary. Stickiness may also weaken through abandonment, changed importance, expired deadlines, impossibility, repeated interruption, or evidence that revises the strategy. No algorithm is fixed here.

## Scope

This theory does not require a global goal, intention, commitment, or task manager. An Intention Manager may be an example of a possible Part whose mission concerns conflicting commitments or limited time; it has no special runtime position or authority. Resource awareness may likewise emerge in ordinary Parts.

Generic automated tasks, background jobs, scheduled agents, and job runners belong to external infrastructure. Prediction evaluation scheduling remains runtime support for Part learning, not task automation.
