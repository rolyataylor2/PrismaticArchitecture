# Project naming and compatibility

The project is **The Prism Agent Architecture**. Complete agents are **Prismatic Agents**; `Agent` remains the concise domain type. The implementation namespace is `prism`, npm workspaces use `@prism/*`, and configuration uses `PRISM_*`.

This rebrand changes names, not cognitive responsibilities or access boundaries. Parts, Identity, Self, WorldState and external execution retain their documented meanings. Existing agent IDs, database paths, memories, developmental history and credentials remain unchanged.

Legacy `ONTOAGENTIC_*` environment variables remain accepted when the corresponding `PRISM_*` variable is absent. Browser selections and session metadata migrate from `ontoagentic-*` keys without overwriting newer Prism values. New portable method packages use `assets/prism-method.json` and `prism-*` metadata; existing immutable packages retain their original bytes and digests and remain readable.

Earlier decision records, developer source threads and recorded workspace evidence retain the name used when they were written. References there to OntoAgentic describe the same project before this rebrand. Third-party source stays unchanged.
