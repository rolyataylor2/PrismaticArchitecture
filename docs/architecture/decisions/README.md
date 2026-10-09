# Architecture Decision Records

This directory records significant architectural decisions.

Decision records explain what was decided, why it matters, what must remain true, and what remains flexible.

These records exist so future developers understand why boundaries exist rather than accidentally removing them during implementation or refactoring.

For normal Agent runtime authority, read `../CANONICAL_AGENT_FLOW.md` and ADRs 0030–0049 before relying on older records.

They are not permanent implementation specifications.

If an architectural decision later changes, preserve the old record and create a new decision record superseding it.

ADRs 0057–0066 record the current scaffolding for relational Parts, activation propagation, provenance, specificity/generalization, conservative consolidation, ordinary therapeutic change, emotional charge, and Part networks. They extend the earlier salience decision in ADR 0009: psychological significance remains important to formation, while relational recognition need not entail high emotional charge or behavioral advocacy.

ADR 0067 supersedes the binary activation semantics in ADR 0051 while preserving its principle that Parts do not compete for one activation slot.

ADRs 0068–0070 establish task persistence through Part stickiness, allow Parts to carry execution order, and define execution as an external handoff. These decisions preserve the existing WorldState → Activator → Parts → Bids → world-blind Self → Identity-guided selection flow.

ADRs 0074–0079 refine the distinction between objective experience and subjective memory: experience is psychologically digested; ancestry may remain opaque; routine cognition and sleep use digested material; exceptional ancestor replay is controlled and interpreted by the current Part; significant reinterpretation can preserve psychological continuity.

ADRs 0080–0085 establish activation spikes as optional Part context, one outstanding prediction per Part, predictions broader than bid forecasts, Part-selected prediction context capture, waking episodic encoding, and memory formation paths that do not require prediction.

ADR 0087 defines per-Agent OpenAI reasoning selection and encrypted, server-only API keys as provider routing settings.

ADR 0088 defines editable task prompts, Agent overrides, global defaults, and resets to bundled originals. ADR 0094 supersedes its prompt revision history mechanism with current overrides only.

ADR 0089 defines Twig-rendered task context, template variable access boundaries, and the continued use of provider-native output constraints.

ADR 0090 defines persisted chat-thread isolation for conversational context, activation baselines, Part stickiness, and bounded private thought continuity while learned psychology remains shared.

ADRs 0071–0073 distinguish online cognition from offline consolidation, establish incremental subjective-memory reconsolidation, and define therapy as an architecture benchmark. Existing ADRs 0060–0066 already record provenance isolation, specific/general learning, selected-trace consolidation, conservative structural change, ordinary therapeutic cognition, emotional charge semantics, and emergent higher-order psychology; they are retained as the authoritative history for those decisions.

ADR 0091 permits disabling per-Agent vector candidate filtering while retaining independent shared-state activation Scores and the existing activation policy.

ADR 0092 defines short motivation-based Part names, ego-centric relational missions, distinct strategies and beliefs, and broad subjects for generalized Parts while preserving specific relationships and developmental continuity.

ADR 0093 supersedes bounded conversation/private-only thought continuity with full thread transcripts and attributed shared prior thoughts with linear decay. Private memories and beliefs, immutable snapshots, and world-blind Self remain protected.

ADR 0094 removes prompt revision history while retaining current Agent/global overrides and factory-default resets.

ADR 0095 defines timestamped plain-English facts, preserved speaker attribution, and readable execution status with explicit fact-origin provenance.

ADR 0097 separates cognition from prediction formation, introduces bounded formation/outcome gates, and groups editable prompts by process.

ADR 0098 restricts cognition to four products, replaces same-cycle cue waves with next-cycle thought activation, and routes ordinary waking memory and mutation through predictions.

ADR 0112 replaces Self Choice with graded bid Scores and conservative marginal selection of compatible proposals.

ADR 0113 adds expression-only, Identity-guided speech realization at the external chat handoff.

ADR 0118 restricts prediction reflection to subtle append-only beliefs, mission-serving strategies, and How I think nuances. Part names and missions remain unchanged. Confidence shifts are tiny and linguistic; subjective beliefs may be false or formed from trusted testimony. Runtime preserves existing entries and rejects other prediction-driven Part edits.

ADR 0119: Thoughts interact with thoughts. Internal replies belong in thought or deliberation response. Say/Ask address external WorldState entities, never Parts, Self, primitives or retained thoughts. Self scores internally addressed dialogue bids at zero without receiving WorldState.

ADR 0120 supersedes linguistic-only prediction confidence: Parts start at 100% beliefConfidence, gain 1 percentage point per correct resolved outcome and lose 5/12 point per incorrect one, clamped to 0–100%. Predictions support existing beliefs and inherit current Part confidence; subjective thoughts retain conviction. Additive learning and unchanged names/missions remain enforced.

ADR 0122 distinguishes mission-driven advocacy from belief- and memory-grounded answers, permitting disagreement, uncertainty and unknowns without mission conformity. It refines ADR 0120 ordinary cognition certainty while retaining prediction and confidence rules.

[ADR 0123](0123-jev-subjective-memory-recall.md) defines independent JEV subjective memory recall and the optional memory-based Part candidate prefilter.

[ADR 0124](0124-researcher-memory-search-and-removal.md) defines researcher memory search, editing and history-preserving removal.

[ADR 0125](0125-agent-memory-and-worldstate-links.md) separates Agent-owned subjective records, Part references and overlapping WorldState ancestry.

ADR 0126 defines the default constructed-perspective architecture, explicit historical instance retention, subjective autobiography, thread steering, entity-bound gated disposition graphs, pending prediction continuity, offline disposition learning and preserved world-blind Self. Earlier Parts decisions remain historical and apply to the explicitly selected persistent experiment where not superseded.

- [0127 — Researcher-authorized legacy cutover](0127-legacy-cutover.md)

- [0128 — One online cognition loop, retained consolidation](0128-single-online-cognition.md)

- [0129 — Progressive disposition cognition](0129-progressive-disposition-cognition.md)

- [0130 — Disposition Parts participate without activation scoring](0130-disposition-parts-participate-without-activation-scoring.md)

- [0131 — Ordered construction, evidence and cognition generation](0131-ordered-perspective-generation.md)

- [0132 — Direct WorldState disposition activation](0132-direct-worldstate-disposition-activation.md)

ADR 0134 records explicit researcher component authoring, editable smart drafts, ownership/provenance validation and display-only browsing controls.

- [0136 — Experienced WorldState and affective perspective traversal](0136-experienced-and-prospective-worldstate.md)

- [0139 — Soft disposition activation associations](0139-soft-disposition-activation-associations.md)

- [0154 — Offline inheritance of expressed concerns](0154-offline-concern-inheritance.md)
