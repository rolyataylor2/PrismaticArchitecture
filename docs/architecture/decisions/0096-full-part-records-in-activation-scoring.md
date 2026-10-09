# ADR 0096: Full Part records in activation scoring

Status: Accepted
Date: 2026-09-30

## Decision

Activation scoring receives the complete current Part record for every candidate, alongside the shared immutable WorldState and bounded cues. Candidate records include mission, beliefs, strategies, cognitive characteristics, relationships, lifecycle, stickiness, emotional charge, and developmental metadata as well as IDs and triggers. The factory prompt renders every Part record field.

These records contextualize independent trigger activation judgments. Beliefs remain subjective; emotional charge and stickiness do not determine activation or authority. Vector retrieval continues to index triggers only, and the existing candidate selection settings remain in force. Disabling vector search includes every active-lifecycle Part.

This access belongs to the activation scorer. It does not expose other candidates’ private state to Part cognition or Self. Separately stored subjective memories, predictions, and audit history are outside this request. Existing Part-private inference boundaries remain in force.

## Consequences

Activation requests and previews share the full candidate-record contract. Settings → Prompts documents all available candidate fields. Requests may contain more tokens. Existing edited prompt overrides retain their text and can render the new fields or reset to the factory template.
