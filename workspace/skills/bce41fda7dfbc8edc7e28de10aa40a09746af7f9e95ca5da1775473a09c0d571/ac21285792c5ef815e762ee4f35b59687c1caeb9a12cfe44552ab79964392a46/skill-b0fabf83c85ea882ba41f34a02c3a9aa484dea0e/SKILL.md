---
name: skill-b0fabf83c85ea882ba41f34a02c3a9aa484dea0e
description: "Prescribed conditional fixture policy. Use when: Current explicit preference and exact recorded input"
compatibility: "Exact recorded OntoAgentic MCP method bindings; requires compatible tools and current host approval."
metadata:
  ontoagentic-skill-id: "skill_af3f63c0-e3e5-4cc3-88d8-913d8bab5e13"
  ontoagentic-version: "2"
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
