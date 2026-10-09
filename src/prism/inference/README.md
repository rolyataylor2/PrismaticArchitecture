# Inference Infrastructure

This subsystem contains infrastructure shared by cognitive systems that request model inference. It does not own psychological decisions.

Model execution is divided into deterministic orchestration, bounded decision inference, and generative reasoning. Cognitive callers request capabilities rather than depending on vendor SDK types.

Potential responsibilities include context reuse, provider-neutral inference requests, prompt/KV cache hints, token accounting, batching, concurrency support, and inference telemetry.

Routing decides which computational resource to use. Providers communicate with that resource. Inference infrastructure helps use that resource efficiently. Cognitive subsystems remain authoritative for what information they are permitted to receive.
