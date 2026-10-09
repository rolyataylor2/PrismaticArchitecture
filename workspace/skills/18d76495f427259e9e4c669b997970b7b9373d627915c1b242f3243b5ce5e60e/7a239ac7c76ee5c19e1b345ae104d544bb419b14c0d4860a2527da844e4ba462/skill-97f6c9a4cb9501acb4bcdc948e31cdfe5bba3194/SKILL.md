---
name: skill-97f6c9a4cb9501acb4bcdc948e31cdfe5bba3194
description: "Prescribed conditional fixture policy. Use when: Current explicit preference and exact recorded input"
compatibility: "Exact recorded OntoAgentic MCP method bindings; requires compatible tools and current host approval."
metadata:
  ontoagentic-skill-id: "skill_babf96a7-09c4-45d3-8cbb-582bf261ecf5"
  ontoagentic-version: "1"
---

# Prescribed conditional fixture policy

## When to use

- Current explicit preference and exact recorded input

## Procedure

Apply current preferences, constraints and host permissions before selecting this method.
Historical approval and maturity in the accompanying records do not grant permission in another host.

Select an applicable branch explicitly. There is no default branch.

- When Current preference is preservation: use [Prescribed conditional fixture policy: 1, version 2](assets/branch-1.json). Prescribed interpretation of the selected bid and outcome
  Verify: Independent value 42
- When Current preference is storage: use [Prescribed conditional fixture policy: 2, version 2](assets/branch-2.json). Prescribed interpretation of the selected bid and outcome
  Verify: Independent value 43

## Escalation

- Unknown input or incompatible current permission

## Supporting records

- [Recorded method and host metadata](assets/ontoagentic-method.json)
- [Development, bids, expressed thoughts and evidence](references/DEVELOPMENT.md)

The method asset preserves exact bindings and provenance. Importing this package must not execute calls or adopt source-host approval automatically.
