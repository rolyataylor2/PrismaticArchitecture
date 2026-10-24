# Independent prediction evidence refinement

Source: researcher discussion supplied on 2026-10-24 about evidence recycling, retrospective support, contradiction selection and self-fulfilling predictions. [ADR 0181](../architecture/decisions/0181-independent-contradiction-aware-prediction-evidence.md) extends the existing sleep review rather than adding another disposition type or controller.

## Implemented boundaries

- Memory encoding can select exact external excerpts from its supplied snapshot. Runtime verifies citations; original experience/source IDs, timestamps and exact recalled-memory versions survive reinterpretation and synthesis. Ordinary recall does not receive the provenance payload as an extra detail channel. Deleted parent excerpts cannot certify outcomes.
- Predictions capture originating evidence and a claim-version boundary. Revision clears the current evaluation and preserves earlier versions. Old-dated records and old recollections cannot become prospective tests merely through later encoding.
- Sleep independently scores supporting, contradicting and undetermined memory relevance with the existing memory-accessibility task. No disposition concern or WorldState archive is supplied. Source diversity precedes bounded temporal sampling; every selected memory receives an explicit coverage assessment. Search omissions remain visible.
- A prospective verdict requires a preserved available external outcome source, later than the assessed claim, matching conditions and the actual claim. The evaluator must distinguish outcome from interpretation and observational from action-conditioned or self-influenced evidence. Runtime enforces declared qualifications and provenance, not semantic truth.
- Repeated reflections cannot earn new positive evidential confidence. Reconciliation counts independent experience roots and records consumed sources across versions and descendants, including restoration of older psychology. Establishment and institutionalization require independently evidenced repeated usefulness; weakening and provisional refinement remain possible. Source-hypothesis truth and learned relevance usefulness remain distinct.

The sleep dialog exposes the historical search bound (default 200, valid 1–1000), alongside existing selected-memory/review limits. The evidence view shows coverage, source novelty, outcome qualifications and bounded-search omissions. Factory prompts, versions, schemas and Settings descriptions were updated together; Self remains world-blind and primitives are unchanged.

## Experiments and limits

The sidebar Simulation Test registry includes balanced evidence, replay-only comparison, action-influence and recall-accuracy-versus-effort conditions. Each uses a fresh Agent and ordinary messages/sleep; source Agents are preserved. Authored starting attention and conditions are explicit. No fixture dictates the model's psychological conclusion.

Four fixture observations completed and are preserved locally in `workspace/gauntlet/independent-prediction-evidence-2026-10-24/evidence.sqlite` and `runs.json`. They establish runnable integration only; all semantic measures remain inconclusive. No configured-model claim or human psychological conclusion follows.

Stable record references plus timestamps preserve identity across explicit re-exposure; ordinary remembered ancestry preserves aliases. Identifying that differently worded reports concern the same external event still requires cognition or an environment-supplied record identity. Provenance cannot establish honesty, intentional deception, causal independence or comparative effort by itself. Search is bounded, legacy missing provenance stays unknown, and an absent retrieved contradiction never proves a universal claim.

## Verification

The final relevant suite passed 106/106 tests covering registry execution, scaffolds, history, source checks, consolidation, prediction gates, providers, prompts, memory and runtime (`/tmp/prism-evidence-combined-final.log`). The additional source/rollback and actual Chrome desktop/mobile run passed 12/12 (`/tmp/prism-evidence-final-regression.log`); screenshots were inspected at both widths. Strict TypeScript and architectural dependency lint passed (`/tmp/prism-evidence-lint.log`), as did the build. An earlier full-suite run was red and is not a final whole-suite pass. The broader asynchronous-action check still fails its score-2 external-condition assertion; the identical failure reproduces against an isolated archive of unchanged HEAD (`/tmp/prism-evidence-baseline-async.log`). These deterministic tests verify enforced contracts, not absence of cognitive bias.
