# TypeScript implementation

`core` owns provider-independent domain contracts and cognitive sequencing.
`storage` implements durable persistence; it is not an autobiographical memory.
`providers` implements inference capabilities behind core contracts.
`sdk` assembles application services used by all interfaces.
`executive` implements external tool infrastructure behind framework-granted execution scopes; it cannot mutate cognitive state.

Architecture documentation and ADRs remain authoritative. The older `src/ontoagentic` directories retain conceptual subsystem documentation.
