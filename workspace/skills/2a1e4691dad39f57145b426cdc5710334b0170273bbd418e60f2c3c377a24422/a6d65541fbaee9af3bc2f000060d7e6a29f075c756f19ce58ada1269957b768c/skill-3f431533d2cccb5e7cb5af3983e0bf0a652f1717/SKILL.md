---
name: skill-3f431533d2cccb5e7cb5af3983e0bf0a652f1717
description: "Prescribed conditional fixture policy. Use when: Current explicit preference and exact recorded input"
compatibility: "Exact recorded OntoAgentic MCP method bindings; requires compatible tools and current host approval."
metadata:
  ontoagentic-skill-id: "skill_25a84bc5-540e-4a9e-85c0-36eea3fdba9b"
  ontoagentic-version: "5"
---

# Prescribed conditional fixture policy

## When to use

- Current explicit preference and exact recorded input

## Procedure

Apply current preferences, constraints and host permissions before selecting this method.
Historical approval and maturity in the accompanying records do not grant permission in another host.

Select an applicable branch explicitly. There is no default branch.

- When Current preference is preservation: use [Prescribed conditional fixture policy: 1, version 3](assets/branch-1.json). Prescribed interpretation of the selected bid and outcome
  Verify: Independent value 42
- When Current preference is storage: use [Prescribed conditional fixture policy: 2, version 3](assets/branch-2.json). Prescribed interpretation of the selected bid and outcome
  Verify: Independent value 43

## Escalation

- Unknown input or incompatible current permission

## Supporting records

- [Recorded method and host metadata](assets/ontoagentic-method.json)
- [Development, bids, expressed thoughts and evidence](references/DEVELOPMENT.md)

The method asset preserves exact bindings and provenance. Importing this package must not execute calls or adopt source-host approval automatically.
