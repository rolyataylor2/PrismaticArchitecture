# Self and affect implementation audit

Status: active; implementation is incomplete. Source retrieved on 2026-10-10:
https://chatgpt.com/share/6acaa14a-54f8-83e8-a9b2-0d6a4004d945

## Source conclusions and required evidence

The final discussion favors one Constitutional Self, one proposal system and two genuinely separate model invocations. These extend ADR 0136; selected action posture alone does not implement them. Earlier suggestions in the thread are alternatives, not permission to add an emotion engine, global goal manager or a second sovereign Self.

| Requirement | Completion evidence needed | Current evidence |
|---|---|---|
| Parts propose natural-language affect orientations with motivation, expected value and optional supporting prediction references | Validated Part output, provider schemas, persisted attributed proposals and tests | Missing explicit affect proposals |
| Affect Selection receives Identity/constitution, proposals and mediated prior-period outcome feedback | Dedicated restricted context and model invocation; tests excluding WorldState, private memories, disposition definitions and activation scores | Missing separate pass |
| Affect Selection can select, maintain or make no deliberate change, with reason and bounded investigation requests | Validated selection and ordinary bounded deliberation integration | Missing |
| Cognitive layer updates relevant bids after orientation selection | Same immutable snapshot, ordinary scoped cognition, preserved original proposals, focused revisions and lineage | Missing |
| Bid Selection evaluates revised bids under selected orientation while retaining authority to reject its preferred action | Restricted context, bounded scoring and selected bid history | Existing `self.ts` and `self-scoring.ts` cover ordinary arbitration only |
| Baseline versus focused evaluations remain inspectable | Original scores/proposals, revised scores/proposals, selection changes and expressed reasons | Missing |
| Experienced affect remains distinct from voluntary selected focus | Attributed Part affect retained separately; focus never overwrites affect or asserts facts | ADR 0136 preserves expressed affect/posture; explicit focus missing |
| Focus is temporary and expires unless renewed | Explicit bounded lifecycle, maintain/renew/expire records and restart tests | Missing |
| Every participating proposal is evaluated independently of activation strength | No intensity weighting or activation leakage; perturbation tests | Missing affect evaluation |
| Prior-period feedback distinguishes supported, contradicted, unresolved and untested predictions | Prediction-origin baseline, outcome/version attribution, delayed resolution and denominator tests | Missing period accumulator |
| Feedback separates predictive reliability, learning progress and remaining practical/meaningful value | Recorded factual counts plus attributed cognitive interpretation; unavailable estimates stay unavailable | Missing |
| Period usefulness is distinct from disposition maturity | No automatic psychological mutation or global reward; offline attribution preserves lineage | Existing learning boundaries apply; new integration missing |
| Self may retain sadness/anger/disgust or other nuanced focus for meaning, care, protection or action despite little learning | Factory constitution and normal-pipeline experiments with comparison conditions | Missing |
| Confirmation bias, self-caused outcomes and generalization limits remain visible | Baseline and action attribution; alternative/discriminating inquiry; no confirmation-as-proof claim | New integration missing |
| Lifetime affect analysis panel with timeframe refinement | Durable researcher API, timeline, distinct periods, per-period statistics and browser tests | Missing dedicated panel |
| Analytics show how affect was used | Proposal/selection/renewal/expiry, bid changes, selected behavior, prediction outcomes, contributing Parts/dispositions and inspectable source references | Missing |
| Prompt responsibilities and provider routing match two passes and focused cognition | Task catalog, templates, previews, settings, schemas and adapters tested together | Missing |
| Sourced hypotheses run through Simulation Tests | Fresh isolated Agents, ordinary experiences, controls, criteria, source, limitations and durable run evidence | Existing registry supports addition; new scenarios missing |

## Architectural constraints for implementation

Read ADRs 0133, 0136, 0138 and 0139 together. Preserve independent activation/admission, scope continuity, immutable shared snapshots, separate factual prediction checks and conservative offline institutionalization. Self receives mediated expressed cognition only. Researcher timelines and raw audit traces are not Self memory.

Use natural-language focus rather than hard-coded emotion labels or numeric affect weights. Parts supply psychological meaning. Runtime supplies validation, attribution, lifecycle and statistics. Never derive emotional intensity from Jev activation or convert prediction correctness into automatic disposition development.

Do not fabricate learning-progress estimates from unmatched outcomes. The thread suggests proper scoring rules only for genuinely probabilistic comparable predictions; existing linguistic confidence does not justify invented probabilities. Record unavailable/insufficient evidence explicitly. Preserve prior-period unresolved predictions when they resolve later.

The thread's optional complementary lenses and selective use during meaningful conflict must be resolved explicitly in the new ADR, without making runtime infer psychological conflict. Existing routine external execution must remain bounded by selected authority and ADR 0155's explicit Executive connection.

## Next implementation milestone

Document the two-pass extension and its relationship to ADR 0136 posture/navigation before changing runtime. Then implement proposal/context/selection schemas and provider task routing together, followed by focused revision, durable episode attribution, researcher analytics and sourced experiments. Completion requires requirement-level runtime, persistence, prompt and rendered-panel evidence; this audit is not evidence that the feature works.

## Validation of this milestone

Inspected current repository arbitration, scoring, core/web documentation and ADR 0136. Retrieved the shared thread through direct HTTPS after the web fetch returned a cache miss. No runtime behavior has changed.
