# Part Runtime Protocol

The Part runtime should remain mechanically simple and semantically neutral. Its job is to make persistent cognitive perspectives possible.

## Mechanical responsibilities

The runtime may eventually provide:

- durable Part storage;
- identifiers;
- Part retrieval;
- vector indexing;
- trigger candidate retrieval;
- validated mutation application;
- version creation;
- retaining an open Part prediction and its evaluation horizon;
- surfacing relevant later evidence for prediction evaluation;
- lifecycle persistence;
- archival;
- history access.

## Semantic responsibilities

The runtime does not decide what a Part believes, what it should want, whether an event matters emotionally, whether a memory is true, how a Part should reinterpret experience, whether two perspectives are psychologically equivalent, or whether a Part has fulfilled its mission.

Those judgments are produced through cognitive inference.

## Model/runtime boundary

```text
model / cognitive inference
    ↓
structured semantic proposal
    ↓
runtime validates shape and permission
    ↓
runtime applies mechanical change
    ↓
new version
```

Examples include creating a Part, mutating a Part, splitting a Part, merging Parts, archiving a Part, and reactivating a Part.

## Minimalism

Avoid turning the runtime into an opinionated psychological workflow engine. The runtime should provide durable mechanisms. The cognitive system provides meaning.

## Canonical mechanical minimum

Future implementations should expect approximately these mechanisms:

```text
Part persistence
WorldState snapshots
vector candidate retrieval
Activator inference
Part inference
bid collection
Self inference
Identity retrieval
open-prediction continuity and evidence surfacing
validated Part mutations
Part version history
lifecycle operations
inspection
```

This is not a required class structure.
