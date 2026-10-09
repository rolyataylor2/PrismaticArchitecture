# Inference Context Cache

Inference caching exists to reduce repeated processing of identical context. Caching is infrastructure and must not alter cognitive meaning.

## Primary reusable object

The most important shared context within one cognitive cycle is the immutable WorldState snapshot. The same serialized WorldState should be reused wherever that role is permitted to access it.

## Part evaluation

Activated Parts should not each receive a newly generated description of the environment. They should receive the same cached WorldState representation:

```text
cached Wₙ
    ├── Part A
    ├── Part B
    ├── Part C
    └── Part D
```

Part-specific material is added separately.

## Provider prompt caching

Some providers can reuse computation for repeated prompt prefixes or explicitly cached context. Provider adapters should exploit these capabilities where available, but The Prism Agent Architecture must not depend on one provider's implementation.

Other stable context, such as generic Part, Activator, or Self role contracts and unchanged Identity content, may also be cacheable. Cache domains remain separate: a Part/world cache and a Self/Identity cache must never be merged merely to save tokens.

## Cache semantics

A cache hit means the cognitive entity received semantically and version-wise the same permitted context. It does not mean the context was merely similar enough. Approximate semantic similarity is appropriate for Part retrieval, not for substituting WorldState snapshots.

## Self isolation

WorldState cache entries must never be automatically attached to Self inference. Self belongs to a separate cognitive context domain. The existence of cached WorldState does not grant Self access to it.

## Part-private context

A Part's persistent state may potentially be cached for repeated use by that same Part. Part A private state must never become Part B context. Subjective memories remain private.

## Correctness before savings

If a caching optimization changes what a cognitive entity can know, it is invalid. Architectural boundaries take priority over token savings.
