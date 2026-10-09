# ADR 0143: Selected procedure teaching and known-method use

Status: Accepted. Selected exact-procedure implementation verified through prescribed pipeline fixtures; configured-model observations remain pending.
Date: 2026-10-08
Extends ADRs 0140/0142 without psychological mutation or new Self access.

## Decision

An ordinary operational proposal may explicitly request retention through `teachProcedure`: name, declared conditions, Agent/thread scope, and optionally an existing skill/version to revise. Self must select the whole proposal. Ordinary operations do not become lessons automatically. After the host persists an operational outcome, an external recording hook processes the selected directive against the actual submission/result ledger. It never accesses Part-private state or creates psychological meaning.

The contract captures learning mode. Disabled captured/current mode skips learning; supervised captured/current mode produces an evidence-backed proposal awaiting approval. Automatic activation requires both modes to allow it, passed independent evidence and current permissions. Failed/inconclusive evidence cannot activate a procedure. A later resolution may append validation to the same proposal rather than duplicate it. Recording is idempotent per execution outcome. Teaching errors produce separate attributed factual reports; they never erase a real tool outcome or change its action, verification or causal lineage.

One-time teaching/guidance/invocation bindings are excluded from retained procedures; source contracts preserve them. Skill revisions preserve history and reset current validation. Invalid references, scopes, stale versions and rejected source instructions cannot manufacture procedural authority. Cognitive approval, shared scopes, generalized parameters and broader runtime lifecycle remain separate extensions.

Current public skill manifests may enter one bounded original-thread WorldState context. They report name, declared conditions, status/version, exact recorded-input policy, linguistic success criterion, constraint declarations, limits, required tools, permission availability and validation limitations. They contain no raw tool arguments/results, private Part state or source argument. Self receives only expressed proposals. These manifests do not accumulate as facts and are excluded from factual prediction checks.

A Part may propose `skillInvocation` with an exact current active skill/version. It supplies its goal, the known success criterion and required constraint declarations, with no competing explicit steps/verification. Self selects that known-method reference. The host resolves the immutable recorded procedure under fresh authority, scope, current grants and the intersection of stored/current limits. The original selected action stays unchanged; the compiled contract records the resolved method/version. Existing handoffs use that captured version, while later selections must use the current active version. Invocation cannot change parameters, grant tools or revive one-time instructions. Inactive/stale/foreign/incompatible references return blocked feedback with zero tool authority.

Exact recorded-input validation does not prove declared-condition applicability, generalization or semantic success of arbitrary goals. Selecting known competence is not an unexplained perfect solution: Parts receive its public declared affordance, limitations and criterion, and Self explicitly chooses that option. Generative/adaptive planning remains an independent requirement.

## Verification

Exercise normal Part generation and Self selection with real local MCP for selected teaching, mode gates, delayed background recording, failed/inconclusive evidence, restart/idempotence, revision, permission changes and later exact method invocation. Check immutable action/contracts, source lineage, scope and current grants. Keep prescribed providers labeled as plumbing; configured teaching/transfer observations require separate Simulation Tests and retained evidence.
