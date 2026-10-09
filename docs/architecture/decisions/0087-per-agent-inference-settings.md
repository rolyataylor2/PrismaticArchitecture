# ADR 0087: Per-Agent inference settings and server-side credentials

## Status

Accepted, 2026-09-29.

## Decision

Researchers may select an OpenAI reasoning model and optional Agent-specific OpenAI API key for each persistent Agent. Per-Agent model settings are routing configuration, not cognitive state. The runtime resolves the configured provider using the current Agent ID at each reasoning operation. Jev's bounded decision role remains independently configured at the host level.

API credentials are never part of Agent, Part, Identity, WorldState, history, prompts, events or API responses. Agent keys are encrypted with authenticated encryption before entering SQLite. A machine-local permission-restricted master key is stored outside the database under ignored workspace credentials. Empty key updates preserve the current key; explicit clear falls back to the server environment key.

The current model selector deliberately offers two inexpensive models: GPT-5 nano ($0.05/M input tokens) and GPT-4.1 nano ($0.10/M input tokens), with current OpenAI pricing recorded in the provider documentation. Adding models requires confirming they support the required structured outputs and passing the provider contract suite.

## Consequences

- Cognitive providers remain replaceable infrastructure; Part identity is unchanged by model selection.
- Settings updates use the researcher API and are isolated by Agent ID.
- The local vault key and database backup must be kept together to retain access to encrypted Agent keys.
- The loopback research UI remains a trusted single-user interface; this ADR does not add multi-user authentication or remote deployment support.
