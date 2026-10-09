# ADR 0110: Self choice with complete mediated cycle history

Status: Accepted
Date: 2026-10-01
Refines ADRs 0105 and 0108.

Self receives Identity, all chronological contribution snapshots from the current cycle (including superseded, withdrawn and subsequently inactive bids), complete inquiry plans and attributed responses, and current selectable contributions. History is explicitly mediated cognitive output, not private Part state, WorldState or audit access. Historical bids inform choice but are not selectable unless still current.

Jev Self choice selects only a current bid ID, DELIBERATE, or NOTHING after at least two completed inquiry rounds in this cycle. A round is a complete inquiry, not one response or target. Runtime and adapters enforce this threshold. NOTHING ends selection without external execution; round exhaustion remains a runtime bound rather than an early NOTHING option.

The factory choice prompt describes bounded selection and Identity guidance without generative output instructions, primitive definitions, exclusions or activation re-evaluation mechanisms. DELIBERATE may gather more information, request clearer articulation, resolve inability to choose or seek better bids. Self cannot invent actions, observations or forecasts. Existing custom templates remain preserved; factory reset uses the new prompt. Task inspection and preview share the mediated history and available-choice contract.
