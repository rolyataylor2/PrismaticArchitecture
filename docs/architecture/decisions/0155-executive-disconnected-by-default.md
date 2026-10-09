# ADR 0155: Executive disconnected by default

Status: Accepted.
Date: 2026-10-09
Source: Researcher request in the development conversation.

## Decision

Each Agent has a researcher-controlled Executive enabled setting, default false. Profiles lacking this setting also read as disabled. Enabling is explicit and versioned outside psychology.

When disabled, ordinary cognition still activates, recalls, forms Parts, evaluates predictions, selects with world-blind Self and records subjective development. It does not discover Executive capabilities, inject operational requests, skills or imported skill documents, compile execution contracts, hand off actions (including speech), or accept Executive checkpoint cognition/consultation. Execution and teaching feedback are excluded from subsequent factual projection. Selection is not execution; no completed outcome is fabricated. Enabling later does not replay earlier selections.

Existing audit records, contracts and configuration remain inspectable. Disabling prevents further tool submissions even under earlier captured contracts; an already submitted external effect cannot be undone by this setting. Background results may still be recorded for audit, without initiating cognition or automatic learning while disabled. Cognitive memories and prior subjective thoughts remain cognitive history, not Executive connections.

Factory prompts describe proposals as recommendations with execution conditional on the host enabling it. No inference task or Self access is added.

## Validation

Deterministic integration checks cover default/legacy profiles, selection without handoff, exclusion of operational context/feedback, opt-in execution, subsequent disablement and checkpoint rejection. These are configuration and boundary checks, not psychological hypotheses.

The Executive boundary, real background disablement, browser opt-in, profile/migration and affected execution/skill/sandbox regression checks pass. The full regression run exposed two unrelated 390px layout assertions (Dispositions and Part inspector); both reproduce on the unchanged baseline. Existing execution fixtures and Executive sandbox experiments now opt in explicitly rather than changing the production default.
