# Decision Models

A decision model consumes state and returns bounded semantic judgments or chooses among predefined outcomes.

OntoAgentic uses decision models where:

- possible outputs are already known;
- open-ended generation is unnecessary;
- probabilistic uncertainty is useful;
- the result will be consumed by code.

## Noul / binary probability

Answers: “Is this proposition true?” Its probability primarily expresses uncertainty about a binary proposition. Binary judgments may be useful in experiments but are not the canonical Part activation representation.

## Score

Answers: “Where does this item fall on an ordered semantic scale?” Part activation is graded, so it maps more naturally to independent Score-style judgments, one per candidate against the shared WorldState. The permanent scale remains experimental; scores are not normalized across candidates.

## Choice

Answers: “Which predefined option should be selected?” Choice remains appropriate for Self arbitration among existing proposals or `DELIBERATE`. Do not use Choice for Part activation.

## Appropriate uses

Current appropriate uses include:

- How activated is this Part by the WorldState according to its trigger pattern?
- Which existing bid best serves Identity?
- Is additional deliberation required?

## Inappropriate uses

Decision models should not be asked to:

- write a Part's argument;
- invent new actions;
- generate memories;
- determine a Part's mission;
- rewrite Part beliefs;
- narrate psychological explanations.

Those are generative tasks.

## Probabilities

Decision probabilities describe uncertainty in the current semantic judgment.

They are not automatically psychological properties.

For example:

An activation Score for Part A describes that Part's own graded activation assessment.

means approximately: “How activated is Part A by this WorldState according to its trigger pattern?”

It does not automatically mean fear, strength, emotional intensity, bid priority, or control. Self-arbitration probabilities likewise describe uncertainty among currently supplied choices. They may be retained as operational telemetry and used by runtime policies, but must not silently become psychological state.
