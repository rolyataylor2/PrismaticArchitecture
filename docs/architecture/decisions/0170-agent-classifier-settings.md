# ADR 0170: Per-Agent JEV classifier settings

Status: Accepted, 2026-10-15.
Source: Researcher request for a Classifier model and API key in model settings, explicitly JEV.

Classifier settings independently route the existing bounded DecisionProvider calls to JEV. An Agent may save a JEV model ID and vault-encrypted API key, use the server JEV/TYPESAFE key, or reset to the configured server decision provider. Generative models and credentials remain independent. Profiles without classifier overrides retain server behavior; missing server credentials fail on inference, allowing settings to be configured first.

Routing uses only the owning Agent identifier and existing task inputs. It does not merge contexts or grant Self access to WorldState. Independent activation Scores, bounded choice/outcome semantics, runtime authority and task catalog remain unchanged. Provider operations and simulation provenance identify the actual selected classifier; cloned configured experiments retain classifier configuration.

Factory prompt review: existing JEV task templates already express these responsibilities and boundaries. No prompt or inference task changes are necessary. Validation covers encrypted storage, Agent isolation, actual routed HTTP requests, server fallback, reset, credential separation and browser settings persistence. These are plumbing checks, not psychological experiments.
