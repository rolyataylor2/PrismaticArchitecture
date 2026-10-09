# ADR 0141: Evidence-grounded model assessment of simulation tests

Status: Accepted, 2026-10-08. Requested by the researcher.

Extend ADR 0135 with automated researcher assessment outside cognition. Preserve deterministic measurements and original run evidence. Explicit semantic rubrics define observed, not observed, prerequisites, controls and limitations. A stateless evaluator model reviews frozen recorded stages, never executes experiences or mutates Agent psychology. Missing prerequisites remain inconclusive; model evaluation cannot override deterministic measurements or promote fixture/mixed evidence into empirical validation.

Configured runs with real reasoning providers request assessment automatically by default; fixture execution never starts evaluator calls. Researchers may explicitly assess saved fixture reports, retaining their harness-only provenance. Researchers may disable automatic assessment, choose a supported evaluator model independently of the experimental model, and assess completed historical runs explicitly. Credentials use existing server/Agent secret boundaries; changing vendor never reuses the other vendor's key. Assessment failures are separate from successful simulation execution.

Each assessment appends a versioned record with model label, rubric and prompt snapshots, exact evidence input and hash, criterion verdicts, supporting evidence references, explanation, counterevidence/alternatives, limitations, timestamps and failure status. Runtime validates criterion coverage and references against the frozen input. Decisive verdicts require evidence citations. Previous assessments and operational measures remain unchanged. These are automated assessments, not human reviews, psychological truth, or proof of causal learning. Same-thread carryover and model pretraining must be considered.

The evaluator task appears in Settings → Prompts with researcher-only access. It receives recorded experiment evidence, not a cognitive context, and is routed through existing stateless structured-output transports. There is no new Agent motivation, Self access, cognitive learning authority or simulation-world authority.
