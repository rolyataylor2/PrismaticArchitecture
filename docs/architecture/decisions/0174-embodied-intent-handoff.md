# ADR 0174: embodied intentions cross an external Executive boundary

Status: Accepted, 2026-10-19.
Revision: [ADR 0175](0175-embodied-external-behavior.md) supersedes the availability of chat-only Say/Ask/Wait in embodied mode; all external body behavior uses natural `act`.
Source: Researcher instruction that an NPC's bid must not know game mechanics; the Executive translates it.

## Decision

An explicitly host-bound embodied Agent proposes `act` with natural-language text, constraints and an observable success criterion. It may express an ordered behavioral strategy through the existing executionOrder. It does not select tool steps, action IDs, role bindings or engine predicates. Say/Ask/Wait and internal inquiry remain available. Self still receives only mediated products and selects the intention; the Executive cannot select a replacement goal.

The immutable WorldState marks this action space as embodied. Host configuration supplies no tool catalog, operational skill manifests, raw execution guidance or procedure documents to this Agent. Runtime admission rejects operational proposals in this mode, including revised proposals. Provider output schemas and factory prompts reflect that boundary. General software-tool Agents retain exact selected `operate` strategies and their existing independent gateway enforcement.

After selection, a separate `external_action` contract delegates realization of this one intention to the configured external Executive endpoint. This grants no framework MCP tools. The endpoint is host configuration, never bid-controlled. The host checks the recorded selection, current Executive tools switch, captured/current limits, duration and once-only dispatch before sending. Lost responses remain unverified and are never retried automatically. No endpoint means no physical execution. Existing native adapters must not report an unhandled `act` as completed chat.

The external embodiment adapter owns semantic translation, permitted mechanics, bounded execution and observable verification. It must preserve the selected goal, constraints and behavioral order, validate mechanical proposals through the environment, and report only embodied observations to cognition. Technical traces belong to external execution/evaluation records. Missing mechanics do not become successful world outcomes. Generative translation may be external; established game mechanics remain deterministic and require no model.

Bindings must precede an Agent's first experience. Existing nonembodied history cannot be made mechanically unaware by hiding a later catalog. A persisted embodied Agent remains in this action space when a binding is absent after restart and cannot silently fall back to general tools. Host configuration is outside cognitive state; this introduces no new Part, planner, motivation or psychological hypothesis.

## Prompt review and verification

Part cognition, cognition, answers and focused revision must describe natural embodied proposals conditionally. Their task descriptions and request-specific schemas must agree. No new cognitive inference task is introduced: translation belongs to the external task-focused Executive described by ADR 0162.

Tests must inspect actual Part and Self inputs, reject mechanical proposals/revisions, preserve general exact-tool behavior, and verify an external translation against real environment outcomes. Prescribed translators establish plumbing only, not live reasoning, empirical realism or intent-equivalence proof.
