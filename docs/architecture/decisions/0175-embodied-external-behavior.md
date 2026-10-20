# ADR 0175: embodied external behavior always passes through the body

Status: Accepted, 2026-10-20.
Source: NPC embodiment and conversation requirements; inspection found that Say/Ask/Wait could bypass the inhabited world through chat execution.

## Decision

For a host-bound embodied Agent, every external behavioral proposal uses the existing natural `act` form. This includes speaking, asking an external person a question, remaining still and moving. Parts express intended words or communicative purpose, constraints and an observable criterion in ordinary language. They do not select mechanical action identifiers. Internal inquiry, navigation, thoughts without bids and world-blind Self selection retain their existing meanings.

This supersedes ADR 0174's statement that chat-only Say/Ask/Wait remain available in embodied mode. General nonembodied Agents retain those forms and their existing speech realization. Historical selected actions remain preserved; no history or persisted psychology is rewritten. Runtime admission and request-specific schemas reject chat-only proposals in embodied snapshots, including later bid revisions. Factory prompts and their versions reflect the same boundary.

Selected `act` contracts already grant bounded external realization. The external Executive translates speech into the environment's physical speaking mechanism and waiting into its time/queue mechanism. The engine determines who can hear and what physically happens. A chat transcript alone cannot count as an NPC's world utterance. Engine events enter each listener's normal WorldState; private thoughts and evaluator histories are not broadcast.

No execution-contract capability, model task, cognitive process or numeric psychological parameter is added. The current embodied path continues to require explicit Tool execution permission for delegated body behavior; the Speaking module controls the separate nonembodied chat path. External semantics and observable verification remain the Executive's responsibility, with existing duration, budget and once-only dispatch checks. The agent and simulator remain independently runnable.

## Verification

Test that schemas and runtime reject embodied Say/Ask/Wait, that ordinary chat remains valid outside embodiment, and that natural speaking/waiting proposals preserve selected text and constraints. Exercise actual game speech and listener-specific observation without inference, then distinguish prescribed-provider integration from live model conversation observations. These checks do not establish psychological realism, learned social behavior or clinically qualified diagnoses.
