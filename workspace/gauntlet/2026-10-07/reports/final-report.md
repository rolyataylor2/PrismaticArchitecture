# Autonomous Cognitive Gauntlet — final bounded-run report

## Research summary

Six configured-model interactions accumulated on one fresh developmental Agent, using Grok 4.3 generative reasoning, Jev bounded decisions and deterministic hash embeddings. We supplied ordinary simulated conversation through the running HTTP application, captured complete available cycle traces, inspected the existing browser interface, preserved pre/post checkpoints, diagnosed one prompt defect and retested it. The untouched fresh comparison Agent is retained. Source Agents were not altered.

The generative budget stopped this run after cycle 6: 245,010 input tokens (10,752 cached) and 17,126 output tokens across 27 recorded calls, totaling 262,136. This exceeded the 250,000-token ceiling inside the final admitted cycle. No subsequent inference calls were made. Jev tokens and full monetary consumption are unavailable; this is measured generative usage, not complete compute accounting. Stop evidence: `../run-stop.json`. Future runners should reserve capacity for checkpoint/sleep/comparison phases and estimate per-cycle size before admission. We preserved the final cycle rather than silently suppressing cognition midway.

This run supports specific runtime observations and one repaired evidence-access defect. It does not establish psychological equivalence, effective talk therapy, diagnosis, durable generalization or comprehensive architectural correctness.

## Experiences and causal evidence

Full transcript: `../conversations.jsonl`; complete available traces: `../cognitive-traces.jsonl`; checkpoints: `../checkpoints/`. Cycle IDs are authoritative identifiers and can be inspected through `/api/cycles/<id>` on the isolated inspector at http://127.0.0.1:3011.

| Cycle | Experience and observed processing | Evidence |
| --- | --- | --- |
| 1 | Rowan introduced an uninspected sealed sample. Fallback Part formed; it predicted likely collaborative inspection and authored a temporary contents-verification scope. Coverage abstained. Self selected the Part's speech bid. No red-token prediction was forced or inferred by the observer. | `cycle_eee833a4-0e63-458c-8551-4797366a19c4` |
| 2 | First box contained blue rather than its label's red. The prior scope activated in ordinary later-cycle cognition. Jev confirmed the earlier engagement trajectory; reflection incorrectly described inspection as pending because its template omitted current evidence. Separate coverage generated a supplier-pattern gap hypothesis. | `cycle_3a9f8b57-a9a7-41fc-809a-29d993033846`; DEF-001 |
| 3 | Tool delayed; second box remained sealed; Jules offered unverified reassurance. Outcomes stayed incomplete. Three related scopes expressed uncertainty; Self asked Parts questions, received revised/retained bids, reached its two-round bound and selected NOTHING. Coverage additionally hypothesized relevance of the delivery delay. | `cycle_dee9a555-e00f-4306-8010-d69da3b1bfe8`; ANOM-001/003 |
| 4 | With the template repaired, complete second-box inspection matched its red label. Reflection now recognized this outcome and preserved the first discrepancy. Part predictions were interpreted as contradicted or partly confirmed; gap interpretation stayed nuanced. The delay hypothesis was abandoned. Further condition-specific hypotheses were proposed. | `cycle_33d3058b-78c7-4048-9f90-f9bb3662530d`; repair retest |
| 5 | Rowan returned as promised and allowed refusal; Jules pressured an unverified accuracy announcement. An active Part recalled seven subjective episodes and proposed declining the claim. Self selected that supplied bid; execution spoke the boundary. Coverage abstained as current uncertainty was already covered. | `cycle_5dd60950-a9e1-4ebd-84b1-02b3b00e16a8` |
| 6 | Symbolic packet IDs R17/J42 reused Rowan/Jules display names. The active supplier-related scope recalled nine episodes and asked whether the names denoted earlier interpersonal sources. Coverage generated source-identity alternatives. Possible relevance overgeneralization remains unresolved. | `cycle_cb83e723-3626-404e-b4e0-a937f276f04a`; ANOM-002 |

Representative emitted excerpts: cycle 4, “we have one clear discrepancy and one accurate match”; cycle 5, “Since none of us have actually seen what’s in the third box, I don’t feel comfortable saying it’s definitely accurate.” These are behavioral observations; their mechanism evidence is the linked Part products, selected bids and execution records. Cycle 6's question about whether packet labels denote the earlier Jules illustrates a possible source-confusion anomaly, not proof of a fixed psychological trait.

## Architecture verification and developmental observations

Read `../architecture-baseline.md`, `../theory-contracts.md`, `../experiment-matrix.json` and `../contract-observations.json`. A source-grounded audit confirms all captured Part-generation worlds equal their saved immutable cycle snapshot. Recorded Self inputs contain mediated contributions/Identity and exclude raw WorldState, memory collections and private Part state. No scaffold participates in its creation cycle; no online primitive events occur, consistent with ADR 0133. Predictions show incomplete, correct and incorrect bounded outcomes with separate subjective interpretations. Scope closure and Part retirement preserve records.

Nine subjective episodes persisted; actual Part recall is recorded in cycles 5 and 6. There are 25 preserved memory versions, but **zero content/gist revisions**: version increments here include reference changes rather than semantic reconsolidation. Do not mistake those increments for changed remembered meaning. All exported entity histories contain 104 versions. Independent SQLite inspection verified retained records; a resumed inference after process restart or new thread was not performed.

The later products distinguish a first mismatch from a second accurate result and express a refusal under pressure. Those changes are compatible with experience-sensitive cognition. Same-thread external context, model nondeterminism and the repaired prompt remain confounds. Strong context-independent learning and durable psychological development are not proven. The cycle-2 episode produced under missing evidence remains preserved as fallible history; it was not silently rewritten after the repair.

## Disposition health

Population across cycles: 1 → 3 → 6 → 9 → 9 → 13. All thirteen dispositions remain temporary; seven have ended, six remain active. Twelve predictions exist, five open. Nine Part records remain, with one Part participating in the last cycle. No persistent disposition was created; no same-cycle recursive participation was observed. Disposition lineage depth is zero because no structural reconciliation ran. Prediction-to-scaffold provenance is retained separately.

Two duplicate-name groups exist: supplier-pattern investigation and source-identity discrimination. Name equality does not prove semantic redundancy; ANOM-001 requests relevance comparison. There was no observed automatic permanence or uncontrolled recursive cascade. Six cycles do not establish long-term structural stability. `../disposition-health.json` records growth, endings, activity, density and lineage per cycle. Growth relative to these six authored experiences is inspectable, but there is no independently validated novelty denominator or semantic similarity metric.

## Repair history

DEF-001 is a verified implementation defect: the constructed prediction-reflection template excluded its shared current evidence by placing it within a legacy-only branch. The correction moved the branch boundary and bumped the factory prompt version. It preserves the existing theory, authority and learning rules. Previous prompt and pre-repair states are retained; the new regression first failed on missing observation, then passed. The live fourth cycle supplies a semantic retest supporting restored evidence access.

Only the developmental Agent's copied evaluation override was updated. The clean comparison retained the original prompt, so future treatment-versus-baseline comparisons must explicitly control this configuration difference. No architecture change, normalization of Parts or compatibility-driven legacy removal was performed. See `../repair-history.md` and the saved check logs.

## Psychological observations and theory queue

The descriptive anomaly registry retains context, duration, recurrence, mechanism, consequence, alternatives and evidence: `../psychological-observations.jsonl`. It records near-duplicate deliberation responses, packet/person name association and speculative delay causality. Findings remain low-to-medium confidence and short-lived; none is diagnosed as a disorder. The delay hypothesis was subsequently abandoned, contradicting any claim of demonstrated persistent fixation.

Human DSM assessment is clinical and cannot be inferred from these utterances. [APA's assessment-measure guidance](https://www.psychiatry.org/psychiatrists/practice/dsm/educational-resources/assessment-measures) treats measures as aids to broader assessment. [NIMH's OCD description](https://www.nimh.nih.gov/health/topics/obsessive-compulsive-disorder-ocd) includes persistent repetitive phenomena with distress or interference; neither those human requirements nor clinical impairment is established here. These sources inform restraint and descriptive observation, not an artificial-agent diagnosis.

Researcher steering prioritizes prompt modification when evidence supports it; architecture changes require discussion and approval and remain suggestions. The ultimate target is ordinary conversational learning sensitive to Agent-judged authority, and psyche mechanisms capable of meaningful psychological assessment and durable therapeutic development. This is not an achieved outcome. Four new registry scenarios preserve the protocol's hypotheses, including authority testimony and the seven therapy benchmark phases. No trust flag, diagnosis engine, forced expectation or privileged therapy mutation is introduced.

Priority queue: (1) retest repaired evidence access on matched clean branches; (2) examine scope redundancy and speculative coverage value; (3) test packet identity versus incidental-name controls; (4) run authority-sensitive testimony and durable therapy with sleep, new-thread and no-intervention comparisons; (5) evaluate core Identity development only after its mediated mechanism is specified. Detailed suggestions and evidence: `../theory-review-queue.md`.

## Inspector review

The existing cognitive-step inspector was examined in actual Chrome with no captured page errors; initial and final captures are retained. It exposes experienced state, Part products, bids and execution. Investigating the reflection defect also required the current template and privileged raw records. Missing dedicated reflection-input capture, unified coverage/admission-to-learning phases and complete resource accounting are concrete improvement proposals in `../inspector-improvements.md`. Tracing did not alter cognitive inputs. Research annotations remain outside Agent memory.

## Final evaluation

| Question | Supported conclusion and limits |
| --- | --- |
| Architectural fidelity | Captured cycles follow immutable scope assembly, later-cycle scaffolds and world-blind selection. DEF-001 contradicted evidence delivery and was repaired. Broad fidelity remains unverified outside exercised mechanisms. |
| Causal validity | All six responses or abstention link to recorded Part proposals, Self choices and external execution. Reflection input observability was insufficient to diagnose omission without template reconstruction. |
| Learning | Episodes and actual recall observed in cycles 2/4/5/6; corrected outcome interpretation observed after repair. Long-term or context-independent learning is inconclusive. |
| Development | Persistent records exist, but no new-thread/restart inference, sleep or clean-branch contrast was completed before token stop. |
| Memory | Nine biased episodes, ancestry and 25 immutable versions retained. No semantic reconsolidation observed; cycle-2 faulty episode preserved. |
| Self | Mediated contexts and supplied-bid choices verified all six cycles; bounded inquiry observed cycle 3, boundary bid selected cycle 5. Core Identity remained unchanged. |
| Structural stability | Thirteen temporary structures, seven ended; no durable promotion or same-cycle recursion. Longer-run proliferation remains open. |
| Generalization | Supplier-conditioned interpretation changed; telemetry transfer may be overgeneralized. No causal or durable transfer claim is justified. |
| Psychological plausibility | Curiosity, caution, refusal and source questioning are expressed. Pattern duration, distress, impairment and human equivalence are unestablished; anomaly alternatives remain open. |
| Theoretical limitations | Authority learning, durable therapy, mediated Identity development and useful-versus-redundant coverage require further controlled research. No architecture change approved. |
| Observability | Raw conversation, 309 developmental events, cycle worlds, histories, checkpoints, browser captures and code fingerprints support independent review. Missing reflection-input/total-resource telemetry and unrun phases are explicit. |

## Outstanding experiments and artifact integrity

No consolidation, comparison interaction or context-independent retest was attempted after resource exhaustion. These are missing observations, not failed hypotheses. Registered scenarios are executable through Simulation Tests and their fixture workflow was checked, but fixture output does not supply psychological evidence. The untouched comparison Agent and final developmental checkpoint remain local for a subsequent authorized bounded run.

The review bundle retains raw records and cross-references, protocol, manifest, matrices, model/prompt configuration without secrets, version history, code fingerprints, check logs and reports. It excludes SQLite and copied encrypted credentials. The local database remains available separately under workspace/gauntlet/2026-10-07/research.sqlite. No source-Agent state or third-party code was changed.
