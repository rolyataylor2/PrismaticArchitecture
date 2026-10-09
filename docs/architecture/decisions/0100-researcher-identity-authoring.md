# ADR 0100: Researcher Identity Authoring

## Decision

The Identity brain dialog is an explicit researcher authoring operation, outside Agent cognition. A clarification task proposes versions of a named person or fictional character; an answer task drafts every preset question using the selected description, extra details and shared authoring guidance. Neither task receives WorldState, Parts, private memories, audit history or the current Identity. Both prompts are editable through Settings → Prompts. The dialog information button explains the auto-fill workflow and replacement consequences. Reference type is inferred from the submitted name through clarification options. Initial routing uses the Agent's configured OpenAI model and credentials through the provider layer.

Answer generation may batch the preset catalog using the same answer template. Runtime validates complete, unique question coverage and nonempty answers, then assigns trait IDs, timestamps and preset keywords. Only after successful validation is the collection replaced atomically with optimistic version checking as a researcher edit. Failed generation or a concurrent edit leaves the current collection intact. Earlier Identity versions remain preserved even though the Identity page no longer exposes a history button.
