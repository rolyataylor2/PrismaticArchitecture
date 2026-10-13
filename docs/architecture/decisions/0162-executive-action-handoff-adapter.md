# ADR 0162: Executive action handoff adapter

Status: Accepted scope clarification.
Date: 2026-10-12
Source: Researcher request to make the Executive Layer’s adapter role explicit in the README and elsewhere.
Clarifies ADR 0140 and subsequent Executive extensions; supersedes interpretations requiring a feature-complete execution agent inside this repository.

## Decision

The Executive Layer is an adapter that assembles Self-selected actions into a bounded handoff for a task-focused external tool-use agent. It is not intended to be a feature-complete tool-use agent execution layer.

The handoff preserves selected intent, action order, constraints, success criteria, permissions, budgets and source lineage without inventing missing instructions. Operational planning, tool orchestration and recovery belong to the external agent within that contract. The framework continues to enforce authority and record attributed factual feedback for later WorldState. Only Self selects a new intention through ordinary mediated cognition; the external agent cannot change goals, grant itself authority or mutate psychology.

Existing native exact-strategy execution, MCP infrastructure, validation, monitoring and procedural evidence remain bounded integration and research support. They do not establish a requirement to implement a complete external agent internally. Earlier descriptions of general planning and recovery describe external execution capabilities, not an expansion of the adapter’s responsibility. Concrete external-agent adapters remain implementation work; this clarification does not claim they are complete or change current runtime behavior.

## Prompt and task review

The factory cognition and Part cognition prompts already describe recommendations, supported exact strategies, conditional enactment and Self selection. Procedural consolidation proposes evidence-backed methods without execution authority. Those current interfaces and access boundaries remain unchanged, so no inference task, routing, prompt text or Settings → Prompts catalog change is required for this scope clarification.

## Verification

Review the root README, canonical flow, system overview, invariants, Executive subsystem README and current implementation status together. Documentation must distinguish the intended external-agent handoff from existing native support and preserve selection, permission, feedback and psychology boundaries. This is a scope clarification, not a new cognitive hypothesis or runtime mechanism.
