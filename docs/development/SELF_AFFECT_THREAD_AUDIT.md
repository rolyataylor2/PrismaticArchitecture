# Self and affect implementation audit

Status: active; implementation is incomplete. Source retrieved on 2026-10-10:
https://chatgpt.com/share/6acaa14a-54f8-83e8-a9b2-0d6a4004d945

## Source conclusions and required evidence

The final discussion favors one Constitutional Self, one proposal system and two genuinely separate model invocations. These extend ADR 0136; selected action posture alone does not implement them. Earlier suggestions in the thread are alternatives, not permission to add an emotion engine, global goal manager or a second sovereign Self.

| Requirement | Completion evidence needed | Current evidence |
|---|---|---|
| Parts propose natural-language affect orientations with motivation, expected value and optional supporting prediction references | Validated Part output, provider schemas, persisted attributed proposals and tests | Implemented in cognition/constructed schemas, runtime `part.affect_proposals`, factory prompt and `affect-proposals.test.ts`; selection dispatch remains missing |
| Affect Selection receives Identity/constitution, proposals and mediated prior-period outcome feedback | Dedicated restricted context and model invocation; tests excluding WorldState, private memories, disposition definitions and activation scores | `affectSelectionContext` projection and exclusion tests implemented; separate invocation still missing |
| Affect Selection can select, maintain or make no deliberate change, with reason and bounded investigation requests | Validated selection and ordinary bounded deliberation integration | Selection schema and `decideAffect` validate choices/targets; runtime dispatch and inquiry integration missing |
| Cognitive layer updates relevant bids after orientation selection | Same immutable snapshot, ordinary scoped cognition, preserved original proposals, focused revisions and lineage | Missing |
| Bid Selection evaluates revised bids under selected orientation while retaining authority to reject its preferred action | Restricted context, bounded scoring and selected bid history | Existing `self.ts` and `self-scoring.ts` cover ordinary arbitration only |
| Baseline versus focused evaluations remain inspectable | Original scores/proposals, revised scores/proposals, selection changes and expressed reasons | Missing |
| Experienced affect remains distinct from voluntary selected focus | Attributed Part affect retained separately; focus never overwrites affect or asserts facts | ADR 0136 preserves expressed affect/posture; explicit focus missing |
| Focus is temporary and expires unless renewed | Explicit bounded lifecycle, maintain/renew/expire records and restart tests | Domain lifecycle implements next-thread-cycle expiry and validated renewal; durable periods and restart lifecycle missing |
| Every participating proposal is evaluated independently of activation strength | No intensity weighting or activation leakage; perturbation tests | Missing affect evaluation |
| Prior-period feedback distinguishes supported, contradicted, unresolved and untested predictions | Prediction-origin baseline, outcome/version attribution, delayed resolution and denominator tests | Pure origin-cohort feedback logic and denominator/late-resolution tests implemented; host attribution and period accumulator missing |
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

ADR 0157 resolves bounded complementary lenses (up to two proposed orientations) and proposal-driven invocation without making runtime infer psychological conflict. Existing routine external execution remains bounded by selected authority and ADR 0155's explicit Executive connection.

## Next implementation milestone

Route separate Affect Selection and focused-revision tasks through provider adapters, editable factories, previews and Settings. Connect them to runtime baseline scoring, ordinary bounded inquiry and final bid arbitration. Then implement durable episode attribution, researcher analytics and sourced experiments. Completion requires requirement-level runtime, persistence, prompt and rendered-panel evidence; domain helpers are not evidence that the full feature works.

## Validation of this milestone

Inspected current repository arbitration, scoring, core/web documentation and ADRs 0133/0136/0138/0139 plus relevant Self/affect theory. Retrieved the shared thread through direct HTTPS after the web fetch returned a cache miss. ADR 0157 documents the full target. Ordinary cognition can now publish optional attributed affect proposals, with reference validation before Part formation writes. Domain contracts project restricted first-pass input, reject unavailable selections/targets and stale/cross-scope focus, preserve renewal/expiry/switch lineage and report honest prediction cohort counts. Runtime affect selection, focused revision and analytics are not implemented yet.

Targeted tests pass 10/10 for context exclusion, lifecycle, ownership, denominators, late resolution, ordinary cognition publication, SQLite reopen durability and dynamic provider schema reference constraints. Updated provider/schema/Executive regressions pass 46/46. Strict TypeScript and dependency lint passed. The initial full suite passed 334/341; three affected schema expectations are corrected and reverified, two Executive failures pass on isolated rerun, and two browser failures reproduce on unchanged baseline 5a3ad3d. Exact terminal verification and logs are recorded in CURRENT_STATE.md. This is a foundation milestone, not completion of the requested feature.
