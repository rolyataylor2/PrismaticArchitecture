# Runtime Dependencies

This directory contains source checkouts of external infrastructure that OntoAgentic may use at runtime. External libraries must be wrapped behind OntoAgentic interfaces.

## any-llm

`any-llm` provides a unified interface over many AI providers. OntoAgentic intends to use it initially for provider communication while maintaining its own request, response, routing, capability, cognitive metadata, retry, and inspection structures.
