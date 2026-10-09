# ADR 0126: Constructed perspectives, subjective autobiography and dispositions

Status: Accepted, 2026-10-03. Requested revision: https://chatgpt.com/share/6ac17535-1530-83e8-907c-cff9ec0caafe

## Decision

The default Agent uses constructed Parts. Parts are temporary coherent, motivated models assembled from accessible subjective memories, current perception and primitive needs. Distinct conflicting hypotheses are preserved; there is no required number of Parts or predefined optimistic/pessimistic persona. An empty autobiography can bootstrap from current experience and primitives. A legacy persistent architecture remains an explicit experiment option, not the default.

All created instances remain in Parts with immutable versions, creation cycle/thread, evidence/counterevidence, retirement reason and thought/prediction history. Retiring ends participation, not storage. A later recurrence constructs a new instance rather than reactivating a retired one. Researcher restoration cannot re-enable retired constructed instances. Pre-existing persistent Parts are preserved as historical records when converting an Agent; open predictions remain evaluable.

Subjective autobiography is Agent-owned, not authoritative world truth. Retrieval preserves original biased text and interpretive formation context. Episodes also retain selected perceived details, not a copy of WorldState or an omniscient fact log. Effortful recall explicitly requests these fallible details. Self sees only mediated reports, never memories, WorldState or audit history. Existing private Part state is not shared with constructed Parts. This explicitly supersedes private-only ordinary memory access in ADRs 0016/0123/0125 for constructed cognition only.

Steering is a versioned thread working state: carried affect, attentional focus, unresolved Part concerns and selected intentions. It is a compact cognitive product, not a task manager, planner, autonomous emotion agent or second chooser. Intentions are derived only from Self-selected proposals, carry no execution authority and may be retained or retired through explicit working-state reasoning. Each Part owns its local concern and execution order. A working instance may survive multiple turns while its concern remains unresolved. Open predictions can outlive their instance and are evaluated through its preserved perspective; they never restore selection authority.

Dispositions are learned attention/recall sensitivities, not Parts or bids. They form a directed graph with hard scope prerequisites and soft activation routes. Runtime binds activation to an observed entity, so one threatening dog cannot activate a threat scope for another. A parent makes children eligible, not active. Bounded rounds and independent scores limit work; cycles in the graph cannot loop forever. Reclassification or disappearance removes the entity scope. Direct root routes allow a growl to register before a dog is identified. Generative perception inspects supplied observations with eligible attention instructions; it cannot invent observations or commit external world truth. The current text interface observes supplied facts; it does not claim image understanding.

Predictions may author temporary attention cues, scoped to their target, effective on the next cycle and removed when no longer open. Durable dispositions require resolved prediction evidence and subjective episodes through conservative offline learning; imagined predictions alone do not teach durable biases. Memories can support multiple perspectives, contradict them, or be irrelevant. Bounded evidence scoring is independent per memory/hypothesis, never a vote or truth verdict.

Every contributor in a phase receives the same frozen WorldState. Perception and steering are additional explicit inputs; neither rewrites WorldState. Self retains final Identity-guided selection; execution remains external. Primitives remain memoryless and prediction-free. Online episode encoding supports primitive-only bootstrap and salient experiences without mandatory predictions, superseding ADR 0098 for constructed cognition. Prediction outcomes teach autobiography rather than permanently adjusting a miniature personality or global reward score (superseding ADRs 0118/0120 for constructed Parts).

Sleep reinterprets selected subjective episodes and may learn dispositions from resolved evidence. It does not revive or form permanent Parts. Legacy persistent consolidation remains available only for the explicit persistent experiment. Prompt task catalog, adapters and preview contexts must reflect these boundaries. Existing historical decisions and stored versions remain unchanged.

## Canonical default flow

WorldState → immutable snapshot + thread steering → broad perception → gated entity-bound disposition scores → selective perceptual detail → subjective memory accessibility → distinct perspective construction → independent evidence scores → working Parts → independent activation + primitives → same-snapshot cognition/predictions → world-blind Self + Identity → external execution → subjective episodes + working-state update → later prediction evaluation → conservative offline memory/disposition learning.

## Experimental limits

Semantic quality depends on the selected models. Mock behavior is an explicit fixture. Retrieval scale, disposition thresholds/depth, perspective recurrence and therapeutic generalization remain experiments. No numeric activation is emotion, truth, confidence or control authority.

## Subsequent administrative cutover

ADR 0127 records the researcher-authorized discard of legacy Parts and logs. Its one-time wholly legacy reset is an explicit exception to legacy preservation above; retention of constructed instances remains mandatory.
