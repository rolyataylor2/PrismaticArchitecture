# Activator

The Activator determines which Parts are psychologically relevant to current WorldState by matching Part trigger patterns. It does not propose actions, predict outcomes, evaluate Identity, choose behavior, assign goals, or determine emotional meaning.

Candidate retrieval may optimize scalability, but activation evaluation remains conceptually distinct from retrieval.

## Activation model

The Activator evaluates psychological relevance in two stages.

### Candidate retrieval

Approximate semantic/vector retrieval removes obviously irrelevant Parts. This stage should favor high recall; uncertain Parts should generally be left for Jev to evaluate. Candidate assembly may also retain sticky Parts whose concerns remain unresolved, along with other explicitly due/relevant Part sources already supported. These Parts remain candidates for the same activation process; this is not a pinned-Part subsystem.

### Semantic activation scoring

The remaining Parts are evaluated together against the same immutable WorldState. Each candidate receives its own graded activation-level judgment. The initial decision model is Jev. Candidate Parts do not compete for one activation slot, and several may simultaneously receive high activation levels.

The Jev request may contain all candidate questions together for efficiency and shared contextualization. The returned activation level remains specific to each Part. Do not normalize activation across the candidate population. A runtime activation policy later determines which Parts receive further cognition; its scale and policy remain experimental. Stickiness preserves consideration, not activation: Jev still scores current relevance against Wₙ.

### Important distinction

An activation Score means how activated a Part is by the current WorldState according to its trigger pattern. It is distinct from stickiness and emotional charge, and is not bid strength, prediction confidence, or control authority. Recognition Parts may be highly activated and contribute context without making behavioral bids. A derived rank may support inspection or resource allocation, but ranking does not define activation.

## Next-cycle thought activation

Part cognition produces no activation cues. Its expressed thoughts enter a later immutable WorldState as attributed, decaying shared thought history. Both vector retrieval and shared-state Jev scoring consider that history. No new thoughts cause same-cycle activation waves or modify the current snapshot. See [Activation Propagation](../../../docs/architecture/ACTIVATION_PROPAGATION.md) and ADR 0098.

## Candidate retrieval and semantic scoring

### Stage 1 — candidate retrieval

An inexpensive retrieval mechanism identifies Parts whose trigger patterns might plausibly matter. A vector database or vector index is an optional candidate implementation. It should favor high recall: false positives are cheap, while false negatives may remove psychologically important Parts before semantic evaluation.

```text
WorldState representation
        ↓
similarity search against Part trigger representations
        ↓
candidate Part IDs
```

This is approximate filtering, not activation.

### Stage 2 — shared-state activation scoring

A provider-neutral Score-style decision model evaluates candidate Parts against the actual objective WorldState. The initial provider is Jev:

```text
                 Wₙ
                  ↓
     one shared Jev activation request
                  ↓
 independent graded Score per candidate
                  ↓
       experimental activation policy
                  ↓
            activated Parts
```

Every candidate is evaluated against the exact same immutable Wₙ. The preferred semantics are independent graded Score-style judgments in one shared-state request. Parts do not compete for activation; several can receive high Scores at once. Scores are not normalized. Binary judgments and winner-take-all Choice are not canonical activation representations.

The permanent Score scale and runtime activation policy remain experimental; no threshold is defined here. A derived rank may be useful operationally but does not define activation.

Activation is distinct from emotional charge, prediction confidence, and bid content. Parts may contribute recognition or context without making bids. Expressed thoughts may make additional Parts relevant on a later cycle; they do not command activation or directly invoke another Part.

### Activated Part execution

Each activated Part independently receives the exact same WorldState snapshot, its own private Part state, its own subjective memories or retrieved evidence, and its Part cognition contract. It does not receive another Part's private context, bid, or Self's choice.

Activated Parts use generative reasoning for conceptually separate responsibilities:

- interpretation of what is happening;
- emotional or mission-relevant reaction;
- thought, question, or contextual contribution;
- optional prediction about meaning or what may happen;
- optional proposed action and argument, which may test a current prediction;
- supporting subjective evidence.

These are conceptual possibilities, not a permanent schema. A significant activation change may be supplied as context and invite prediction, but does not require one. Predictions may precede bids; one unresolved prediction per Part is the normal limit, and an existing prediction may be updated or resolved. Paired selected/non-selected forecasts are not required. Under ADR 0097, cognition and prediction formation are separate requests; a Jev yes/no gate dispatches forecasting. First-pass Part inference remains independent even if the runtime eventually executes calls concurrently. Attributed thoughts remain subjective; a Part does not gain access to another Part's private memory through later activation.

Where provider semantics permit, the stable Part contract and exact WorldState may form a shared prefix, followed by private Part context. Caching must not leak private context or cross the World-aware and Self world-blind domains.

## Current cognition boundary (ADR 0098)

Part cognition returns only interpretation, thought, evidenceSummary and an optional proposal. It produces no cues, memory or mutation. Additional Parts are considered on later cycles through attributed, decaying expressed thoughts in immutable WorldState; vector filtering and independent activation scoring both consider retained thoughts. Ordinary waking memory formation and mutation occur only through prediction outcome reflection. Offline development and explicit researcher edits remain separate existing paths. Older same-cycle cue and direct cognition-encoding guidance is superseded.
