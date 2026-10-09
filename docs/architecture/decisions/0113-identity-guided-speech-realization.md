# ADR 0113: Identity-guided speech realization at external execution

Status: Accepted
Date: 2026-10-01
Refines ADRs 0070 and 0112.

After Self selects Say commands, the external chat Executor sends consecutive selected Say commands to a generative speech-realization task. The request contains only those selected command IDs, intended text and arguments, plus Identity Traits whose keywords contain the exact tag speech (trimmed, case-insensitive). Explicit speech tagging authorizes this use regardless of Trait role; Self's exclusion of autobiographical Traits remains unchanged. The renderer receives no WorldState, chat transcript, Part private state, memory, prediction or unselected bids.

The LLM embodies the speaker's tagged manner of speech and expresses the selected intent in that voice. It does not re-arbitrate, change intentions, invent facts, add commitments or choose other actions. Consecutive Say commands form one coherent utterance; Ask and Wait retain their existing handoffs and relative order. An empty speech Trait list still runs realization, preserving the supplied intent without inventing a personality. Custom external Executors may implement the same optional grouped Say capability; ordinary single-action Executors remain compatible. No Faculty or second sovereign is introduced.

Execution.action retains the first original command as its primary anchor. Execution.speech preserves all source bid IDs and the actual emitted text. Every original bid has a handoff audit event. Chat displays emitted speech, and factual execution feedback records actual spoken words. Structural output validation precedes emission; semantic fidelity is prompt-guided and remains a generative-model limitation. Provider or validation failure ends execution without posting the affected utterance or silently falling back.

The speech task uses the Agent-selected generative provider/model/key. The factory Markdown/Twig prompt, input/output inspection, Agent/global overrides, resets and read-only preview are available in Settings → Prompts under Exec · Speech. Demo mode uses a clearly labeled deterministic fixture.
