# ADR 0140: Bounded, teachable external Executive

Status: Accepted implementation target; completion is tracked separately.
Date: 2026-10-08
Source: https://chatgpt.com/share/6ac7d5eb-8150-83e8-b6cc-d4727cea3e96
Extends ADRs 0070, 0113 and 0117 without changing the cognitive loop.

## Decision

Self determines what to pursue. The external Executive determines how to enact that selected intent within a framework-enforced execution contract. WorldState records operational observations. Parts determine psychological meaning. The Executive cannot rewrite Identity, memories, predictions, dispositions, activation or its own authority.

The latest substantive thread revises its earlier prohibition on Executive learning: cognitively instructed procedures may be validated, versioned and retained. Psychological learning remains exclusively in ordinary cognition and offline consolidation. Immediate operational adaptation, durable procedural learning and cognitive development are separate operations.

## Handoff and authority

Operational bids may supply an explicit ordered tool strategy and a separately selected verification call with an exact structured-result criterion. This is a supported deterministic starting mechanism, not the sole final planning model: the full Executive target still includes bounded plan construction and permitted operational adaptation. Exact selected arguments constrain this path; it cannot reinterpret linguistic constraints as permission to change recipients, channels or payloads. Missing steps or verification return compact blocked/unverified feedback rather than inventing a plan or claiming success. Raw capability schemas may enter the shared immutable WorldState as external availability records for ordinary Part proposals; Self sees only expressed proposals. Detailed MCP arguments and responses remain in the separate execution audit ledger.

Code compiles selected bids, their order, decision/cycle/thread references, associated opaque prediction references, explicit success criteria, constraints, granted capabilities and budgets into an immutable contract. Compilation must not invent recipient, channel, success evidence or permission from ambiguous prose. Missing operational details cause guidance requests. Self continues choosing from Part proposals; there is no global psychological planner or task manager.

The Executive may construct a bounded plan, inspect permitted capabilities, sequence operations, coordinate parallel external jobs, recover transient failures and verify outcomes. Equivalent methods require contract permission. Changes of goal, consequential method or granted authority return to ordinary cognition. Defaults permit two bounded transient retries, harmless equivalent methods where explicitly authorized, and escalation when no viable plan exists. Tool annotations are hints, never authorization or proof of idempotence.

The framework tool gateway anchors the submission deadline to the immutable contract event timestamp. Recreating a gateway or replacing an adapter cannot reset that clock. Expired budgets reject new submissions; in-flight calls receive a host-owned deadline signal even when an adapter supplies none. Loss of a submitted response remains unverified rather than permitting repetition.

Timeout after a potentially consequential call yields an unverified outcome, not a claim of failure or permission to repeat it. Tool-reported success and independently verified goal completion remain distinct. Running work may outlive a cognitive cycle; cancellation, guidance, resume and terminal reports retain the original attribution. Repeated identical guidance requests are bounded by a handoff budget and require new information or instruction.

Execution reports preserve immutable ownership, selected action and contract lineage. Completed, failed and blocked reports are terminal. An unverified report may receive later resolution evidence, but cannot regress to pending or running and thereby authorize replay. Operational attempt counts and trace references accumulate monotonically; resolution cannot discard earlier ambiguity evidence. These rules are enforced at persistence as well as the application reporting interface.

Native background mode returns an attributed running execution before scheduling external work. The host persists that handoff before the worker submits tools. Completed cognitive cycles do not revoke a still-running recorded execution, but failed cycles and terminal/unverified executions cannot submit further calls. Per-Agent concurrent operational jobs obey the captured parallel-job budget. Cancellation stops future submissions and aborts transport waiting; it does not prove reversal of an in-flight side effect. A cancelled wait without a valid response remains unverified. Process restart never automatically resubmits unfinished work; recovery/resume requires a separate evidenced lifecycle operation.

## External infrastructure and persistence

One active Executive runtime per Agent implements initialize, execute, resume, cancel, events, skills and proposeSkill. Native, OpenClaw and custom adapters use the same contracts. Framework permissions and the shared MCP client manager remain outside interchangeable runtimes. An adapter must be implemented and tested before it can be selected; a dropdown is not integration.

The shared MCP registry supports local stdio and remote Streamable HTTP connections, secret references, timeouts, discovery and namespaced cached schemas. Each Agent receives a permitted server/tool subset intersected with the current contract. The client manager validates tool arguments/results and owns transport compatibility; cognition does not import MCP SDK objects.

Current capability schemas occupy a separate optional `externalCapabilities` field in each immutable WorldState. They describe the current discovery result and permission revision, not events that occurred. They are supplied once per cycle, bounded by the explicit grant/catalog count, and do not accumulate in factual conversation history. Self never receives this field, and factual-only prediction outcome contexts exclude it. Discovery failure remains explicit unavailable metadata. Previously saved snapshots, including earlier capability-as-fact records, remain immutable; legacy generated capability records are excluded from later factual projection rather than replaying outdated access as current permission.

An execution ledger preserves operational plans, arguments, responses, timestamps, verification and event lineage. Compact incremental factual feedback enters later original-thread WorldState snapshots; raw tool responses and traces do not enter ordinary context. Explicit bounded retrieval may supply relevant execution evidence to activated Parts, with no transparent audit access for Self. Execution trace references are provenance, not psychological memories.

## Teaching and profile

Difficulty may emit an attributed guidance request containing the selected goal, problem, attempted strategies, operational uncertainty, requested instruction and paused state. Ordinary activation, recall, Part cognition and Self selection supply any instruction. The Executive does not choose a teacher Part or prescribe a lesson. ADR 0138 coverage can investigate unfamiliar feedback through its existing later-cycle mechanism; no primitive activation or direct durable formation is reinstated.

An operational handoff with no executable selected strategy may enter `needs_guidance` before any tool submission. Its structured request preserves execution/contract attribution, selected goal, problem, attempted methods, uncertainty, requested instruction and opaque traces. The native exact-strategy path emits at most one request per handoff and obeys the captured guidance budget; a zero budget returns blocked feedback. Compact request content enters only later original-thread factual snapshots, never the current snapshot or direct Self input. Generic status reporting cannot restart this paused execution or change/discard its request. A future resume operation must establish a recorded new Self-selected instruction and supplemental authority before further submissions; emitting a request alone does not implement resume or teach a skill. Submitted uncertainty remains unverified and cannot enter this no-submission guidance path.

[ADR 0142](0142-selected-guidance-continuations.md) subsequently defines the selected supplemental-contract mechanism for this no-submission case. It preserves the original handoff, consumes requests once and retains the original chain budget. Submitted-effect recovery and durable cognitive teaching remain separate requirements.

Per-Agent profiles remain separate from psychology and retain procedures, skills, runtime settings, autonomy and limits. Learning modes are disabled, supervised proposal and validated automatic application. Skills retain source instruction, validation evidence, conditions, limits, scope and immutable versions; rollback appends history. Cognitive instruction alone does not prove procedural validity. Runtime replacement preserves identity and portable procedural knowledge, and cannot expand permissions.

The first supported retained procedure is an exact selected operational strategy, anchored to its recorded contract and expressed instruction. Validation inspects independent recorded tool submissions/results and the selected structured verification criterion, rather than trusting an adapter's completion flag. Evidence proves only those exact inputs and criterion, not transfer, condition applicability or safety in a novel context. Disabled learning prevents new proposals/validation/activation; supervised proposals wait for explicit approval; validated automatic mode may activate only after this evidence check. Researcher administration and rollback append versions and never grant tools. Generalized procedures, ordinary-cognition teaching/approval and reuse under fresh Self-selected contracts remain required extensions.

Profiles use optimistic revisions and immutable configuration history outside psychological entities. Each selected handoff captures the profile revision, sensitivity and execution limits so later configuration edits do not reinterpret an existing contract. An exact selected strategy continues to forbid equivalent methods even if a profile permits them in a future planning path. Runtime selection accepts only implemented adapters. Learning-mode configuration alone does not enable unimplemented learning or validate procedures. Researcher restoration appends a new revision rather than changing prior history.

Five operational signals inform reaction policy: repeated failure, stalled/diverging progress or constraint violation, unexpected results, novelty and uncertainty. Signals are observations, not affect or activation authority. Policies consider risk, thresholds, bounds and cooldowns; novelty and surprise need not halt harmless investigation. Sensitivity may change only within configured bounds under cognitive supervision. Example thread slider numbers are uncalibrated hypotheses, not scientific probabilities.

The external reaction policy accepts attributed operational observations and explicit host-assessed risk; tool annotations cannot establish harmlessness. Its thresholds are configurable engineering settings, not probabilities. Constraint violations and unresolved consequential submissions bypass thresholds and cooldowns. Cooldowns suppress repeated advisory responses only, never safety gates. Native exact-strategy execution records observed signals and recommended responses in operational diagnostics; recommendations cannot expand its selected strategy or turn an unverified result into success. Persistent profiles and cognitively supervised profile changes remain separate implementation requirements.

Agent Components → Executive exposes six panels: Runtime; MCP Connections; Autonomy & Recovery; Environmental Sensitivity; Skills & Learning; Feedback & Diagnostics. Live inspection shows goal, progress, uncertainty, current tools and escalation reasons. Applicable planning/teaching prompts, routing, previews and Settings → Prompts must change together with runtime enforcement.

## Verification

The implementation audit must cover contracts, permissions, actual MCP transports, bounded execution/recovery/verification, async lineage, compact original-thread feedback, cognition-mediated guidance, procedural validation/history, runtime substitution, researcher configuration/inspection, prompt access and sourced Simulation Tests. Mock plumbing demonstrates mechanics only. Configured-model experiments preserve evidence and report inconclusive observations separately from infrastructure failure. No single simulated outcome proves human psychology.

## Explicit configuration copy

Researcher-requested cross-Agent profile copies append a target-owned revision and an attributed copy record, checking both source and target revisions. This copies external configuration only. Tool grants, credentials, procedures and psychology retain their ownership; current selected contracts retain their captured settings. This portability operation does not choose or redesign an execution loop.

## MCP progress observations

Progress notifications are attributed server reports about a still-open tool request. The host may preserve bounded progress diagnostics under the original trace and expose them in inspection. Progress is neither a successful response nor goal verification, a settled correction boundary, permission to retry, or a reason to extend deadlines. It introduces no new cognitive inference task or raw Self access.

Tool-list change notifications invalidate the connection's discovered definitions. The next catalog read or call refreshes definitions through the official SDK before argument validation; concurrent readers share that refresh. Notifications do not invoke tools, revise selected contracts or grant newly advertised capabilities. A failed refresh cannot fall back to stale definitions. Changes received during discovery remain pending for a later refresh.
