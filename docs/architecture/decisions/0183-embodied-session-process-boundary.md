# ADR 0183: seal an owned embodied session before external checkpointing

Status: accepted, 2026-10-26.

An optional researcher-owned JSONL CLI process loads existing Agents and ordinary configured providers. It binds each Agent to one external Executive endpoint and one thread before receiving experiences. It does not create/reset Agents, alter profiles/providers, seed psychology or expose technical world state to cognition. Observation facts enter the existing `Application.message` observation contract with the exact expected WorldState cursor. Parts/Self/Executive retain their normal boundaries.

The process owns its Application and database exclusively. A `seal` command synchronously closes input admission, pauses further activation through the existing runtime control, drains already admitted message/inference work, pauses any streams created during that drain and waits again. It refuses a successful seal while a cycle, consolidation or execution remains running/pending. Only after Application shutdown and storage close does it return the final per-Agent thread/cursor map and exit normally. Interrupted, failed or timed-out shutdown is not a seal. No selected action is replayed and no prediction, belief or memory is synthesized for checkpointing.

The external coordinator must verify the successful correlated seal response AND normal process exit before copying storage or pairing it with a world checkpoint. This is an explicit quiescent boundary, not a distributed transaction or single-owner filesystem lock. No other process may write the owned database. External workspace assets, encryption keys, provider credentials, installed dependencies and source versioning remain the coordinator/operator's responsibility. Restart uses copied storage and explicit current Executive bindings; it does not automatically resume cognitive streams or old actions.

The CLI protocol is researcher infrastructure, not an Agent tool or new inference task. It changes no factory prompt or cognitive setting. Tests must distinguish normal-pipeline mock-provider plumbing from configured-model observations and psychological validation.
