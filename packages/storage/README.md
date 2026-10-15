## Continuous cognition (ADR 0165)

See [ADR 0165](../../docs/architecture/decisions/0165-continuous-asynchronous-cognition.md) and the [current audit](../../docs/development/CONTINUOUS_COGNITION_AUDIT.md). The runtime now admits overlapping observations, commits bounded independent scope jobs as they complete and serializes Self decisions. Per-Agent activation settings persist busy-scope rescoring, thought concurrency/queue bounds and per-observation activation-pass allowances. One-pass pause and explicit resume use the same runtime. Historical descriptions of a global batch barrier below no longer describe ordinary execution. Activation history is a researcher-only projection; it grants no cognitive authority.

Enabled Executive feedback includes narrowly projected host admission rejections: no action was submitted, with its factual admission reason and timestamp. It creates no Execution or environmental outcome and stays excluded when Executive is disconnected.

Schema 27 adds nullable validated thought-routing configuration to protected Agent provider settings. Missing legacy routing remains disabled, credentials remain encrypted, and branch copying preserves routing alongside the owning provider configuration.

Researcher dream branching transactionally copies same-Agent entities, immutable versions, experiences, cycles, audit, settings and selected caches with an explicit internal identifier map. Reports, shared registry and MCP grants are excluded. Source rows are never edited; ciphertext remains solely in protected settings. Branch histories retain source provenance, and default discard preserves the developed branch for inspection. See ADR 0159.

## Conditional procedural consolidation (ADR 0147)

Conditional skill versions use existing immutable skill JSON history. Storage checks same-Agent scope-compatible exact member versions, preserves branch metadata during ordinary lifecycle transitions and requires current active permitted members for family activation/restoration. Branch refresh is an explicit revision; no migration rewrites old exact skills or evidence.

## Executive checkpoint review (ADR 0146)

Pause completion requires the recorded selected execution-control contract and matching confirmed host receipt. Requested/stopped receipts preserve target contract lineage; original outcomes remain separate. Attention-review cycles retain ordinary cognition; monitor-only cycles keep their earlier exclusions. No schema migration or worker replay is introduced.

## Checkpoint attention persistence (ADR 0145)

Existing profile JSON stores validated opt-in attention settings and immutable revisions; historical profiles without the field receive conservative disabled defaults on read. Monitor snapshots retain ordinary cycle/world attribution with `kind: attention_monitor`, and advisory decisions append as `execution.attention` events. Restart reads this evidence without creating workers or resubmitting tools. Monitor cycles remain external chronological evidence and are excluded from ordinary cognitive thought-age/stance and consolidation-trajectory calculations.

## Selected procedure records (ADR 0143)

Skill source validation resolves the exact method captured in selected invocation contracts and independently matches preserved active history. Validation may conservatively leave a passed proposal inactive; automatic activation still requires current automatic mode, captured automatic teaching mode, actual ledger evidence and current grants. Separate `execution.procedure_teaching` records project compact original-thread facts without changing tool outcomes. Immutable method history and one-time directive removal preserve source lineage.

## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](../../docs/architecture/decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

# Hypothesis and scaffold persistence

ADR 0138 uses the generic entity/version store without rewriting historical records. Partless predictions require explicit same-Agent gap-origin cycle/thread attribution; Partless memories require a linked gap prediction. Prediction formation ownership/origin remains immutable. Scaffolds reference a preserved prediction version and origin thread, retain temporary relevance and optional ended-cycle evidence, and cannot be active when ended. Nullable owner values do not defeat the existing one-open-per-Part unique index; gap hypothesis limits belong to deterministic runtime. Institutionalized descendants preserve source lineage and all underlying memories.

# SQLite persistence

Optional guidance metadata uses existing execution JSON and audit events; no migration is needed. A request requires a recorded Self-selected nonfailed source contract and available captured guidance budget. Storage rejects duplicate requests per handoff and any claimed no-submission request contradicted by the tool ledger. Requests remain immutable across reporting. `recentFacts` labels `needs_guidance` as awaiting instruction rather than completed, and preserves bounded original-thread factual feedback. Historical snapshots remain unchanged.

`continued` requires a recorded Self-selected supplemental contract and an exact guidance-consumption event. Storage rechecks source openness, scope, goal, constraint declarations, usage and new asserted information before closing the parent; successors require preserved parent lineage. Rejected supplemental contracts can persist only zero-attempt blocked outcomes, including for replacement adapters. Parent continuation targets are terminal and immutable. Retained skill procedures strip one-time guidance bindings while their source contracts preserve them; validation still examines the complete selected execution and real tool ledger.

Migration 23 adds per-Agent Executive skills and SQL-protected immutable version history. Optimistic writes preserve source contracts, exact procedures, validation ancestry and scope. Storage independently checks passed validation against recorded tool evidence, enforces learning modes and lifecycle transitions, and intersects active procedures with current grants. Rollback appends an exact preserved version; it cannot fabricate evidence or restore revoked permissions. Administrative Agent deletion removes only that Agent's procedural records and history.

Migration 21 adds the shared MCP registry and isolated per-Agent tool permissions with immutable revision histories. Saves use optimistic revision checks; removing a server transactionally appends revocation versions for affected Agents. Re-registering its ID cannot restore earlier grants. Credentials remain references in these records. Permanent Agent deletion removes its permission history through the existing administrative exception and preserves the shared registry. Older cognition, provider configuration and state histories are untouched.

Operational actions and compact execution metadata use the existing JSON record store. Detailed authorization/submission/response traces append to immutable audit events, separately from factual WorldState projection. Blocked and unverified statuses preserve their distinct meanings in later original-thread feedback instead of being mislabeled completed or failed. Raw responses are not included in `recentFacts`.

Optional current `externalCapabilities` metadata persists with each snapshot but is not replayed by `recentFacts`. Earlier generated capability-as-fact records are omitted from later factual projection using their exact source/kind/reference/text signature; arbitrary user testimony remains. Original snapshots and subjective memories are never rewritten. No database migration is needed for this optional JSON field.

Migration 19 extends the validated Agent model selection to GPT-4.1 mini for non-reasoning comparisons, preserving every saved model choice and encrypted key.

## Constructed revision

ADR 0126 stores steering and dispositions in the existing generic versioned entity store; no schema migration or data reset is required. Constructed Part origin/thread and retirement are protected at write boundaries. Subjective encoding metadata retains selected fallible detail. Constructed Part history stays intact. ADR 0127 permits an explicit administrative reset of wholly legacy Parts and logs while preserving subjective memory and Identity versions. Memory formation attribution remains immutable; references grant only subjective-record access.

The local adapter persists current domain state, immutable versions, objective snapshots, cognitive records, and inspection events. Migrations are transactional. History records and current state remain distinct. Only host application services receive the full store; cognitive providers receive owner-scoped values. Database paths are caller supplied.

Cycle-to-thread membership and current per-thread Part stickiness are persisted separately. Legacy membership registration preserves immutable audit and world records. Full chat facts filter by thread, retain chronological ordering, and avoid duplicating earlier snapshot context. Explicit bounded queries still apply limits; unthreaded callers use a separate context.

Migration 9 adds per-Agent activation settings, with vector filtering enabled when no setting has been saved.

Migration 10 replaces prompt revision history with one current override per task and scope. It carries forward the latest active Agent/global custom prompts, then removes the obsolete revision log.

World facts use timestamped `says`, `observes`, and `does` records (ADR 0095). Conversation history preserves original speaker and time; origin-cycle provenance prevents duplicates. Legacy snapshots stay immutable and are interpreted on read. Execution status describes the action in ordinary language, and completed dialogue supplies its words without generic operation-ID status facts.

Migration 11 appends converted question-and-answer Identity Traits with migration provenance. Original version bodies remain immutable; legacy Identity history is interpreted on read. Existing Trait IDs and creation timestamps are preserved by ordinary edits.

Identity wizard character name, clarification options and selected version are saved per Agent as researcher preferences, separately from cognitive Identity. Successful clarification replaces the saved options; reopening restores them without inference. SQLite migration 12 preserves them across application restarts.

## Continuous primitive appraisal (ADR 0104)

Every cycle scores all configured primitives together with candidate Parts in one shared request. Only threshold-crossing primitives generate thoughts and basic bids. They are not Parts and cannot access memories, form predictions or mutate psychology. Existing Self arbitration and deliberation remain world-blind; execution uses the ordinary handoff. Agent Components → Primitives owns plain thought/bid instructions and language-first aspects, with create, edit, delete, per-item reset and reset-all. Custom reset restores its creation definition; reset-all restores factory primitives. SQLite migration 13 stores per-Agent configuration with optimistic revisions and preserved researcher configuration history. Provider failures remain errors. Primitive inference is separate from Part prompts and uses the Agent's selected provider. Mock output is fixture behavior.

Primitive activation instructions and surfacing thresholds are edited in the primitive inspector; existing definitions project defaults without rewriting saved history. Identity temperament self-definition Traits affect primitive appraisal scores only. Brain Monitor shows all primitive scores, including implicit appraisals. Selected owning-Part consolidation traces may include concurrent subjective primitive appraisals; these never force learning or lifecycle changes.

## Quality-guided deliberation (ADR 0105)

Self chooses an existing bid or DELIBERATE. The deliberation task generates one ordered inquiry with a primary and optional supporting C quality; qualities never compete as choices. A selected Part deliberate bid keeps its original question and targets. Participating contributors answer first, then retain, replace or withdraw their current bid in the same generation. Retain preserves the bid ID; replacement records replacesBidId. Responses return to the same world-blind Choice. Factory templates, previews and inspection expose these contracts. Historical debate audit records and custom overrides remain readable without rewriting their content.

## Optional post-deliberation activation (ADR 0108)

The per-Agent `reevaluateAfterDeliberation` switch defaults to false. When enabled, completed inquiry responses enter a new immutable, attributed subjective snapshot before activation is re-evaluated. Remaining active contributors retain bids; newly active contributors generate cognition; inactive contributors leave Self’s choice set. Self remains world-blind and ordinary deliberation limits apply. See [ADR 0108](../../docs/architecture/decisions/0108-post-deliberation-activation.md).

ADR 0115: Settings → Delete Agent confirms permanent removal of all Agent-owned data, including psychology and audit history. Active work blocks deletion; other Agents and global settings are preserved.

Migration 17 persists the per-Agent primitives-first cognition switch, defaulting existing Agents to false.

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.

ADR 0124 adds the researcher Memories search page: explicit vector/JEV queries, full-detail inspection, versioned edits and logical deletion. Deleted records leave ordinary memory lists and recall; immutable versions and audit lookup remain preserved.

## Agent memory storage (ADR 0125)

Migration 22 adds separate per-Agent Executive profiles and immutable revision history. Validated optimistic writes capture the default revision before the first edit; restoration appends a new revision. Administrative Agent deletion removes only its own profile/history, preserving other Agents and the shared registry. Existing databases obtain defaults lazily without changing psychology, grants or historical contracts.

Subjective memories are Agent-owned records. Immutable `partId` attributes formation; explicit `referencingPartIds` controls Part access, with legacy records referencing their originating Part. `ancestorIds` links each interpretation to its own possibly overlapping set of WorldState snapshots, without fixed event groups or automatic source replay. Reference edits are versioned; archival preserves records. Formation behavior and originating-Part consolidation authority remain unchanged. See [ADR 0125](../../docs/architecture/decisions/0125-agent-memory-and-worldstate-links.md).

Disposition inspector controls edit the current record, restore a historical version as a new version, or delete using a preserved tombstone. Deleted dispositions are excluded from live listings and cognition; saved history and references remain intact.

ADR 0137 developmental metadata validates provenance transactionally: lineage refers to preserved same-Agent disposition versions; previous-version references identify the immediate predecessor; evidence refers to a same-Agent memory's formation cycle and thread. Prediction evidence must be linked by the memory's prediction reference. Referenced disposition versions must already exist. Invalid references cannot append history or modify current state. These checks validate attribution, not the psychological interpretation of retrieval usefulness.

Hosted xAI is available as `grok-4.3` with reasoning effort `none`. Agent model settings select OpenAI or xAI and use only that provider’s server key or an explicitly saved Agent key. Changing providers cannot reuse an existing key without an explicit replacement; migrations 19–20 preserve saved model settings and encrypted credentials. Configure `XAI_API_KEY` in the local environment or enter it in Agent Settings. Jev bounded decisions remain separate. Live xAI behavior requires configured-model observation; transport tests do not establish subjective bias.
Maturity revisions preserve status, method identity and administrative validation. Storage independently verifies same-Agent scoped exact-method evidence, distinct successes and conditional branch support; ordinary decisions cannot silently replace maturity. Revisions clear assessment, while rollback preserves the recorded version exactly. No migration fabricates legacy assessments.


Rejected remainder contracts must report blocked with zero attempts/traces and no verified outcome, just like rejected guidance/method requests. They cannot teach a retained procedure or fabricate completion.

SQLite preserves immutable remainder claims across reload. Captured accepted remainder contracts cannot report running/completed/verified outcomes before ready handoff support exists; unready contracts admit only blocked zero-attempt reports. Ready handoffs are independently verified for other reports. A consumption claim alone cannot synthesize parent cessation or restart a worker.

A ready remainder parent may transition blocked → continued only with the exact captured prefix and recorded ready receipt. Source action/attempts/traces remain immutable. Remainder completion additionally requires independently checked successor tool/verification evidence; readiness or a provider report alone cannot establish goal completion.

Migration 24 preserves current prompt overrides and scope uniqueness while raising the SQLite template bound to the already-existing domain/API 32768 limit. SDK validation now uses that same bound, allowing complete factory templates to be edited and cloned into configured simulations without truncation.
## Corrected skill source evidence

Correction-derived methods retain the reconstructed whole procedure and original contract limits. Storage independently verifies their source chain and complete trace evidence; a remainder-only proposal is rejected. This historical evidence check grants no current tool authority and does not promote maturity.

## Selected procedural review (ADR 0153)

Researcher-only approval remains the default. The opt-in `self_selected` profile policy exposes bounded candidate review choices to Parts. An exclusive Self-selected approval/rejection operation resolves the exact immutable Agent Skills package, checks captured/current policy and current scope/version/evidence/grants, and atomically records the decision and new skill version. Approval dispatches no tools, changes no permissions or maturity, and requires a later fresh selected invocation. Storage independently checks selected review lineage and completion receipts. Inspection includes the review episode's expressed thoughts, bids and Self reason, alongside the preserved version history.

ADR 0155 disconnects Executive integration by default. Per-Agent `enabled` is explicit; missing legacy values read false. Disabled cognition preserves selection without enactment or operational context/feedback.

## Reviewed Agent MCP registration (ADR 0156)

MCP permissions may retain explicit serverIds independently from tool grants. Shared server deletion revokes both with immutable history; Agent membership removal preserves shared definitions and other Agents.

Inspection may persist explicit invoking research-stage metadata separately from event payloads. The SDK supplies the async resolver, filtered by Agent identity; core has no research-context dependency. Null-cycle offline events retain stage scope without invented cycles, and failed scope resolution leaves an ordinary unscoped event. Schema 25 adds nullable immutable event metadata; historical bytes remain unchanged and both event query paths preserve scope across restart. Provider arguments and cognitive state receive no metadata.

ADR 0160 permits explicitly disposition-attributed partless synthesis memories alongside gap episodes. Storage validates same-Agent sleep/disposition lineage, immutable distinct source versions and preserved ancestry. Optional per-disposition recall exclusions use versioned JSON; no migration or global source archival is needed. Branching remaps these references with the existing identifier map.

ADR 0166 replacement snapshots bound automatic thread-scoped external fact carryover: recentFacts excludes records before the latest replacement boundary. Historical rows and subjective memory remain intact.

Executive profiles default missing ADR 0167 module permissions to Speaking and Tool execution enabled under the existing master switch. No schema migration or historical rewrite is needed. Automatic execution feedback respects each action module, and tool checkpoint/teaching feedback requires Tool execution.

Completed speech execution feedback projects into Sensor audio with `You said: [rendered text]`, including legacy speech records. Projection preserves timestamp, cycle and execution references without changing archived executions or frozen snapshots.

ADR 0168 removes legacy prediction attention from current domain schemas and activation. Preserved prediction versions project current schema fields on read without rewriting raw version bytes. Explicit researcher cleanup appends current versions; no automatic live-state migration or legacy activation path is provided.

Schema 28 adds per-Agent Cloudflare image settings with encrypted credentials, separate from versioned Agent profile data. Agent deletion removes these settings. Saved raster avatars remain versioned profile fields.
