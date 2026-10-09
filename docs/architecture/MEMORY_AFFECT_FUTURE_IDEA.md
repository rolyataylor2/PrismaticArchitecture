# Memory formation affect and possible future recall filtering

Source: researcher discussion, 2026-10-09. The researcher requested documentation of a future idea and storage of current Self affect only, without implementing its use.

## Stored formation context

New online subjective memories optionally record `selfAffectAtFormation`: the attributed natural-language affects in the immutable cycle snapshot's current Self-selected posture. Multiple selected contributions remain separate `{ partId, affect }` records; runtime does not synthesize one emotion. Ordinary reflection, Part prediction outcomes and gap-hypothesis outcome episodes capture this same context.

This is the carried posture available when encoding begins, not the later Self choice in the encoding cycle. It is distinct from `encoding.affect`, which records the originating Part's affect or reflection. An empty array means the snapshot had no selected posture; an absent field means no experienced context was supplied or the memory predates this addition. Historical records are not backfilled. Existing memory versioning preserves the formation record through reinterpretation.

The field is storage metadata only. `ordinaryMemory` excludes it from ordinary recall inputs. No new scoring, eligibility rule, prompt responsibility or Self access is introduced. ADR 0136's existing affect-informed relevance judgments remain unchanged.

## Future concept — not adopted or implemented

A possible future experiment would compare the Self-selected affect recorded at memory formation with the current Self-selected affect, and remove affectively mismatched memories from recall consideration. No matching mechanism, emotion taxonomy, threshold or policy has been selected. This is not an accepted cognitive architecture change.

Questions include whether such exclusion would produce useful state-dependent accessibility, reinforce a current posture by withholding contrary evidence, reduce independent Part dissent, or obstruct transfer across emotional states. Formation-time Self posture may also differ from the encoding Part's affect. These are open questions, not demonstrated psychological findings.

Before implementing any use, define the comparison and evaluate it against unchanged relevance-based recall and softer affect-informed accessibility through the shared Simulation Tests registry. Use ordinary cognition and external experiences, preserve source Agents and run evidence, distinguish fixture plumbing from configured-model observations, and measure contradictory recall, perspective diversity, prediction revision and transfer across states. The existing affective-interpretation scenario can supply a starting point; it does not currently test this proposed filter. Human psychological accuracy requires separate scientific evidence.
