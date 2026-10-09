# Inference Context and Caching

The Prism Agent Architecture may evaluate many Parts against the same environmental situation. Naively resending and recomputing the entire environment independently for every Part would be expensive and could introduce contextual inconsistency.

The architecture therefore treats the WorldState snapshot as reusable shared inference context.

## One factual snapshot

At the beginning of a cognitive cycle:

1. collect objective WorldState;
2. freeze it;
3. render it through the effective task Twig template;
4. assign it a stable cycle/version identity;
5. reuse that exact representation throughout permitted inference.

## Activation pipeline

Candidate Part discovery should be inexpensive:

```text
WorldState
→ selectable vector trigger lookup / JEV memory relevance / unfiltered eligibility
→ candidate Parts
→ one shared-state Jev request with a graded Score question per candidate
→ independent per-Part activation Scores
→ separate activation policy
→ activated Parts
```

The vector stage primarily rejects obviously irrelevant Parts and favors high recall. The Activator performs actual psychological activation scoring. The activation template is rendered once from the exact shared Wₙ, candidate Part records and attributed retained thoughts (ADR 0098). Jev receives that same rendered prompt as shared state with each candidate's independent Score question in one request when practical; Scores remain independent and unnormalized. Vector similarity is not activation. The runtime applies a separate experimental activation policy. Templates may select which supplied fields are rendered, but the source snapshot and candidate set do not vary between questions in that request.

## Part inference

Each activated Part's template receives the exact same immutable WorldState snapshot plus that Part's own private Part context. The rendered message may select fields from those task-scoped values. No provider separately receives a serialized task-context object.

```text
                     cached Wₙ
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
        Part A         Part B        Part C
        state A        state B       state C
          │             │             │
          ▼             ▼             ▼
         bid A          bid B         bid C
```

Differences in bids should arise from Parts rather than context drift. Activated Parts are prompted individually.

## Cache-friendly context

Where provider semantics allow it, assemble the largest common stable content as a cacheable prefix or block: stable inference contract and the rendered WorldState Wₙ, followed by role- or Part-specific state, private subjective memory, and the current request. Provider adapters may arrange fragments differently to use native caching, but must preserve the same cognitive information boundary.

Stable instructions and unchanged Identity may also be cacheable, but PART WORLD CACHE and SELF / IDENTITY CACHE remain separate.

## Exact reuse versus semantic retrieval

Vector retrieval is approximate and finds candidate Parts. Context caching is exact/versioned reuse and ensures multiple inferences process the same factual snapshot. A semantically similar WorldState is not interchangeable with the current WorldState.

## Self

Self receives none of the WorldState context. Its context is assembled independently from Self role, Identity, optional Identity mask, Part bids, and answers from Parts during deliberation. Provider cache reuse must never cause WorldState to leak into Self context.

## Future cycle and parallel evaluation

When the environment changes, Wₙ becomes historical and a new Wₙ₊₁ is created. No Part in one cycle receives a mixture of Wₙ and Wₙ₊₁. Independent Part calls may eventually execute concurrently against the immutable snapshot; no Part should observe another Part's bid merely because it finished first. Part-to-Part interaction occurs later through Self-mediated deliberation.

## Cache invalidation and observability

A WorldState cache entry becomes inappropriate when the WorldState version changes. Prefer explicit version/hash identity over guessing whether cached context is close enough.

Inspection should eventually record the WorldState snapshot/version, retrieval use, candidate Parts, activated Parts, provider/model, cache eligibility and hit/miss where available, input/cached/newly processed/output tokens, and other operational performance data. Observability must not alter cognition.

ADR 0093 extends shared Wₙ with the full thread chat transcript and an explicitly shared projection of retained prior thought text. That projection includes attribution and decay metadata, not private Part snapshots, memories, or beliefs. It is frozen with the facts; current-cycle output cannot mutate Wₙ. Self inference remains world-blind.

ADR 0123 adds scorer-only JEV memory candidate discovery as an alternative to vector filtering. Owner-scoped JEV recall selects exact current subjective memory versions for Part contexts against the same immutable snapshot. Cross-owner discovery does not grant private memory access to another Part, Self or primitives.
