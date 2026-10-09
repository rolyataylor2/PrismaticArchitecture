# Architecture baseline

Inventory established before interpreting the first interaction. Implementation status is source inspection, not behavioral verification. ADRs 0133, 0136 and 0138 supersede affected older paragraphs; documentary layering is flagged below.

| Mechanism | Source status | Contract / implementation | Experimental verification at baseline |
| --- | --- | --- | --- |
| Immutable experienced WorldState | Implemented | ADR 0136; core/runtime.ts, experienced.ts; timestamped facts, attributed interpretations/futures/posture | Unverified |
| Online primitive stimulus evaluation | Absent by design | ADR 0133 explicitly removes online participation; configuration/history remain | Verify absence, not a missing-mechanism defect |
| Disposition activation and prior-cycle prerequisites | Implemented | ADR 0133; constructed.ts prepare/judge; independent Jev scores and recorded eligible bindings | Unverified |
| Subjective memory recall | Implemented | constructed.ts recall, current Agent-owned memories, chronological selected records; Self excluded | Unverified |
| Scope continuity, formation and retirement | Implemented | ADR 0133; code selects unique scoped instance, parallel ordered generation; retired records retained | Unverified |
| Subjective waking episodes | Implemented | constructed-domain.ts ordered reflection/gist and validated commits | Unverified |
| Part/gap predictions and attention | Implemented | ADR 0138; predictions.ts, runtime.ts; optional Part forecasts and consequential coverage | Unverified |
| Outcome evaluation and reflection | Implemented | Jev outcome check distinct from generative meaning; factual later original-thread evidence | Unverified |
| Temporary relevance scaffolds | Implemented | Versioned Dispositions, later-cycle eligibility; ended sources retire attention; admission budgets | Unverified |
| Evidence attachment and structural learning | Implemented | experiential-formation.ts attachment only; offline reconciliation and institutionalization gates | Unverified |
| Memory reconsolidation and versions | Implemented | Separate memory_reinterpretation task; SQLite immutable versions | Unverified |
| Self selection and deliberation | Implemented | core/self.ts/context.ts; mediated Identity/contributions, selectable supplied bids only | Unverified |
| Identity persistence and masks | Implemented; development unverified | domain/SQLite/context; roles filtered; no automatic core Identity rewrite in constructed sleep | Automatic Identity development is not established |
| External execution and feedback | Implemented for chat | sdk/chat-executor.ts; speech realization; supported action records, later factual status | Physical action effects not established |
| Thread continuity and persistence | Implemented | Store cycles/thread facts, subjective records and source scope provenance | Context-independent transfer unverified |
| Offline consolidation | Implemented | constructed.learn; selected digested evidence/history, conservative operations, no revival | Unverified |
| Embodied/environment interfaces | Partially exercised infrastructure | FactSchema supports observations/actions; simulation boundary outside cognition | Conversation uses simulated symbolic reports; no physical sensor test |
| Inspection and usage accounting | Implemented, coverage unverified | existing Brain/cycle inspector, events and provider.usage | Jev aggregate resource accounting may be incomplete |
| Branch/restore history | Partial | Immutable entity versions and research snapshots available; no assumed native cognitive branch API | Fresh comparison Agent, JSON checkpoints used |

Documentation ambiguity: overview, invariants and subsystem READMEs retain older paragraphs about persistent Parts, primitives, numeric confidence and direct formation beneath current-ADR notices. These are not silently applied to current runtime. Current explicit ADRs govern; any genuine conflict is a theory-review entry. Scheduling, appropriate long-term Identity development, automatic action breadth, rare replay criteria and psychological success thresholds remain open (OPEN_QUESTIONS.md).
