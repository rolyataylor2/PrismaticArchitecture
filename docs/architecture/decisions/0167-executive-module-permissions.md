# ADR 0167: Executive module permissions

Status: Accepted, 2026-10-15.

The researcher requested independently enabled modules immediately below the Executive master switch, including Speaking.

The current implemented execution capabilities are Speaking (selected Say/Ask intentions realized as text) and Tool execution (native exact strategies, MCP calls and their existing skill, verification, background and checkpoint support). These are configuration permissions on the existing external execution boundary, not cognitive Faculties or new autonomous systems. Wait remains a non-tool execution record under the master switch. Audible speech and external-agent adapters remain unimplemented.

The master switch overrides both module permissions. Disabling Speaking prevents Say/Ask dispatch. Disabling Tool execution prevents operational dispatch, tool submissions, tool/skill/guidance context and tool checkpoint feedback. Selected proposals and history remain preserved. Changes take effect at later dispatch/submission checks; already submitted external effects cannot be undone. Re-enabling permissions never replays old choices.

Legacy profiles without module fields retain both module permissions under their existing master switch. New profiles still default the master switch off. Module choices persist in the versioned profile and copy with its existing configuration-copy interface. Tool grants, learning policies and monitoring settings remain separate requirements rather than being implied by enabling a module.

Prompt/task review: no new inference tasks or cognitive authority are introduced. Existing speech realization consumes only selected speech and Identity; tool contexts remain runtime filtered. Factory Part and speech prompts already describe conditional supported execution and selected intentions. Task catalog and routing remain unchanged.

## Spoken output as audio experience

Completed realized Say/Ask output is externally recorded audio-channel feedback with the literal framing `You said: [rendered text]`, rather than General world facts. The execution retains its exact unprefixed speech text and selected-bid lineage. Ordinary later WorldState assembly carries this attributed audio fact forward without generating a new psychological interpretation. Failed or merely proposed speech creates no spoken observation.

The current perception view can display completed same-thread utterances recorded after its latest frozen snapshot, explicitly marked as spoken after that snapshot; they enter the next observation through ordinary intake. This live projection does not mutate frozen WorldStates, mark a draft edited, or trigger an additional activation pass. Past snapshots display only captured entries. Reference IDs prevent duplicating captured speech in the live view. Legacy execution records are projected in the same audio framing without rewriting their history. No prompt or inference access changes are needed: this is factual external output framing.
