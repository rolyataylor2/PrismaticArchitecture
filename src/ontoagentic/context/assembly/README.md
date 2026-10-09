# Context Assembly

Context Assembly constructs inference contexts while preserving OntoAgentic cognitive boundaries. Different cognitive roles receive different context.

## Activator context

Conceptually:

shared objective WorldState snapshot

+

candidate Part trigger information

+

Activator role instructions

The Activator determines which candidate Parts psychologically trigger. It does not perform their full cognition.

## Part context

Conceptually:

shared objective WorldState snapshot

+

one Part's persistent state

+

that Part's subjective memories or retrieved evidence

+

Part evaluation instructions

Each Part is evaluated individually. Part-specific context must not alter the shared WorldState snapshot.

## Self context

Conceptually:

Self instructions

+

Identity

+

optional Identity mask

+

Part bids/reports

Self context explicitly excludes WorldState. Self must not receive WorldState merely because the context assembler already has it available.

## Prediction-evaluation context

Prediction evaluation may later combine the Part, its earlier prediction, and relevant future factual evidence. This is distinct from the original decision context.

## Context fragments

Implementations should preserve conceptual fragments so provider adapters can optimize caching without changing cognitive meaning. Examples include stable runtime instructions, the WorldState snapshot, candidate triggers, Part state, Part memory, bids, and Identity.

The physical arrangement of provider messages may vary where necessary, but cognitive access boundaries remain invariant.
