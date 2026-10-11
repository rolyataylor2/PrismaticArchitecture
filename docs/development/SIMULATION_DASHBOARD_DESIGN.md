# Simulation analytics redesign

## Discovery and analytical assumptions

The experiment registry supplies hypotheses, seeded conditions, control/training/probe stages, criteria and limitations. A saved run freezes scenario, providers, prompts, starting configuration, lineage and stage snapshots. Analysis supplies per-cycle events, final activation rounds, Part origins/retirements, prediction versions/checks, memory recall, changes and provider diagnostics. Research records supply immutable human reviews and candidate findings; automated assessments are separate model judgments.

Primary questions: Which recorded criteria recur or vary across trials? Are repetitions actually comparable? What happened during controls versus training and probes? Which scopes activated, generated proposals and recalled memories? How were expectations later assessed? What changed, and where is the original evidence?

Run sets use the existing server's exact configuration grouping (scenario, seeds, prompt versions/text, provider routing, activation/runtime/Identity/Executive configuration). Missing starting configuration prevents grouping. Experiment-wide summaries can mix configurations and always disclose this. Operational observations are not theory validation. Semantic observer measures are unresolved until separately assessed. Human and automated judgments remain independent channels. Only completed runs enter criterion recurrence denominators; failed/running trials remain visible separately. Missing criteria are counted separately from inconclusive criteria. A consistently observed criterion means recorded operational support in every eligible measured trial, not causality or psychological proof.

Trajectory x-axis is recorded stage order, not wall-clock time. Repeated stages align by exact phase/name/occurrence. Missing measurements remain gaps. Active scopes count the final round per disposition; counts of unique memories/predictions use snapshot IDs, not versions. Memory recall indicates access, not effectiveness. Prediction confidence is subjective conviction, not calibrated probability. Affect is linguistic: display categorical transitions and attributed proposals, never invented numerical intensity. Usage/cost/calibration and unrecorded causal parents remain unavailable.

## Information architecture and primary wireframe

Experiments → research direction → experiment → run set (exact configuration) → individual run → dedicated analytical view → evidence dialog/source cycle. A breadcrumb restores the experiment overview; a single left navigation handles direction and experiment selection. There are no nested record trees in analytics.

```
COGNITIVE OBSERVATORY                        New run / Refresh
Experiment [hypothesis]   Run set [configuration]   Run [all / trial]
Experiment › Run set › Run                    provenance / status
Overview | Activation | Predictions | Learning | Affect | Execution | Conclusions | Compare | Records
Hypothesis and limits
Runs / completion / controls / measured criteria   (units, denominators)
Criterion recurrence                         Stage trajectories
observed / not observed / inconclusive        activation / contribution / recall
Click criterion → cited evidence             Click stage → dedicated investigation
Run timeline / condition comparison          Pattern variation and missing evidence
```

Restrained ink, teal, ochre and violet distinguish series. White plotting surfaces, fine rules, generous spacing and compact labels create hierarchy. SVG charts use accessible names, keyboard-focusable marks, visible hover/focus tooltips and exact-data dialogs. Line charts show stage trajectories; stacked horizontal bars show criterion recurrence; heatmaps show activation; interval lanes show prediction/Part histories; flow diagrams distinguish relevance, proposal, selection and enactment. Tables are reserved for exact searchable records. Raw JSON appears only in a named dialog. Mobile navigation wraps and plot surfaces retain readable axes through bounded scrolling.

## Verification

Build and architecture lint; semantic-layer tests for provenance separation, completion denominators, missing values and stage alignment; browser integration for navigation/back, stage marks, raw dialogs, launch/replay, human review and comparison; desktop/mobile screenshots using real saved fixture runs. Fixture screenshots demonstrate UI behavior, not theory validity.

## Evaluation outcome

The application was launched with mock providers; the dashboard scripts and inspector served successfully. Twenty targeted tests passed with zero skipped/cancelled tests, covering metric projection, research data boundaries, evaluator prerequisites, API behavior, replay/forks and real Chromium workflows. Build and architectural lint passed. Browser screenshots include experiment overview on desktop/mobile, activation, comparison, dedicated stage investigation and original-evidence dialog. Visual review identified inherited vertical navigation, generic form-help clutter, oversized mobile headers and late-loading sections after the footer; scoped fixes were applied and the browser workflow rerun. Full document width was checked at 390px, alongside keyboard tooltip activation and evidence access.

Screenshots and validation logs are local artifacts under `/workspace/onboarding-artifacts/dashboard`, outside tracked source. Fixture observations and stub evaluator integration demonstrate UI and protocol correctness, not cognitive-theory validity. Paid model observations were not run. The previously recorded unrelated repository-wide failures from environment onboarding were not changed by this task.
