# Executive integration handoff

Researcher steering, 2026-10-09: the Executive loop may be redesigned. Prioritize the official MCP client library, tool calls, consulting ordinary cognition, and inspectors. A complete working loop is not required for this handoff. Further learning, approval-policy and planner design should not drive the integration.

## MCP and tool calls

`packages/executive/src/mcp-client-manager.ts` uses the official `@modelcontextprotocol/client` Client, stdio and Streamable HTTP transports, and schema validator. It owns connections, discovery, validated calls, transport errors and shutdown. `packages/sdk/src/executive-connections.ts` bridges persisted server configuration and Agent tool grants to this transport.

`ExecutiveConnections.executionGateway(contract)` is the current tool-call integration point. It verifies recorded selected authority and current grants before accepting the next exact selected call. Audit events preserve submitted calls and received results. Raw tool arguments and results stay out of Self inference. Ambiguous results do not authorize replay.

The present native executor runs explicitly selected steps and a separate structured verification call. It does not implement a general-purpose planner. A redesigned loop can retain the MCP transport and scoped host gateway while replacing method orchestration explicitly.

## Consulting cognition

`Application.observeExecution(agentId, executionId, facts, checkpoint, competence)` accepts attributed operational observations. Meaningful background tool results already call this interface. `CognitiveRuntime.monitorExecution` evaluates advisory activation/competence separately from tool authority. With interested review enabled, ordinary Parts produce expressed products and world-blind Self decides whether to continue or intervene.

Agent Components → Executive → Sensitivity exposes monitoring, interested review and waiting for review before the next tool call. These are opt-in. Monitoring alone does not select an intervention. The native executor also reports `needs_guidance` for a missing executable method; later selected guidance is bound to the original activity.

`Application.consultExecution(agentId, executionId, facts, reason, competence?)` and POST `/api/agents/:id/executions/:executionId/consult` explicitly request ordinary cognition for a running selected activity. This works independently of automatic attention settings and thresholds, while preserving normal independent activation and world-blind Self. The request reason enters the shared Part snapshot as an attributed observation and appears in the cycle inspector. The response reports `consultation: reviewed` or `activity_ended` if the activity ends during assessment. A foreign or already ended activity rejects admission. The host call does not pause the worker; a redesigned external loop may await it at its own valid boundary. It creates no new inference role, worker ownership or tool authority.

The current selected pause and remainder replacement paths depend on live local workers and recorded settled checkpoints. Their receipt/budget machinery is implementation of the existing loop, not a requirement for a proposed replacement loop. Keep Self's selection authority, mediated factual feedback, immutable cycle snapshots and current tool permissions across any redesign.

## Inspectors

`apps/web/src/executive.ts` provides six Executive tabs, configuration, MCP administration and execution inspection. `apps/web/src/skill-inspector.ts` and `packages/sdk/src/skill-inspection.ts` expose preserved versions, variants, source instructions, expressed thoughts, bids, activation context, Self reasons, corrections, tool outcomes and application evidence. Exact procedure packages contain standard `SKILL.md` plus readable development references.

Inspection is a privileged read-only audit projection. It is not Agent memory or additional information for Self. A redesigned executor should continue emitting selected contracts, trace attribution and factual outcome records so existing inspection can observe it through public host interfaces.

## Current limitations

- General planning/recovery and alternative runtime adapters remain unfinished.
- Competence/coverage estimates are advisory operational inputs, not calibrated psychological confidence.
- Real local MCP and prescribed ordinary-pipeline fixtures exercise integration. They do not prove model-driven correction, learning or transfer.
- The recently added Self-selected skill review path is default-off and separate from tool dispatch. It is not a dependency of the prioritized MCP/cognition/inspection integration and should be reconsidered with the Executive redesign.
- No fully working redesigned Executive loop is claimed.

Relevant architecture: ADRs 0140, 0144–0146, 0149–0153 and the canonical Agent flow. The full historical thread audit remains in `EXECUTIVE_THREAD_AUDIT.md`; this handoff records the newer priority rather than silently treating every historical design as settled.

## Verification at handoff

Strict TypeScript/architectural lint and the application build passed. The complete Node regression suite passed 313 tests with zero failures, cancellations or skips (184.3 seconds). Command: `npx tsx --test tests/node/*.test.ts`; local output: `/tmp/executive-selected-review-regression.log`. Coverage includes actual local MCP stdio/HTTP, selected tool calls, operational guidance, interested ordinary cognition, Executive settings, inspector provenance and Simulation Tests persistence. Prescribed/mock providers in these checks establish infrastructure behavior, not configured-model learning or transfer.

The latest focused handoff checks passed 11 tests: MCP stdio/HTTP and timeout behavior, ordinary interested cognitive review/continuation/selected control, and the real-browser Executive workflow. The browser registers an environment secret reference, discovers a real local MCP server, grants tools, inspects tool responses and cognition history, and retains expanded evidence across refresh. These cover the prioritized integration surface; full historical planning/learning/adapter requirements remain unfinished.
