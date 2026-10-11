## Self affect extension target (ADR 0157)

[ADR 0157](decisions/0157-two-pass-self-and-affect-exploration.md) adds separately invoked affect selection before focused bid revision and final behavioral arbitration. Both Self modes remain world-blind; Parts supply proposals and interpretation against the unchanged cycle snapshot. Routine cycles without proposals or active voluntary focus retain ordinary arbitration. Ordinary runtime integrates dispatch and completed-cycle persistence; the implementation audit records source experiments, verification evidence and measurement limitations.

## Executive connection (ADR 0155)

The Executive is disabled by default, including existing profiles without an explicit enabled setting. When off, cognition records selections without execution, operational context, feedback or checkpoint review. Enable it explicitly in Executive → Runtime. See [ADR 0155](decisions/0155-executive-disconnected-by-default.md).

## Conditional procedural knowledge (ADR 0147)

Offline external procedural inference may propose conditional skills from bounded ended selected experience and independently verified operations without explicit teaching. Conditions/reasons and source methods remain versioned. Ordinary Part/Self must explicitly select a branch under current preferences and constraints; the host checks approved current parent/member versions and current permission. No first-branch default, global planner, psychological mutation, causal proof or transfer guarantee is introduced. See [ADR 0147](decisions/0147-conditional-procedure-consolidation.md).

## Checkpoint cognition and selected pause (ADR 0146)

Interested checkpoints may enter the ordinary pipeline against the identical immutable snapshot and issued activation assessment. No bids means no mandatory Self deliberation. World-blind Self receives only mediated previously selected goal/criterion/constraints and may exclusively choose CONTINUE_EXECUTION. Local pause requires a fresh selected execution-control contract, same-Agent/thread live ownership and a durable once-only host receipt. In-flight cancellation remains unverified; it never undoes effects or proves the original goal. Monitor-only cycles remain distinct from cognitive reviews.

## Soft activation associations (ADR 0139)

Disposition prerequisites no longer gate activation. Every live eligible scope receives a direct independent score; contributing/inhibiting keyword or disposition associations then inform one bounded second judgment using frozen direct scores and the identical WorldState. Final scores govern ordinary activation/admission. No recursive feedback, private-state sharing or automatic associative learning occurs. Legacy dependencies read as contributing associations; history stays preserved. See [ADR 0139](decisions/0139-soft-disposition-activation-associations.md). This supersedes prerequisite descriptions below.

## Prediction-led development (ADR 0138)

[ADR 0138](decisions/0138-prediction-led-relevance-scaffolds.md) replaces direct online durable formation with bounded cognition coverage, gap-origin hypotheses and versioned temporary relevance scaffolds. Ordinary Parts investigate through later-cycle activation/recall; factual outcome reflection and recorded usefulness feed conservative offline institutionalization. Self remains world-blind, snapshots immutable and execution external. The ADR defines the implementation target; see the prediction-scaffold audit for current completion evidence.

# Canonical Agent Flow

ADR 0145 adds an explicitly marked read-only `attention_monitor` checkpoint for already selected external activity. Its immutable WorldState uses ordinary independent disposition scoring without recall, Part generation or Self arbitration. It records advisory background/interested attention separately from competence and coverage. Workers continue under their existing authority. Monitor-only records are not expressed cognition and do not age thoughts or replace stance. The full ADR 0144 interested → ordinary Parts → world-blind Self → selected correction path remains a required integration, not an implicit property of a high score.

## Experienced and prospective state (ADR 0136)

[ADR 0136](decisions/0136-experienced-and-prospective-worldstate.md) extends ADR 0133 with attributed prospective predictions and natural-language selected posture in the immutable experienced WorldState. Predictions can activate dispositions but never become external facts. Self receives mediated expressed worlds and stance history only; prediction evaluation uses factual-only context. Selected stance carryover and bounded internal return-to-stance navigation supersede the prior removal of affect momentum. No working-state inference, affect eligibility filter or global planner is restored.


Current decision: [ADR 0133](decisions/0133-parallel-assembled-part-cognition.md), superseding the affected online stages of ADRs 0126–0132. Historical ADRs remain decision history, not alternate production paths.

[ADR 0134](decisions/0134-general-disposition-attention-and-development.md) clarifies general attention scopes and conditional situational navigation. Offline disposition learning additionally receives selected chronological activation and expressed thought/proposal trajectories with thread attribution, alongside subjective episodes and resolved predictions. It receives no raw worlds or private Part snapshots. ADR 0133's online sequencing and access boundaries remain authoritative.

## Responsibilities and sequence

1. **Code assembles immutable WorldState.** It preserves thread facts and attributed decaying thought history. Current permitted external capability schemas, when supplied, occupy a separate optional field and do not accumulate as factual conversation history. All Parts in the cycle receive exactly the same snapshot. Objective audit history is not autobiographical memory; Self receives neither WorldState nor capability catalogs.
2. **Code freezes eligible disposition scopes.** Active durable scopes and later-cycle unended temporary scopes are eligible without prerequisite gating.
3. **JEV independently scores disposition activation.** Shared-state batches judge actual scope relevance, not mere similarity. Scores confer no truth, emotion or selection authority.
4. **Parallel JEV batches select subjective memories for each active scope.** Memories may serve multiple Parts and contradict one another. Code orders selected episodes oldest to newest.
5. **Code determines Part continuity.** Each active disposition/scope uses its unique current instance, or creates a new instance after validated generation. Retired instances never return. When no disposition activates, one fallback Part named `self` is assembled around Identity self-definition.
6. **Parallel independent LLM calls form and think.** Each ordered response contains formation → memoryReflection → memoryGist → cognition. Formation supplies the current perspective; optional reflection and gist supply a sufficient biased episode; cognition supplies appraisal, inferred beliefs, affect, thought, optional local goal, prediction and bid. Code validates the whole batch before committing products. Models never choose reuse, scope, IDs or execution. A new memory may not invent an outcome of an action proposed later in the same cycle.
7. **Separate JEV prediction checks remain.** Older open predictions are checked against later original-thread evidence. Correct/incorrect results trigger the existing generative outcome reflection; incomplete remains open and irrelevant is invalidated. Retired owners can supply preserved perspective for evaluation without selection authority. Each instance has at most one open prediction. Prediction attention enters subsequent cycles.
8. **World-blind Self selects using Identity.** It receives mediated Part contributions, bids, forecasts and inquiry responses, never WorldState, raw memories or private Part state. Optional world-blind deliberation asks Parts for missing information; they answer from their own permitted contexts.
9. **External execution enacts selected proposals.** Code compiles immutable selected-intent contracts with ordered bid and opaque prediction lineage before external handoff (ADR 0140). Simple actions execute through code; selected speech may be realized as one utterance by an expression LLM. Original bids remain inspectable. Self retains selection authority. The Executive may adapt operational methods only within granted authority; difficulty returns factual guidance requests to later ordinary cognition. Cognitively taught procedures require separate validation and preserved versions, never psychological mutation by the Executive.
10. **Code records outcomes and lifecycle.** Scope disappearance retires instances without deleting history or forecasts. Subsequent facts supply execution evidence. Attributed prior thoughts carry over and decay.

## Access boundaries

Ordinary disposition Parts receive their disposition, chronologically selected subjective memories, their own continuing state and prediction, and the shared immutable WorldState. They do not receive Identity or another scope's private state. The fallback Part `self` alone receives Identity self-definition; it has ordinary Part authority and is distinct from Self.

Primitives remain in the researcher menu but do not score, think, predict or bid online. Steering, affect/attention momentum, selected-intention carryover, separate working-state inference and separate online experience encoding are removed. Thought decay remains. There is no global task manager or planner.

Offline consolidation remains a distinct developmental timescale; ADR 0137 separates explicit disposition reconciliation from subjective memory reinterpretation; retained historical Part-development facilities remain separate. Simulations create experiences through narrow interfaces and never directly mutate psychology or Identity.

Explicit message `skillDocumentIds` can request up to ten distinct same-Agent currently reviewed import proposals. The host verifies packages before cognition and places only main instruction text/name/description plus immutable digest/review revision in `WorldState.externalSkillDocuments`. All Parts share that snapshot; supporting resources/audit and foreign approval remain excluded. Factual evidence contexts used to evaluate predictions omit this metadata, and Self receives ordinary expressed products rather than raw documents. Documents do not automatically recur in later snapshots. This is explicit intake, not automatic discovery, progressive provider retrieval, selected executable adoption or evidence of learned application. Factory Part/answer prompts and the task description reflect these boundaries.
