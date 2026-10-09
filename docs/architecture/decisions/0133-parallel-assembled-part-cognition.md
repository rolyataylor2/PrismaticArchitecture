# ADR 0133: Parallel assembled Part cognition

Status: Accepted, 2026-10-04. Requested by the researcher.

Supersedes the online construction, steering, primitive participation and separate experience encoding responsibilities in ADRs 0126–0132. Offline consolidation is unchanged. Existing prerequisite eligibility remains based on the preceding completed thread cycle, without same-cycle descent.

Code selects one independent assembly per active disposition scope, retrieves chronological subjective memories and chooses the unique current instance for that binding. Models never choose reuse, IDs, scope, retirement or the number of Parts. Disposition scopes remain separate and their instance versions preserve development. A missing current instance creates a new one; retired instances remain inspection records.

One independent LLM request per assembly runs in parallel against the same frozen WorldState. Ordered output fields are formation, memoryReflection, memoryGist, cognition. Formation frames the temporary perspective from disposition and chronological memories; optional rich subjective reflection and its subsequent gist may create a memory; later cognition generates appraisal, beliefs, affect, thought, optional local goal, prediction and bid. These are concise cognitive products, not hidden chain-of-thought. Code validates and commits all outputs after the batch completes. A reflection must not describe an action selected or executed later in this cycle as already performed.

When no disposition activates, code assembles exactly one Part named `self` around Identity self-definition, with its purpose deliberately unspecified. This world-aware Part is distinct from world-blind Self arbitration and has no special selection authority. Only this fallback receives Identity during Part cognition; ordinary disposition Parts do not. Self arbitration and deliberation receive mediated contributions and Identity, never WorldState, raw memories or Part private state.

Primitives remain editable in their menu but neither score nor think nor bid in online cognition. Steering, affect/attention momentum and selected-intention carryover are removed; attributed thought carryover and decay remain. Code retires instances when their assembly scope leaves the active set, without deleting history or outstanding predictions. Prior-cycle binding eligibility is read from completed-cycle inspection records rather than steering.

Separate JEV prediction outcome checks and the existing generative outcome reflection remain unchanged, including evaluation of retired instances. No separate online experience-encoding or working-state call remains. Removed inference tasks and unused factory prompts are removed from routing and Settings → Prompts; storage history compatibility is not a cognitive runtime path.
