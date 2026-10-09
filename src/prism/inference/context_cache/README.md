# Inference Context Cache

This subsystem concerns reuse of inference context across compatible calls. The key architectural use case is one WorldState evaluated by many Parts.

## Provider-neutral design

Different providers may implement context reuse through automatic prefix caching, explicit cached blocks, reusable sessions, or local-model KV reuse. The Prism Agent Architecture should expose enough context structure for provider adapters to exploit these capabilities without making cognition provider-specific.

## Cache domains

Contexts belonging to different cognitive access domains must remain separate. At minimum distinguish WORLD-AWARE (Activator and Parts) from WORLD-BLIND (Self). Never reuse a WORLD-AWARE cache entry as the prefix of a Self inference.

## Versioning and privacy

Cache entries derived from WorldState must be associated with the exact snapshot/version they represent. Part-private memory or state must not accidentally become reusable context for another Part.

Shared context is WorldState for World-aware callers; private context is Part-specific cognitive state. Self has a separate World-blind cache/context domain and must not reuse the WorldState context.
