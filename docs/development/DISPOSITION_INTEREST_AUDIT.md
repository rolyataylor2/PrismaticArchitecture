# Disposition interest implementation audit

2026-10-17. Governing decision: [ADR 0173](../architecture/decisions/0173-disposition-interest-thresholds.md).

## Implemented behavior

- Bounded long-term [0, 1] and short-term [-1, 1] interest traces belong to each
  disposition. Legacy missing traces are neutral; old manual thresholds remain
  in immutable history but no longer control current activation.
- Runtime derives thresholds with neutral 2, weights 0.45/0.35, and bounds
  1.4–2.35. Independent relevance judgments and the existing optional frozen
  association phase remain unchanged in number and purpose.
- New Self-selected behavioral, navigation and affect proposals reinforce their
  owning dispositions, with a single update per disposition per decision and
  persistent proposal-ID deduplication. Mere activation, repeated assessment,
  inference, maintained affect and continued execution do not reinforce.
- Exponential decay uses elapsed immutable experience time. Defaults are 30 days
  for long-term interest and 30 minutes for short-term interest. Reads do not
  write decay versions. Selection and researcher edits preserve prior versions
  and immediate developmental predecessors. Settings changes materialize elapsed
  decay under the old rates before switching policies.
- The environmental scorer receives an explicit relevance allowlist; interests,
  thresholds and interest settings are absent. Self inputs remain unchanged and
  blind to the dynamic. Ordinary Part contexts exclude interest traces.
- Settings → Activation contains a Disposition interests card. Existing header
  Save persists weights, selection gains and half-lives. Disposition editors
  expose both interests and a read-only threshold preview. APIs reject direct
  threshold writes and invalid interest values. Partial settings updates retain
  other saved values.
- Researcher judgments record thresholds outside provider inputs. Activation
  charts, statistics, sleep scope selection and simulation analysis use recorded
  thresholds rather than a later disposition's changed policy. Current versus
  historical/legacy threshold displays remain distinct.

## Validation

Build and strict TypeScript/dependency lint pass. The focused acceptance set has
57 passing tests across interest arithmetic/runtime/persistence, desktop/mobile
Chromium, activation authoring/settings, concern inheritance, constructed
cognition, sleep synthesis, Executive attention and developmental evidence.
An additional 10-test interest/analytics/migration run passes, including exact
selection-derived state changes and legacy activation-setting upgrades.

Browser checks save settings, immediately use the saved weights in previews,
create dispositions through both interest sliders, and check desktop/mobile
overflow and JavaScript errors. Screenshots were inspected during development;
generated assets remain outside source control.

The broader repository suite is not a clean baseline. An independent checkout of
the pre-change commit reproduces failures involving Executive defaults, affect
fixtures, procedure/skill fixtures, the Jev transport-constructor expectation,
and speech/world-history formatting. The initial broad run also stalled in
`simulation-tests.test.ts`; that worker was terminated after several minutes.
These broad results do not establish a full-suite pass.

## Experiment and limits

The paired `interest-selected-engagement` and `interest-neutral-control`
Simulation Tests use identical authored experiences and ordinary isolated Agent
pipelines, with selection gains disabled in the control. Both fixture protocols
complete and preserve the source Agent. Mock evidence verifies orchestration and
access boundaries, not psychological usefulness or human validity. Configured
model comparisons and longer-term observations remain empirical work.

The source transcript does not define a validated meaningful-progress or
unproductive-engagement signal. No prediction-accuracy reward, automatic
repetition penalty, identity-affinity inference, interest propagation or extra
interest-management inference is invented. Researchers can set negative
short-term interest; automatic outcome-sensitive satiation requires a later
explicit rule.
