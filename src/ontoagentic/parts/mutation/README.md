# Part Mutation

Part Mutation represents explicit changes to persistent Part state.

Normal Part development should occur through mutations rather than silent replacement of the entire Part.

Possible mutations may conceptually include:

- change belief wording;
- add evidence;
- revise memory interpretation;
- add trigger;
- remove trigger;
- narrow trigger;
- broaden trigger;
- change strategy;
- revise prediction confidence;
- change mission interpretation;
- change cognitive capability;
- change lifecycle status.

The exact mutation representation remains open.

A structured patch format such as JSON Patch is one possible implementation.

## Semantic proposal, mechanical application

A cognitive inference process determines what the mutation means. Runtime infrastructure validates and applies it.

```text
Part evaluates experience
    ↓
Part proposes mutation
    ↓
runtime validates mutation
    ↓
new Part version
```

The runtime should not invent psychological changes itself.

## Incremental change

Ordinary mutation should prefer targeted changes. Avoid replacing the complete Part object merely because one belief changed.

## Historical preservation

Every accepted persistent mutation should eventually be historically reconstructable.

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.
