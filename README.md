## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](docs/architecture/decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

# The Prism Agent Architecture

The updated Executive learning target is [ADR 0144](docs/architecture/decisions/0144-correction-led-executive-learning-and-attention.md): continuous authorized activity, independent cognitive attention and operational competence, Self-selected corrections, conditional skills and late-bound preferences. Skill inspection follows actual bid/thought/validation/version lineage; checkpoint cognition/selected pause and offline conditional candidates are implemented, with source-member inspection. Maturity, automatic policy, full adaptation and transfer remain requirements tracked in the thread audit.

The bounded Executive implementation is tracked in [ADR 0140](docs/architecture/decisions/0140-bounded-teachable-executive.md) and the [thread audit](docs/development/EXECUTIVE_THREAD_AUDIT.md). Chat and explicit operational strategies compile immutable selected-bid contracts. The native executor enacts exact selected tool calls, checks a selected verification criterion and returns compact later-thread feedback, while raw traces stay in audit. The shared MCP manager supports stdio/Streamable HTTP, schema validation and scoped permissions, with durable configuration APIs. Per-Agent profiles, native background work/cancellation and evidence-checked exact-procedure versions are administered through six Executive tabs. [ADR 0142](docs/architecture/decisions/0142-selected-guidance-continuations.md) connects no-submission guidance pauses to fresh Self-selected supplemental contracts, preserving original history and cumulative request limits. [ADR 0143](docs/architecture/decisions/0143-selected-procedure-teaching-and-use.md) adds explicit Self-selected procedure teaching and exact active-method reuse with recorded evidence and mode gates. Broader planning/recovery, cognitive approval, generalized/shared methods, portable adapters and remaining configuration are unfinished.

The Prism Agent Architecture is an experimental cognitive architecture with a TypeScript runtime, durable Prismatic Agent state, and a browser research inspector.

Agents built with this architecture are called **Prismatic Agents**. `Agent` remains the concise domain type for a complete Prismatic Agent; Parts, Identity and Self keep their distinct meanings. See [project naming and compatibility](docs/architecture/PROJECT_NAMING.md).

## Current cognition

```text
immutable experienced WorldState + attributed thoughts, imagined futures and selected posture
→ code: eligible disposition scopes
→ JEV: independent disposition activation
→ parallel JEV: memory relevance per active scope
→ code: chronological memories and scope continuity
→ parallel LLM: formation → memory reflection → gist → cognition
→ world-blind Self + Identity: bid selection or deliberation
→ external execution
→ bounded coverage: hypotheses and temporary relevance for later cycles
→ evidence attachment; offline institutionalization from recorded usefulness
```

Each active disposition scope has its own temporary Part and version history. Code chooses continuity; models never choose reuse, IDs or scope. Each independent Part call forms its perspective, optionally reflects the current experience into a rich biased memory and gist, then produces appraisal, beliefs, affect, thought, optional prediction, local goal and bid. All calls share the exact frozen WorldState. Memories can inform multiple scopes and preserve incompatible interpretations.

When no disposition activates, one Part named `self` forms around Identity self-definition. Its purpose remains unspecified. It is a world-aware Part with ordinary bid authority; **Self** is the distinct world-blind selector. Ordinary disposition Parts receive no Identity. Self receives mediated contributions, Identity and deliberation, never raw WorldState, memories or private Part state.

Primitives remain configurable in Agent Components → Primitives, but do not participate in online cognition. Steering is removed; attributed thought carryover and decay remain. Disposition associations softly influence activation through frozen direct scores without recursive same-cycle propagation. Instances retire when their scope leaves the active set; retirement preserves inspection history and outstanding predictions. Retired instances cannot reactivate.

JEV checks older open predictions against later same-thread evidence, separately from Part cognition. Correct/incorrect results trigger the existing generative outcome reflection; incomplete stays open and irrelevant is invalidated. Prediction attention takes effect on later cycles. Bounded cognition coverage can generate gap hypotheses without an owning Part; both those and Part predictions may propose temporary relevance scaffolds for later ordinary cognition. Online experience only attaches evidence. Offline consolidation conservatively institutionalizes repeatedly useful relevance with preserved lineage under ADR 0138. See [ADR 0133](docs/architecture/decisions/0133-parallel-assembled-part-cognition.md) and the [canonical flow](docs/architecture/CANONICAL_AGENT_FLOW.md).

## Run locally

Requires Node 24 or later and npm.

```sh
npm install
npm run demo
npm run dev
```

Open **http://127.0.0.1:3000**. Default mock inference requires no paid credentials. `PRISM_DB` selects the SQLite file; the default is `workspace/agents/local.sqlite`. `PORT` changes the HTTP port. CLI and server use the same database by default. The privileged researcher interface binds to loopback.

The Agent selector includes saved experimental bots as well as ordinary Agents. Experimental databases named `research.sqlite` inside immediate subdirectories of `workspace/gauntlet` are discovered when the server starts; `PRISM_RESEARCH_ROOT` changes that directory. Each bot opens through the normal chat and inspection pages using its original database, with an experiment label in the selector.

For live inference, copy `.env.example` to `.env`, supply provider credentials through environment variables, and select the provider/model there or in Agent Settings. Credentials remain server-side; Agent-specific keys are encrypted with a machine-local key under ignored `workspace/credentials/`. Back up that key with the database. `.env` is ignored by Git. Jev stays behind its replaceable adapter. Missing credentials and provider errors fail explicitly; there is no silent mock fallback.

```sh
npm run cli -- --help
npm run cli -- agent list
npm run cli -- chat AGENT_ID "I feel uncertain."
npm run cli -- sleep run AGENT_ID
```

## Research interface

Interaction and Brain Monitor expose immutable snapshots, scope activation, ordered Part products, thoughts, bids, Self inputs and execution. Agent Components includes Parts, Memories, Predictions, Dispositions, Primitives and Identity. Every current or retired Part retains versions and originating thread/cycle. Memories retain rich subjective contents, gists, formation context and opaque ancestry. Audit ancestry is available only to researcher inspection, not Self.

Settings → Prompts exposes current tasks with editable Markdown/Twig templates and their exact permitted inputs and output schemas. Agent overrides take precedence over global defaults and bundled factory templates. Removed perception, separate evidence, working-state and experience-encoding tasks are absent. Earlier online prediction-formation and Part-activation prompts are absent from the application catalog.

Dispositions can attend to situations, methods, strategies and combinations of conditions as well as entities. Procedural memories can inform analogous activities involving different objects. Offline learning uses selected chronological activation and expressed thought/proposal traces alongside subjective episodes and resolved predictions to conservatively create or refine useful attention structures. These traces preserve thread attribution and exclude raw WorldState and private Part snapshots. See [ADR 0134](docs/architecture/decisions/0134-general-disposition-attention-and-development.md).

Experiments → Dream selects an offline consolidation profile: constructed memory/disposition learning or retained Part-development consolidation. This never changes online chat cognition. Consolidation does not revive retired instances. Historical regression fixtures live under `tests/node/historical/`; production cannot import them. Architecture decisions remain under `docs/architecture/decisions/` as immutable decision history.

## Validation

Use **Simulation Tests** in the sidebar to run sourced research hypotheses through ordinary cognition on fresh test Agents. The initial catalog covers the disposition discussion, including contradiction, learning/generalization and negative controls. Reports preserve stage progress, provider provenance, observations and inconclusive/failed states. Fixture mode checks the workflow with bundled mocks; configured mode uses the selected Agent's model/prompt settings and may incur provider costs. Neither a single observation nor a completed run proves a psychological theory. Future testable developer-thread hypotheses belong in this registry, as required by AGENTS.md. See [ADR 0135](docs/architecture/decisions/0135-simulation-hypothesis-tests.md).

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests use mocks or transport stubs and do not make paid requests. Browser tests run when local Chrome is available; `CHROME_BIN` selects another executable. `npm run smoke:live` explicitly runs paid validation in a temporary database. Mock semantics are deterministic fixtures, not evidence of psychological validity.

## Repository layout

- `packages/`: domain/runtime, storage, providers, shared application services and simulation interfaces.
- `apps/`: CLI, HTTP and browser interfaces.
- `docs/`: architecture, theoretical meaning and development status.
- `presets/`: starting configurations, distinct from living state.
- `workspace/`: generated local development state; storage may live elsewhere.
- `tests/` and `experiments/`: validation and reproducible experiments.
- `src/prism/`: earlier Python subsystem scaffolding and boundary documentation.
- `third_party/`: read-only external runtime infrastructure and research references.

A Part is not an LLM call, provider, autonomous Agent or executor. Simulation owns external truth; Agents own subjective psychological meaning. Models propose cognitive products; deterministic runtime validates and sequences them. Identity guides, Self chooses and external systems execute.

Experienced WorldState (ADR 0136) preserves attributed imagined alternatives and natural-language posture. Cognitive-step inspection separates trajectory/action-conditioned/unclassified futures and shows pre-choice, chosen and resulting posture. Simulation Tests includes prospective anticipation, lived calibration, affective interpretation and return-to-stance scenarios with explicit controls, model provenance and preserved observations. Self sees only active Parts’ expressed predictions, never the raw future synthesis.

## Automated simulation assessment (ADR 0141)

Simulation Tests preserves operational measures and adds separate versioned model assessments of semantic criteria. Configured runs with real reasoning providers assess automatically unless disabled; fixture execution makes no evaluator requests. Select an evaluator model independently, or use the source Agent model. Assess saved run also supports completed historical reports. Evaluators use the appropriate existing Agent/server key and never reuse credentials across vendors.

Each assessment preserves its rubric, prompt, model, exact frozen input and hash, cited verdicts, alternatives, limitations and errors. Runtime rejects missing/duplicate criteria, invalid evidence pointers and decisive verdicts without citations. Evaluator failure does not fail a completed scenario or overwrite its measures. Fixture/mixed provenance remains explicit; model judgments are researcher assessments, never Agent cognition or proof of psychology. The `simulation_evaluation` task is editable and previewable under Settings → Prompts. See [ADR 0141](docs/architecture/decisions/0141-simulation-model-assessment.md).

## Offline concern inheritance (ADR 0154)

Offline institutionalization may inherit an expressed concern and its meaning from attributed prediction-origin and investigation thoughts, with validated citations and repeated recorded usefulness. Temporary scaffolds remain relevance-only. Learned concern/meaning inform ordinary Part formation; audit trajectories remain outside online cognition and Self. Inspection preserves the inheritance rationale and source references.
