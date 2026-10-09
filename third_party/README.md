# Third-Party Source

This directory contains external source repositories used either as infrastructure or architectural reference material. Third-party source is deliberately separated from OntoAgentic source.

## Runtime

`runtime/` contains external libraries that OntoAgentic expects to wrap or use as infrastructure. OntoAgentic should access external inference providers through its own provider abstraction.

## Reference

`reference/` contains projects useful for studying existing solutions. They are not automatically OntoAgentic dependencies and should not be copied wholesale into OntoAgentic.

## Currently pinned revisions

- any-llm: `dccdb7ad6bb6b3868bfb8c18107abf3c9a52e7aa`
- TextArena: `6dfb577c01d0337fe03b05adce84c5ae1878eca1`
- Dulwich: `e27b0cc310ab4ebf1deee0f09ca027ad153ccc07`
- Evennia: `a89a9b94e4d7ed0acfee86def533b77bf6baa512`
- Quilltale: `c9dd31e1f6dfbb80273ee8a63dafd6d8c061b455`
- Fortress Engine: `941811dcba90e424d4b2bf24698549c14f5aec3a`

## Additional references

Evennia is a candidate persistent world-runtime substrate and remains external infrastructure under evaluation.

Quilltale is reference material for structured world state, narration, validated transitions, NPC state, and authoritative facts.

Fortress Engine is GPL-licensed reference material for data-driven worlds, semantic graphs, authored YAML worlds, action validation, reusable operations, and event-sourced history. It is not an OntoAgentic dependency.
