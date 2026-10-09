# ADR 0123: JEV subjective memory recall and memory candidate filtering

Status: Accepted, 2026-10-02.

## Decision

Current subjective memories remain owner-scoped, append-only versioned records. Recall scans the chronological current versions, never reconstructing them from objective history. The bounded decision adapter scores each memory independently against the exact immutable WorldState and its owning Part's perspective. Functional usefulness to interpretation, prediction, emotional response or action matters more than textual similarity. Formation timestamps are supplied separately from remembered event timing; temporal scope is interpreted from WorldState without inventing dates.

Recall uses independent Jev 0–4 Scores, exposed as relevance 0–1 (score / 4), preserving distributions. Runtime selects above a configurable inclusive relevance threshold, descending relevance, with an optional maximum count. Defaults are 0.5 and 12; no maximum is also supported. These are experimental operational settings, not psychological intensity or authority. All current memories are scored before selection. No embeddings or fabricated retrieval keywords are required. Batches of 100 share the same WorldState; candidate-set sensitivity remains experimental.

Each activated Part receives only its own selected exact stored memories. Prediction evaluation and post-deliberation context refresh use the same owner-scoped recall. Empty streams require no provider request. Invalid, missing or duplicate results fail as infrastructure errors; there is no silent all-memory fallback. Scores and selections are inspectable audit state, not Part memory.

A per-Agent memorySearchEnabled setting selects an alternative candidate filter: score current memories belonging to active-lifecycle Parts, select relevant memories, then nominate their owners for ordinary activation. This scorer-only cross-owner access is an explicit researcher-requested retrieval mechanism, not an authoritative autobiographical database. Each memory is scored with its own owner; no Part receives another owner's private state. Memoryless Parts remain candidates so new perspectives are not excluded. Sticky unresolved Parts remain candidates. Dormant/archived Parts remain excluded. Memory relevance never directly activates a Part. This extends ADR 0091 and the vector-first pipeline in ADR 0067: memory mode takes precedence over vector mode; disabling both scores every eligible Part. Existing Agents keep vector mode by default.

## Boundaries and integration

Self and primitives receive no recall state or raw memories. Factory relevance prompts omit provenance and ancestry references; these references are not automatically retrieval triggers. Current memory content and its version history remain preserved; relevance does not write psychological state. One editable Mem · Memory relevance task supports owner recall and candidate discovery, with task-scoped preview and provider routing. Existing overrides are preserved. No global planner, task manager or faculties system is introduced.
