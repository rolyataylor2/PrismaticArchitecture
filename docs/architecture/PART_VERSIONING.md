# Part Versioning

Every persistent Part is developmental.

The framework should preserve both:

"What is this Part now?"

and:

"How did it become this?"

## Immutable history

Accepted Part mutations create historical versions. Previous versions should not be destructively rewritten.

```text
Part v1
    ↓ mutation
Part v2
    ↓ mutation
Part v3
```

## Mutation provenance

A persistent mutation should eventually be traceable to relevant information such as previous version, new version, reason for change, triggering experience, prediction result, memory evidence, lifecycle operation, and timestamp. The exact metadata schema remains open.

## Reverting

Rollback should not erase later history. A rollback creates another historical version:

```text
v1
 ↓
v2
 ↓
v3
 ↓
restore state based on v1
 ↓
v4
```

v2 and v3 remain part of history. This allows the system to say, "The current Part resembles version 1 again," without pretending versions 2 and 3 never happened.

## Editing an edit

Historical mutations themselves should not normally be rewritten. A later mutation may supersede a previous mutation's effect. This creates a new version.

## Branching

Experiments and simulations may eventually branch Part state from an earlier version. Branches preserve common ancestry.

## Split

A split creates multiple descendant lineages.

## Merge

A merge creates a descendant with multiple ancestors.

## Archive

Archiving changes lifecycle state. It does not end historical accessibility.
