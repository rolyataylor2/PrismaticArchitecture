The Sleep dashboard is served as `/sleep-dashboard.js` and uses the existing same-origin consolidation API and saved Agent snapshot records. It adds no cognitive runtime, background worker or storage schema.

Affect Analysis is served as a browser module and uses the shared read-only researcher API. Its POST query receives ordinary same-origin JSON validation without mutating Agent state.

The simulation Observatory is served as `/simulation-observatory.js`. Shared SDK APIs supply read-only analysis/comparisons and separately versioned privileged researcher reviews/findings. Review writes use the same same-origin JSON protections as existing local administration; no public unauthenticated deployment is introduced.

# Local research server

Node HTTP serves the browser and validated shared application API on loopback. SSE carries persisted cognitive events with numeric resume IDs. Inspection is privileged; model contexts remain restricted. Mutating browser requests require same-origin JSON. This local demo is not an authenticated multi-user deployment.

MCP registry, grants and schema discovery use those same privileged API protections. Registry data is shared by Agents in the selected database; research databases retain their own external configuration. Startup does not spawn configured MCP processes. Shutdown closes external MCP clients before database handles.

`PRISM_EMBODIMENT_BINDINGS` optionally names a trusted JSON file mapping fresh primary-database Agent IDs to loopback external Executive endpoints. Bind before first experience and explicitly enable the Executive tools module. Embodied cognition receives natural action proposals without technical catalogs; selected intentions cross the configured handoff once under current limits. This server does not launch the external world or translator. Persisted embodied histories retain their restricted action space if a binding is absent. Research databases do not inherit the primary bindings. See ADR 0174 and `packages/sdk/README.md`.

Shutdown first cancels and settles native background workers, preserving ambiguous outcomes as unverified, then disconnects MCP and closes stores. The execution cancellation endpoint uses the same researcher request protections and requires a locally owned running execution. Startup never replays saved unfinished operations.

The normal Agent selector combines the primary store with saved experimental stores. Startup discovers `research.sqlite` in immediate subdirectories of `PRISM_RESEARCH_ROOT` (default `workspace/gauntlet`). Each store has its own Application and provider/prompt settings. A researcher-only catalog supplies database labels; prefixed API and event-stream routes keep operations in the selected database. No Agent copying, cognition, or experimental execution occurs during discovery. Set the root to another directory to inspect experiments stored elsewhere.

Agent image requests use the existing same-origin JSON API. The 1 MB request limit includes bounded profile image data URIs; browser uploads are resized before submission. CSP permits raster data images while inference credentials remain server-side.
