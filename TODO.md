# Active Self affect thread — ADR 0157

- [x] Record source requirements and architectural access/lifecycle boundaries.
- [x] Add explicit Part affect proposals, restricted selection contracts and origin-cohort feedback logic.
- [ ] Route the separate affect-selection inference and focused Part revision tasks; synchronize prompt catalog and previews.
- [ ] Connect bounded first-pass deliberation, baseline scoring and final bid selection to ordinary runtime.
- [ ] Persist periods, renewals/expiry/navigation and delayed prediction attribution across restart.
- [ ] Add lifetime/timeframe affect panel, per-period statistics and source inspection.
- [ ] Add sourced normal-pipeline Simulation Tests and verify every audit requirement.

# Completed requested prediction scaffold work

- [x] Implement and verify all conclusions of the 6ac6ac9c shared thread. Source and requirement ledger: docs/development/PREDICTION_SCAFFOLD_THREAD_{SOURCE,AUDIT}.md.
- [x] Read required architecture/theory, document revised hypothesis-first formation architecture, implement full lifecycle and synchronized surfaces, add normal-pipeline experiments, complete requirement-level verification.

# The Prism Agent Architecture Development TODO

Task specification: `docs/development/IMPLEMENTATION_REQUEST.md`. Resume by reading this file and `docs/development/CURRENT_STATE.md`. Check boxes require implementation and evidence, not intent.

## Phase 0 — Repository audit and ledger
- [x] Inventory repository: documentation/scaffolding only; no executable source or package manager.
- [x] Read root rules, canonical flow, system overview, invariants, open questions.
- [x] Create persistent development ledger and preserve full implementation request.
- [x] Read remaining required architecture, theory, subsystem READMEs, and ADRs.
- [x] Establish strict TypeScript workspace, scripts, and implementation decision record.

## Phase 1 — Domain and persistence
- [x] Define validated Agent, Identity, Part, memory, prediction, WorldState and mutation contracts.
- [x] Implement SQLite migrations, durable current state, immutable versions, and audit origins.
- [x] Implement owner-scoped cognitive access and separate privileged inspection.
- [x] Test persistence/restart, version continuity, ownership, rollback, and one-open-prediction constraint.

## Phase 2 — Providers
- [x] Define decision, reasoning and embedding interfaces and versioned prompts.
- [x] Implement clearly labeled deterministic providers.
- [x] Implement configured real reasoning provider with schema validation and infrastructure errors (Ollama; stub transport tested, live service not yet verified).
- [x] Implement Jev contract/configuration and real adapter where service access permits (injectable transport; service access unavailable).

## Phase 3 — First executable cognitive slice
- [x] Freeze one WorldState; persist cycles and typed live events.
- [x] Persist trigger embeddings; high-recall candidate filtering plus sticky inclusion.
- [x] Shared independent activation Scores, configurable policy, previous score and spike.
- [x] Independent Part cognition using identical WorldState and private state.
- [x] World-blind Self Choice and bounded DEBATE with Part responses.
- [x] Selected-action external handoff and future factual execution outcomes.
- [x] Seed agent and CLI create/chat/cycle inspection.
- [x] Test complete slice and cognitive access boundaries.

## Phase 4 — Predictions and development
- [x] Part-selected capsule, continuation/revision, early resolution, abandon/expiry/invalidation.
- [x] Later evidence evaluation and causal attribution; waking episodic memory.
- [x] Explicit versioned Part patches, lifecycle, rollback as new version, researcher origins.
- [x] Verify bounded activation cues and recognition/context-only Parts (execution and consolidation tests).
- [x] Tests for privacy, no ordinary ancestor replay, immutable memory/prediction history.

## Phase 5 — Sleep
- [x] Selected psychological traces, conservative no-change, persisted proposals/acceptance.
- [x] Demonstrate Part update, formation, memory reinterpretation, trigger/association adjustment.
- [x] Specific/generalized learning with provenance isolated from triggers.
- [x] Controlled exceptional ancestor replay to current owning Part, never Self.
- [x] Tests for consolidation boundaries, provenance, no automatic coactivation merge.

## Phase 6 — Shared application services, CLI and server
- [x] Typed service/API contracts shared by CLI, server, experiments and tests.
- [x] Full agent/Part/Identity/memory/prediction/history/sleep management CLI and help.
- [x] CLI live cognitive stream.
- [x] HTTP API, validated writes, infrastructure errors, SSE stream and reconnect.

## Phase 7 — Web application
- [x] Agent creation/selection and interaction.
- [x] Live Brain Monitor with expandable stages, Part cards, frozen old-cycle inspection.
- [x] Part Manager create/edit/archive/reactivate, state and version comparison.
- [x] Memory Inspector with explicitly gated objective ancestor inspection.
- [x] Prediction Monitor including Parts without open predictions and causal evaluation.
- [x] Typed Part Network including lineage, associations and provenance.
- [x] Sleep Console selected traces, proposals, accepted/rejected/no-change, before/after.
- [x] Filterable History Timeline and Identity Inspector.
- [x] Experiment Panel with saved results.

## Phase 8 — Demos and experiments
- [x] Controlled text environment with validated actions and factual outcomes.
- [x] Reproducible 17-step development demo, inspectable in CLI and web.
- [x] Activation stability, stickiness, prediction correction, memory, sleep experiments.
- [x] Therapy baseline → ordinary interaction → immediate retest → sleep → same-context → novel-context → durability benchmark.

## Phase 9 — Validation and documentation
- [x] Root README install/configure/run/inspect/manage/sleep/benchmark documentation.
- [x] Tests, typecheck, lint, build and deterministic demo pass (21 tests, zero skips).
- [x] Real provider smoke test if credentials available; otherwise record limitation (no installed/configured Ollama or Jev transport; stub contract tests pass).
- [x] Verify all 27 completion workflow steps including restart persistence.
- [x] Audit every specification requirement and record authoritative evidence in `docs/development/COMPLETION_AUDIT.md`.

## Hardening discovered during implementation
- [x] Validate asynchronous external execution status updates and handoff identity; test next-cycle outcomes, including delayed results after more than eight cycles.
- [x] Verify complete CLI command coverage against specification and run subprocess persistence checks.
- [x] Add explicit recovery for interrupted cycles/consolidations without silently re-executing actions.
- [x] Review semantic output validation, concurrent edits, and persistence/event atomicity; use selected event queries for ordinary cognition/sleep.
- [x] Build browser assets before tests, guard asynchronous Agent selection responses, preserve input drafts, and display configured provider labels.

## Completion evidence
See `docs/development/COMPLETION_AUDIT.md` for the complete scope mapping, tested workflow, command evidence and explicitly permitted limitations. No required implementation tasks remain for the requested local demo.

## Live OpenAI + Jev integration (2026-09-29)

- [x] Add inexpensive OpenAI reasoning and official Jev HTTP transport.
- [x] Load private local credentials and preserve mock demo behavior.
- [x] Add stubbed provider contracts and explicit paid smoke command.
- [x] Complete live follow-up cycle and final validation (27 tests, lint/build, two live cycles, live browser-server configuration).

## Per-Agent inference settings (2026-09-29)

- [x] Add a Settings tab with inexpensive OpenAI model choices and an optional Agent API key.
- [x] Route each Agent's reasoning through its configured model, keeping Jev host-configured.
- [x] Encrypt per-Agent keys outside cognitive state; omit secrets from the API response and SQLite plaintext.
- [x] Validate model routing, secret storage, browser settings workflow, migrations, and live server startup.

## Editable prompt settings (2026-09-29)

- [x] Add a Prompts tab for every task prompt, grouped by inference task and category.
- [x] Save prompt text per Agent or as a global default and resolve it in OpenAI, Jev and Ollama calls.
- [x] Show factory originals and chronological immutable edits/resets.
- [x] Reset one Agent prompt to the current global default, or a global prompt to its built-in original.
- [x] Reset all prompts across all Agents and global defaults to original built-in configuration while preserving history.
- [x] Verify settings UI, provider wiring, immutable storage and full-reset behavior in browser/API tests.
# Disposition discussion implementation (2026-10-04)

- [x] Retrieve the complete shared discussion and inspect ADR 0133/0126 and current runtime.
- [x] Record conclusions and compatibility decisions in ADR 0134 and DISPOSITION_THREAD_AUDIT.md.
- [x] Broaden factory prompts and Settings descriptions to general attention, situational navigation and conservative natural growth.
- [x] Supply selected chronological activation/cognition trajectories to disposition learning, with thread attribution and no raw world/private state.
- [x] Verify general scopes, overlapping procedural recall, changing situational relevance, conservative creation/refinement and provider rendering.
- [x] Complete requirement audit, build, tests and lint; refresh the development handoff (171 tests passed, zero skips; build/typecheck/lint passed).

## Simulation Tests sidebar (2026-10-04)
- [x] Document experiment boundaries and future-hypothesis instructions (ADR 0135, AGENTS.md).
- [x] Add sourced runnable disposition hypothesis registry, independent measurements, isolated configured/fixture runs, persistence and progress API.
- [x] Add sidebar test catalog, execution controls, progress and evidence reports.
- [x] Verify no forced judgments, source isolation, observable/inconclusive/failed outcomes, persistence and browser workflow; update handoff (174 tests passed, zero skips; affected API/browser checks 3/3; build/typecheck/lint passed).
