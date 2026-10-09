# Integration Contracts

These conceptual boundaries do not prescribe implementation interfaces.

ADR 0140 separates privileged MCP configuration/capability inspection from selected execution. The shared registry and per-Agent grants describe what could be permitted, not what Self has chosen. Only the later selected-contract intersection authorizes tool submission. Administrative discovery can inspect schemas through external protocol clients, but cannot create a bid, invoke cognition or call a tool on behalf of an Agent. Connection credentials resolve outside cognitive contexts; persisted configuration contains references only.

```text
Environment → WorldState
WorldState → Activator
Activator → activated Parts
WorldState → activated Parts
Parts → Bids
Bids → Self
Identity → Self
Self → Parts (questions / mediation only)
Self → external handoff (chosen action)
External system → Environment (execution)
Future environment state → WorldState
Prediction Scheduler → Part (evaluation opportunity)
```

Recent internal/execution context included in a WorldState is bounded and source-tagged. While it remains available, a Part may select relevant details into its prediction context capsule; that preserved context supports later evaluation after recent context decays. It records facts about prior events (for example, “Part C proposed X” or “operation X is still running”), not objective validation of the Part's subjective claims. External operations may continue asynchronously; prediction evaluation scheduling remains a learning support mechanism rather than generic task automation.

Additional context contracts:

```text
WorldState → Context Cache
WorldState → Vector Retrieval
Vector Retrieval → Activator
Activator → Parts
Context Cache → Parts
Context Cache -X→ Self
```

The immutable canonical WorldState snapshot becomes reusable inference context. High-recall vector retrieval may use an embedding or other representation to narrow candidate trigger matches, while sticky unresolved Parts may also be retained for consideration; neither source supplies an activation decision. Jev scores all candidate triggers against one shared Wₙ rendering in a shared request when practical, returning an independent graded Score per Part. A task Twig template selects fields from the available bounded input and renders readable text; every candidate in that request shares the same rendered state. A separate activation policy supplies identifiers of Parts requiring cognition. Each activated Part's template receives the exact same WorldState snapshot plus that Part's own bounded context; WorldState-derived context is explicitly unavailable to Self. After selection, execution is handed to an external interface. Its factual status may appear in a future WorldState, including while external work proceeds in parallel with cognition.

WorldState is objective and goalless. Parts own interpretation, motivation, emotional reaction, forecasting, and proposals. Self does not receive WorldState directly; it selects among mediated bids using Identity. The selected action is handed to external execution capabilities. Simulation is one optional environment adapter, not a direct dependency of cognition.

Under ADR 0098, Part cognition contributes only interpretation, thought, evidenceSummary and an optional proposal. Only expressed thoughts enter later WorldState thought history; no same-cycle cue channel exists. Waking memory and mutation are outputs of prediction outcome reflection.

ADR 0123 adds scorer-only JEV memory candidate discovery as an alternative to vector filtering. Owner-scoped JEV recall selects exact current subjective memory versions for Part contexts against the same immutable snapshot. Cross-owner discovery does not grant private memory access to another Part, Self or primitives.
