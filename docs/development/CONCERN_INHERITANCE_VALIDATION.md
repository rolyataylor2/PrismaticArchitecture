# Offline concern inheritance validation — 2026-10-09

Implements [ADR 0154](../architecture/decisions/0154-offline-concern-inheritance.md), sourced from the researcher conversation requesting inheritance from originating and investigation thoughts while keeping temporary scaffolds relevance-only.

## Implemented behavior

Part prediction creation records its exact thought event, Part version and originating disposition versions. Offline consolidation receives bounded attributed origin, prediction-holding, originating-disposition and scaffold thoughts, including continuity through new Part instances. Association is not proof of a motive. Trajectories preserve the origin and recent products and report omitted thoughts; missing terminal provenance conservatively excludes later thoughts.

Only institutionalization may propose a newly inherited concern/meaning. Its citations must match supplied recorded source-investigation thoughts, include an origin and a subsequent cycle in the same investigation, and satisfy existing ended-investigation/repeated-use gates. The persisted descendant retains concern/meaning, source thoughts, original disposition versions and continuity/distinctness rationales. Ordinary Part formation receives the learned concern/meaning; provenance thought records remain offline/researcher context. Existing predictions without origin metadata remain readable, with conservative unique-event reconstruction. Temporary scaffolds gain no inherited concern.

Factories, Settings task descriptions/variables and previews expose the new offline context and ordinary learned concern. Older provider calls default to empty trajectories. The disposition inspector displays the inherited concern, meaning, rationale and attributed source thoughts. No inference task or provider routing role was added.

## Deterministic verification

The focused lineage, scaffold, OpenAI/Ollama schema/prompt and simulation-evaluator checks pass 27/27 (`/tmp/prism-concern-final-focused.log`). These prescribed fixtures establish runtime/persistence/access boundaries, not model-discovered motivation. The final lineage check passes 2/2, covering bounded history and missing terminal provenance (`/tmp/prism-concern-final-lineage.log`). Final build and strict TypeScript/dependency lint pass (`/tmp/prism-concern-final-build.log`, `/tmp/prism-concern-final-lint.log`).

## Preserved ordinary-pipeline fixture experiments

The shared registry includes `concern-inheritance-desire` and `concern-inheritance-inquiry`, each with explicit researcher-authored starting concerns, ordinary external performance experiences, an unrelated control, offline consolidation and an analogous transfer probe. Neither case prescribes activation, predictions, classification or inherited meaning.

Local inspection evidence is preserved in ignored `workspace/gauntlet/2026-10-09-concern-inheritance/research.sqlite`, discovered with the ordinary research databases after server startup. Both fresh-Agent fixture runs completed all eight stages without infrastructure errors, preserving their source Agent:

- Desire: `simulation_9bc41a36-df37-48ba-9ab2-9671e1e5fac0`, Agent `agent_055d93a0-f7f2-4970-a40f-16b02cd6a116`.
- Inquiry: `simulation_d7aac26c-4fbb-46ac-9fc3-26fc54330fee`, Agent `agent_2e4ce559-8938-4718-be4c-6d6d0bb68b45`.
- Untouched source: `agent_9db0c955-3315-42ff-8b25-b814cf05eeae`.

Both record originating prediction/thought plumbing. Eligible scaffold institutionalization was not supplied by the bundled mock, so inheritance-dependent observations remain inconclusive. Semantic comparison and transfer also remain inconclusive. No paid/configured-model run was performed, and these results do not establish motivational development or human psychology. Run the paired scenarios in configured mode for model observations; evaluator prerequisites prevent absent inheritance from being presented as demonstrated transfer.

## Full-suite context

The first full run passed 320/323 checks. Its provider default failure was fixed and passed the focused recheck. The two remaining failures concern 390px overflow in component menus and the Part inspector; both reproduce with the unchanged HEAD UI served in isolated browser comparisons (`/tmp/prism-concern-baseline-browser.log`, `/tmp/prism-concern-baseline-part-browser.log`). The final full suite passes 322/324 checks, with only those two reproduced mobile-layout failures (`/tmp/prism-concern-final-suite.log`). The provider compatibility check passes. Separate memory-affect work in the shared workspace remains outside this task's commit.
