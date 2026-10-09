# Repair history

## DEF-001 — constructed prediction reflection loses factual outcome context

Contract: ADR 0133 preserves separate prediction outcomes and reflection; ADR 0136 requires factual-only later evidence. Live cycle `cycle_3a9f8b57-a9a7-41fc-809a-29d993033846`: Jev recognized the opening, but constructed reflection said no opening occurred. A deterministic render reproduced omission of current facts, preserved expectation and later evidence.

Root cause: `prompt.evaluation.md` opened a constructed/legacy conditional but closed its legacy branch after the shared WorldState, prediction, memory and later-evidence sections. Constructed inference therefore received old Part interpretation but omitted factual context.

Minimal repair: close the branch before shared context. Keep legacy additive-learning instructions exclusive to legacy owners; keep constructed autobiography instructions exclusive to constructed owners. Bump factory version to prediction-evaluation-shared-evidence-v12. Preserve previous file in checkpoints. Regression: `tests/node/prediction-reflection-evidence.test.ts` checks actual rendered facts, capsule and memory for both owners. Original test failed on missing current observation; repaired render passes. Affected prompts, outcome gates and scaffold checks pass; full regression pending.

Live retest: cycle `cycle_33d3058b-78c7-4048-9f90-f9bb3662530d` uses the repaired developmental-Agent override. Reflection recognizes the red second box and retains the blue first mismatch. Two ordinary Part forecasts were interpreted as contradicted, while gap reflection retained a nuanced partly-confirmed view. This supports restored evidence access; it does not establish universal semantic correctness or resolve the supplier hypothesis.

Comparison Agent retains original prompt. Source Agent unchanged. Record the configuration boundary explicitly; later behavior cannot all be attributed to learning. No architecture or learning rule changed.
