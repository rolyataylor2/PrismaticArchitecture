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
