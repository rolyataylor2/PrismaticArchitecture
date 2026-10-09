# ADR 0089: Task prompts render explicit context through Twig templates

## Status

Accepted, 2026-09-29.

## Decision

Settings → Prompts stores Twig templates. At inference time, the provider adapter renders the effective Agent/global/factory template with the bounded data object explicitly supplied to that task. The rendered text carries task instructions and any selected context. Providers do not separately serialize the task context object into a user message.

Templates can choose which available fields to include. The task-specific data object remains the access boundary: a template cannot retrieve Store data, another Part's private state, objective history, or WorldState where that task does not receive it. In particular, Self tasks remain world-blind.

The activation adapter renders one shared prompt string from the immutable WorldState, candidate trigger definitions, and bounded cues before issuing the independent Score questions. Jev receives that human-readable prompt as its shared state, and each question asks for one candidate's Score. Jev still requires typed question IDs, score criteria and option keys; those protocol fields remain separate from the rendered context text.

Output validation remains deterministic runtime behavior. OpenAI and Ollama continue to receive provider-native structured-output constraints. Jev continues to receive Score/Choice questions and return typed judgments. Settings exposes the data variables available to each template and the expected result format.

Twig templates cannot include or load external templates. Saved templates are syntax-validated before a revision is recorded.

## Consequences

- Researchers can select and order task context in readable prompt text without sending a serialized context object alongside it.
- Template changes affect future inference calls and remain versioned under ADR 0088.
- A template can omit any supplied field, but it cannot gain access to data outside its task context.
- Provider protocol envelopes and output schemas still exist; Twig replaces the task-context serialization, not provider request formats or runtime validation. Jev still receives typed question metadata required by its API.
- Prompt templates are executable configuration and must render against the documented task variables.
