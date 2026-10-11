Affect Analysis is served as a browser module and uses the shared read-only researcher API. Its POST query receives ordinary same-origin JSON validation without mutating Agent state.

# Local research server

Node HTTP serves the browser and validated shared application API on loopback. SSE carries persisted cognitive events with numeric resume IDs. Inspection is privileged; model contexts remain restricted. Mutating browser requests require same-origin JSON. This local demo is not an authenticated multi-user deployment.

MCP registry, grants and schema discovery use those same privileged API protections. Registry data is shared by Agents in the selected database; research databases retain their own external configuration. Startup does not spawn configured MCP processes. Shutdown closes external MCP clients before database handles.

Shutdown first cancels and settles native background workers, preserving ambiguous outcomes as unverified, then disconnects MCP and closes stores. The execution cancellation endpoint uses the same researcher request protections and requires a locally owned running execution. Startup never replays saved unfinished operations.

The normal Agent selector combines the primary store with saved experimental stores. Startup discovers `research.sqlite` in immediate subdirectories of `PRISM_RESEARCH_ROOT` (default `workspace/gauntlet`). Each store has its own Application and provider/prompt settings. A researcher-only catalog supplies database labels; prefixed API and event-stream routes keep operations in the selected database. No Agent copying, cognition, or experimental execution occurs during discovery. Set the root to another directory to inspect experiments stored elsewhere.
