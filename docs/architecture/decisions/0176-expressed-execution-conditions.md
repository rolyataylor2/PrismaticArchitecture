# ADR 0176: expressed execution conditions are actual prerequisites

Status: Accepted, 2026-10-20.
Source: live body-mediated conversation diagnostic in the neighboring PrismaticCoupler, `live-conversation-bindings-20261020-1`.

## Decision

Clarify the existing `validWhile` meaning from ADR 0165. An authoring Part uses it for observable external circumstances whose absence would make its particular recommendation inappropriate. It is optional, not a request to enumerate ideal outcomes or every fact the Part would prefer to know. Keep desired responses, uncertain expectations and private interpretations in their existing subjective fields unless the Part actually intends to make them execution prerequisites. An empty or omitted list is valid.

For example, wanting someone to attend to a question does not automatically mean their attention must already be established before asking. A Part may nevertheless intentionally condition its particular recommendation on observed attention, privacy, consent or another relevant circumstance. Do not strip such a condition, assume it is true, or bypass factual applicability judgment to obtain activity. Parts may abstain; Self still chooses. No action, bid, concern or conclusion is prescribed.

Factory Part cognition and owning-answer instructions explain this contract consistently. Version the edited factories; preserve saved custom prompts and historical records. Existing schemas, classification thresholds, eligibility, permissions, runtime validation and cognitive access remain unchanged. The external Executive continues to translate only a selected intention.

## Verification and limits

Rendered prompt checks establish that authoring guidance is present without exposing mechanics. Existing runtime tests must retain rejection of unsupported explicit conditions. Fresh live observations must preserve abstention and blocked conditions, and distinguish ordinary cognition, world time, translation, physical speech and hearing. This clarification proposes no new psychological mechanism or claim about human behavior; configured observations are development diagnostics, not validation of psychology. General learning and conversation hypotheses remain separate experiments.

Prompt wording follows the [official GPT-4.1 prompting guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)'s emphasis on specific instructions and empirical evaluation. Models and inference routing are unchanged.

## Recorded development observation

Fresh normal-pipeline conversation observation `.evidence/live-conversation-conditions-20261020-1/report.json` in PrismaticCoupler produced two questions from Mara, heard by nearby Jo and delivered through Jo's later WorldState. Jo did not answer; the unchanged bidirectional criterion was not observed. This is neither a controlled causal comparison nor a psychological result. A translator verified only Mara's question despite a reply-dependent criterion, preserving an important external semantic-verification counterexample.

Embodiment/continuous-cognition checks passed 23 tests; typecheck passed. The applicability suite passed 8/9, with the score-2 test failing only its expected recent-feedback assertion after the no-execution/no-handoff/rejection assertions passed. The same failure at `asynchronous-bids.test.ts:66` reproduced in an isolated untouched `175c993` worktree. Thresholds, feedback behavior and test expectations were not altered. Factory and embodiment rendering checks also run after version changes. No clinical, learning or broad conversational result is claimed.
