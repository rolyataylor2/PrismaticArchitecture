# Part Memory

The default constructed model is defined by [ADR 0126](../architecture/decisions/0126-constructed-perspectives-and-dispositions.md). It supersedes the older persistent-Part meaning below for constructed Agents. Subjective memories retain their bias; temporary instances retain working continuity and remain in the inspector after retirement.

OntoAgentic treats autobiographical memory as fundamentally perspectival. Agent-owned subjective records preserve interpretations formed by Parts. Parts reference memories relevant to their missions and lived perspectives, and different Parts may remember overlapping experiences differently.

## Subjective evidence

A Part uses memories as evidence for beliefs, predictions, activation, strategies, bids, and interpretations. Its memory is not assumed to be an objective historical record.

## Memory privacy

Parts recall only explicitly referenced subjective records (legacy records reference their originating Part). An explicit reference may grant access to an interpretation formed by another Part, without access to its private beliefs or state. Self may facilitate communication between Parts while consulting Identity, making disagreement meaningful.

## Identity reconstruction

Identity does not require one authoritative autobiographical database. Self may form a current understanding from Part reports and selected subjective memories supplied through mediation; the result may remain ambiguous. Self cannot inspect objective ancestor events to settle disagreement.

## External records

Simulation histories, logs, journals, transcripts, and similar records provide evidence about external events but are not subjective memory. They can challenge Part memories without automatically replacing them.

Objective experiences are not ordinary autobiographical recall. Ordinary cognition uses current subjective Part memories directly; it does not reconstruct them from event logs. Current memory content is persistent and directly retrievable, while older versions are historical context and are not all injected into normal cognition. A memory may retain opaque ancestor experience references for provenance without making those records automatically readable.

## Incremental change

Memory revision should preserve continuity. A Part may change confidence, interpretation, attribution, causal understanding, selected details, or emotional relationship to an event without atomically replacing the whole memory.

Significant reinterpretation may preserve the Part's relationship to its previous view, such as “I used to think X; now I think Y,” when that is psychologically meaningful. Do not force a fixed wording template. Rare controlled re-exposure to an ancestor experience may support re-evaluation; the current developed Part interprets it, and the goal is developmental reinterpretation rather than factual correction.

## Resistance and history

A Part may resist reinterpretation when its existing account seems to serve its mission. This is not automatically an implementation failure. Changes should eventually be historically inspectable so researchers can distinguish what a Part remembers now from how that memory changed.

## Exact subjective content

The current subjective memory should be retrievable without requiring a retrieval layer to create a fresh paraphrase. A Part should receive the exact referenced subjective content rather than a neutralized summary; formation attribution remains separate from the recalling perspective.

Machine-readable metadata may support identity, ownership, provenance, retrieval cues, entities, time references, version identity, related-memory links, and history references separately from remembered language.

## Consolidation

Consolidation may create compact or derived material for active cognition, but must preserve original memory version lineage. A semantic change to a memory is developmental history, not a silent rewrite.

## Experience ancestry

Important subjective memories should be capable of retaining stable references to one or more ancestor experiences. An ancestor ID normally means “this memory descended from that experience,” not “reread that experience whenever this memory is retrieved.” Different Parts may retain divergent memories descended from the same objective event. Objective ancestry can support inspection and structural verification without deciding which emotional interpretation is correct.

## Agent memory storage (ADR 0125)

Subjective memories are Agent-owned records. Immutable `partId` attributes formation; explicit `referencingPartIds` controls Part access, with legacy records referencing their originating Part. `ancestorIds` links each interpretation to its own possibly overlapping set of WorldState snapshots, without fixed event groups or automatic source replay. Reference edits are versioned; archival preserves records. Formation behavior and originating-Part consolidation authority remain unchanged. See [ADR 0125](../architecture/decisions/0125-agent-memory-and-worldstate-links.md).
