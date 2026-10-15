## Continuous cognition (ADR 0165)

See [ADR 0165](../../docs/architecture/decisions/0165-continuous-asynchronous-cognition.md) and the [current audit](../../docs/development/CONTINUOUS_COGNITION_AUDIT.md). The runtime now admits overlapping observations, commits bounded independent scope jobs as they complete and serializes Self decisions. Per-Agent activation settings persist busy-scope rescoring, thought concurrency/queue bounds and per-observation activation-pass allowances. One-pass pause and explicit resume use the same runtime. Historical descriptions of a global batch barrier below no longer describe ordinary execution. Activation history is a researcher-only projection; it grants no cognitive authority.

Dreams replaces Simulator under Agent Operations. Launch chooses a developed base Agent; Keep dream changes is unchecked by default. Default dreams preserve a separate continuation and its evidence without modifying the source. Explicit permanence means ordinary changes affect the base as experiences occur, even before a scenario failure. Fresh research tests remain an alternative Experience mode. Frozen before/after version comparisons and exact source snapshots are available in Overview. Research labels are not delivered as experiences; cognition may independently infer unusual circumstances. Executive scenarios require the separate fresh research-test mode.

## Agent Operations

The sidebar groups Sleep and Dreams under Agent Operations. Sleep induces the existing offline memory/disposition consolidation over a selected range of completed cognitive cycles and displays saved cycle statuses, provider provenance, selected evidence, recorded learning and immutable original records. Counts describe recorded processing, not psychological improvement. Historical Part-development cycles remain inspectable; this page does not launch that legacy profile. Dreams also retains isolated fresh-Agent experiments. The old Run catalog and unfinished formation, split/merge and memory-replay pages have been removed from the browser navigation and source; backend history and offline compatibility remain intact.

Simulation Tests includes eight sourced affect hypotheses. Completed reports expose an Affect exploration evidence section with actual offers, world-blind input, choices, decisions, baseline/revision lineage, experienced transitions, event order and source-cycle links. Mock/mixed provenance and inconclusive prerequisites remain explicit.

## Simulation run analytics

Agent Operations → Dreams opens the dashboard directly in the main content area. Read [DASHBOARD_DESIGN.md](../../DASHBOARD_DESIGN.md) before changing analytics. The [discovery and wireframe](../../docs/development/SIMULATION_DASHBOARD_DESIGN.md) document metrics, missing data and interpretation boundaries.

A single searchable research-direction directory and Experiment → Run set → Run selectors lead from combined experiment observations to exact-configuration repetitions and individual trials. Breadcrumbs return to each overview. Navigation is retained per source Agent/database in session storage. Evidence-basis filtering keeps fixture, mixed and configured observations explicit.

Dedicated views cover Overview, Activation, Predictions, Learning, Affect, Execution, Conclusions, Compare and Records. SVG stage trajectories include source-stage drill-downs and keyboard/hover tooltips; activation heatmaps, coactivation networks, prediction lifespan charts, Part lifespans, memory reuse bars, categorical affect transitions and execution timing separate distinct recorded quantities. Original JSON appears only in searchable dialogs; stage investigations and authoritative cognitive-cycle links retain the original evidence. Research forms preserve immutable reviews, findings, candidates and exact cited history.

Criterion recurrence uses completed trials only, displays observed/not-observed/inconclusive/missing counts and denominators, and lets researchers select original observer, latest human review or latest completed model assessment independently. Original semantic criteria remain unresolved; fixture results never become theory validation. Run sets use the existing exact configuration aggregation API; historical runs without starting configuration remain separate. Stage trajectories align exact phase/name/occurrence, represent missing metrics as gaps and show descriptive min–max ranges rather than confidence intervals. Counts, coactivation, recall and object changes do not imply causality, usefulness or calibrated probability.

Comparison supports both aligned runs and explicit baseline/follow-up stages, preserving configuration confounds and exact evidence access. Launch, saved-run assessment, fresh-Agent rerun/fork and Agent inspection remain available. Detached views discard stale responses. No research presentation enters Agent cognition or changes simulation behavior.

## Affect Analysis

Agent Components → Affect Analysis renders the read-only SDK lifetime projection. A clickable period chart, lifetime/last-seven-day/custom-timeframe controls and thread/Part filters refine the view. Period inspectors keep lifetime and window-origin statistics separate, show proposal reasons, renewals/boundaries, actual choices, original/revised bids, non-enacting baseline evaluations, prediction versions and contributing disposition IDs. Experienced affect remains a separate chronological stream, including cycles without voluntary focus. Source links use the authoritative cycle inspector. Detached pages discard late responses; browsing does not create cognitive state.

## Conditional procedural consolidation (ADR 0147)

Skills & Learning can consolidate ended procedural experience and inspect preserved inference reports. Conditional inspectors show branch conditions/reasons, escalation and member-version links; source bids/thoughts remain in each member inspector. Explicit branch-version refresh requires approved unchanged members and does not approve the family. Reports and model fixture limitations are separate from execution authority.

## Executive checkpoint review (ADR 0146)

Environmental Sensitivity exposes an opt-in wait before the next native background tool call. It takes effect with monitoring and interested review enabled; cancellation/deadlines remain independent. Full remainder correction/resume is unfinished.

Opening a cycle inspector fetches the authoritative cycle and events rather than relying on the page's stream cache. Late responses cannot replace a newer inspection or cross an Agent/database selection; prediction display uses the same fetched cycle evidence.

Executive attention settings expose opt-in interested-checkpoint cognition. Cycle inspection distinguishes Attention Review from monitor-only records and shows continuation or confirmed local pause lineage. Paired Executive checkpoint Simulation Tests expose readable thoughts, Self reasons, attention records and final execution evidence; missing live selection is explicitly not observed, and researcher cleanup is distinct from cognitive intervention.

## Cognitive checkpoint monitoring

Executive → Environmental Sensitivity exposes opt-in checkpoint monitoring, independent relevance/competence/coverage thresholds, advisory cooldown, relevance hysteresis and supported event policies. Feedback & Diagnostics displays recorded background/interested decisions, unassessed values, reasons and links to the persisted checkpoint snapshot. These controls implement read-only monitoring; the interface explicitly distinguishes it from the pending automatic Part review and selected intervention path. Authorization limits remain separate.

## Skill development inspector

Episode labels distinguish actual applications, administrative validation and rejected application attempts. Rejected method requests show the host's recorded reason and never imply that a conditional member ran.

Development shows independently checked application evidence across historical versions. Success, reported failure, inconclusive, pending and rejected counts remain distinct; they do not establish transfer or maturity.

In Agent Components → Executive → Skills & Learning, **Inspect skill** opens Procedure, Development, Bids & Thoughts and Related Variants tabs. Select an immutable version, compare recorded changes and reasons, read linked source thoughts/bids and Self choices, and inspect successful or failed validation episodes. Related-method navigation follows recorded lineage, with shared-source variants distinguished from derivation. Full source cycles remain accessible; missing evidence and transfer/causal limitations are visible. The shared dialog and keyboard-accessible tabs use the read-only SDK projection and do not own cognitive state.

## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](../../docs/architecture/decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

# Hypothesis and relevance inspection

ADR 0138 adds coverage, gap outcome and gap reflection Settings prompts; experience evidence attachment has no persistent-creation authority. Prediction inspection distinguishes gap origin and linguistic future value from owning-Part predictions. Temporary disposition histories display source hypothesis/version, origin thread, discriminating evidence, tracked distinction and ended-cycle provenance. Nullable gap episode/prediction origins are displayed explicitly. Simulation Test stages preserve coverage outputs alongside ordinary cognitive evidence for researcher review.

<!-- Current online flow: ADR 0133 -->

[ADR 0133](../../docs/architecture/decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

<!-- Current online flow: ADR 0132 -->

Online cognition passes immutable WorldState directly to Jev disposition activation, then retrieves subjective memories and constructs Parts with ordered evidence and cognition. No perception inference runs; Perception is removed from the active prompt catalog. Prior-cycle prerequisites remain eligibility gates. Compatibility bindings identify disposition scopes rather than extracted entities. Self remains world-blind.

# Web inspector

Feedback & Diagnostics displays paused guidance requests, operational uncertainty, supplemental-contract targets and answered-request attribution alongside execution status. Instructions flow through ordinary cognition and Self selection; the inspector observes their lineage.

Agent Components → Executive exposes seven configuration/inspection tabs, with one panel visible at a time. Tabs support arrow keys and Home/End, retain edits while switching, and share a Save Executive profile control. Runtime mode, execution budgets, bounded sensitivity, learning-mode configuration, MCP registration/discovery/disconnection/removal and Agent tool grants use the validated shared APIs. Skills & Learning proposes exact procedures from recorded selected executions, validates against tool evidence, approves/rejects/archives and restores preserved versions. Evidence limitations remain visible. Feedback & Diagnostics polls attributed operational records and traces for current tools/progress, displays uncertainty and reasons, and requests cancellation from local running workers. It does not own cognitive state or expose audit context to Self. Selected teaching and active exact-method invocation are described alongside evidence limitations. Unimplemented adapters, cognitive approval and generalization remain explicitly identified.

Chat messages can start with `--name Rowan Hello` or `--name "Rowan Smith" Hello` to choose that message's speaker. The flag is stripped before submission; the name becomes the recorded external source and transcript label. Messages without the flag use `user`. Malformed flags preserve the draft and show a usage error.

The Agent selector lists all Agents from the main database and mounted experimental databases, labelled by experiment. Selecting an experimental Agent uses the normal Chat Sessions, Brain, components and settings pages against that Agent's original database. Database selection survives reload; browser thread metadata is kept separately per database. Merely opening a bot performs no inference or new experimental run.

Agent Operations → Simulator is the sidebar entry with thirteen sourced hypotheses covering dispositions, imagined future, lived prediction error, affective interpretation, stance traversal and missing-perspective deliberation: general/overlapping attention, procedural transfer, situational navigation, prediction contradiction, formation/refinement/generalization, later-cycle comprehension, familiarity/chunking/novelty, and conservative ambiguous-evidence learning. Select a hypothesis and fixture or configured-model mode, then Run simulation test. Each run creates an isolated Agent and displays stage progress, observed/not-observed/inconclusive measures, provider provenance, raw stage evidence and the frozen scenario/prompt snapshot. Inspect test Agent opens its ordinary Part/history surfaces. Configured runs can incur provider costs; fixture or mixed inference is not empirical validation. Completed means execution finished, not that the hypothesis is proven.

Agent Components lists Primitives, Identity, Dispositions, Memories, Predictions, Analytics and Logs in that order. Dispositions opens perspective history, Analytics shows the existing Part network, and Logs displays audit events.

## Single online loop (ADR 0128)

Application cognition always constructs temporary working perspectives. The previous runtime and candidate filtering are isolated in historical test fixtures, with no production import or selectable online fallback. Consolidation, structural Part-development facilities, their prompts and inspection remain available. The historical `architecture` field now identifies only the offline consolidation profile; The Sleep dashboard induces current-profile consolidation and preserves historical profiles for inspection. Online Activation exposes accessibility, deliberation re-evaluation and primitive ordering, with no vector or memory-owner discovery switches.


## Constructed revision

ADR 0126: Parts includes all working and retired instances, their evidence/counterevidence, origin and retirement reason. Retirement never removes the card or history and offers no Reactivate action. Dispositions displays learned scopes/evidence and pending prediction attention. Parts exposes carried thread steering; Brain Monitor shows construction/perception judgments. Agent creation defaults to constructed; Agent Operations → Sleep induces current-profile offline consolidation. Memory inspection supports explicit fallible detail recall. New task prompts and recorded-input previews remain editable.



Browser TypeScript compiles with the workspace build. The browser calls the shared HTTP API and subscribes to SSE; no cognitive logic or persistent psychology lives here. Researcher inspection can see privileged state, clearly separated from Self's actual input. Text is rendered with DOM textContent, never interpreted as HTML.

Messages include their thread ID before the runtime creates a cycle. Existing local sessions register their cycle membership with the server. Chat and Brain views switch within the selected thread; the sidebar keeps that thread highlighted in both views. Brain inspection shows a timeline of completed thought generations from that thread only.

Thread pencil menus store names, pin status, and deletion markers in this browser's local session metadata. Deleted threads stay hidden after reload; cognitive audit history and shared learned psychology are preserved.

The Brain timeline displays ranked bids above Activated Parts, with selected bids marked. Rankings use the final recorded arbitration independently of the earlier thought keyframe cutoff. The score and marginal-round inspector appears within the ranked bids section.

Settings → Activation includes a persisted per-Agent “Use vector search before Jev” switch. Turning it off sends all active Parts to independent activation scoring on the next cycle.

The Part editor explains motivation-based names of at most five words and the distinction between relational missions, strategies, and beliefs. Parts list names are uppercased for display only.

Parts displays a four-column card grid (two or one columns on narrower screens), without a dispositions panel. When search is empty, Parts appear newest formation first, using their original creation cycle rather than later updates; records without a formation date follow dated instances. Clicking a card opens its inspector. Stable pastel colors identify the free-form emotionalCharge text without classifying psychological meaning; archived cards are grey, temporary cards have dashed borders, and an open prediction appears as a thought bubble. Version numbers sit at the bottom right.


The Part inspector uses a left-hand star timeline, with the largest star for the current version. Selecting a star displays that saved perspective, including mission, checkmarked beliefs, strategies, triggers and developmental context. Restore creates a new version. Predictions and memory bubbles appear only for the current version: Part snapshots do not reconstruct their historical collections. Historical raw-data popups show only the selected saved perspective and its version record. Prediction rows show an active slot, creation-cycle date, correct/incorrect markers from recorded outcome checks (with legacy assessment fallback), or a grey dotted marker for inconclusive terminal outcomes. Information popups show prediction and subjective memory details. On the current version, Edit perspective and Archive/Reactivate sit beside the name and information button. The yellow star marks only the displayed version; the current star remains larger. The Explore the Agent sidebar stays visible while scrolling, with its own scroll area for long navigation. The information button beside the current Part name contains the raw current/selected perspective, versions and recent audit records; raw dumps are absent from the main page.

Agent Components → Dispositions shows single-line Name › Concern › Cues rows, with cropped concerns scrolling on hover and subdued cues. The pencil opens a popup editor; other row clicks open a dedicated inspector panel in the main content area with all preserved versions in a timeline. Back to dispositions returns to the list; the sidebar remains available. Agent Components → Predictions shows Active predictions (open) and Recent predictions (completed or closed) sections when search is empty, each newest first with its own empty state. Search shows one flat matching list over expectation, owning Part name, status and outcome label. Rows reuse the Part inspector’s markers, expectation, creation date and information popup. Predictions also remain available through their owning Parts. Part prediction information popups include complete version history inline, with the current version expanded and one version open at a time. Each version shows exact confidence, captured activation and spike, record metadata, change timestamp/origin/reason/source references, and its own expectation, context, status and evaluation. Inspect raw prediction version exposes the complete preserved record. Historical outcome markers use that version’s evaluation rather than later outcome checks.

The standalone Memories menu is removed. Part memory information popups show all preserved versions inline with their change reasons, content and context. The current version starts expanded; opening another automatically collapses the rest. Provenance for the displayed version sits after the version list, with its version labeled. Inspect originating event opens the referenced objective WorldState in a separate audit popup, including from older memory versions.

The feeling line appears above the Part version caption in the same style. Last Thoughts sits between predictions and memories and shows the five most recent recorded thoughts, newest first. View complete history opens all recorded thoughts, each with an information button for its raw thought payload and event. Historical versions show only thoughts whose recorded Part snapshot matches that version; current versions show the Part’s full recorded thought history.

Settings → Prompts validates Twig syntax before saving either an Agent override or global default. Invalid drafts stay in the editor with an error toast; the current override changes only after validation succeeds.

Settings → Prompts offers a custom prompt dropdown in execution order, to the left of Save and Reset. The dropdown displays the current prompt’s name and a down arrow; switching prompts preserves unsaved drafts. Outcome reflection follows correct/incorrect Jev checks, prediction formation follows a yes/no gate in a separate request, and deliberation loops back to Self choice. Prompts are grouped by process. The editor fills the workspace, with save/reset controls above it and an optional data reference panel and popups for output format and the original built-in prompt. Provider badges distinguish JEV bounded Score/Choice tasks from LLM generation.

The prompt toolbar groups scope actions into Save (To Agent / Globally) and Reset (Agent / Global prompts / Every prompt) popup menus. Agent/global resets affect the selected task; Every prompt resets all tasks and scopes. Information opens a description of the selected task’s purpose and execution role.

Preview renders the current unsaved Twig draft in a popup using a randomly selected saved WorldState from the Agent. Sample context is identified explicitly; Self uses recorded mediated inputs without WorldState, and offline tasks use owner-scoped traces. Rendering calls no model and saves no changes.

The prompt data sidebar lists compact `{{ variable }}` disclosure controls. Opening a variable shows its description and a compact schema outline with each property and type on one line, indented nested fields, array items, enum choices, and collapsed union types; the (?) help button opens template usage guidance.

ADR 0097: Settings prompts use Cog/Mem/Slp/RFN name prefixes and category headings. Prediction formation is a separate gated request; outcome checks run before conditional LLM reflection.

ADR 0098: Cognition output exposes only interpretation, thought, evidenceSummary and proposal. Memory and persistent learning remain in prediction reflection; expressed thoughts affect activation on later cycles.

Identity displays a three-column trait card grid with local context search over question, answer and keywords. Cards use case-insensitive categorical keywords for colors and icons, show the first two keywords, question and a three-line answer preview, and show a grayscale book or speaking-head role icon. Narrow screens use two or one columns. Add Trait opens a popup; clicking a question opens its editable question/answer/keywords and creation timestamp. Copy and trash buttons in the upper right duplicate or delete that Trait through versioned researcher operations.

When creating a Trait, Autofill appears beside Question and opens a searchable picker of every example question with its keywords, grouped by source. Selecting an entry fills Question and Keywords. New and edit Trait dialogs both have a top-right information button that opens the same general answer guidance. The shared guide displays the researcher-provided general instructions verbatim; guidance does not depend on a selected category. Existing answer text stays in the draft; creating the Trait remains an explicit operation.

Identity has a brain button for modeling its Traits on a person or fictional character. Enter requests version choices; the first radio option is selected, with extra details available before Generate replaces the complete Trait collection. The auto-fill wizard includes a short description and asks only for the name; reference type is inferred through clarification. The information button explains the workflow and warns that Generate replaces all current Traits, including custom questions and edited answers. Prompts remain editable in Settings → Prompts. The Identity history button is removed; persisted versions remain intact.

ADR 0101: Traits carry `self_definition` or `autobiographical` roles. Presets assign roles automatically in the picker and generated answers; the Trait editor can change them. Runtime excludes autobiographical Traits from all Self inputs and previews. Missing roles default to self_definition for compatibility. Background remains authoring data; no automatic Part access or formation is introduced.

The Identity wizard offers a scrollable one-line-per-question checklist with Select all / Select none. All questions start selected. Generation sends explicit questionIds, rejects empty, duplicate or unknown selections before inference, and replaces Traits with only the selected answers. Omitting questionIds preserves legacy all-question generation.

The checked-by-default Delete All Existing Traits option controls replacement. Unchecking sends deleteExistingTraits=false and appends the selected generated Traits, preserving current Trait IDs and content. Writes remain atomic and version checked; failure never deletes Traits.

Identity wizard character name, clarification options and selected version are saved per Agent as researcher preferences, separately from cognitive Identity. Successful clarification replaces the saved options; reopening restores them without inference. SQLite migration 12 preserves them across application restarts.

Chat submissions immediately display the submitted text and an animated thought bubble. The persisted cycle-start SSE event confirms server receipt. The bubble follows ordered researcher inspection events, including reasoning starts, expressed thoughts, bids, predictions, deliberation and execution. Arrival of the response collapses the bubble to a clickable thought icon; saved event history reconstructs it after reload. Failed submissions retain the submitted text and an explicit error. These displays do not alter cognitive state or inference inputs.

The processing thought bubble uses a solid soft pastel background, a gentle pulse and unnumbered internal-conversation paragraphs. It displays expressed thoughts, predictions and revisions, recorded outcomes, applied perspective changes, memory creation, bids and Self selection. Retrieval scores, reasoning-start notices and mutation proposals stay in the audit stream rather than the conversation. Descriptions follow recorded changes; the UI does not infer psychological softening. Reduced-motion preferences disable the animation.

While processing, only the latest conversational update is visible in a 90px maximum-height content area. A retained DOM paragraph fades out before replacing its text and fading in; newer updates supersede pending transitions. Expanding a completed bubble shows the full ordered conversation. Reduced-motion preferences also disable text fades.

## Continuous primitive appraisal (ADR 0104)

Every cycle scores all configured primitives together with candidate Parts in one shared request. Only threshold-crossing primitives generate thoughts and basic bids. They are not Parts and cannot access memories, form predictions or mutate psychology. Existing Self arbitration and deliberation remain world-blind; execution uses the ordinary handoff. Agent Components → Primitives owns plain thought/bid instructions and language-first aspects, with create, edit, delete, per-item reset and reset-all. Custom reset restores its creation definition; reset-all restores factory primitives. SQLite migration 13 stores per-Agent configuration with optimistic revisions and preserved researcher configuration history. Provider failures remain errors. Primitive inference is separate from Part prompts and uses the Agent's selected provider. Mock output is fixture behavior.

Primitives have an optional researcher-selected display icon (emoji or symbol); older definitions remain readable and show the relevant factory icon by ID. The Primitives page uses single-line rows ordered icon, name, aspects, bid-production status icon and inspector pencil, with name/aspect search and right-hand create/reset toolbar controls, with icon-only reset and trash actions in the inspector’s top-right header. Icons are editable with quick choices in the component editor and reset with the primitive definition.

Primitive activation instructions and surfacing thresholds are edited in the primitive inspector; existing definitions project defaults without rewriting saved history. Identity temperament self-definition Traits affect primitive appraisal scores only. Brain Monitor shows all primitive scores, including implicit appraisals. Selected owning-Part consolidation traces may include concurrent subjective primitive appraisals; these never force learning or lifecycle changes.

## Quality-guided deliberation (ADR 0105)

Self chooses an existing bid or DELIBERATE. The deliberation task generates one ordered inquiry with a primary and optional supporting C quality; qualities never compete as choices. A selected Part deliberate bid keeps its original question and targets. Participating contributors answer first, then retain, replace or withdraw their current bid in the same generation. Retain preserves the bid ID; replacement records replacesBidId. Responses return to the same world-blind Choice. Factory templates, previews and inspection expose these contracts. Historical debate audit records and custom overrides remain readable without rewriting their content.

ADR 0107: Each primitive can disable bids independently through Allow this primitive to produce bids. Appraisal, thoughts and inquiry answers remain available; cognition and inquiry cannot create bids when disabled. Existing definitions default to enabled. Settings revisions and reset preserve ordinary configuration history.

## Optional post-deliberation activation (ADR 0108)

The per-Agent `reevaluateAfterDeliberation` switch defaults to false. When enabled, completed inquiry responses enter a new immutable, attributed subjective snapshot before activation is re-evaluated. Remaining active contributors retain bids; newly active contributors generate cognition; inactive contributors leave Self’s choice set. Self remains world-blind and ordinary deliberation limits apply. See [ADR 0108](../../../docs/architecture/decisions/0108-post-deliberation-activation.md).

ADR 0112 replaces Self single Choice with graded bid Scores and conservative compatible-set selection. Scores and selected IDs remain inspectable; external handoffs preserve each original bid.

ADR 0113 adds external chat speech realization: selected consecutive Say commands and exact speech-tagged Identity Traits guide one utterance. Original bid actions remain preserved; execution speech records emitted text and source IDs. Exec · Speech is editable and previewable through Settings → Prompts.

ADR 0115: Settings → Delete Agent confirms permanent removal of all Agent-owned data, including psychology and audit history. Active work blocks deletion; other Agents and global settings are preserved.

The Brain timeline shows current bids from the final recorded arbitration, sorted by descending initial Self score with stable input order for ties. Each scored bid displays its ordinal rank and score out of four, with selected bids marked. Marginal compatibility rounds remain in the detailed score inspector; historical arbitrations without scores show unranked bids.

ADR 0117: Consecutive selected Say and Ask bids become one chat utterance through speech realization. Questions and intentions are preserved; Wait separates dialogue groups. All original handoffs remain inspectable.

Self choice and deliberation prompt previews combine current self-definition Identity Traits with sampled recorded mediated contributions and inquiry history. Preview metadata labels this combination explicitly; historical arbitration audit inputs remain unchanged and WorldState remains excluded.

ADR 0120: Part inspection shows persisted belief confidence beside My Beliefs as (XX% Confident), with up to two decimal places (legacy records default to 100%). Historical selections show their own saved confidence. Settings → Prompts describes belief-supporting prediction formation and asymmetric confidence updates.

The per-Agent `primitivesFirst` cognition setting defaults to false. When enabled, surfaced primitive cognition completes before activated Part cognition in each cognition phase, including after deliberation re-evaluation. This changes execution order only: all contributors retain the same immutable snapshot, current-phase thoughts enter later snapshots, and Self remains world-blind. Inference task responsibilities, prompts and routing are unchanged.

ADR 0121: Parts have optional descriptive retrievalKeys for vector candidate retrieval alongside triggers. Keys never enter activation scoring; the inspector and editor expose versioned keys. Legacy versions without keys remain readable.

The Brain timeline places the selected cycle’s complete thought conversation on the left and WorldState on the right, stacking conversation first on narrow screens. Conversation bubbles show the recorded contributor name and thought or deliberation reply; routed deliberation questions are labeled Self. The completed conversation, like final bid rankings, includes events after the thought keyframe cutoff. Activation cards still reflect the selected keyframe.

Brain timeline thought-generation moments combine primitive and Part thoughts from the same completed cognition phase, including primitive-only phases; primitives do not receive separate timeline stops.

The thought conversation shows each Self inquiry once per deliberation round, suppressing duplicate per-recipient question events while keeping every contributor reply. A repeated inquiry in a later round remains visible.

ADR 0123 adds independent JEV subjective-memory recall and selectable memory-based Part candidate discovery. Recall uses current owner-scoped stored contents, timestamps and functional relevance; cross-owner scanning is scorer-only, followed by ordinary Part activation. Self and primitives gain no memory access. Operational recall threshold/count are configurable; existing version history is preserved.

ADR 0124 adds the researcher Memories search page: explicit vector/JEV queries, full-detail inspection, versioned edits and logical deletion. Deleted records leave ordinary memory lists and recall; immutable versions and audit lookup remain preserved.

Disposition-bound Parts are labeled Active through disposition in thought steps and Brain Monitor, without numeric activation levels. Their inspection records retain an explicit unscored participation reason (ADR 0130).

Settings → Prompts exposes Cog 3/4/6 as one ordered construction/evidence/cognition template; separate evidence is removed from the active menu and standalone cognition is supplemental. Primitive-first controls publication order for combined Part products.

The Memories panel shows the ten most cognitively recalled memories and ten newest memories when its search is empty. The read-only `/api/agents/:id/memories/overview` endpoint derives counts from supplied Part-cognition memory contexts and recorded recall selections, excluding researcher search/inspection and deleted memories. Recency uses original formation time, never an edit timestamp. Rankings do not influence Agent recall or cognition.

Identity entries use two-line clickable rows: question shortened to 48 characters with `...?` above the cropped answer, with the category icon and muted keywords spanning both lines. Hovering or focusing a row scrolls overflowing answer text; reduced-motion preferences disable scrolling. Clicking opens the existing Trait inspector.

Identity’s top-right Sort button opens a floating context menu with independent Trait Role and icon-category sorting controls, each with ascending/descending order. When both are enabled, role is primary and category is secondary. Preferences are retained per Agent during the page session; sorting only changes researcher display order.

The Identity Sort menu is anchored below the button, overlays the list and dismisses on outside click or Escape.

Identity’s Filter button beside Sort opens a floating menu with multi-select Trait Role and icon-category checkboxes. Selected roles and categories combine with the search query; Reset filters restores all options. Active filtering is indicated on the button and preferences remain per Agent during the page session.

Component and Settings menu pages share a two-column, two-row header: title at top left, psychological description at top right, muted creation controls at bottom left, and compact search immediately before filter/sort controls at bottom right. On narrow screens these regions stack; pages without creation actions introduce no new actions. Chat and Brain timeline retain their thread headers.

ADR 0134 adds privileged researcher creation of dispositions, subjective memories and predictions. Memory/prediction forms require an existing owning Part and source cycle; predictions preserve the one-open-per-Part and original-thread constraints. Smart creation proposes editable drafts from explicit researcher descriptions only and requires a separate save. The `researcher_authoring` task, factory prompt, routing, preview and Settings → Prompts listing are kept together. No online workflow or offline consolidation changes.

Basic creation controls show a plus icon with an accessible name; alternate creation controls follow, then reset icons with floating menus containing full action labels. Dispositions, Primitives, Memories and Predictions have component-specific floating sort/filter menus, alongside search. Options include name/date, lifecycle/status, owner, primitive family/bid capability/threshold/icon, disposition scope/prerequisites/duration and memory prediction linkage. Display preferences remain per Agent and page during the session and never alter cognition. Page descriptions introduce what each component is and when/how it participates.

Menu content now fills the right panel width. The shared header extends to its edges with a themed background and bottom divider, keeping the two-by-two title/description/creation/search layout visually integrated with the application.

All menu headers use the same measured height at a given panel width, reserving room for the longest introduction and largest control group before switching menus. Height recalculates on panel resize. Titles remain left-aligned and vertically centered in their top-left cell.

Smart creation controls for Identity, Memories and Predictions use grayscale brain icons with tooltips and accessible action labels.

The sidebar has a single Settings link. Settings opens one page with Model & key, Prompts, Activation and Delete Agent tabs inside its header, preserving the selected tab when returning. Tabs support arrow keys, Home and End. The header reserves the same height across tabs at the current viewport width, including the longest description and wrapped tabs. Each tab retains its introduction and controls; Per-thought resources remains a separate card within Model & key.

Prompts places the active prompt dropdown, save/reset/preview actions, Information, Data Available, Output Format and Original built-in prompt controls in one bar directly below the Settings header. Provider/source metadata remains with the editor. Switching prompts swaps the toolbar while preserving unsaved editor drafts.

The Prompts bar orders call type, prompt dropdown, override/default status, Save, Reset, Preview, Data, output, Original built-in prompt and the far-right (?) information button. The editor fills the remaining right panel below the header; Data can open its reference pane alongside the editor.

The Prompts toolbar uses fixed-width call type (132px) and dropdown (300px), followed by Save, Reset, Orig/Modified and a [glob] tag for shared factory/global prompts. Agent overrides hide the global tag while retaining its space. The right-aligned controls are data, output, preview, view default and (?).

UI operation failures use shared, accessible error toasts above the page and modal dialogs. Toasts can be dismissed and expire after 12 seconds, pausing while hovered or focused. Prompt validation preserves the draft and invalid editor marker; preview failures appear as toasts.

All creation, editing, help and inspection popups use a shared native dialog shell with a consistent header, close control, scrollable body and backdrop. Clicking outside cancels and discards the open draft; clicks inside (including padding) leave it open. Escape and the close control dismiss only the topmost popup. Part creation and editing also open in this shell, preserving the underlying page.

Popup and settings forms share responsive field rows with a visible label and contextual help on the left and controls on the right. Bounded scales use sliders with live numeric values; counts retain numeric inputs. Feature toggles hide dependent customization while retaining drafts, including primitive bid instructions and disabled Identity sort directions. Narrow screens stack labels above controls.

Popup header actions share the Memory inspector’s compact icon toolbar, with action icons immediately before the close icon. Every icon preserves its accessible action name and tooltip; save/create and cancel controls remain in the form body.

Disposition inspector controls edit the current record, restore a historical version as a new version, or delete using a preserved tombstone. Deleted dispositions are excluded from live listings and cognition; saved history and references remain intact.

Experienced WorldState (ADR 0136) preserves attributed imagined alternatives and natural-language posture. Cognitive-step inspection separates trajectory/action-conditioned/unclassified futures and shows pre-choice, chosen and resulting posture. Simulation Tests includes prospective anticipation, lived calibration, affective interpretation and return-to-stance scenarios with explicit controls, model provenance and preserved observations. Self sees only active Parts’ expressed predictions, never the raw future synthesis.

Hosted xAI is available as `grok-4.3` with reasoning effort `none`. Agent model settings select OpenAI or xAI and use only that provider’s server key or an explicitly saved Agent key. Changing providers cannot reuse an existing key without an explicit replacement; migrations 19–20 preserve saved model settings and encrypted credentials. Configure `XAI_API_KEY` in the local environment or enter it in Agent Settings. Jev bounded decisions remain separate. Live xAI behavior requires configured-model observation; transport tests do not establish subjective bias.

Dispositions use the same Name › Concern › Cues rows for durable and temporary records. Temporary dispositions appear in a separate container above durable dispositions, with slightly transparent dashed borders; durable rows use solid borders. Search, filters and sorting apply to both groups, with sorting preserved within each group.

Dispositions lists persistent and temporary prediction-bound dispositions. Tiles open their versioned inspector, with temporary dispositions grouped under their source prediction. Legacy prediction-attention tiles are removed (ADR 0168).

## Automated simulation assessment (ADR 0141)

Simulation Tests preserves operational measures and adds separate versioned model assessments of semantic criteria. Configured runs with real reasoning providers assess automatically unless disabled; fixture execution makes no evaluator requests. Select an evaluator model independently, or use the source Agent model. Assess saved run also supports completed historical reports. Evaluators use the appropriate existing Agent/server key and never reuse credentials across vendors.

Each assessment preserves its rubric, prompt, model, exact frozen input and hash, cited verdicts, alternatives, limitations and errors. Runtime rejects missing/duplicate criteria, invalid evidence pointers and decisive verdicts without citations. Evaluator failure does not fail a completed scenario or overwrite its measures. Fixture/mixed provenance remains explicit; model judgments are researcher assessments, never Agent cognition or proof of psychology. The `simulation_evaluation` task is editable and previewable under Settings → Prompts. See [ADR 0141](../../docs/architecture/decisions/0141-simulation-model-assessment.md).
Development displays recorded maturity, researcher attribution, applicability, limitations and optional evidence details. Legacy knowledge remains unassessed. Maturity administration is currently SDK/API only; ordinary cognitive assessment and UI editing are unfinished.


Executive → Imports lists imported portable-knowledge proposals with their instructions, declared source/reason, resource contents and explicit links to previous proposals. Content is rendered as text; scripts remain inspectable resources. Imported knowledge remains separate from executable skills and has no approval controls until the adoption bridge exists.

Imports provides a folder picker for UTF-8 text Agent Skills packages, declared source/reason fields and an optional earlier-proposal selector. Import preserves relative resources and records a proposed revision through the SDK; successful import refreshes inspection. Binary intake and executable adoption remain separate unfinished work.

Imported knowledge supports researcher `reviewed`/`rejected` decisions, reasons and immutable revision history. POST `executive-skill-imports/:id/review` requires `expectedRevision`, `decision` and `reason`; concurrent writers publish one complete content-addressed review record per revision. Reload validates record content and attribution. Imports displays current knowledge review and history, with separate review controls; expanded proposal inspection survives refresh. Reviews do not alter standard package bytes, grants, cognitive history or the executable skill registry. Executable adoption remains unfinished.

Skill episode provenance can inspect the exact parent/member snapshot captured in a selected contract. The inspector loads the recorded digest through the read-only package API and displays standard instructions/resources as text; it does not substitute the current method version. Responses for removed inspection nodes are discarded. Package reading has no cognitive or execution authority.

Reviewed imported skill proposals offer “Ask Agent to consider this skill” with an explicit message. This uses ordinary chat with the proposal ID attached, and checks that the Agent/database selection still matches the opened proposal. The server verifies the latest review and exact package before cognition. Researcher review alone does not invoke cognition or grant executable authority.
## Corrected procedure development

Skill inspection follows remainder-parent lineage and displays completed steps preserved, previous future steps replaced and newly selected future steps alongside the contributing cycle's thoughts, bids and Self reasons. Ready handoff remains separate from verification of the whole goal. These researcher audit views do not enter Agent inference.
Skills & Learning exposes manual, after-verified-execution and after-repeated-success candidate consolidation policies, plus the repeated-success evidence prerequisite. These controls schedule external candidate inference only; skill approval, application and maturity remain separate.

Executive Feedback & Diagnostics now includes an ordered tool-call table with individual recorded responses and a direct link to the execution's cognitive cycle. Submitted calls without a recorded response remain awaiting results; recorded statuses do not imply whole-task verification. This reads audit state without changing the Executive loop or Agent cognition.

Execution diagnostics retain every recorded cognition checkpoint in chronological history, with timestamps and individual cycle links. Expanded call/response/checkpoint evidence is preserved across live refreshes using audit identities; view state remains local to the inspector and never enters Agent state.

Execution inspection also displays the captured selected procedure and constraints, identifies its separate verification call, and links preceding and continuation executions. These views read the recorded contract rather than replacing it with the current skill version.

Cycle inspection displays explicit Executive consultation requests and their recorded reasons alongside ordinary review outcomes. Host consultation uses the existing cognitive review pipeline; this audit view does not pass request metadata directly to Self.

Skill source episodes also show explicit consultation reasons and their recorded outcomes alongside the contributing thoughts, bids and decisions. Requests ending before cognition are labelled separately, and request/review-start events from one cycle appear once.

Running execution rows offer Consult cognition. A separate dialog collects a researcher-attributed current observation and reason, submits the ordinary consultation API, reports review or activity ending, and links its cycle inspector. The dialog preserves input across execution-list refreshes. It does not suspend execution; the host still checks ownership and live activity at admission.

The real-browser consultation check uses an explicitly held replacement-executor fixture and prescribed cognitive providers. It verifies draft retention through refresh, observation attribution, ordinary thought-only review without another execution, and the cycle inspection link. This is UI integration evidence, not model-driven intervention or tool completion evidence.

Feedback & Diagnostics initially shows the latest 20 operational executions and reports the displayed/total count. Show older executions progressively includes earlier history, retaining each execution's tool evidence and cognition checkpoint links.

Explicit Executive configuration copying is available through POST `agents/:target/executive-profile/copy` and the Runtime panel. The researcher previews a source Agent's settings and supplies a reason. Both revisions are checked; the target receives a new revision and attributed copy event. Skills, grants, provider credentials and psychology are not copied. Selected contracts keep their captured profile. This addresses configuration portability only; skill migration and alternative adapters remain unfinished.

MCP progress notifications are bounded attributed diagnostics under the original call trace. At most 200 updates are retained per call, with 250 ms coalescing and a final buffered observation before the response. The tool-call inspector shows the latest server-reported count/total/message. Progress does not reset timeouts, validate success, count as a submitted step or create a settled correction checkpoint. Raw progress text remains outside Self inference.

MCP Connections shows the official client's local connection state for each registered server. Discovery refreshes status on success or failure; disconnect and manual status refresh update it without tool submission or Agent cognition. Connected describes a transport state, not successful task completion or tool authorization.

Cross-Agent standard package copying is available through POST `agents/:target/executive-skill-imports/copy` and each retained skill's Copy package controls. Choose a preserved source version and recipient, with an explicit reason. The host verifies the original immutable binding and copies unchanged standard files into target-owned proposed knowledge, recording source Agent/skill/version/digest lineage. Historical source approval or maturity is inert; no target method, grant or cognition is created. Identical repeat copies retain target review history. The ordinary imported-knowledge review and selected document intake remain the route to considering it; full canonical executable adoption and shared/parameterized runtime methods remain unfinished.

## Offline concern inheritance (ADR 0154)

Offline institutionalization may inherit an expressed concern and its meaning from attributed prediction-origin and investigation thoughts, with validated citations and repeated recorded usefulness. Temporary prediction-bound dispositions remain relevance-only. Learned concern/meaning inform ordinary Part formation; audit trajectories remain outside online cognition and Self. Inspection preserves the inheritance rationale and source references.

ADR 0155 disconnects Executive integration by default. Per-Agent `enabled` is explicit; missing legacy values read false. Disabled cognition preserves selection without enactment or operational context/feedback.

Executive → Imports groups configuration copying, skill package folder imports and imported proposal inspection/review in a dedicated tab. Runtime keeps execution settings; Skills & Learning keeps retained procedures and learning controls.

## Reviewed Agent MCP registration (ADR 0156)

Executive uses an Agent MCP list with an empty state and a registration dialog: official MCP Registry search, manual settings, public GitHub declarations, or an existing shared connection. Imported settings are editable and confirmed before saving. Save profile and revision sit beside the Executive heading.

Run Explorer → Repeat or fork saved starting conditions discloses the frozen specification/configuration/prompts and launches a persisted isolated rerun or explicit activation-setting fork. Researchers provide a reason and can inspect parent lineage. Progress remains in the shared experiment history; launch does not copy developed psychology or automatically assess. Missing historical snapshots disable launch; backend adapter/runtime drift is shown as an error.

Diagnostics & Evidence includes Provider operation diagnostics: component/task/provider, recorded status and elapsed time, explicit source cycle or unassigned attribution, progressive exact input/output/prompt evidence, HTTP/retryability/contract locations and reported usage. Historical missing instrumentation remains explicit. Adapter returns, runtime validation and admission stay distinct; no failure is interpreted as a psychological conclusion.

Sleep induction offers default-off disposition memory synthesis and a dependent default-off source recall replacement checkbox. Saved scope results show reasons, consolidated content, source counts and inspectable lineage. Original memories remain preserved and accessible to other dispositions.
Detail retention is adjustable before induction: preserve meaningful details/history, emphasize belief changes, or summarize the current perspective. Optional guidance and per-source retained/omitted detail judgments remain inspectable alongside the recorded policy.

## Dream progress and continuation

Dreams expose stage progress, current model tasks, cooperative pause and explicit resume of paused/failed runs. Pause finishes the current stage; resume preserves the same dream Agent/thread and skips completed stages. Console opens a searchable live/historical projection of attributed persisted events, including rejected learning and errors. It does not expose provider input bodies or feed audit state into cognition. See ADR 0163.

Dream run progress and controls appear at the top of Overview only. Criterion recurrence (What recurs, what wavers?) belongs to Conclusions, using the shared recurrence projection. Cognition across experience appears first in Execution with the same selected-run cohort, metrics and stage drill-downs.

## Sensor messages

The chat composer accepts multiple `/sensor <type>` blocks, each containing quoted items or one unquoted description. Example: `/sensor audio "James says: Hello" "Bird chirps" /sensor visual "A desk with papers"`. Items appear separately with their sensor labels and enter the same cognition cycle without relevance filtering. Plain chat arrives as audio, `Someone says: <text>`; `--name "James Smith" Hello` supplies an explicit speaker. Saved sensor items remain visible when reopening a thread.

## Perception

Perception replaces the chat thread interface with the selected Agent’s latest recorded immutable WorldState across threads. External observations show source, kind and timestamp; carried thoughts and experienced prospective alternatives, remembered interpretations and posture remain explicitly subjective. Full snapshot and source-cycle inspection preserve evidence access. New frozen snapshots update the page through the existing event stream. No snapshot means an explicit empty state; viewing the page does not create cognition or grant Self access to WorldState. Historical threads remain stored.

WorldState playback controls step backward or forward through recorded snapshots in event order. Browsing history pins the chosen immutable snapshot even as live evidence arrives; stepping to the newest snapshot follows subsequent updates. Historical inspection never replays or rolls back cognition. Play is available at the current snapshot when its owning Agent/thread has a recorded non-running cognition stream; it resumes ordinary cognition with the configured activation allowance through the existing cognition-control API. Running streams, missing streams and pending requests disable Play.

Beside the current/past WorldState title, information, grayscale brain and cycle-history icon buttons open the full snapshot, Brain timeline and source cycle. Each retains its descriptive accessible label and tooltip.

The current Perception view includes an editable sensor draft, including audio speech (speaker plus chat bar) and raw audio, visual, tactile, olfactory and gustatory observations. Add chat renders attributed text such as `Taylor Says "Hello"`; adding or editing draft items performs no inference. Play finalizes all pending items as one sensor input through the ordinary message API and starts cognition. A failed submission preserves the draft. Without pending input, Play retains the existing stream-resume behavior. Drafts are isolated by Agent/database and hidden in historical views. Recorded snapshots are never modified; finalized input creates a new immutable observation.

Perception displays sensor channels and General world facts as keyboard-accessible tabs for both current and historical snapshots. Current entries support staged add/edit/delete; Play delivers a new observation, preserving immutable history. Pending edits survive browsing history; stale submissions require an explicit reset to the latest snapshot.

Current sensor entries display as text, matching historical entries, with right-aligned pencil and delete icons. The pencil opens an inline editor; Done returns to the text display. Edits remain staged until Play.

A trash icon to the right of the current WorldState channel tabs resets staged entry edits to the latest recorded snapshot after confirmation. Cancel preserves edits; historical snapshots have no reset control.

Channel tabs use three-letter labels (AUD, VIS, TAC, OLF, GUS, GEN, THO) with ear, eye, hand, nose, tongue, globe and brain icons. Full names remain available in tooltips and accessible labels; counts and keyboard navigation are preserved.

Decaying thoughts appear in a dedicated read-only WorldState tab for both current and past snapshots, retaining Part attribution, recorded age and Self-selection status.

Subjective context appears at the bottom of the Decaying thoughts tab, after carried thoughts, with the selected snapshot’s prospective alternatives, remembered interpretations and posture.

Perception playback exposes Single Cycle using the existing per-Agent activation-pass setting: checked saves one pass; unchecked saves unlimited passes. Play starts or resumes that allowance while admitted Part cognition, prediction evaluation and Self finish. It does not cancel in-flight cognition.

Executive Runtime shows Speaking and Tool execution module switches directly below Enable Executive. The master switch disables both; saved module choices survive switching it off. Speaking realizes selected Say/Ask as text. Tool execution gates native/MCP operations and their tool/skill/checkpoint context. Skills, verification, background execution and monitoring retain their existing settings; audible playback and external-agent adapters remain unavailable.

Completed realized replies appear in Audio as `You said: [text]`. The current view also shows same-thread completed speech recorded after the frozen snapshot, explicitly labeled; browsing past snapshots never adds later speech. Live speech entries do not trigger activation or dirty the researcher draft. Ordinary next-snapshot intake retains the audio feedback with its execution reference.

The sidebar shows the current Agent as a full-width square linking to Perception. Hover or keyboard focus reveals its options pencil. Edit Agent opens a name and emoji/initials avatar dialog; changes persist as a versioned researcher profile edit. Change Agent opens a grid of all catalog Agents, including database labels, with the current selection marked.

Sidebar navigation places icon-only Sleep and Dreams controls beneath the Agent square, followed by Primitives, Identity, Dispositions, Memories, Predictions, Analytics, Affect Analysis, Logs and Executive. Settings remains the final collapsible group. The Agent square opens Perception.

## Disposition directory

Dispositions use a responsive grid of compact icon tiles showing each name and concern. Tiles open the disposition view in the combined Part history inspector; separate edit controls, search, filtering and temporary/durable filtering remain available. Long descriptions are limited to three lines with the full concern available on hover and in the inspector.

The Part inspector timeline begins with a disposition icon for each recorded source binding. Selecting it displays the shared disposition inspector information in the adjacent pane, including activation evidence and preserved versions; selecting a Part version returns to its perspective. Embedded disposition inspection is read-only; editing remains in Dispositions. Identity fallback and unbound historical Parts explicitly show that no disposition is recorded. Detached responses cannot replace a subsequently selected perspective.

Embedded disposition inspection opens on the current disposition version and displays one version at a time. Top-right previous/next controls browse preserved versions, label Current versus Historical, and disable at the ends of the recorded history. Activation statistics and charts retain their lifetime evidence scope.

Disposition directory tiles open the combined inspector within Dispositions with the disposition selected. The inspector uses the latest non-retired bound Part when available, otherwise the latest retired instance; dispositions without a bound Part retain the same disposition information and version navigation with an explicit empty Perspective History. There is no separate standalone disposition inspector. Directory pencil controls retain disposition editing.

The disposition directory uses one continuous tile grid: persistent dispositions first with solid color borders, then temporary prediction-bound dispositions with translucent dashed borders. Stable ID-derived colors distinguish records without implying psychological meaning. Each tile retains a textual type label; search and within-type sorting remain available.

The standalone Part History directory and sidebar link are removed. Existing unbound fallback Parts named `self` appear as ordinary tiles in the Dispositions grid, without a separate category or fabricated disposition. Each opens its preserved perspective versions; no fallback tile is shown unless that Part exists. Inspection remains researcher-only and does not create cognitive state.

Prediction-bound disposition tiles are grouped by their recorded source prediction in transparent, white-outlined containers. The prediction text sits in the top-left border and opens its evidence inspector. Compact child tiles retain disposition inspection and editing; horizontal scrolling keeps all children accessible while each container stays the same height as other directory tiles. Missing source records are labeled explicitly; temporary dispositions without a source ID remain individual tiles.

The Dispositions directory hides ended temporary prediction-bound dispositions by default. Filter → Show expired dispositions includes them; Reset filters restores the default. This visibility preference is retained per Agent during browsing and does not change cognitive state. Inactive durable dispositions remain visible.

When no saved selection or main-database Agent is available, startup clears stale selection/context and opens the new-Agent form in the main database. Research Agents remain available through explicit selection; they are not automatically loaded as an empty-main fallback.

Change Agent uses a vertical list with separate selection and trash buttons. Deletion confirms the named Agent and database, removes only that Agent, retains the list when deleting another Agent, and returns to creation after the last available local Agent is removed.

Edit Agent also accepts PNG/JPEG/WebP uploads (up to 10 MB) or a text prompt for Cloudflare FLUX.1 Schnell. Images are resized locally to at most 512 pixels and stored as raster data URIs through the versioned profile API when Save changes is pressed. Cancel discards the draft. The sidebar and Agent picker display saved portraits. Settings → Models includes a per-Agent Cloudflare Account ID and encrypted API token; blank token preserves it and Clear removes it. Generation requires Workers AI access and does not use the language-model key.

ADR 0169 changes the default Executive profile to enabled with Speaking on and Tool execution off. Existing saved choices and legacy profile parsing remain unchanged. Executive → Runtime exposes both module switches; tool use requires explicit enablement.

ADR 0170 adds independent per-Agent JEV Classifier settings (model ID and encrypted API key) under model settings. Unsaved/reset settings use the server decision provider; an explicit JEV model uses its saved key or the server JEV/TYPESAFE key. API responses expose only credential presence. Generative credentials remain separate. Classifier calls retain their original bounded task inputs and actual-provider provenance. Schema 29 stores these settings outside cognitive state.

ADR 0171 adds a per-Agent Model providers list above model settings, with provider dropdown, password input and Add/update action. OpenAI, xAI, JEV and Cloudflare keys are stored independently and encrypted (schema 30). Existing key controls remain compatible. Connections take precedence over legacy keys and fall back to the same provider’s server key. Removal clears the Agent’s credential for that provider without changing model choices or server keys.

Selecting Cloudflare in the Add provider row reveals a required 32-character Account ID field alongside the API key. Both are saved together; the existing image-generation settings use the saved Account ID and key. Provider rows display the saved Account ID, while secrets remain hidden.

ADR 0172 adds direct Google Gemini (Flash-Lite/Flash), direct Alibaba Qwen (Flash/Plus) and OpenRouter generation to existing provider connections. New model IDs are service-prefixed; old OpenAI/xAI IDs remain compatible. OpenRouter browsing filters its public catalog to structured-output text models and explicit synchronous IDs. Main, Identity authoring, speech and thought routing use each model’s matching encrypted credential. Main/intuitive/deliberative dropdowns include all available generative providers, with independent keys for cross-provider routing. The provider list is the only credential editor; classifier and image dropdowns list only their supported added providers. OpenRouter models load automatically. Qwen supports an official regional/workspace API base URL; its JSON mode retains local schema validation. Gemini/OpenRouter request JSON Schema. Schema 31 preserves old settings while expanding model IDs and endpoint metadata. Reported backend/model metadata stays in usage records; no task prompt or cognitive boundary changes occur.
