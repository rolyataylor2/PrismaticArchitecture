# Jev Decision Adapter

This directory will eventually adapt TypeSafe Jev to OntoAgentic's decision-inference interface.

Jev should remain behind this adapter.

Current intended mappings are:

Part activation → independent per-Part Score-style judgments against one shared WorldState request

Self action arbitration → Choice

Do not represent activation as one Choice among candidate Parts. Canonical activation is graded rather than binary Noul; binary judgments may remain useful in experiments.

Other primitives may be used later where appropriate.

Do not expose Jev SDK objects throughout cognitive domain code.

## State boundaries

The adapter receives only the state that the calling cognitive subsystem is permitted to expose.

For Activator, WorldState is permitted.

For Self arbitration, WorldState is forbidden.

The adapter must never expand cognitive access merely because Jev supports larger state.
