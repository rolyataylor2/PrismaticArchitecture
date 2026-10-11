# ADR 0158: Simulation Cognitive Observatory

Status: Accepted, 2026-10-10. Requested by the researcher.

Source: https://chatgpt.com/share/6ac7fbdd-08e0-83e8-96eb-7939ff18597f

Extend ADRs 0135/0141 with researcher-only simulation analytics. The Observatory has Overview, Experiments, Run Explorer, Comparisons, Development and Diagnostics & Evidence views over the shared simulation registry. Agent lifetime inspection remains separate.

Immutable scenario, starting conditions, configuration, prompt and stage records remain authoritative. Read-only SDK projections reconstruct readable timelines, activation rounds, prediction ledgers, object-version changes and bid-to-execution lineage. Historical gaps remain explicit; current psychology must not fill missing historical observations. Repeated snapshots are not repeated events. Independent activation, admission and Self selection remain distinct. Administrative prediction closure, evidence sufficiency and expectation support are separate measures. Conviction is not a calibrated probability.

Trace references retain run/stage/cycle/event identity, ordering, responsible component and recorded input/output provenance. Inferred adjacency is not a causal parent. External facts, testimony, expressed interpretation, imagined futures and researcher judgment retain distinct ownership. Raw evidence is progressively disclosed and never supplied to Self or Agent memory by inspection.

Versioned researcher reviews and saved candidate findings cite preserved evidence, admit uncertainty, retain alternatives and proposed controls, and remain separate from operational measures and model assessments. Comparisons align scenario stages and explicit semantic scope definitions, report unmatched/ambiguous matches and configuration differences, and retain trial counts and variability. Before/after learning and consolidation comparisons require actual preserved baselines and held-out controls; counts alone do not establish learning or transfer.

New instrumentation records factual provider/validation/execution outcomes without assigning psychological meaning or changing cognitive authority. Missing latency, usage, cost, verification, retirement reasons or assessability remain unavailable. Provider failures are infrastructure outcomes, not failed psychological hypotheses. No global reward, intelligence percentage, affect weighting or new Agent subsystem is introduced.

Implementation is tracked requirement by requirement in `docs/development/SIMULATION_ANALYTICS_THREAD_AUDIT.md`. This decision defines the full requested target; partial projections do not establish completion.

## Research record implementation

Human reviews and saved findings use separate tagged experiment records, each with a new ID, explicit version and previous-record link. Optimistic append checks run synchronously in the existing storage transaction. They never rewrite the simulation record, model assessments, audit events or psychology. Citations preserve exact referenced bytes, hashes, source run identity, run status and provider-evidence basis. Explicit `/runs/:runId/...` references support paired comparisons within the same research database; unqualified event references are restricted to the owning run.

New runs preserve public initial Identity, activation settings, construction-time runtime configuration and Executive profile alongside existing scenario and prompt snapshots. Comparison fingerprints omit generated Identity IDs and timestamps, but retain its psychological content. Historical absent configuration is never reconstructed from current settings and cannot establish controlled repeat trials. Provider labels and prompts are provenance, not a claim of bitwise inference reproducibility.

Transparent researcher rules generate unreviewed candidate findings after terminal runs and admit appropriate concern carryover, incomplete capture and intentional administrative closure as alternatives. Rule findings and human revisions retain independent history. Comparative model verdicts require paired evidence; a single-run evaluator cannot claim the benefit of a missing comparison. The existing evaluator task's access boundaries and factory responsibilities remain unchanged.

## Frozen run launch

Reruns instantiate a fresh isolated Agent from the saved scenario, Identity content, activation settings, runtime configuration, Executive profile and exact prompt texts. Forks preserve this baseline and explicitly record researcher-authored activation-setting changes and a reason. Neither operation copies developed psychology or edits its source run. Public provider routing is frozen without credentials. Configured launches require compatible current adapters/runtime and an available credential for the recorded model; changed or missing adapters fail explicitly rather than silently using current source settings. External models, tools and time remain nondeterministic; repeated configuration is not bitwise reproducibility. Historical missing starting configuration cannot be rerun under an exactness claim.

## Provider operation audit boundary

SDK provider adapters append attributed operation start/return/failure records with unique operation/input/output identities, timestamps, elapsed time, exact domain arguments/results and hashes, prompt provenance and explicitly available diagnostic fields. Provider labels and records are researcher audit, never inference context. Adapter return is distinct from runtime validation/admission. Unreported token/cache/cost data stay unknown. World-blind calls without an explicit cycle reference keep a null cycle rather than guessing from chronology; run-level diagnostics can inspect these unassigned calls. No retries, model choices, cognitive meaning or authority change through instrumentation.

## Recorded evidence trails

Research projections join bids to their expressed source, Self visibility/scoring/selection records, captured contract commands, executions and tool traces through explicit recorded IDs. A recorded choice is distinct from accepted authority and verified enactment. Multiple visibility/scoring episodes remain inspectable; no nearest-event heuristic assigns a causal request or round. Knowledge methods use exact captured skill/version/package references. Predictions link their recorded cognition-origin event, later checks, interpretation and memory IDs; remembered interpretations remain subjective. Missing source/selection/contract/execution evidence is an explicit gap. These joins describe documented lineage rather than proving psychological causation or learning effectiveness.

Runtime schema validation appends a distinct accepted/rejected record referencing the exact inference/judgment input event. Schema acceptance grants no psychological truth, structural adoption or execution authority. Adapter failures occur before runtime output validation and remain provider failures. Candidate coverage checks record their own rejection; no requested ID can be accepted through a diagnostic record. Existing model tasks, prompts, schemas and admission policies remain unchanged.

## Activation and lifecycle inspection

Runtime audit snapshots record factual scope eligibility/exclusion and separate admission outcomes under the existing policy. Active, inactive, wrong-thread, same-cycle and ended-investigation records describe availability rather than psychological salience. Association inspection retains each original direct/associated judgment and its frozen contributing/inhibiting signals; numeric differences are score changes, not emotion, influence or learning. Lifecycle charts distinguish creation, expressed participation, snapshot presence and recorded retirement. Researcher selection of a chart cell only navigates preserved evidence and cannot activate or recruit a Part.

## Metric evidence and operationalization

The Observatory keeps ten research dimensions separate. Transparent counts describe prediction/check/closure cohorts, recalled episodes and recorded subjective usefulness, retained versions/lineage, decision/authority/verification references, and provider usage/elapsed time. Their denominators and censoring remain explicit. Numerical conviction is not a calibrated probability; neither lexical matches nor record counts establish relevance, transfer, stability or causal benefit.

Dimension reviews append independent researcher records with an explicit operationalization, verdict, rationale, limitations, citations and optional measured value/unit. Different methods or units cannot be pooled as one measure. Reviews remain external judgments rather than cognitive updates or globally normalized scores. Null-cycle operation/validation citations in the isolated run window explicitly retain unassigned attribution; they never acquire a guessed cycle or causal parent.

## Contextual researcher reports

Read-only run reports answer what worked, what was surprising, what remains unknown, what changed and what to inspect next using the frozen run, recorded changes and latest separate research reviews/findings. Each statement identifies whether it is operational evidence, an observer measure, an attributed subjective assessment, a human review or an unreviewed candidate. Citation references navigate exact stage/event evidence; reviewed statements retain their saved citation hashes and versions. Initial snapshots are distinguished from later changes. Reports do not infer psychological success from completion or treat contradictory subjective predictions as objective failure. No extra inference task or Agent access is introduced.

Timeline inspection supports a run-level lane/stage matrix, individual stage events and a bounded event neighborhood. Selecting an event synchronizes stage and explicit uniquely identified owner references; multi-owner events retain ambiguity. Identifier fields and captured object ownership support navigation only, never inferred causal edges or access to current psychology. Missing historical event traces remain visible.

## Prediction alignment research

The existing external simulation evaluator additionally assesses prediction/evaluation subject alignment and fidelity of linked subjective memories. Its frozen rubric compares preserved pre-evaluation versions, later evaluations and exact linked memories; legitimate recorded revisions and changing horizons remain meaningful. Missing pre-evaluation or linked-memory evidence blocks decisive judgments. These machine interpretations append to the existing separate assessment history and may create cited unreviewed research findings, never prediction edits or psychological learning. Automatic model analysis follows the run's explicit evaluator-enabled setting; inspection alone makes no provider call. The existing researcher task/factory describes this expanded rubric scope without gaining Agent access.

Dimension reviews may concern the whole run or one explicitly selected recorded stage. Each run/dimension/scope has independent optimistic history. Stage-local judgments are never pooled into whole-run trial measurements or substituted for another stage's evidence. Comparisons show latest scope-matched judgments with their methods, units, limitations and frozen citations. Numeric differences require matching operationalizations and units; differences remain descriptive under the displayed configuration and experience confounds, not automatic improvement or regression verdicts.

Simulation execution records explicit stage start/completion/failure audit identities. SDK async audit context attributes provider operations and usage to the invoking run/stage/start event, including world-blind and offline calls. The metadata never enters provider arguments, prompts or cognitive state. Cycle identity remains null when a call has no explicit cycle; stage attribution does not grant WorldState access. Background descendants retain their originating stage rather than being reassigned by time. Research projections/citations prefer recorded scope identities; historical timestamp-only attribution remains explicitly weaker.
