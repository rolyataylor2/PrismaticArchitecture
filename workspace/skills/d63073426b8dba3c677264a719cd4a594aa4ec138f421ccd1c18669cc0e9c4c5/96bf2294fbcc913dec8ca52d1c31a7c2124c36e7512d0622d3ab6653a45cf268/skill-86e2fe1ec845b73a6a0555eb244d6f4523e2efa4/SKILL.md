---
name: skill-86e2fe1ec845b73a6a0555eb244d6f4523e2efa4
description: "Prescribed conditional fixture policy. Use when: Current explicit preference and exact recorded input"
compatibility: "Exact recorded OntoAgentic MCP method bindings; requires compatible tools and current host approval."
metadata:
  ontoagentic-skill-id: "skill_a8e3d8e6-f512-4d87-90a1-8c42fbffb0b1"
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
