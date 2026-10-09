# Autonomous Cognitive Gauntlet — 2026-10-07

## View the saved Agents

The main interface at [port 3000](http://127.0.0.1:3000) now includes both gauntlet Agents in its normal Agent selector, labelled **Experiment · 2026-10-07**. They continue to use this run's isolated database.

From the repository root, run `npx tsx workspace/gauntlet/2026-10-07/server.ts`, then open [the normal research interface](http://127.0.0.1:3011). The Agent selector contains **Gauntlet longitudinal branch** and **Gauntlet clean comparison**. Chat Sessions, Brain, Agent Components and Logs inspect their saved conversations and cognitive state. This instance uses the isolated research database; the main interface at port 3000 continues to use its own database. Starting the server runs no new experiment or inference. Ordinary chat and editing controls remain available and save changes to the research database.

Protocol: `/Users/user/.codex/attachments/e5aa9713-f801-4e9a-9a4e-0b7bf969cef2/pasted-text-1.txt` (copied as protocol.md). This is an isolated configured-model longitudinal experiment, not a clinical assessment or a fixture validation. See run-manifest.json for resource limits, provider configuration and explicit starting conditions.

Researcher formulates and classifies hypotheses; participant supplies only ordinary fictional external experiences; observer captures immutable API records and examines the existing browser inspector; engineer changes code only after evidence establishes a documented-contract violation. Observer expectations never enter the participant input.

`research.sqlite` is the isolated live store. It contains a copied encrypted credential and must stay local, outside any export bundle. JSON checkpoints and retained traces contain researcher-visible psychology, not decrypted credentials. Export bundles exclude server configuration and SQLite credentials. No source Agent is modified. The comparison Agent remains untouched until comparison probes.

Conversations, traces, findings, learning events, lineage and psychological observations are append-only JSONL. Later assessment records cross-reference earlier raw findings rather than rewriting them. Checkpoints preserve every pre/post state. Large trace records are retained once, referenced by cycle ID. Browser captures and annotations provide the primary human inspection trail.

Research limitations: no exposed provider seed; deterministic hash embeddings; model nondeterminism; researcher-authored fictional observations; within-branch carryover; simulated elapsed time is not wall-clock longitudinal duration. Current architecture has no online primitive stage. Psychological resemblance and fluent responses cannot validate mechanisms. Anomalies are descriptive research signals only.
