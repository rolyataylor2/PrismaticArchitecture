## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](../docs/architecture/decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

<!-- Current online flow: ADR 0133 -->

[ADR 0133](../docs/architecture/decisions/0133-parallel-assembled-part-cognition.md) defines the current online pipeline: immutable WorldState → JEV disposition activation → parallel chronological memory retrieval and code-owned scope assembly → parallel ordered Part formation/reflection/gist/cognition → world-blind Identity-guided Self → external execution. A Part named `self` uses Identity only when no disposition activates. Primitives remain in the menu but do not participate. Steering and separate online encoding/working-state inference are removed; thought carryover and decay remain. Separate prediction outcome checks and offline consolidation are unchanged.

# Tests

`simulation-tests.test.ts` runs every registered scenario through ordinary cognition without prescribing semantic outcomes. It verifies source isolation, saved evidence/restart, honest inconclusive states, copied configuration, progress and separate infrastructure failure. `simulation-tests-browser.test.ts` verifies the sidebar, actual execution controls, progress/evidence and restored report history in Chrome. These automated checks validate the experiment harness; configured-model runs in the sidebar supply observations for hypothesis review.

## Single online loop (ADR 0128)

Application cognition always constructs temporary working perspectives. The previous runtime and candidate filtering are isolated in historical test fixtures, with no production import or selectable online fallback. Consolidation, structural Part-development facilities, their prompts and inspection remain available. The historical `architecture` field now identifies only the offline consolidation profile; browser selection belongs to Experiments → Dream. Online Activation exposes accessibility, deliberation re-evaluation and primitive ordering, with no vector or memory-owner discovery switches.


## Constructed revision

Constructed tests import the real Application and exercise its default. Historical tests import `node/persistent-fixture.ts`, explicitly selecting the previous experiment while preserving its regression coverage. Constructed checks cover restart/retention, working continuity, pending prediction evaluation after retirement, thread isolation, overlapping contradictory evidence, world-blind Self, entity-scoped graph gating/reclassification, model-ID validation and provider/browser integration.

This directory contains automated tests for the The Prism Agent Architecture system. Tests should emphasize observable behavior and subsystem boundaries. External AI calls should not be required for the majority of the test suite.

ADR 0112 replaces Self single Choice with graded bid Scores and conservative compatible-set selection. Scores and selected IDs remain inspectable; external handoffs preserve each original bid.

ADR 0113 adds external chat speech realization: selected consecutive Say commands and exact speech-tagged Identity Traits guide one utterance. Original bid actions remain preserved; execution speech records emitted text and source IDs. Exec · Speech is editable and previewable through Settings → Prompts.

`concern-inheritance.test.ts` checks ADR 0154 creation linkage, attributed bounded investigation trajectories, unsupported citation rejection, offline inheritance persistence and online audit exclusion. The desire/inquiry Simulation Tests use ordinary fresh-Agent experiences; fixture observations establish plumbing, not learned motivation.
